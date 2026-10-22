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

/** true = déverrouillé (ou biométrie indisponible), false = refusé/annulé. */
async function authenticate() {
  if (authenticating) return true;
  authenticating = true;
  try {
    const { BiometricAuth } = await import("@aparajita/capacitor-biometric-auth");
    const info = await BiometricAuth.checkBiometry();
    if (!info.isAvailable) return true;
    await BiometricAuth.authenticate({
      reason: REASON,
      allowDeviceCredential: true, // code/schéma du téléphone en secours : évite le blocage définitif
    });
    return true;
  } catch (_) {
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
    if (!info.isAvailable) return false;
  } catch (_) {
    return false;
  }
  return authenticate();
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
  biometricEnabled = !!s?.biometric;
  const block = !!s?.block_screenshots;

  // Natif : FLAG_SECURE. Web / PWA : flou à la perte de focus.
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

  // La biométrie n'existe que sur l'application native.
  if (!Capacitor.isNativePlatform()) return;

  await ensureBiometricListener();

  // Verrouillage au démarrage à froid (appStateChange ne se déclenche
  // qu'au retour d'arrière-plan, pas au lancement).
  if (!coldChecked) {
    coldChecked = true;
    if (biometricEnabled && !(await authenticate())) {
      const { App } = await import("@capacitor/app");
      App.exitApp();
    }
  }
}
