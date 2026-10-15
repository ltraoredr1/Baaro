/**
 * Client BAARO — traduction texte & média
 * Utilise le token de session Supabase. Aucune clé IA côté navigateur.
 *
 * Moteur backend : Google Gemini
 */
import { supabase } from "../supabaseClient.js";
import { API_BASE } from "../config.js";

// Liste des 30 langues supportées
export const TRANSLATE_LANGS = [
  { code: "fr", label: "Français" },
  { code: "en", label: "English" },
  { code: "es", label: "Español" },
  { code: "pt", label: "Português" },
  { code: "ar", label: "العربية" },
  { code: "zh", label: "中文" },
  { code: "hi", label: "हिन्दी" },
  { code: "ru", label: "Русский" },
  { code: "ja", label: "日本語" },
  { code: "de", label: "Deutsch" },
  { code: "sw", label: "Kiswahili" },
  { code: "it", label: "Italiano" },
  { code: "ko", label: "한국어" },
  { code: "tr", label: "Türkçe" },
  { code: "nl", label: "Nederlands" },
  { code: "pl", label: "Polski" },
  { code: "uk", label: "Українська" },
  { code: "vi", label: "Tiếng Việt" },
  { code: "id", label: "Bahasa Indonesia" },
  { code: "th", label: "ไทย" },
  { code: "bn", label: "বাংলা" },
  { code: "ha", label: "Hausa" },
  { code: "yo", label: "Yorùbá" },
  { code: "ig", label: "Igbo" },
  { code: "am", label: "አማርኛ" },
  { code: "zu", label: "isiZulu" },
  { code: "af", label: "Afrikaans" },
  { code: "fa", label: "فارسی" },
  { code: "he", label: "עברית" },
  { code: "sv", label: "Svenska" },
];

const LANG_CODES = new Set(TRANSLATE_LANGS.map((l) => l.code));
const RTL_LANGS = new Set(["ar", "fa", "he"]);

const MAX_TEXT_LENGTH = 5000;
const MEDIA_MODES = new Set(["subtitles", "dub"]);

const CACHE_MAX = 200;
const textCache = new Map();

export class TranslateError extends Error {
  constructor(message, status = 0) {
    super(message);
    this.name = "TranslateError";
    this.status = status;
  }
}

export function langLabel(code) {
  return TRANSLATE_LANGS.find((l) => l.code === code)?.label || code;
}

export function isRtl(code) {
  return RTL_LANGS.has(String(code || "").slice(0, 2).toLowerCase());
}

function normalizeLang(code) {
  return String(code || "").trim().toLowerCase().slice(0, 2);
}

function assertTargetLang(targetLang) {
  const code = normalizeLang(targetLang);
  if (!LANG_CODES.has(code)) {
    throw new TranslateError("Cette langue de traduction n'est pas disponible.", 400);
  }
  return code;
}

function messageFor(status, serverMessage, fallback) {
  if (status === 401) return "Ta session a expiré. Reconnecte-toi, puis réessaie.";
  if (status === 413) return "Le contenu est trop volumineux à traduire.";
  if (status === 429) return "Trop de demandes. Attends une minute, puis réessaie.";
  if (status >= 500) {
    return "Le service de traduction est temporairement indisponible. Réessaie dans un instant.";
  }
  return (typeof serverMessage === "string" && serverMessage) || fallback;
}

async function authHeaders() {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) {
    throw new TranslateError("Ta session a expiré. Reconnecte-toi, puis réessaie.", 401);
  }
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${session.access_token}`,
  };
}

async function post(path, body, { signal, timeoutMs = 30000 } = {}, fallbackMessage) {
  const headers = await authHeaders();

  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener("abort", () => controller.abort(), { once: true });
  }

  try {
    const res = await fetch(`${API_BASE}${path}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new TranslateError(messageFor(res.status, data.error, fallbackMessage), res.status);
    }
    return data;
  } catch (e) {
    if (e instanceof TranslateError) throw e;
    if (e.name === "AbortError") {
      if (timedOut) {
        throw new TranslateError(
          "La traduction prend trop de temps. Réessaie avec un contenu plus court.",
          408
        );
      }
      throw e;
    }
    throw new TranslateError("Connexion impossible. Vérifie ton Internet, puis réessaie.", 0);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Traduit un texte vers targetLang (code ISO, ex: "en").
 */
export async function translateText(text, targetLang, sourceLang = null, options = {}) {
  const clean = String(text ?? "").trim();
  if (!clean) throw new TranslateError("Il n'y a aucun texte à traduire.", 400);
  if (clean.length > MAX_TEXT_LENGTH) {
    throw new TranslateError(`Le texte dépasse ${MAX_TEXT_LENGTH} caractères.`, 400);
  }
  const target = assertTargetLang(targetLang);
  const source = sourceLang ? normalizeLang(sourceLang) : null;

  const cacheKey = `${source || "auto"}|${target}|${clean}`;
  if (textCache.has(cacheKey)) return textCache.get(cacheKey);

  const data = await post(
    "/api/translate",
    { text: clean, targetLang: target, ...(source ? { sourceLang: source } : {}) },
    options,
    "Traduction impossible. Réessaie dans un instant."
  );

  if (textCache.size >= CACHE_MAX) {
    textCache.delete(textCache.keys().next().value);
  }
  textCache.set(cacheKey, data);
  return data;
}

/**
 * Traduit une vidéo / audio via Gemini (Sous-titres ou Doublage).
 */
export async function translateMedia(
  { mediaUrl, targetLang, mode = "subtitles", videoId = null, sourceLang = null },
  options = {}
) {
  if (typeof mediaUrl !== "string" || !/^https?:\/\//i.test(mediaUrl.trim())) {
    throw new TranslateError("L'adresse du média est invalide.", 400);
  }
  if (!MEDIA_MODES.has(mode)) {
    throw new TranslateError("Mode de traduction inconnu (sous-titres ou doublage).", 400);
  }
  const target = assertTargetLang(targetLang);

  return post(
    "/api/translate-media",
    {
      mediaUrl: mediaUrl.trim(),
      targetLang: target,
      mode,
      videoId,
      sourceLang: sourceLang ? normalizeLang(sourceLang) : null,
    },
    { timeoutMs: 120000, ...options },
    "Traduction du média impossible. Réessaie dans un instant."
  );
}
