/**
 * Client BAARO — traduction texte & média
 * Utilise le token de session Supabase. Aucune clé IA côté navigateur.
 */
import { supabase } from "../supabaseClient.js";
import { API_BASE } from "../config.js";

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
  { code: "vi", label: "Tiếng Việt" },
  { code: "id", label: "Indonesia" },
];

async function authHeaders() {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("Non authentifié");
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${session.access_token}`,
  };
}

/**
 * Traduit un texte vers targetLang (code ISO, ex: "en").
 */
export async function translateText(text, targetLang, sourceLang = null) {
  const headers = await authHeaders();
  const res = await fetch(`${API_BASE}/api/translate`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      text,
      targetLang,
      ...(sourceLang ? { sourceLang } : {}),
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Traduction impossible");
  return data;
}

/**
 * Traduit une vidéo / audio.
 * mode: "subtitles" (défaut) | "dub"
 */
export async function translateMedia({
  mediaUrl,
  targetLang,
  mode = "subtitles",
  videoId = null,
  sourceLang = null,
}) {
  const headers = await authHeaders();
  const res = await fetch(`${API_BASE}/api/translate-media`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      mediaUrl,
      targetLang,
      mode,
      videoId,
      sourceLang,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Traduction média impossible");
  return data;
}
