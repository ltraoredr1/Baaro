/**
 * Protection anti-capture d'écran
 * - Web / PWA : flou quand l'onglet perd le focus
 * - Android natif : à activer plus tard avec @capacitor-community/privacy-screen
 *   (ne pas importer ici, sinon le build Vercel casse)
 */

/** No-op sur le web. Sur Android natif, on brancherá le plugin plus tard. */
export async function enableSecureScreen() {
  // Réservé à l'app Android (FLAG_SECURE)
}

/** No-op sur le web. */
export async function disableSecureScreen() {
  // Réservé à l'app Android
}

/**
 * Protection web : floute un élément quand la page perd le focus.
 * Retourne une fonction de nettoyage.
 */
export function attachWebPrivacyBlur(elementId = "chat-content") {
  const getEl = () => document.getElementById(elementId);

  const blur = () => getEl()?.classList.add("privacy-blur");
  const unblur = () => getEl()?.classList.remove("privacy-blur");

  const onVisibility = () => {
    if (document.hidden) blur();
    else unblur();
  };

  window.addEventListener("blur", blur);
  window.addEventListener("focus", unblur);
  document.addEventListener("visibilitychange", onVisibility);

  return () => {
    window.removeEventListener("blur", blur);
    window.removeEventListener("focus", unblur);
    document.removeEventListener("visibilitychange", onVisibility);
    unblur();
  };
}
