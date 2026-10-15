import { useEffect } from "react";
import {
  enablePushNotifications,
  getPermissionStateAsync,
} from "../lib/pushNotifications.js";

/**
 * BAARO — Activation des notifications push.
 *
 * - Si la permission est déjà accordée : rien à faire ici. La synchronisation
 *   silencieuse du jeton est assurée par src/lib/pushNotifications.js
 *   (démarrée à l'import de ce module, à chaque connexion / ouverture).
 * - Si la permission n'a jamais été demandée : on la demande UNE seule fois
 *   par appareil, quelques secondes après l'ouverture de l'app.
 * - Si l'utilisateur a refusé ou désactivé les notifications : on ne
 *   redemande jamais automatiquement (il peut les réactiver dans les Réglages).
 *
 * Avant : enablePushNotifications() était rappelé à chaque connexion, ce qui
 * redemandait la permission en boucle et annulait toute désactivation.
 */

const PROMPTED_KEY = "baaro_push_prompted";
const PROMPT_DELAY_MS = 4000;

function wasPrompted() {
  try {
    return localStorage.getItem(PROMPTED_KEY) === "1";
  } catch {
    return false;
  }
}

function markPrompted() {
  try {
    localStorage.setItem(PROMPTED_KEY, "1");
  } catch {
    // Stockage indisponible : sans conséquence.
  }
}

export function usePushNotifications(user_id) {
  useEffect(() => {
    if (!user_id) return undefined;

    let cancelled = false;

    const timer = setTimeout(async () => {
      try {
        if (cancelled || wasPrompted()) return;

        const permission = await getPermissionStateAsync();

        // Déjà accordée (synchro automatique), refusée ou non supportée.
        if (cancelled || permission !== "default") return;

        markPrompted();

        const result = await enablePushNotifications();

        if (cancelled) return;

        if (!result?.ok) {
          console.warn(
            "[push] Activation impossible :",
            result?.error || "Erreur inconnue"
          );
        }
      } catch (error) {
        if (!cancelled) {
          console.error("[push] Erreur pendant l'initialisation :", error);
        }
      }
    }, PROMPT_DELAY_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [user_id]);

  return undefined;
}

export default usePushNotifications;
