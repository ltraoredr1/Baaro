/**
 * BAARO AI Gateway v2
 * - Circuit breaker + fallback multi-providers
 * - Rate-limit async (Upstash)
 * - Logging structuré
 * - Headers latence / provider
 */
import { getAdminClient, requireUser } from "./_supabaseAdmin.js";
import { rateLimitAsync } from "./_rateLimit.js";
import { applyCors } from "./_cors.js";
import { chooseProvider, normalizeCountry, providerConfig } from "./ai/router.js";
import { callOpenAICompatible } from "./ai/openai-compatible.js";
import { isOpen, recordFailure, recordSuccess } from "./ai/circuit.js";
import { logError, logWarn } from "./_logger.js";

function safeMaxTokens(value) {
  return Math.min(Math.max(Number(value) || 1200, 1), 2000);
}

function safeCountry(req, context) {
  return (
    normalizeCountry(context?.country) ||
    normalizeCountry(req.headers["x-baaro-country"]) ||
    null
  );
}

function buildSystem(customSystem, mode, context) {
  let system =
    customSystem ||
    "Tu es l'assistant officiel de BAARO. Réponds de façon claire, utile et respectueuse.";
  if (context && typeof context === "object") {
    if (context.display_name)
      system += `\nUtilisateur: ${String(context.display_name).slice(0, 100)}`;
    if (context.language)
      system += `\nLangue préférée: ${String(context.language).slice(0, 20)}`;
  }
  if (mode === "cohost")
    system += "\nTu es co-animatrice d'un live. Réponds en 1 à 3 phrases maximum.";
  return system.slice(0, 12000);
}

async function loadCountry(admin, userId) {
  try {
    const { data } = await admin
      .from("profiles")
      .select("country, language")
      .eq("user_id", userId)
      .maybeSingle();
    return data || {};
  } catch {
    return {};
  }
}

async function callAnthropic({ apiKey, messages, system, maxTokens }) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-20250514",
      max_tokens: maxTokens,
      system,
      messages,
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok)
    throw Object.assign(
      new Error(data.error?.message || "Erreur Anthropic"),
      { status: response.status }
    );
  return {
    reply:
      data.content?.find?.((c) => c.type === "text")?.text ||
      data.content?.[0]?.text ||
      "Désolé, je n'ai pas pu générer une réponse.",
    raw: data,
  };
}

async function callN8n({ url, secret, sessionId, payload }) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Session-Id": sessionId,
      ...(secret ? { "X-N8N-Secret": secret } : {}),
    },
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok)
    throw Object.assign(
      new Error(data.error || data.message || "Erreur agent n8n"),
      { status: response.status }
    );
  return {
    reply:
      data.reply ||
      data.content?.[0]?.text ||
      "Désolé, je n'ai pas pu générer une réponse.",
    raw: data,
    sessionId: data.sessionId || sessionId,
    provider: data.provider || "n8n",
  };
}

async function invokeProvider(provider, ctx) {
  const {
    normalizedMessages,
    system,
    maxTokens,
    sessionId,
    country,
    profile,
    mode,
    publicModel,
  } = ctx;

  if (provider === "n8n") {
    return callN8n({
      url: process.env.N8N_BAARO_WEBHOOK_URL,
      secret: process.env.N8N_WEBHOOK_SECRET,
      sessionId,
      payload: {
        messages: normalizedMessages,
        context: {
          country,
          user_id: ctx.userId,
          language: profile.language || null,
        },
        max_tokens: maxTokens,
        mode: mode || "default",
        system,
        model: publicModel || process.env.BAARO_AI_MODEL || null,
        provider,
        sessionId,
      },
    });
  }

  if (provider === "anthropic") {
    return callAnthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
      messages: normalizedMessages,
      system,
      maxTokens,
    });
  }

  const cfg = providerConfig(provider);
  if (!cfg?.key || !cfg?.base) {
    throw Object.assign(new Error(`Provider ${provider} mal configuré`), {
      status: 503,
    });
  }
  return callOpenAICompatible({
    base: cfg.base,
    key: cfg.key,
    model: publicModel || cfg.model,
    messages: normalizedMessages,
    system,
    maxTokens,
  });
}

export default async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== "POST")
    return res.status(405).json({ error: "Méthode non autorisée" });

  const limit = await rateLimitAsync(req, {
    key: "chat",
    max: 20,
    windowMs: 60_000,
  });
  if (!limit.ok) {
    Object.entries(limit.headers || {}).forEach(([k, v]) =>
      res.setHeader(k, v)
    );
    return res.status(limit.status).json(limit.body);
  }

  let admin, user;
  try {
    admin = getAdminClient();
    user = await requireUser(req, admin);
  } catch (e) {
    return res.status(e.status || 500).json({ error: e.message });
  }

  const body = req.body || {};
  const {
    messages,
    context,
    max_tokens,
    mode,
    system: customSystem,
    model: requestedModel,
    provider: requestedProvider,
  } = body;

  if (
    !Array.isArray(messages) ||
    messages.length < 1 ||
    messages.length > 30
  ) {
    return res
      .status(400)
      .json({ error: "messages doit contenir entre 1 et 30 éléments" });
  }

  const normalizedMessages = messages.map((m) => ({
    role: m?.role === "assistant" ? "assistant" : "user",
    content: String(m?.content ?? m?.text ?? "").slice(0, 8000),
  }));
  if (normalizedMessages.some((m) => !m.content.trim())) {
    return res.status(400).json({ error: "Message vide ou invalide" });
  }

  const profile = await loadCountry(admin, user.id);
  const country = safeCountry(req, {
    ...(context || {}),
    country: context?.country || profile.country,
  });

  const maxTokens = safeMaxTokens(max_tokens);
  const system = buildSystem(customSystem, mode, {
    ...(context || {}),
    language: context?.language || profile.language,
  });
  const sessionId = String(
    req.headers["x-session-id"] || body.sessionId || `user-${user.id}`
  ).slice(0, 160);
  const publicModel =
    requestedModel && requestedProvider
      ? String(requestedModel).slice(0, 120)
      : undefined;

  const ctx = {
    normalizedMessages,
    system,
    maxTokens,
    sessionId,
    country,
    profile,
    mode,
    publicModel,
    userId: user.id,
  };

  const start = Date.now();
  const tried = [];
  let lastError = null;
  let result = null;
  let usedProvider = null;

  // Tentatives avec fallback (max 4 providers)
  for (let i = 0; i < 4; i++) {
    const provider = chooseProvider({
      country,
      requested: i === 0 ? requestedProvider || requestedModel : undefined,
      exclude: tried,
    });
    if (!provider) break;
    if (isOpen(provider)) {
      tried.push(provider);
      logWarn("chat", `Circuit open for ${provider}`, { userId: user.id });
      continue;
    }

    tried.push(provider);
    try {
      result = await invokeProvider(provider, ctx);
      recordSuccess(provider);
      usedProvider = result.provider || provider;
      break;
    } catch (err) {
      lastError = err;
      recordFailure(provider);
      logWarn("chat", `Provider ${provider} failed`, {
        userId: user.id,
        status: err?.status,
        message: err?.message,
      });
    }
  }

  const latency = Date.now() - start;

  if (!result) {
    logError("chat", lastError || new Error("No provider available"), {
      userId: user.id,
      country,
      tried,
    });
    return res.status(502).json({
      error: "Fournisseur IA temporairement indisponible",
      tried,
    });
  }

  res.setHeader("X-BAARO-AI-Provider", usedProvider);
  res.setHeader("X-BAARO-AI-Country", country || "unknown");
  res.setHeader("X-BAARO-AI-Latency-Ms", String(latency));
  res.setHeader("X-BAARO-AI-Tried", tried.join(","));

  return res.status(200).json({
    reply: result.reply,
    sessionId: result.sessionId || sessionId,
    provider: usedProvider,
    model: publicModel || usedProvider,
    country: country || null,
    latencyMs: latency,
  });
}
