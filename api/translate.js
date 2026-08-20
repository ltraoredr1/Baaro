/**
 * BAARO /api/translate
 * Traduction de texte (posts, commentaires, descriptions vidéo).
 * Le client envoie text + targetLang — jamais de clé API.
 *
 * Variables optionnelles (réutilise le gateway IA existant) :
 *   ANTHROPIC_API_KEY | OPENAI_API_KEY | GEMINI_API_KEY | XAI_API_KEY | MOONSHOT_API_KEY
 */
import { getAdminClient, requireUser } from "./_supabaseAdmin.js";
import { rateLimit } from "./_rateLimit.js";
import { applyCors } from "./_cors.js";
import { chooseProvider, normalizeCountry, providerConfig } from "./ai/router.js";
import { callOpenAICompatible } from "./ai/openai-compatible.js";

const MAX_CHARS = 4000;
const ALLOWED_LANGS = new Set([
  "fr", "en", "es", "pt", "ar", "zh", "hi", "ru", "ja", "de",
  "sw", "it", "ko", "tr", "nl", "pl", "uk", "vi", "id", "th",
  "bn", "ha", "yo", "ig", "am", "zu", "af", "fa", "he", "sv",
]);

const LANG_NAMES = {
  fr: "français", en: "English", es: "español", pt: "português",
  ar: "العربية", zh: "中文", hi: "हिन्दी", ru: "русский",
  ja: "日本語", de: "Deutsch", sw: "Kiswahili", it: "italiano",
  ko: "한국어", tr: "Türkçe", nl: "Nederlands", pl: "polski",
  uk: "українська", vi: "Tiếng Việt", id: "Bahasa Indonesia",
  th: "ไทย", bn: "বাংলা", ha: "Hausa", yo: "Yorùbá",
  ig: "Igbo", am: "አማርኛ", zu: "isiZulu", af: "Afrikaans",
  fa: "فارسی", he: "עברית", sv: "svenska",
};

function jsonError(res, status, message) {
  return res.status(status).json({ error: message });
}

async function callAnthropic({ apiKey, system, userContent }) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-20250514",
      max_tokens: 2000,
      system,
      messages: [{ role: "user", content: userContent }],
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw Object.assign(new Error(data.error?.message || "Erreur Anthropic"), {
      status: response.status,
    });
  }
  return (
    data.content?.find?.((c) => c.type === "text")?.text ||
    data.content?.[0]?.text ||
    ""
  );
}

export default async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== "POST") return jsonError(res, 405, "Méthode non autorisée");

  const limit = rateLimit(req, { key: "translate", max: 30, windowMs: 60_000 });
  if (!limit.ok) {
    Object.entries(limit.headers || {}).forEach(([k, v]) => res.setHeader(k, v));
    return res.status(limit.status).json(limit.body);
  }

  let admin, user;
  try {
    admin = getAdminClient();
    user = await requireUser(req, admin);
  } catch (e) {
    return jsonError(res, e.status || 500, e.message);
  }

  const body = req.body || {};
  const text = String(body.text || "").trim().slice(0, MAX_CHARS);
  const targetLang = String(body.targetLang || body.lang || "en")
    .toLowerCase()
    .slice(0, 8);
  const sourceLang =
    body.sourceLang && String(body.sourceLang).toLowerCase().slice(0, 8);

  if (!text) return jsonError(res, 400, "Texte manquant");
  if (!ALLOWED_LANGS.has(targetLang)) {
    return jsonError(res, 400, "Langue cible non supportée");
  }

  // Cache optionnel en base (évite de re-traduire le même contenu)
  const contentHash = await hashText(`${targetLang}:${text}`);
  try {
    const { data: cached } = await admin
      .from("content_translations")
      .select("translated_text, source_lang, target_lang")
      .eq("content_hash", contentHash)
      .eq("target_lang", targetLang)
      .maybeSingle();
    if (cached?.translated_text) {
      return res.status(200).json({
        ok: true,
        translated: cached.translated_text,
        sourceLang: cached.source_lang || sourceLang || "auto",
        targetLang,
        cached: true,
      });
    }
  } catch {
    /* table peut ne pas exister encore */
  }

  const targetName = LANG_NAMES[targetLang] || targetLang;
  const system = [
    "Tu es un traducteur professionnel pour le réseau social BAARO.",
    "Traduis UNIQUEMENT le texte fourni.",
    "Conserve le ton, les emojis, les @mentions et les hashtags.",
    "Ne ajoute aucune note, préface ni guillemets autour de la traduction.",
    `Langue cible : ${targetName} (code ${targetLang}).`,
  ].join(" ");

  const userContent = sourceLang
    ? `Source (${sourceLang}) → ${targetLang}:\n\n${text}`
    : `Traduis vers ${targetName}:\n\n${text}`;

  let country = null;
  try {
    const { data: profile } = await admin
      .from("profiles")
      .select("country")
      .eq("user_id", user.id)
      .maybeSingle();
    country = normalizeCountry(profile?.country);
  } catch {
    /* ignore */
  }

  const provider = chooseProvider({ country, requested: body.provider });
  if (!provider) {
    return jsonError(res, 503, "Aucun fournisseur IA configuré pour la traduction");
  }

  try {
    let translated = "";
    if (provider === "anthropic") {
      translated = await callAnthropic({
        apiKey: process.env.ANTHROPIC_API_KEY,
        system,
        userContent,
      });
    } else {
      const cfg = providerConfig(provider);
      const result = await callOpenAICompatible({
        base: cfg.base,
        key: cfg.key,
        model: cfg.model,
        messages: [{ role: "user", content: userContent }],
        system,
        maxTokens: 2000,
      });
      translated = result.reply || "";
    }

    translated = String(translated).trim();
    if (!translated) {
      return jsonError(res, 502, "Traduction vide");
    }

    // Persistance cache (best-effort)
    try {
      await admin.from("content_translations").upsert(
        {
          content_hash: contentHash,
          source_lang: sourceLang || "auto",
          target_lang: targetLang,
          original_text: text.slice(0, 2000),
          translated_text: translated.slice(0, 8000),
          created_by: user.id,
        },
        { onConflict: "content_hash,target_lang" }
      );
    } catch {
      /* ignore */
    }

    res.setHeader("X-BAARO-AI-Provider", provider);
    return res.status(200).json({
      ok: true,
      translated,
      sourceLang: sourceLang || "auto",
      targetLang,
      cached: false,
      provider,
    });
  } catch (err) {
    console.error("[translate]", err);
    return jsonError(
      res,
      err.status && err.status < 500 ? err.status : 502,
      "Traduction temporairement indisponible"
    );
  }
}

async function hashText(s) {
  // Hash simple stable (pas crypto critique — anti-doublon cache)
  const encoder = new TextEncoder();
  const data = encoder.encode(s);
  if (typeof crypto !== "undefined" && crypto.subtle) {
    const buf = await crypto.subtle.digest("SHA-256", data);
    return [...new Uint8Array(buf)]
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")
      .slice(0, 64);
  }
  // Fallback Node
  const { createHash } = await import("node:crypto");
  return createHash("sha256").update(s).digest("hex").slice(0, 64);
}
