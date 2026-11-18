/**
 * BAARO — Moteur IA partagé pour les routes indépendantes.
 * Reprend la cascade et les mécanismes de /api/live.js.
 * Ne modifie pas le handler de /api/live.js.
 */
import {
  providerConfig,
  getProviderOrder,
  isOpen,
  recordFailure,
  recordSuccess,
} from "./router.js";

import { callOpenAICompatible } from "./openai-compatible.js";

const DEFAULT_AI_PROVIDER_CASCADE = [
  "groq",
  "mistral",
  "gemini",
  "gemini-fallback",
];

const AI_PROVIDER_TIMEOUT_MS = 12000;
const LUMEN_TIMEOUT_MS_DEFAULT = 45000;
const AI_MAX_REPLY_CHARS = 6000;

function buildCascade() {
  return [
    ...getProviderOrder(),
    ...DEFAULT_AI_PROVIDER_CASCADE,
  ].filter((name, index, list) => list.indexOf(name) === index);
}

function resolveProvider(name) {
  let cfg = null;

  try {
    cfg = providerConfig(name);
  } catch {
    cfg = null;
  }

  const key =
    cfg?.key ||
    (
      name === "gemini" || name === "gemini-fallback"
        ? process.env.GEMINI_API_KEY
        : name === "groq"
          ? process.env.GROQ_API_KEY
          : name === "mistral"
            ? process.env.MISTRAL_API_KEY
            : undefined
    );

  if (!key) return null;

  if (name === "lumen") {
    return cfg && cfg.base
      ? { ...cfg, key, model: cfg.model || "lumen" }
      : null;
  }

  let model =
    cfg?.model ||
    (
      name === "groq"
        ? process.env.GROQ_MODEL ||
          process.env.GROQ_MODELS?.split(",")[0]?.trim() ||
          "openai/gpt-oss-20b"
        : name === "mistral"
          ? process.env.MISTRAL_MODEL || "ministral-3b-latest"
          : name === "gemini"
            ? process.env.GEMINI_MODEL ||
              process.env.GEMINI_MODELS?.split(",")[0]?.trim() ||
              "gemini-2.5-flash-lite"
            : name === "gemini-fallback"
              ? process.env.GEMINI_FALLBACK_MODEL ||
                "gemini-2.5-flash"
              : undefined
    );

  if (
    name === "groq" &&
    typeof model === "string" &&
    /^llama-3\.1-8b-instant$/i.test(model.trim())
  ) {
    model = "openai/gpt-oss-20b";
  }

  return { ...(cfg || {}), key, model };
}

function timeoutFor(name) {
  if (name === "lumen") {
    const value = Number(process.env.LUMEN_TIMEOUT_MS);

    return Number.isFinite(value) && value >= 1000
      ? value
      : LUMEN_TIMEOUT_MS_DEFAULT;
  }

  return AI_PROVIDER_TIMEOUT_MS;
}

function isRetryable(err) {
  const status = Number(err?.status);

  return (
    !status ||
    status === 401 ||
    status === 403 ||
    status === 404 ||
    status === 408 ||
    status === 429 ||
    status >= 500
  );
}

function withTimeout(promise, ms, label) {
  let timer;

  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      reject(
        Object.assign(
          new Error(`${label} trop lent`),
          { status: 408 }
        )
      );
    }, ms);
  });

  return Promise.race([promise, timeout]).finally(() => {
    clearTimeout(timer);
  });
}

export async function invokeWithFallback({
  normalizedMessages,
  system,
  maxTokens,
  temperature,
}) {
  let lastError = null;
  const tried = [];

  for (const name of buildCascade()) {
    const cfg = resolveProvider(name);

    if (!cfg || !cfg.key) continue;

    let circuitOpen = false;

    try {
      circuitOpen = Boolean(isOpen(name));
    } catch (err) {
      console.warn("[translate-ai circuit check]", err?.message || err);
    }

    if (circuitOpen) continue;

    tried.push(name);

    try {
      const result = await withTimeout(
        callOpenAICompatible({
          ...cfg,
          messages: normalizedMessages,
          system,
          maxTokens,
          temperature,
        }),
        timeoutFor(name),
        name
      );

      const reply = String(result?.reply || "")
        .trim()
        .slice(0, AI_MAX_REPLY_CHARS);

      if (!reply) {
        throw Object.assign(
          new Error("Réponse vide du fournisseur IA"),
          { status: 502 }
        );
      }

      try {
        recordSuccess(name);
      } catch (err) {
        console.warn("[translate-ai circuit success]", err?.message || err);
      }

      return {
        reply,
        provider: name,
        model: cfg.model || result.modelUsed || null,
        tried,
      };
    } catch (err) {
      lastError = err;

      console.warn("[translate-ai provider failed]", name, {
        status: err?.status,
        message: err?.message,
      });

      if (isRetryable(err)) {
        try {
          recordFailure(name);
        } catch (recordErr) {
          console.warn(
            "[translate-ai circuit failure]",
            recordErr?.message || recordErr
          );
        }

        continue;
      }

      throw err;
    }
  }

  if (tried.length === 0) {
    throw Object.assign(
      new Error("Aucun fournisseur IA disponible ou configuré"),
      { status: 503, cause: lastError }
    );
  }

  throw Object.assign(
    new Error("IA temporairement indisponible, réessaie dans un instant."),
    { status: 502, cause: lastError }
  );
}
