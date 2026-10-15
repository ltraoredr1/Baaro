import { useEffect } from "react";
import { enablePushNotifications } from "../lib/pushNotifications.js";

/**
 * BAARO — Activation des notifications push.
 *
 * La gestion des permissions, des jetons et des écouteurs
 * est centralisée dans src/lib/pushNotifications.js.
 */
export function usePushNotifications(user_id) {
  useEffect(() => {
    if (!user_id) return undefined;

    let mounted = true;

    const setup = async () => {
      try {
        const result = await enablePushNotifications();

        if (!mounted) return;

        if (!result?.ok) {
          console.warn(
            "[push] Activation impossible :",
            result?.error || "Erreur inconnue"
          );
        }
      } catch (error) {
        if (mounted) {
          console.error(
            "[push] Erreur pendant l'initialisation :",
            error
          );
        }
      }
    };

    void setup();

    return () => {
      mounted = false;
    };
  }, [user_id]);

  return undefined;
}

export default usePushNotifications;
