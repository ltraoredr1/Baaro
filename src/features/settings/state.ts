/**

* Helpers d'état et de présentation pour les réglages BAARO.
  */

import {
DEFAULT_SETTINGS,
loadLocalSettings,
} from "../../lib/appSettings.js";

const RTL = new Set(["ar", "he", "fa", "ur", "ps", "sd", "ug", "nqo"]);

export { DEFAULT_SETTINGS };

/**

* Compatibilité avec les imports existants de index.tsx.
  */
  export function loadLocal() {
  return loadLocalSettings();
  }

/**

* Normalise la langue pour l'interface.
  */
  export function uiLang(lang: string): string {
  const value = String(lang || "fr").trim().toLowerCase();
  return value || "fr";
  }

/**

* Thème personnalisé par défaut.
* Vérifie que les propriétés correspondent à celles utilisées
* dans index.tsx avant d'ajouter une personnalisation.
  */
  export const DEFAULT_CUSTOM_THEME = {};

/**

* Applique la langue et la direction du document.
  */
  export function applyDocumentLang(lang: string) {
  try {
  const root = document.documentElement;
  const normalizedLang = uiLang(lang);
  const baseLang = normalizedLang.split("-")[0];
  const isRTL = RTL.has(baseLang);
  
  root.lang = normalizedLang;
  root.dir = isRTL ? "rtl" : "ltr";
  
  if (isRTL) {
  root.setAttribute("data-rtl", "1");
  document.body?.classList.add("baaro-rtl-text");
  } else {
  root.removeAttribute("data-rtl");
  document.body?.classList.remove("baaro-rtl-text");
  }
  } catch (error) {
  console.warn("[settings] Impossible d'appliquer la langue :", error);
  }
  }
