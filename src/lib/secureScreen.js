/**
 * Protection anti-capture d'écran
 * - Android natif : FLAG_SECURE via @capacitor-community/privacy-screen
 *   (import dynamique : le plugin n'est jamais chargé sur le web, le build Vercel ne casse pas)
 * - Web / PWA : flou (classe .privacy-blur de index.css) quand l'onglet perd le focus.
 *   C'est une dissuasion, pas un vrai blocage.
 *
 * enableSecureScreen / disableSecureScreen sont idempotents et laissent
 * remonter les erreurs natives à l'appelant (voir nativeSettings.js).
 */
import { Capacitor } from "@capacitor/core";

const BLUR_CLASS = "privacy-blur";
const ROOT_ID = "root";

let detachWeb = null;

/**
 * Active la protection : FLAG_SECURE sur Android natif,
 * flou de toute l'application sur le web.
 */
export async function enableSecureScreen() {
  if (Capacitor.isNativePlatform()) {
    const { PrivacyScreen } = await import("@capacitor-community/privacy-screen");
    await PrivacyScreen.enable();
    return;
  }
  if (!detachWeb) detachWeb = attachWebPrivacyBlur(null);
}

/** Désactive la protection (natif ou web). */
export async function disableSecureScreen() {
  if (Capacitor.isNativePlatform()) {
    const { PrivacyScreen } = await import("@capacitor-community/privacy-screen");
    await PrivacyScreen.disable();
    return;
  }
  detachWeb?.();
  detachWeb = null;
}

/**
 * Protection web : floute un élément quand la page perd le focus.
 * Sans elementId (ou si l'élément n'existe pas dans la page courante,
 * par exemple dans les Réglages), c'est toute l'application (#root) qui est floutée.
 * On ne met jamais le filtre sur <html> : un filter y casserait les éléments
 * position: fixed (navigation basse).
 * Retourne une fonction de nettoyage.
 */
export function attachWebPrivacyBlur(elementId = "chat-content") {
  if (typeof window === "undefined") return () => {};

  const getEl = () =>
    (elementId ? document.getElementById(elementId) : null) ||
    document.getElementById(ROOT_ID);

  const blur = () => getEl()?.classList.add(BLUR_CLASS);
  const unblur = () => {
    document.getElementById(ROOT_ID)?.classList.remove(BLUR_CLASS);
    if (elementId) document.getElementById(elementId)?.classList.remove(BLUR_CLASS);
  };

  const onVisibility = () => {
    if (document.hidden) blur();
    else if (document.hasFocus()) unblur();
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
