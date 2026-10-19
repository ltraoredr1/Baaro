
/**
 * BAARO — configuration i18next
 * Langues UI :
 * fr, en, ar, bm, nqo, boz, dog, snk, pt, es, sw, wo, ha, ff
 * Persistance : localStorage `baaro_i18n_lng`
 * Traductions : locales/<code>.json
 */

import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import fr from "./locales/fr.json";
import en from "./locales/en.json";
import ar from "./locales/ar.json";
import bm from "./locales/bm.json";
import nqo from "./locales/nqo.json";
import boz from "./locales/boz.json";
import dog from "./locales/dog.json";
import snk from "./locales/snk.json";
import pt from "./locales/pt.json";
import es from "./locales/es.json";
import sw from "./locales/sw.json";
import wo from "./locales/wo.json";
import ha from "./locales/ha.json";
import ff from "./locales/ff.json";

export const SUPPORTED_LANGUAGES = [
  "fr",
  "en",
  "ar",
  "bm",
  "nqo",
  "boz",
  "dog",
  "snk",
  "pt",
  "es",
  "sw",
  "wo",
  "ha",
  "ff",
];

export const RTL_LANGUAGES = ["ar", "nqo"];

const STORAGE_KEY = "baaro_i18n_lng";

function normalizeLanguage(code) {
  return String(code || "fr").trim().toLowerCase().split("-")[0] || "fr";
}

function readStoredLanguage() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const lang = normalizeLanguage(stored);
      if (SUPPORTED_LANGUAGES.includes(lang)) return lang;
    }
  } catch {
    // localStorage peut être indisponible.
  }

  return null;
}

function guessDefaultLanguage() {
  const stored = readStoredLanguage();
  if (stored) return stored;

  try {
    const browserLanguage =
      navigator.language ||
      navigator.languages?.[0] ||
      "fr";

    const lang = normalizeLanguage(browserLanguage);

    if (SUPPORTED_LANGUAGES.includes(lang)) return lang;
  } catch {
    // Utiliser le français par défaut.
  }

  return "fr";
}

/**
 * Applique la langue et la direction du document.
 * L'arabe et le N'Ko utilisent RTL.
 */
function applyDocumentDirection(code) {
  try {
    const lang = normalizeLanguage(code);
    const isRTL = RTL_LANGUAGES.includes(lang);
    const root = document.documentElement;

    root.setAttribute("lang", lang);
    root.setAttribute("dir", isRTL ? "rtl" : "ltr");

    if (isRTL) {
      root.setAttribute("data-rtl", "1");
      document.body?.classList.add("baaro-rtl-text");
    } else {
      root.removeAttribute("data-rtl");
      document.body?.classList.remove("baaro-rtl-text");
    }
  } catch (error) {
    console.warn(
      "[i18n] Impossible d'appliquer la direction du document :",
      error
    );
  }
}

if (!i18n.isInitialized) {
  i18n.use(initReactI18next).init({
    resources: {
      fr: { translation: fr },
      en: { translation: en },
      ar: { translation: ar },
      bm: { translation: bm },
      nqo: { translation: nqo },
      boz: { translation: boz },
      dog: { translation: dog },
      snk: { translation: snk },
      pt: { translation: pt },
      es: { translation: es },
      sw: { translation: sw },
      wo: { translation: wo },
      ha: { translation: ha },
      ff: { translation: ff },
    },

    lng: guessDefaultLanguage(),
    fallbackLng: "fr",
    supportedLngs: SUPPORTED_LANGUAGES,

    interpolation: {
      escapeValue: false,
    },

    react: {
      useSuspense: false,
    },
  });
}

i18n.on("languageChanged", (lng) => {
  try {
    localStorage.setItem(STORAGE_KEY, normalizeLanguage(lng));
  } catch {
    // La langue reste utilisable sans persistance locale.
  }

  applyDocumentDirection(lng);
});

// Appliquer aussi la direction au démarrage.
applyDocumentDirection(i18n.language);

/**
 * Change la langue de l'interface.
 * Ignore les codes non pris en charge.
 */
export function setAppLanguage(code) {
  const lang = normalizeLanguage(code);

  if (!SUPPORTED_LANGUAGES.includes(lang)) {
    return Promise.resolve(i18n.language);
  }

  return i18n.changeLanguage(lang);
}

export default i18n;
