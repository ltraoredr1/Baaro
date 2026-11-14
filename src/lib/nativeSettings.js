import { Capacitor } from "@capacitor/core";
import { enableSecureScreen, disableSecureScreen } from "./secureScreen.js";

// Idempotent : peut être appelé à chaque changement de réglage sans effet de bord.
let lastBlock = null;
let biometricEnabled = false;
let listenerReady = false;
let coldChecked = false;
let authenticating = false;
let lastAuthEnd = 0;

const REASON = "Déverrouiller BAARO";

// La biométrie dépend de l'appareil : elle n'est active que si elle a été
// vérifiée ICI (jamais déduite d'un réglage venu d'un autre appareil).
const DEVICE_KEY = "baaro_biometric_device_v1";

export function isBiometricVerifiedOnDevice() {
  try { return localStorage.getItem(DEVICE_KEY) === "1"; } catch { return false; }
}
export function markBiometricDevice(ok) {
  try {
    if (ok) localStorage.setItem(DEVICE_KEY, "1");
    else localStorage.removeItem(DEVICE_KEY);
  } catch { /* ignore */ }
}

/** true = déverrouillé (ou aucun verrou disponible), false = refusé/annulé. */
async function authenticate() {
  if (authenticating) return true;
  authenticating = true;
  try {
    const { BiometricAuth } = await import("@aparajita/capacitor-biometric-auth");
    const info = await BiometricAuth.checkBiometry();
    // Aucun verrou possible : ni biométrie, ni code/schéma du téléphone.
    if (!info.isAvailable && !info.deviceIsSecure) return true;
    await BiometricAuth.authenticate({
      reason: REASON,
      allowDeviceCredential: true, // code/schéma du téléphone en secours : évite le blocage définitif
    });
    return true;
  } catch (e) {
    if (e?.code !== "userCancel") console.warn("[native] biometric", e);
    return false;
  } finally {
    authenticating = false;
    lastAuthEnd = Date.now();
  }
}

/**
 * À appeler AVANT d'activer le réglage « biometric » : vérifie que
 * l'utilisateur peut réellement s'authentifier (sinon il se verrouille dehors).
 * Sur le web, il n'y a rien à vérifier.
 */
export async function confirmBiometricEnable() {
  if (!Capacitor.isNativePlatform()) return true;
  try {
    const { BiometricAuth } = await import("@aparajita/capacitor-biometric-auth");
    const info = await BiometricAuth.checkBiometry();
    if (!info.isAvailable && !info.deviceIsSecure) return false;
  } catch (e) {
    console.warn("[native] biometric", e);
    return false;
  }
  const ok = await authenticate();
  if (ok) coldChecked = true; // évite une 2e demande juste après l'activation
  return ok;
}

async function ensureBiometricListener() {
  if (listenerReady) return;
  try {
    const { App } = await import("@capacitor/app");
    await App.addListener("appStateChange", async ({ isActive }) => {
      if (!isActive || !biometricEnabled) return;
      // La boîte de dialogue biométrique peut elle-même déclencher un
      // appStateChange : on ignore pendant et juste après.
      if (authenticating || Date.now() - lastAuthEnd < 1500) return;
      if (!(await authenticate())) App.exitApp();
    });
    listenerReady = true; // seulement si l'écouteur est bien posé
  } catch (e) {
    console.warn("[native] biometric", e);
  }
}

export async function applyNativeSettings(s) {
  biometricEnabled = !!s?.biometric && isBiometricVerifiedOnDevice();
  const block = !!s?.block_screenshots;

  // Le blocage des captures est une fonction native. Le Web/PWA ne doit pas
  // flouter tout l'écran par défaut lorsque la fenêtre perd brièvement le focus.
  if (!Capacitor.isNativePlatform()) {
    if (lastBlock !== false) {
      lastBlock = false;
      try { await disableSecureScreen(); } catch (e) {
        console.warn("[web] secure-screen", e);
      }
    }
    return;
  }

  // Android/iOS : FLAG_SECURE.
  if (block !== lastBlock) {
    lastBlock = block;
    try {
      if (block) await enableSecureScreen();
      else await disableSecureScreen();
    } catch (e) {
      lastBlock = null; // on réessaiera au prochain appel
      console.warn("[native] secure-screen", e);
    }
  }

  await ensureBiometricListener();

  // Verrouillage au démarrage à froid (appStateChange ne se déclenche
  // qu'au retour d'arrière-plan, pas au lancement).
  // On ne marque le contrôle comme fait que si le réglage est actif.
  if (!coldChecked && biometricEnabled) {
    coldChecked = true;
    if (!(await authenticate())) {
      const { App } = await import("@capacitor/app");
      App.exitApp();
    }
  }
}
