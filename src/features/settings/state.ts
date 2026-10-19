/**
 * Helpers d'état et de présentation pour les réglages BAARO.
 *
 * Conserve ici la liste RTL déjà utilisée par ton projet si elle existe
 * dans ce fichier. Les codes ci-dessous sont des exemples de langues RTL.
 */

const RTL = new Set(["ar", "he", "fa", "ur", "ps", "sd", "ug"]);

export function applyDocumentLang(lang: string) {
  try {
    const root = document.documentElement;
    const normalizedLang = String(lang || "fr")
      .trim()
      .toLowerCase();

    const baseLang = normalizedLang.split("-")[0];
    const isRTL = RTL.has(baseLang);

    root.lang = normalizedLang || "fr";
    root.dir = isRTL ? "rtl" : "ltr";

    if (isRTL) {
      root.setAttribute("data-rtl", "1");
      document.body?.classList.add("baaro-rtl-text");
    } else {
      root.removeAttribute("data-rtl");
      document.body?.classList.remove("baaro-rtl-text");
    }
  } catch (error) {
    // L'environnement peut ne pas exposer le document, par exemple
    // pendant un rendu côté serveur.
    console.warn("[settings] Impossible d'appliquer la langue :", error);
  }
}
