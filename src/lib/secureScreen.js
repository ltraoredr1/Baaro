/**
 * Protection anti-capture d'écran
 * - Android (Capacitor) : FLAG_SECURE réel
 * - Web / PWA : flou quand l'onglet perd le focus
 */
import { Capacitor } from "@capacitor/core";

let privacyPlugin = null;

async function getPlugin() {
  if (privacyPlugin) return privacyPlugin;
  if (Capacitor.getPlatform() !== "android") return null;
  try {
    const mod = await import("@capacitor-community/privacy-screen");
    privacyPlugin = mod.PrivacyScreen;
    return privacyPlugin;
  } catch {
    return null;
  }
}

/** Active le blocage des captures (Android) */
export async function enableSecureScreen() {
  const plugin = await getPlugin();
  if (!plugin) return;
  try {
    await plugin.enable();
  } catch (err) {
    console.warn("[secureScreen] enable:", err?.message);
  }
}

/** Désactive le blocage */
export async function disableSecureScreen() {
  const plugin = await getPlugin();
  if (!plugin) return;
  try {
    await plugin.disable();
  } catch {
    // ignore
  }
}

/**
 * Protection web : floute un élément quand la page perd le focus.
 * Retourne une fonction de nettoyage.
 */
export function attachWebPrivacyBlur(elementId = "chat-content") {
  const el = () => document.getElementById(elementId);

  const blur = () => el()?.classList.add("privacy-blur");
  const unblur = () => el()?.classList.remove("privacy-blur");

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
