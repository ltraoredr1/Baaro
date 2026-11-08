import { TextToSpeech } from "@capacitor-community/text-to-speech";
import {
  GRIOT_KEY,
  GRIOT_VOICE_ALIASES,
  GRIOT_VOICE_KEY,
  GRIOT_VOICE_PROFILES,
  PROVIDER_LABELS,
  SPEECH_PRONUNCIATIONS,
} from "./aiAssistantConfig.js";

/* ---------- Synthèse vocale ---------- */

export function applyPronunciations(text) {
  return SPEECH_PRONUNCIATIONS.reduce(
    (result, { pattern, spoken }) => result.replace(pattern, spoken),
    text
  );
}

export function cleanTextForSpeech(text) {
  return applyPronunciations(String(text || ""))
    .replace(/```[\s\S]*?```/g, " bloc de code omis ")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/https?:\/\/\S+/gi, " lien ")
    .replace(/[*#_`~]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export async function findNativeVoice(voiceKey) {
  try {
    const { voices = [] } = await TextToSpeech.getSupportedVoices();
    const french = voices
      .map((voice, index) => ({ voice, index }))
      .filter(({ voice }) => /^fr(?:-|_|$)/i.test(String(voice?.lang || "")));
    if (!french.length) return undefined;
    const profile = GRIOT_VOICE_PROFILES[voiceKey];
    const profileName = profile?.label?.toLowerCase() || "";
    const femaleWords = /female|femme|woman|女性|fran[cç]aise|google fran[cç]ais|amelie|audrey|marie|julie|sophie|claire|fatou|aminata|mariam|awa/i;
    const maleWords = /male|homme|man|masculin|homme fran[cç]ais|thomas|paul|pierre|jacques|moussa|bakary|oumar/i;
    const score = ({ voice }) => {
      const name = String(voice?.name || "").toLowerCase();
      const genderMatch =
        profile?.gender === "male" ? maleWords.test(name) : femaleWords.test(name);
      return (
        (name.includes(profileName) ? 4 : 0) +
        (genderMatch ? 3 : 0) +
        (voice?.localService ? 1 : 0)
      );
    };
    const ranked = [...french].sort((a, b) => score(b) - score(a));
    return ranked[0]?.index;
  } catch {
    return undefined;
  }
}

/* ---------- Affichage ---------- */

export function resolveAssistantName(profile) {
  const candidates = [profile?.display_name, profile?.first_name, profile?.handle];
  const value = candidates
    .map((item) => String(item || "").trim())
    .find((item) => item && !/^membre baaro$/i.test(item));
  return value?.replace(/^@/, "") || "ami";
}

// Accepte uniquement http(s) : sert pour les images ET les liens de sources
// (évite les href « javascript: » venant d'une réponse serveur).
export function getSafeHttpUrl(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url.href;
  } catch {
    return null;
  }
}

export function getProviderLabel(provider, isGriot) {
  if (isGriot) return "Fa-Baaro · Griotte";
  if (typeof provider !== "string" || !provider.trim()) return "IA Active";
  const key = provider.trim().toLowerCase();
  return PROVIDER_LABELS[key] || provider.trim();
}

/* ---------- Conversation ---------- */

export function makeWelcome(name, isGriot) {
  if (isGriot) {
    return {
      id: "welcome",
      role: "assistant",
      text: `I ko, ${name || "ami·e de BAARO"}... 👋\nJe suis Fa-Baaro, la voix numérique de BAARO, inspirée par l'écoute et la parole transmises de génération en génération. Je ne suis pas une personne réelle et je ne remplacerai jamais un proche ou un professionnel.\nAssieds-toi, parle-moi : je t'aiderai à réfléchir avec douceur et clarté.`,
    };
  }
  return {
    id: "welcome",
    role: "assistant",
    text: `Salut${name ? ` ${name}` : ""} ! 👋\nJe suis l'Assistant IA de BAARO : résumés, débats, aide au quotidien et idées de contenu. Pour les proverbes et la tradition, active la Griotte. Que veux-tu faire ?`,
  };
}

export function loadStoredMessages(key, name, isGriot) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [makeWelcome(name, isGriot)];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return [makeWelcome(name, isGriot)];
    }
    const valid = parsed.filter(
      (m) =>
        m &&
        typeof m.id === "string" &&
        (m.role === "user" || m.role === "assistant") &&
        typeof m.text === "string" &&
        !m.isError
    );
    if (valid.length === 0) return [makeWelcome(name, isGriot)];
    return valid[0].id === "welcome"
      ? [makeWelcome(name, isGriot), ...valid.slice(1)]
      : [makeWelcome(name, isGriot), ...valid];
  } catch {
    return [makeWelcome(name, isGriot)];
  }
}

/* ---------- Préférences stockées ---------- */

export function readGriotMode() {
  try {
    return localStorage.getItem(GRIOT_KEY) === "1";
  } catch {
    return false;
  }
}

export function readGriotVoice() {
  try {
    const stored = localStorage.getItem(GRIOT_VOICE_KEY);
    if (stored && GRIOT_VOICE_PROFILES[stored]) return stored;
    return GRIOT_VOICE_ALIASES[stored] || "fatou";
  } catch {
    return "fatou";
  }
}

export function isTouchDevice() {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(pointer: coarse)").matches
  );
}
