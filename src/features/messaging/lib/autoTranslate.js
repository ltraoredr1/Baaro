/**
 * src/features/messaging/lib/autoTranslate.js
 *
 * Traduction directe des messages reçus (Bambara ⇄ Français et autres langues) :
 * préférence de l'utilisateur, langue cible, consentement, file d'attente.
 *
 * Confidentialité : les messages sont chiffrés de bout en bout. Le mode direct
 * envoie chaque message REÇU, un par un, au service de traduction BAARO (sans
 * mise en cache côté serveur) ; il n'est donc activé qu'après un consentement
 * explicite, et peut être coupé à tout moment. Les traductions restent en
 * mémoire uniquement (jamais écrites sur le disque).
 */
import { useSyncExternalStore } from "react";
import i18n from "../../../../i18n.js";
import { supabase } from "../../../supabaseClient.js";
import { TRANSLATE_LANGS, translateText } from "../../../lib/translateApi.js";
import { createTranslateQueue } from "./translateQueue.js";

const AUTO_KEY = "baaro:chat-autotranslate";
const CONSENT_KEY = "baaro:chat-translate-consent";

// Langues locales de l'interface sans traduction directe : on traduit alors vers le français.
const UI_LANG_FALLBACK = { boz: "fr", dog: "fr", snk: "fr", nqo: "fr", wo: "fr", ff: "fr" };

/** Langue dans laquelle l'utilisateur veut lire : celle de son interface. */
export function chatTargetLang() {
  const raw = String(i18n.language || "fr").split("-")[0].toLowerCase();
  const mapped = UI_LANG_FALLBACK[raw] || raw;
  return TRANSLATE_LANGS.some((l) => l.code === mapped) ? mapped : "fr";
}

function readFlag(key) {
  try {
    return localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

function writeFlag(key, on) {
  try {
    if (on) localStorage.setItem(key, "1");
    else localStorage.removeItem(key);
  } catch {
    /* stockage indisponible */
  }
}

/* ---- consentement (partagé avec le bouton « Traduire » d'un message) ---- */
export const hasChatConsent = () => readFlag(CONSENT_KEY);
export const giveChatConsent = () => writeFlag(CONSENT_KEY, true);

/* ---- préférence « mode direct » (petit store externe pour React) ---- */
const listeners = new Set();
const emit = () => listeners.forEach((l) => l());

if (typeof window !== "undefined") {
  // Autre onglet / autre fenêtre : on reste synchronisé.
  window.addEventListener("storage", (e) => {
    if (e.key === AUTO_KEY) emit();
  });
}

export const isAutoTranslateOn = () => readFlag(AUTO_KEY);

/** Active (avec consentement) ou coupe le mode direct. */
export function setAutoTranslate(on) {
  if (on) giveChatConsent();
  writeFlag(AUTO_KEY, !!on);
  emit();
}

export function useAutoTranslate() {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    isAutoTranslateOn,
    () => false
  );
}

/* ---- file d'attente partagée par tous les messages de l'app ---- */
const queue = createTranslateQueue({
  translate: async (text, lang) => {
    const data = await translateText(text, lang, null, { private: true, preferBambara: true });
    return String(data?.translated || "").trim();
  },
});

/** Traduction mémorisée, sans réseau (ou undefined). */
export const peekTranslation = (text, lang) => queue.peek(text, lang);

/** Traduit un message reçu (file d'attente, cache mémoire, limite de débit). */
export const translateForChat = (text, lang, opts) => queue.enqueue(text, lang, opts);

/** On n'emporte aucun message déchiffré d'une session à l'autre. */
export const clearChatTranslations = () => queue.clear();

try {
  supabase.auth.onAuthStateChange((event) => {
    if (event === "SIGNED_OUT") clearChatTranslations();
  });
} catch {
  /* client indisponible (tests, SSR) : sans importance */
}
