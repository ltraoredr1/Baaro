/**
 * BAARO — Notifications push (Web Push + Capacitor natif)
 *
 * Corrections :
 * - Listeners installés avant register().
 * - Listeners de réception et d'action conservés pendant la vie du module.
 * - Évite de multiplier les listeners permanents.
 * - Nettoyage ciblé des listeners temporaires.
 * - Gestion du timeout et des erreurs.
 * - Persistance via RPC upsert_push_token.
 * - Compatibilité Web, Android et iOS.
 */

import { supabase } from "../supabaseClient.js";

const VAPID_PUBLIC = import.meta.env.VITE_VAPID_PUBLIC_KEY || "";
const NATIVE_REGISTRATION_TIMEOUT_MS = 20000;

// Listeners permanents : réception et action utilisateur.
let nativeEventListenersPromise = null;
const nativeEventListenerHandles = [];

// -----------------------------------------------------------------------------
// Utilitaires Web Push
// -----------------------------------------------------------------------------

function urlBase64ToUint8Array(base64String) {
  const normalized = String(base64String || "").trim();

  if (!normalized) {
    throw new Error("Clé publique VAPID manquante.");
  }

  const padding = "=".repeat((4 - (normalized.length % 4)) % 4);
  const base64 = (normalized + padding)
    .replace(/-/g, "+")
    .replace(/_/g, "/");

  const raw = atob(base64);
  const output = new Uint8Array(raw.length);

  for (let i = 0; i < raw.length; i += 1) {
    output[i] = raw.charCodeAt(i);
  }

  return output;
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

export function getPermissionState() {
  if (typeof window === "undefined") return "unsupported";

  try {
    if (window.Capacitor?.isNativePlatform?.()) {
      // Pour le natif, utiliser checkPermissions() afin
      // d'obtenir l'état réel fourni par Capacitor.
      return "default";
    }
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

// -----------------------------------------------------------------------------
// Authentification et sauvegarde des jetons
// -----------------------------------------------------------------------------

async function getAuthenticatedUser() {
  const { data, error } = await supabase.auth.getUser();

  if (error) throw error;

  if (!data?.user) {
    throw new Error("Non authentifié");
  }

  return data.user;
}

async function savePushToken({ token, platform }) {
  if (!token) {
    throw new Error("Le jeton de notification est vide.");
  }

  const user = await getAuthenticatedUser();

  const userAgent =
    typeof navigator !== "undefined" && navigator.userAgent
      ? navigator.userAgent.slice(0, 200)
      : null;

  const { error } = await supabase.rpc("upsert_push_token", {
    p_user_id: user.id,
    p_token: token,
    p_platform: platform,
    p_user_agent: userAgent,
  });

  if (error) throw error;

  return user;
}

// -----------------------------------------------------------------------------
// Listeners natifs permanents
// -----------------------------------------------------------------------------

/**
 * Installe les listeners de réception et d'action une seule fois.
 *
 * Ces listeners ne font pas partie du cycle d'enregistrement du jeton :
 * ils ne doivent donc pas être supprimés lorsque register() réussit.
 */
async function ensureNativeEventListeners(PushNotifications) {
  if (nativeEventListenersPromise) {
    return nativeEventListenersPromise;
  }

  nativeEventListenersPromise = (async () => {
    const handles = [];

    try {
      handles.push(
        await PushNotifications.addListener(
          "pushNotificationReceived",
          (notification) => {
            console.log(
              "[push] Notification reçue :",
              notification
            );
          }
        )
      );

      handles.push(
        await PushNotifications.addListener(
          "pushNotificationActionPerformed",
          (action) => {
            console.log(
              "[push] Action utilisateur :",
              action
            );
          }
        )
      );

      nativeEventListenerHandles.push(...handles);

      return true;
    } catch (error) {
      await Promise.allSettled(
        handles.map((handle) => handle?.remove?.())
      );

      throw error;
    }
  })().catch((error) => {
    // Autorise une nouvelle tentative si l'installation échoue.
    nativeEventListenersPromise = null;
    throw error;
  });

  return nativeEventListenersPromise;
}

// -----------------------------------------------------------------------------
// Enregistrement natif Android / iOS
// -----------------------------------------------------------------------------

async function enableNativePush() {
  let PushNotifications;

  try {
    ({ PushNotifications } = await import(
      "@capacitor/push-notifications"
    ));
  } catch (error) {
    return {
      ok: false,
      error:
        error?.message ||
        "Plugin push natif indisponible.",
    };
  }

  let permission;

  try {
    permission = await PushNotifications.checkPermissions();

    if (
      permission.receive === "prompt" ||
      permission.receive === "prompt-with-rationale"
    ) {
      permission =
        await PushNotifications.requestPermissions();
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

  const Capacitor = await getCapacitor();

  let platform = "android";

  try {
    platform =
      Capacitor?.getPlatform?.() === "ios"
        ? "ios"
        : "android";
  } catch {
    // Garde la valeur par défaut.
  }

  try {
    // Ces listeners restent actifs après l'enregistrement du jeton.
    await ensureNativeEventListeners(PushNotifications);
  } catch (error) {
    console.error(
      "[push] Installation des listeners permanents :",
      error
    );

    return {
      ok: false,
      error:
        error?.message ||
        "Impossible d'installer les listeners de notification.",
    };
  }

  return new Promise((resolve) => {
    let settled = false;
    let timeoutId = null;
    const registrationHandles = [];

    /**
     * Ne nettoie que les listeners temporaires d'enregistrement.
     * Les listeners de réception et d'action restent actifs.
     */
    const cleanupRegistrationListeners = async () => {
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }

      const handles = registrationHandles.splice(0);

      await Promise.allSettled(
        handles.map((handle) => handle?.remove?.())
      );
    };

    const finish = async (result) => {
      if (settled) return;

      settled = true;

      await cleanupRegistrationListeners();

      resolve(result);
    };

    const onRegistration = async (registration) => {
      if (settled) return;

      try {
        if (!registration?.value) {
          throw new Error(
            "Le système n'a fourni aucun jeton push."
          );
        }

        await savePushToken({
          token: registration.value,
          platform,
        });

        await finish({
          ok: true,
          permission: "granted",
          platform,
        });
      } catch (error) {
        console.error(
          "[push] Enregistrement du jeton natif :",
          error
        );

        await finish({
          ok: false,
          error:
            error?.message ||
            "Impossible d'enregistrer le jeton push natif.",
        });
      }
    };

    const onRegistrationError = async (error) => {
      if (settled) return;

      console.error(
        "[push] Erreur d'enregistrement natif :",
        error
      );

      await finish({
        ok: false,
        error:
          error?.error ||
          error?.message ||
          "Échec de l'enregistrement push natif.",
      });
    };

    const setup = async () => {
      try {
        // Les listeners temporaires doivent être installés avant register().
        registrationHandles.push(
          await PushNotifications.addListener(
            "registration",
            onRegistration
          )
        );

        if (settled) {
          await cleanupRegistrationListeners();
          return;
        }

        registrationHandles.push(
          await PushNotifications.addListener(
            "registrationError",
            onRegistrationError
          )
        );

        if (settled) {
          await cleanupRegistrationListeners();
          return;
        }

        timeoutId = setTimeout(() => {
          void finish({
            ok: false,
            error:
              "Délai dépassé : aucun jeton push natif reçu. Réessaie dans quelques instants.",
            permission: "granted",
          });
        }, NATIVE_REGISTRATION_TIMEOUT_MS);

        await PushNotifications.register();
      } catch (error) {
        console.error(
          "[push] Activation native :",
          error
        );

        await finish({
          ok: false,
          error:
            error?.message ||
            "Impossible de démarrer l'enregistrement push natif.",
        });
      }
    };

    void setup();
  });
}

// -----------------------------------------------------------------------------
// Activation des notifications Web ou natives
// -----------------------------------------------------------------------------

export async function enablePushNotifications() {
  try {
    if (await isNativePlatform()) {
      return await enableNativePush();
    }

    if (!isPushSupported()) {
      return {
        ok: false,
        error:
          "Notifications non supportées sur cet appareil.",
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

    const permission =
      await Notification.requestPermission();

    if (permission !== "granted") {
      return {
        ok: false,
        error: "Permission de notification refusée.",
        permission,
      };
    }

    // Le service worker doit être enregistré par l'application.
    const registration = await navigator.serviceWorker.ready;

    let subscription =
      await registration.pushManager.getSubscription();

    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey:
          urlBase64ToUint8Array(VAPID_PUBLIC),
      });
    }

    const token = JSON.stringify(subscription.toJSON());

    await savePushToken({
      token,
      platform: "web",
    });

    return {
      ok: true,
      permission: "granted",
      platform: "web",
    };
  } catch (error) {
    console.error("[push] Activation :", error);

    return {
      ok: false,
      error:
        error?.message ||
        "Erreur lors de l'activation des notifications.",
    };
  }
}

// -----------------------------------------------------------------------------
// Désactivation des notifications
// -----------------------------------------------------------------------------

export async function disablePushNotifications() {
  try {
    const native = await isNativePlatform();
    const user = await getAuthenticatedUser();

    if (native) {
      const Capacitor = await getCapacitor();

      const platform =
        Capacitor?.getPlatform?.() === "ios"
          ? "ios"
          : "android";

      // Supprime les jetons du compte côté serveur.
      // Les permissions système restent gérées par Android/iOS.
      const { error } = await supabase
        .from("push_tokens")
        .delete()
        .eq("user_id", user.id)
        .eq("platform", platform);

      if (error) throw error;

      return {
        ok: true,
        note:
          "Jetons natifs supprimés du serveur. Les permissions système restent gérées par Android/iOS.",
      };
    }

    if (!isPushSupported()) {
      return { ok: true };
    }

    const registration = await navigator.serviceWorker.ready;

    const subscription =
      await registration.pushManager.getSubscription();

    let token = null;

    if (subscription) {
      token = JSON.stringify(subscription.toJSON());

      const unsubscribed = await subscription.unsubscribe();

      if (!unsubscribed) {
        return {
          ok: false,
          error:
            "Le navigateur n'a pas pu désactiver l'abonnement push.",
        };
      }
    }

    // Supprime uniquement le jeton Web correspondant.
    if (token) {
      const { error } = await supabase
        .from("push_tokens")
        .delete()
        .eq("user_id", user.id)
        .eq("platform", "web")
        .eq("token", token);

      if (error) throw error;
    }

    return { ok: true };
  } catch (error) {
    console.error("[push] Désactivation :", error);

    return {
      ok: false,
      error:
        error?.message ||
        "Erreur lors de la désactivation des notifications.",
    };
  }
}

// -----------------------------------------------------------------------------
// Nettoyage des anciens jetons Web
// -----------------------------------------------------------------------------

export async function pruneCurrentUserPushTokens() {
  try {
    // Les jetons natifs sont gérés par le système d'exploitation.
    if (await isNativePlatform()) {
      return { ok: true };
    }

    if (!isPushSupported()) {
      return { ok: true };
    }

    const user = await getAuthenticatedUser();

    const registration = await navigator.serviceWorker.ready;

    const subscription =
      await registration.pushManager.getSubscription();

    if (!subscription) {
      // Sans abonnement actif, ne supprime pas arbitrairement les jetons.
      return { ok: true };
    }

    const currentToken = JSON.stringify(subscription.toJSON());

    const { error } = await supabase
      .from("push_tokens")
      .delete()
      .eq("user_id", user.id)
      .eq("platform", "web")
      .neq("token", currentToken);

    if (error) throw error;

    return { ok: true };
  } catch (error) {
    console.error("[push] Nettoyage des jetons :", error);

    return {
      ok: false,
      error:
        error?.message ||
        "Erreur lors du nettoyage des jetons push.",
    };
  }
}
