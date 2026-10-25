import { Capacitor } from "@capacitor/core";

// Empreinte WebAuthn : utilisée UNIQUEMENT sur le web/PWA.
// Sur l'APK, le verrou natif de nativeSettings.js fait déjà le travail.

const KEY = "baaro_bio_";
const OK_KEY = "baaro_bio_ok";

const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const challenge = () => crypto.getRandomValues(new Uint8Array(32));

export async function isBiometricAvailable() {
  try {
    if (Capacitor.isNativePlatform()) return false;
    if (!window.PublicKeyCredential) return false;
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

export function hasBiometric(userId) {
  try {
    return !!localStorage.getItem(KEY + userId);
  } catch {
    return false;
  }
}

export function disableBiometric(userId) {
  try {
    localStorage.removeItem(KEY + userId);
  } catch {}
}

export async function enableBiometric(userId, label) {
  try {
    const cred = await navigator.credentials.create({
      publicKey: {
        challenge: challenge(),
        rp: { name: "BAARO" },
        user: {
          id: new TextEncoder().encode(userId),
          name: label || userId,
          displayName: label || "Membre BAARO",
        },
        pubKeyCredParams: [
          { type: "public-key", alg: -7 },
          { type: "public-key", alg: -257 },
        ],
        authenticatorSelection: {
          authenticatorAttachment: "platform",
          userVerification: "required",
          residentKey: "discouraged",
        },
        timeout: 60000,
      },
    });
    localStorage.setItem(KEY + userId, b64(cred.rawId));
    // Activer l'empreinte ne doit pas verrouiller l'utilisateur tout de suite
    try { sessionStorage.setItem(OK_KEY, userId); } catch {}
    return true;
  } catch (e) {
    console.error("[BAARO] Activation empreinte:", e);
    return false;
  }
}

export async function verifyBiometric(userId) {
  try {
    const id = localStorage.getItem(KEY + userId);
    if (!id) return false;
    const assertion = await navigator.credentials.get({
      publicKey: {
        challenge: challenge(),
        allowCredentials: [
          { type: "public-key", id: unb64(id), transports: ["internal"] },
        ],
        userVerification: "required",
        timeout: 60000,
      },
    });
    return !!assertion;
  } catch {
    return false;
  }
}
