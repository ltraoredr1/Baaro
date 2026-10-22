/**
 * Protection anti-capture d'écran
 * - Natif (Android / iOS) : @capacitor-community/privacy-screen
 *   (FLAG_SECURE sur Android ; masquage de l'aperçu multitâche sur iOS).
 *   Import dynamique : le plugin n'est jamais chargé sur le web, le build Vercel ne casse pas.
 * - Web / PWA : flou quand l'onglet perd le focus.
 *   C'est une dissuasion, pas un vrai blocage.
 *
 * enableSecureScreen / disableSecureScreen sont idempotents et laissent
 * remonter les erreurs natives à l'appelant (voir nativeSettings.js).
 */
import { Capacitor } from "@capacitor/core";

const BLUR_CLASS = "privacy-blur";
const OVERLAY_ID = "privacy-overlay";

let detachWeb = null;

/**
 * Active la protection : plugin natif, ou flou de toute l'application sur le web.
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
 * Voile flouté plein écran ajouté à <body>.
 * Contrairement à un filter sur #root, il couvre AUSSI les modales et toasts
 * rendus en portail hors de #root, et ne casse pas les éléments position: fixed
 * (un filter sur un ancêtre devient leur bloc conteneur).
 */
function showOverlay() {
  if (document.getElementById(OVERLAY_ID)) return;
  const el = document.createElement("div");
  el.id = OVERLAY_ID;
  el.setAttribute("aria-hidden", "true");
  Object.assign(el.style, {
    position: "fixed",
    inset: "0",
    zIndex: "2147483647",
    background: "rgba(0,0,0,.35)",
    backdropFilter: "blur(24px)",
    webkitBackdropFilter: "blur(24px)",
    pointerEvents: "none",
  });
  document.body.appendChild(el);
}

function hideOverlay() {
  document.getElementById(OVERLAY_ID)?.remove();
}

/**
 * Protection web : floute quand la page perd le focus.
 * - Avec elementId (et si l'élément existe) : seul cet élément reçoit la classe .privacy-blur.
 * - Sinon : voile flouté sur toute la page (voir showOverlay).
 * Retourne une fonction de nettoyage.
 */
export function attachWebPrivacyBlur(elementId = "chat-content") {
  if (typeof window === "undefined") return () => {};

  const getTarget = () => (elementId ? document.getElementById(elementId) : null);

  const blur = () => {
    const target = getTarget();
    if (target) target.classList.add(BLUR_CLASS);
    else showOverlay();
  };

  const unblur = () => {
    getTarget()?.classList.remove(BLUR_CLASS);
    hideOverlay();
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
