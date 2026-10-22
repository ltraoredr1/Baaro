/**
 * Helpers d'état et de présentation pour les réglages BAARO.
 *
 * Corrections :
 * - SettingsState est maintenant exporté (index.tsx l'importe).
 * - DEFAULT_CUSTOM_THEME avait {} alors que bgColor / accent sont obligatoires :
 *   sélecteurs de couleur sans valeur et fond « undefined » sur le thème perso.
 * - uiLang réduit "en-US" → "en" (avant : aucune traduction trouvée).
 * - La liste des langues RTL vient d'appSettings (une seule source).
 *   applyDocumentLang / applyA11y ne font que le DOM (sans événement) ;
 *   useSettings applique déjà tout, ils restent pour compatibilité.
 */
import {
  DEFAULT_SETTINGS,
  loadLocalSettings,
  RTL_LANGS,
} from "../../lib/appSettings.js";
import type { CustomTheme } from "./constants";

export { DEFAULT_SETTINGS };

export type SettingsState = typeof DEFAULT_SETTINGS & {
  customTheme?: CustomTheme | null;
};

/** Compatibilité avec les imports existants. */
export function loadLocal(): SettingsState {
  return loadLocalSettings() as SettingsState;
}

/** Code de langue de base pour choisir le dictionnaire ("en-US" → "en"). */
export function uiLang(lang: string): string {
  const base = String(lang || "fr")
    .trim()
    .toLowerCase()
    .split(/[-_]/)[0];
  return base || "fr";
}

/** Thème personnalisé par défaut (correspond à CustomTheme). */
export const DEFAULT_CUSTOM_THEME: CustomTheme = {
  bgColor: "#0B1220",
  accent: "#D9AE52",
  bgImage: null,
};

/** Langue + direction du document. */
export function applyDocumentLang(lang: string) {
  try {
    const root = document.documentElement;
    const code = String(lang || "fr").trim() || "fr";
    const isRTL = RTL_LANGS.has(uiLang(code));

    root.lang = code;
    root.dir = isRTL ? "rtl" : "ltr";

    if (isRTL) root.setAttribute("data-rtl", "1");
    else root.removeAttribute("data-rtl");

    document.body?.classList.toggle("baaro-rtl-text", isRTL);
  } catch (error) {
    console.warn("[settings] Impossible d'appliquer la langue :", error);
  }
}

/** Accessibilité : texte agrandi, animations réduites. */
export function applyA11y(settings: Record<string, unknown>) {
  try {
    const root = document.documentElement;

    root.classList.toggle("baaro-large-text", Boolean(settings.large_text));
    root.classList.toggle("baaro-reduce-motion", Boolean(settings.reduce_motion));

    if (settings.large_text) root.setAttribute("data-large-text", "1");
    else root.removeAttribute("data-large-text");

    if (settings.reduce_motion) root.setAttribute("data-reduce-motion", "1");
    else root.removeAttribute("data-reduce-motion");
  } catch (error) {
    console.warn("[settings] Impossible d'appliquer l'accessibilité :", error);
  }
}
