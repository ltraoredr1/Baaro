import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import fr from './locales/fr.json';
import en from './locales/en.json';
import ar from './locales/ar.json';

export const SUPPORTED_LANGUAGES = ['fr', 'en', 'ar'];
export const RTL_LANGUAGES = ['ar']; // ajouter 'he', 'ur', etc. plus tard au besoin

function guessDefaultLanguage() {
  try {
    const browserLang = (navigator.language || navigator.languages?.[0] || 'en').split('-')[0];
    if (SUPPORTED_LANGUAGES.includes(browserLang)) return browserLang;
  } catch {
    // ignore
  }
  return 'en';
}

i18n.use(initReactI18next).init({
  resources: {
    fr: { translation: fr },
    en: { translation: en },
    ar: { translation: ar },
  },
  lng: guessDefaultLanguage(),
  fallbackLng: 'en',
  interpolation: { escapeValue: false }, // React échappe déjà le HTML
});

// Applique automatiquement dir="rtl"/"ltr" et lang="xx" sur <html>
// à chaque changement de langue — nécessaire pour que le layout entier
// (pas juste le texte) s'inverse correctement pour l'arabe.
function applyDocumentDirection(lng) {
  document.documentElement.dir = RTL_LANGUAGES.includes(lng) ? 'rtl' : 'ltr';
  document.documentElement.lang = lng;
}

i18n.on('languageChanged', applyDocumentDirection);
applyDocumentDirection(i18n.language);

export default i18n;
