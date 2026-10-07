/**
 * BAARO — configuration i18next
 * Langues UI complètes :
 *   fr, en, ar, bm, nqo, boz, dog, snk, pt, es, sw, wo, ha, ff
 * Persistance : localStorage `baaro_i18n_lng`
 * Chaînes : locales/<code>.json
 *   (auth, shop, payment, common, nav, app, economy, settings, feed, messages)
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
  "fr", "en", "ar", "bm", "nqo", "boz", "dog", "snk",
  "pt", "es", "sw", "wo", "ha", "ff",
];
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
    document.documentElement.lang = lang;
    if (RTL_LANGUAGES.includes(lang)) {
      document.documentElement.setAttribute("data-rtl", "1");
      document.documentElement.dir = "ltr";
      document.body?.classList?.add("baaro-rtl-text");
    } else {
      document.documentElement.removeAttribute("data-rtl");
      document.documentElement.dir = "ltr";
      document.body?.classList?.remove("baaro-rtl-text");
    }
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
    localStorage.setItem(STORAGE_KEY, lng);
  } catch {
    /* ignore */
  }
  applyDocumentDirection(lng);
});

applyDocumentDirection(i18n.language);

/** Change la langue UI. Ignore les codes hors UI complète. */
export function setAppLanguage(code) {
  const lng = String(code || "").split("-")[0].toLowerCase();
  if (!SUPPORTED_LANGUAGES.includes(lng)) return Promise.resolve(i18n.language);
  return i18n.changeLanguage(lng);
}

export default i18n;
