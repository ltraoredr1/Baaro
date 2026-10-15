import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";
import { enablePushNotifications } from "../lib/pushNotifications.js";

/**
 * BAARO — Activation des notifications push.
 *
 * - Natif : Capacitor / FCM
 * - Web : Web Push / Service Worker
 * - Les jetons sont gérés par src/lib/pushNotifications.js
 * - Les écouteurs créés par ce hook sont retirés individuellement.
 */
export function usePushNotifications(user_id) {
  useEffect(() => {
    if (!user_id) return undefined;

    let mounted = true;
    let starting = false;
    const listeners = [];

    const addListener = async (eventName, callback) => {
      const handle = await PushNotifications.addListener(
        eventName,
        (...args) => {
          if (mounted) callback(...args);
        }
      );

      if (!mounted) {
        await handle.remove();
        return;
      }

      listeners.push(handle);
    };

    const setupNative = async () => {
      const permission = await PushNotifications.checkPermissions();

      if (!mounted) return;

      let receivePermission = permission.receive;

      if (
        receivePermission === "prompt" ||
        receivePermission === "prompt-with-rationale"
      ) {
        const requested = await PushNotifications.requestPermissions();

        if (!mounted) return;

        receivePermission = requested.receive;
      }

      if (receivePermission !== "granted") {
        console.info("[push] Permission native non accordée.");
        return;
      }

      // Installer les écouteurs AVANT register() afin de ne pas
      // manquer l'événement contenant le jeton.
      await addListener("registration", (token) => {
        console.info("[push] Enregistrement natif reçu.");

        // L'enregistrement et la persistance du jeton sont gérés
        // par enablePushNotifications().
      });

      await addListener("registrationError", (error) => {
        console.error("[push] Erreur d'enregistrement natif :", error);
      });

      await addListener("pushNotificationReceived", (notification) => {
        console.info("[push] Notification reçue :", notification);
      });

      await addListener(
        "pushNotificationActionPerformed",
        (action) => {
          const data = action.notification?.data;

          if (data?.channel_id) {
            console.info("[push] Ouvrir le canal :", data.channel_id);
            // Brancher ici la navigation réelle vers le canal.
          } else if (data?.url) {
            console.info("[push] Action de notification :", data.url);
            // Brancher ici la navigation réelle si nécessaire.
          }
        }
      );

      if (!mounted) return;

      // Le module central gère la persistance du jeton via
      // upsert_push_token et la table push_tokens.
      const result = await enablePushNotifications();

      if (!mounted) return;

      if (!result?.ok) {
        console.error(
          "[push] Activation native échouée :",
          result?.error || "Erreur inconnue"
        );
      }
    };

    const setup = async () => {
      if (starting) return;
      starting = true;

      try {
        if (Capacitor.isNativePlatform()) {
          await setupNative();
        } else {
          // Le module central gère l'abonnement Web Push,
          // la permission et la persistance du jeton.
          const result = await enablePushNotifications();

          if (!mounted) return;

          if (!result?.ok) {
            console.warn(
              "[push] Activation Web indisponible :",
              result?.error || "Erreur inconnue"
            );
          }
        }
      } catch (error) {
        if (mounted) {
          console.error("[push] Initialisation impossible :", error);
        }
      } finally {
        starting = false;
      }
    };

    void setup();

    return () => {
      mounted = false;

      // Ne retire que les écouteurs créés par cette instance.
      // Ne pas appeler removeAllListeners(), qui affecterait
      // potentiellement d'autres composants de l'application.
      void Promise.all(
        listeners.map(async (listener) => {
          try {
            await listener.remove();
          } catch (error) {
            console.warn("[push] Nettoyage d'écouteur impossible :", error);
          }
        })
      );
    };
  }, [user_id]);
}

export default usePushNotifications;
