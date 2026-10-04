/**
 * BAARO — configuration i18next
 * Langues UI complètes : fr, en, ar
 * Persistance : localStorage `baaro_i18n_lng`
 */
import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import fr from "./locales/fr.json";
import en from "./locales/en.json";
import ar from "./locales/ar.json";
import nqo from "./locales/nqo.json";
import boz from "./locales/boz.json";
import dog from "./locales/dog.json";
import snk from "./locales/snk.json";

export const SUPPORTED_LANGUAGES = ["fr", "en", "ar", "nqo", "boz", "dog", "snk"];
export const RTL_LANGUAGES = ["ar", "nqo"];

const STORAGE_KEY = "baaro_i18n_lng";

function readStoredLanguage() {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v && SUPPORTED_LANGUAGES.includes(v)) return v;
  } catch {
    /* ignore */
  }
  return null;
}

function guessDefaultLanguage() {
  const stored = readStoredLanguage();
  if (stored) return stored;
  try {
    const browserLang = (navigator.language || navigator.languages?.[0] || "fr")
      .split("-")[0]
      .toLowerCase();
    if (SUPPORTED_LANGUAGES.includes(browserLang)) return browserLang;
  } catch {
    /* ignore */
  }
  return "fr";
}

function applyDocumentDirection(lng) {
  try {
    const lang = (lng || "fr").split("-")[0];
    document.documentElement.dir = RTL_LANGUAGES.includes(lang) ? "rtl" : "ltr";
    document.documentElement.lang = lang;
  } catch {
    /* ignore */
  }
}

if (!i18n.isInitialized) {
  i18n.use(initReactI18next).init({
    resources: {
      fr: { translation: fr },
      en: { translation: en },
      ar: { translation: ar },
      nqo: { translation: nqo },
      boz: { translation: boz },
      dog: { translation: dog },
      snk: { translation: snk },
    },
    lng: guessDefaultLanguage(),
    fallbackLng: "fr",
    supportedLngs: SUPPORTED_LANGUAGES,
    interpolation: {
      escapeValue: false, // React échappe déjà
    },
    react: {
      useSuspense: false, // évite Suspense obligatoire au démarrage
    },
  });
}

i18n.on("languageChanged", (lng) => {
  try {
    localStorage.setItem(STORAGE_KEY, lng);
  } catch {
    /* ignore */
  }
  applyDocumentDirection(lng);
});

applyDocumentDirection(i18n.language);

/** Change la langue UI (fr | en | ar). Ignore les codes hors UI complète. */
export function setAppLanguage(code) {
  const lng = String(code || "").split("-")[0].toLowerCase();
  if (!SUPPORTED_LANGUAGES.includes(lng)) return Promise.resolve(i18n.language);
  return i18n.changeLanguage(lng);
}

export default i18n;
