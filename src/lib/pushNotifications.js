/**
 * BAARO — Notifications push (Web Push + Capacitor natif)
 * Version corrigée :
 * - Listeners installés avant register()
 * - Nettoyage ciblé des listeners (sans removeAllListeners)
 * - Gestion fiable du timeout et des erreurs
 * - Persistance via RPC upsert_push_token
 * - Compatibilité Web, Android et iOS
 */

import { supabase } from "../supabaseClient.js";

const VAPID_PUBLIC = import.meta.env.VITE_VAPID_PUBLIC_KEY || "";
const NATIVE_REGISTRATION_TIMEOUT_MS = 20000;

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
      // L'état natif doit être vérifié avec le plugin Capacitor.
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

/**
 * Active les notifications natives.
 *
 * Important : les listeners sont installés AVANT register(),
 * car l'événement registration peut être émis très rapidement.
 *
 * On retire uniquement les listeners créés ici : on ne doit pas
 * appeler removeAllListeners(), qui peut perturber d'autres composants.
 */
async function enableNativePush() {
  let PushNotifications;

  try {
    ({ PushNotifications } = await import("@capacitor/push-notifications"));
  } catch (error) {
    return {
      ok: false,
      error: error?.message || "Plugin push natif indisponible",
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
      error: "Permission notifications refusée",
      permission: permission?.receive || "denied",
    };
  }

  const Capacitor = await getCapacitor();

  let platform = "android";

  try {
    platform = Capacitor?.getPlatform?.() === "ios" ? "ios" : "android";
  } catch {
    // Garde la valeur par défaut.
  }

  return new Promise((resolve) => {
    let settled = false;
    let timeoutId = null;
    const listenerHandles = [];

    const cleanup = async () => {
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }

      const handles = listenerHandles.splice(0);

      await Promise.allSettled(
        handles.map((handle) => handle?.remove?.())
      );
    };

    const finish = async (result) => {
      if (settled) return;

      settled = true;
      await cleanup();
      resolve(result);
    };

    const onRegistration = async (registration) => {
      try {
        if (!registration?.value) {
          throw new Error("Le système n'a fourni aucun jeton push.");
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
        console.error("[push] Enregistrement du jeton natif :", error);

        await finish({
          ok: false,
          error:
            error?.message ||
            "Impossible d'enregistrer le jeton push natif.",
        });
      }
    };

    const onRegistrationError = async (error) => {
      console.error("[push] Erreur d'enregistrement natif :", error);

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
        // Les listeners doivent exister avant l'appel à register().
        listenerHandles.push(
          await PushNotifications.addListener(
            "registration",
            onRegistration
          )
        );

        listenerHandles.push(
          await PushNotifications.addListener(
            "registrationError",
            onRegistrationError
          )
        );

        // Ces deux listeners servent à observer les événements.
        // Ils ne retirent pas les listeners des autres composants.
        listenerHandles.push(
          await PushNotifications.addListener(
            "pushNotificationReceived",
            (notification) => {
              console.log("[push] Notification reçue :", notification);
            }
          )
        );

        listenerHandles.push(
          await PushNotifications.addListener(
            "pushNotificationActionPerformed",
            (action) => {
              console.log("[push] Action utilisateur :", action);
            }
          )
        );

        if (settled) return;

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
        console.error("[push] Activation native :", error);

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

export async function enablePushNotifications() {
  try {
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

    // Le service worker doit être enregistré par l'application.
    const registration = await navigator.serviceWorker.ready;

    let subscription = await registration.pushManager.getSubscription();

    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC),
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
      error: error?.message || "Erreur lors de l'activation des notifications.",
    };
  }
}

export async function disablePushNotifications() {
  try {
    const native = await isNativePlatform();
    const user = await getAuthenticatedUser();

    if (native) {
      const Capacitor = await getCapacitor();
      const platform =
        Capacitor?.getPlatform?.() === "ios" ? "ios" : "android";

      // Ne pas appeler removeAllListeners() ici : les listeners
      // peuvent appartenir à d'autres parties de l'application.
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

    if (!isPushSupported()) return { ok: true };

    const registration = await navigator.serviceWorker.ready;
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

    // Supprime le jeton correspondant même si l'abonnement navigateur
    // a déjà disparu.
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
      error: error?.message || "Erreur lors de la désactivation des notifications.",
    };
  }
}

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
    const subscription = await registration.pushManager.getSubscription();

    if (!subscription) {
      // Aucun abonnement actif : on ne supprime pas arbitrairement
      // tous les jetons de l'utilisateur.
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
      error: error?.message || "Erreur lors du nettoyage des jetons push.",
    };
  }
}
