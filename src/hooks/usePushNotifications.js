import { useEffect } from "react";
import {
  enablePushNotifications,
  getPermissionStateAsync,
} from "../lib/pushNotifications.js";
import { getSetting } from "../lib/appSettings.js";
// Import pour effet de bord : garantit que l'unique écouteur PLAY_SOUND
// (qui respecte silence / volume) est enregistré dès que les push sont actifs.
import "./useNotificationSound.js";

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
 * - Le son de notification est joué par useNotificationSound.js (préférences
 *   BAARO respectées).
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

export function usePushNotifications(id) {
  // Le son (message PLAY_SOUND du Service Worker) n'est PAS géré ici :
  // l'unique écouteur est dans useNotificationSound.js, qui applique les
  // préférences BAARO (son activé, mode silencieux, volume, son choisi).

  // Gestion de la demande de permission Push
  useEffect(() => {
    if (!id) return undefined;

    let cancelled = false;

    const timer = setTimeout(async () => {
      try {
        if (cancelled || wasPrompted()) return;

        if (getSetting("notif_push") === false) return;

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
  }, [id]);

  return undefined;
}

export default usePushNotifications;
