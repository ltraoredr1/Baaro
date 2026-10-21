/**
 * BAARO — Notifications push (Web Push + Capacitor natif)
 *
 * Changements par rapport à la version précédente :
 * - Synchronisation automatique du jeton à chaque connexion / ouverture
 *   (avant : le jeton n'était enregistré que sur clic "Activer", donc les
 *   autres comptes, les changements de compte et la rotation FCM étaient perdus).
 * - Listener "registration" permanent : un nouveau jeton FCM est toujours
 *   sauvegardé (avant : supprimé après le premier jeton).
 * - Canal Android "baaro_notifications" créé (même id que le serveur).
 * - Web : vérifie que l'abonnement existant correspond à la clé VAPID actuelle,
 *   sinon se réabonne. Enregistre le service worker s'il est absent.
 * - Désactivation volontaire respectée (pas de réactivation automatique).
 * - Événements window "baaro:push-received" et "baaro:push-open" pour l'app.
 *
 * Jetons : enregistrés et supprimés via /api/social (save_push_token /
 * delete_push_token), plus aucun accès direct à push_tokens depuis le client.
 */

import { supabase } from "../supabaseClient.js";
import { callSocial } from "./notifyInteraction.js";

const VAPID_PUBLIC = import.meta.env.VITE_VAPID_PUBLIC_KEY || "";

const NATIVE_REGISTRATION_TIMEOUT_MS = 20000;
const SW_READY_TIMEOUT_MS = 10000;
const SERVICE_WORKER_URL = "/sw.js";
const ANDROID_CHANNEL_ID = "baaro_notifications";
const SYNC_MIN_INTERVAL_MS = 10 * 60 * 1000;
const OPT_OUT_KEY = "baaro_push_disabled";

// -----------------------------------------------------------------------------
// Utilitaires généraux
// -----------------------------------------------------------------------------

function withTimeout(promise, ms, message) {
  let timeoutId;

  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(message)), ms);
  });

  return Promise.race([promise, timeout]).finally(() => {
    clearTimeout(timeoutId);
  });
}

function isOptedOut() {
  try {
    return localStorage.getItem(OPT_OUT_KEY) === "1";
  } catch {
    return false;
  }
}

function setOptedOut(value) {
  try {
    if (value) localStorage.setItem(OPT_OUT_KEY, "1");
    else localStorage.removeItem(OPT_OUT_KEY);
  } catch {
    // Stockage indisponible : sans conséquence.
  }
}

function safeAppUrl(value) {
  if (typeof value !== "string" || !value.startsWith("/")) return null;
  if (value.startsWith("//") || value.includes("\\")) return null;
  return value;
}

// -----------------------------------------------------------------------------
// Utilitaires Web Push
// -----------------------------------------------------------------------------

function urlBase64ToUint8Array(base64String) {
  const normalized = String(base64String || "").trim();

  if (!normalized) {
    throw new Error("Clé publique VAPID manquante.");
  }

  const padding = "=".repeat((4 - (normalized.length % 4)) % 4);
  const base64 = (normalized + padding).replace(/-/g, "+").replace(/_/g, "/");

  const raw = atob(base64);
  const output = new Uint8Array(raw.length);

  for (let i = 0; i < raw.length; i += 1) {
    output[i] = raw.charCodeAt(i);
  }

  return output;
}

function subscriptionMatchesKey(subscription, keyBytes) {
  const current = subscription?.options?.applicationServerKey;

  // Si le navigateur ne l'expose pas, on ne peut pas comparer : on garde.
  if (!current) return true;

  const a = new Uint8Array(current);

  if (a.length !== keyBytes.length) return false;

  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== keyBytes[i]) return false;
  }

  return true;
}

async function getWebRegistration() {
  const existing = await navigator.serviceWorker.getRegistration();

  if (!existing) {
    await navigator.serviceWorker.register(SERVICE_WORKER_URL);
  }

  return withTimeout(
    navigator.serviceWorker.ready,
    SW_READY_TIMEOUT_MS,
    "Le service worker n'est pas prêt."
  );
}

/**
 * Retourne un abonnement valide pour la clé VAPID actuelle.
 * Un abonnement créé avec une ancienne clé est supprimé puis recréé.
 */
async function ensureWebSubscription() {
  const keyBytes = urlBase64ToUint8Array(VAPID_PUBLIC);
  const registration = await getWebRegistration();

  let subscription = await registration.pushManager.getSubscription();

  if (subscription && !subscriptionMatchesKey(subscription, keyBytes)) {
    await subscription.unsubscribe();
    subscription = null;
  }

  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: keyBytes,
    });
  }

  return subscription;
}

// -----------------------------------------------------------------------------
// Utilitaires Capacitor
// -----------------------------------------------------------------------------

async function getCapacitor() {
  try {
    const { Capacitor } = await import("@capacitor/core");
    return Capacitor;
  } catch {
    return null;
  }
}

async function isNativePlatform() {
  const Capacitor = await getCapacitor();

  try {
    return Boolean(Capacitor?.isNativePlatform?.());
  } catch {
    return false;
  }
}

export function isPushSupported() {
  if (typeof window === "undefined") return false;

  try {
    if (window.Capacitor?.isNativePlatform?.()) return true;
  } catch {
    // Continue avec la détection Web.
  }

  return (
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

/**
 * Version synchrone conservée pour compatibilité.
 * Sur natif elle renvoie "default" : utiliser getPermissionStateAsync().
 */
export function getPermissionState() {
  if (typeof window === "undefined") return "unsupported";

  try {
    if (window.Capacitor?.isNativePlatform?.()) return "default";
  } catch {
    // Continue avec la détection Web.
  }

  if (!isPushSupported()) return "unsupported";

  try {
    return Notification.permission;
  } catch {
    return "unsupported";
  }
}

/** État réel de la permission, y compris sur Android / iOS. */
export async function getPermissionStateAsync() {
  try {
    if (await isNativePlatform()) {
      const { PushNotifications } = await import(
        "@capacitor/push-notifications"
      );

      const permission = await PushNotifications.checkPermissions();

      if (permission?.receive === "granted") return "granted";
      if (permission?.receive === "denied") return "denied";

      return "default";
    }
  } catch {
    return "unsupported";
  }

  return getPermissionState();
}

// -----------------------------------------------------------------------------
// Authentification et sauvegarde des jetons
// -----------------------------------------------------------------------------

async function callSocialOrThrow(action, payload) {
  const result = await callSocial(action, payload);

  if (!result) throw new Error("Non authentifié");

  if (!result.ok) {
    throw new Error(result.body?.error || `Erreur serveur (${result.status})`);
  }

  return result;
}

async function savePushToken({ token, platform }) {
  if (!token) {
    throw new Error("Le jeton de notification est vide.");
  }

  const userAgent =
    typeof navigator !== "undefined" && navigator.userAgent
      ? navigator.userAgent.slice(0, 200)
      : null;

  await callSocialOrThrow("save_push_token", {
    token,
    platform,
    user_agent: userAgent,
  });
}

// -----------------------------------------------------------------------------
// Natif : listeners permanents
// -----------------------------------------------------------------------------

let nativeListenersPromise = null;
let nativePlatform = "android";
let pendingRegistration = null;

function settlePending(result) {
  if (!pendingRegistration) return;

  const { resolve, timeoutId } = pendingRegistration;

  pendingRegistration = null;
  clearTimeout(timeoutId);
  resolve(result);
}

function waitForNativeToken() {
  return new Promise((resolve) => {
    settlePending({ ok: false, error: "Demande remplacée par une plus récente." });

    const timeoutId = setTimeout(() => {
      settlePending({
        ok: false,
        error:
          "Délai dépassé : aucun jeton push natif reçu. Réessaie dans quelques instants.",
        permission: "granted",
      });
    }, NATIVE_REGISTRATION_TIMEOUT_MS);

    pendingRegistration = { resolve, timeoutId };
  });
}

/**
 * Installe une seule fois tous les listeners natifs.
 * "registration" est permanent : chaque nouveau jeton FCM est sauvegardé,
 * y compris après une rotation du jeton par Firebase.
 */
async function ensureNativeListeners(PushNotifications) {
  if (nativeListenersPromise) return nativeListenersPromise;

  nativeListenersPromise = (async () => {
    const Capacitor = await getCapacitor();

    try {
      nativePlatform = Capacitor?.getPlatform?.() === "ios" ? "ios" : "android";
    } catch {
      nativePlatform = "android";
    }

    const handles = [];

    try {
      handles.push(
        await PushNotifications.addListener("registration", async (registration) => {
          const token = registration?.value;

          if (!token) {
            settlePending({
              ok: false,
              error: "Le système n'a fourni aucun jeton push.",
            });
            return;
          }

          try {
            await savePushToken({ token, platform: nativePlatform });

            settlePending({
              ok: true,
              permission: "granted",
              platform: nativePlatform,
            });
          } catch (error) {
            console.error("[push] Enregistrement du jeton natif :", error);

            settlePending({
              ok: false,
              error:
                error?.message || "Impossible d'enregistrer le jeton push natif.",
            });
          }
        })
      );

      handles.push(
        await PushNotifications.addListener("registrationError", (error) => {
          console.error("[push] Erreur d'enregistrement natif :", error);

          settlePending({
            ok: false,
            error:
              error?.error ||
              error?.message ||
              "Échec de l'enregistrement push natif.",
          });
        })
      );

      // App au premier plan : Android n'affiche pas la notification tout seul.
      // L'app peut écouter cet événement pour afficher une bannière interne.
      handles.push(
        await PushNotifications.addListener(
          "pushNotificationReceived",
          (notification) => {
            try {
              window.dispatchEvent(
                new CustomEvent("baaro:push-received", { detail: notification })
              );
            } catch {
              // Sans conséquence.
            }
          }
        )
      );

      handles.push(
        await PushNotifications.addListener(
          "pushNotificationActionPerformed",
          (action) => {
            const url = safeAppUrl(action?.notification?.data?.url);

            try {
              const event = new CustomEvent("baaro:push-open", {
                detail: { url, action },
                cancelable: true,
              });

              const handled = !window.dispatchEvent(event);

              // Si l'app n'a pas géré l'événement, ouvre l'adresse directement.
              if (!handled && url && url !== "/") {
                window.location.assign(url);
              }
            } catch {
              // Sans conséquence.
            }
          }
        )
      );

      return true;
    } catch (error) {
      await Promise.allSettled(handles.map((handle) => handle?.remove?.()));
      throw error;
    }
  })().catch((error) => {
    nativeListenersPromise = null;
    throw error;
  });

  return nativeListenersPromise;
}

async function ensureAndroidChannel(PushNotifications) {
  if (nativePlatform !== "android") return;

  try {
    await PushNotifications.createChannel({
      id: ANDROID_CHANNEL_ID,
      name: "Notifications BAARO",
      description: "Abonnés, messages, lives et activité de votre compte",
      importance: 5,
      visibility: 1,
      vibration: true,
    });
  } catch (error) {
    console.warn("[push] Création du canal Android :", error?.message || error);
  }
}

async function registerNative(PushNotifications) {
  await ensureNativeListeners(PushNotifications);
  await ensureAndroidChannel(PushNotifications);

  // Le résultat est attendu avant register() pour ne rater aucun événement.
  const waiting = waitForNativeToken();

  try {
    await PushNotifications.register();
  } catch (error) {
    console.error("[push] register() :", error);

    settlePending({
      ok: false,
      error:
        error?.message || "Impossible de démarrer l'enregistrement push natif.",
    });
  }

  return waiting;
}

// -----------------------------------------------------------------------------
// Activation (action de l'utilisateur)
// -----------------------------------------------------------------------------

async function enableNativePush() {
  let PushNotifications;

  try {
    ({ PushNotifications } = await import("@capacitor/push-notifications"));
  } catch (error) {
    return {
      ok: false,
      error: error?.message || "Plugin push natif indisponible.",
    };
  }

  let permission;

  try {
    permission = await PushNotifications.checkPermissions();

    if (
      permission.receive === "prompt" ||
      permission.receive === "prompt-with-rationale"
    ) {
      permission = await PushNotifications.requestPermissions();
    }
  } catch (error) {
    return {
      ok: false,
      error:
        error?.message ||
        "Impossible de vérifier les permissions de notification.",
    };
  }

  if (permission?.receive !== "granted") {
    return {
      ok: false,
      error: "Permission notifications refusée.",
      permission: permission?.receive || "denied",
    };
  }

  try {
    return await registerNative(PushNotifications);
  } catch (error) {
    console.error("[push] Activation native :", error);

    return {
      ok: false,
      error:
        error?.message || "Impossible d'installer les listeners de notification.",
    };
  }
}

export async function enablePushNotifications() {
  try {
    setOptedOut(false);

    if (await isNativePlatform()) {
      return await enableNativePush();
    }

    if (!isPushSupported()) {
      return {
        ok: false,
        error: "Notifications non supportées sur cet appareil.",
      };
    }

    if (!VAPID_PUBLIC) {
      return {
        ok: false,
        error:
          "VITE_VAPID_PUBLIC_KEY manquante. Génère les clés avec : npx web-push generate-vapid-keys",
      };
    }

    if (Notification.permission === "denied") {
      return {
        ok: false,
        error:
          "Les notifications sont bloquées dans les paramètres du navigateur.",
        permission: "denied",
      };
    }

    const permission = await Notification.requestPermission();

    if (permission !== "granted") {
      return {
        ok: false,
        error: "Permission de notification refusée.",
        permission,
      };
    }

    const subscription = await ensureWebSubscription();

    await savePushToken({
      token: JSON.stringify(subscription.toJSON()),
      platform: "web",
    });

    return { ok: true, permission: "granted", platform: "web" };
  } catch (error) {
    console.error("[push] Activation :", error);

    return {
      ok: false,
      error: error?.message || "Erreur lors de l'activation des notifications.",
    };
  }
}

// -----------------------------------------------------------------------------
// Synchronisation silencieuse (connexion / ouverture de l'app)
// -----------------------------------------------------------------------------

/**
 * Ne demande jamais la permission : si elle est déjà accordée, enregistre
 * (ou réenregistre) le jeton de l'appareil pour le compte connecté.
 */
export async function syncPushForCurrentUser() {
  try {
    if (isOptedOut()) return { ok: true, skipped: "opt-out" };

    if (await isNativePlatform()) {
      const { PushNotifications } = await import("@capacitor/push-notifications");

      const permission = await PushNotifications.checkPermissions();

      if (permission?.receive !== "granted") {
        return { ok: true, skipped: "permission" };
      }

      return await registerNative(PushNotifications);
    }

    if (!isPushSupported() || !VAPID_PUBLIC) {
      return { ok: true, skipped: "unsupported" };
    }

    if (Notification.permission !== "granted") {
      return { ok: true, skipped: "permission" };
    }

    const subscription = await ensureWebSubscription();

    await savePushToken({
      token: JSON.stringify(subscription.toJSON()),
      platform: "web",
    });

    return { ok: true, platform: "web" };
  } catch (error) {
    console.warn("[push] Synchronisation :", error?.message || error);

    return { ok: false, error: error?.message || "Synchronisation impossible." };
  }
}

let authSyncStarted = false;
let lastSync = { userId: null, at: 0 };

/** À appeler une fois au démarrage (appelé aussi automatiquement à l'import). */
export function initPushSync() {
  if (authSyncStarted || typeof window === "undefined") return;

  authSyncStarted = true;

  supabase.auth.onAuthStateChange((event, session) => {
    const userId = session?.user?.id;

    if (!userId) return;
    if (event !== "SIGNED_IN" && event !== "INITIAL_SESSION") return;

    const now = Date.now();

    if (lastSync.userId === userId && now - lastSync.at < SYNC_MIN_INTERVAL_MS) {
      return;
    }

    lastSync = { userId, at: now };

    // Hors du callback : évite les blocages d'appels Supabase imbriqués.
    setTimeout(() => {
      void syncPushForCurrentUser();
    }, 1500);
  });
}

initPushSync();

// -----------------------------------------------------------------------------
// Désactivation
// -----------------------------------------------------------------------------

export async function disablePushNotifications() {
  try {
    setOptedOut(true);

    const native = await isNativePlatform();

    if (native) {
      const Capacitor = await getCapacitor();

      const platform = Capacitor?.getPlatform?.() === "ios" ? "ios" : "android";

      await callSocialOrThrow("delete_push_token", { platform });

      return {
        ok: true,
        note:
          "Jetons natifs supprimés du serveur. Les permissions système restent gérées par Android/iOS.",
      };
    }

    if (!isPushSupported()) {
      return { ok: true };
    }

    const registration = await getWebRegistration();
    const subscription = await registration.pushManager.getSubscription();

    let token = null;

    if (subscription) {
      token = JSON.stringify(subscription.toJSON());

      const unsubscribed = await subscription.unsubscribe();

      if (!unsubscribed) {
        return {
          ok: false,
          error: "Le navigateur n'a pas pu désactiver l'abonnement push.",
        };
      }
    }

    if (token) {
      await callSocialOrThrow("delete_push_token", { platform: "web", token });
    }

    return { ok: true };
  } catch (error) {
    console.error("[push] Désactivation :", error);

    return {
      ok: false,
      error: error?.message || "Erreur lors de la désactivation des notifications.",
    };
  }
}

// -----------------------------------------------------------------------------
// Nettoyage des anciens jetons Web
// -----------------------------------------------------------------------------

export async function pruneCurrentUserPushTokens() {
  try {
    if (await isNativePlatform()) {
      return { ok: true };
    }

    if (!isPushSupported()) {
      return { ok: true };
    }

    const registration = await getWebRegistration();
    const subscription = await registration.pushManager.getSubscription();

    if (!subscription) {
      return { ok: true };
    }

    const currentToken = JSON.stringify(subscription.toJSON());

    await callSocialOrThrow("delete_push_token", {
      platform: "web",
      except_token: currentToken,
    });

    return { ok: true };
  } catch (error) {
    console.error("[push] Nettoyage des jetons :", error);

    return {
      ok: false,
      error: error?.message || "Erreur lors du nettoyage des jetons push.",
    };
  }
}
