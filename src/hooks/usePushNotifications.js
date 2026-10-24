import { useEffect } from "react";
import {
  enablePushNotifications,
  getPermissionStateAsync,
} from "../lib/pushNotifications.js";
import { getSetting } from "../lib/appSettings.js";

/**
 * BAARO — Activation des notifications push et gestion des sons.
 *
 * - Si la permission est déjà accordée : rien à faire ici. La synchronisation
 *   silencieuse du jeton est assurée par src/lib/pushNotifications.js
 *   (démarrée à l'import de ce module, à chaque connexion / ouverture).
 * - Si la permission n'a jamais été demandée : on la demande UNE seule fois
 *   par appareil, quelques secondes après l'ouverture de l'app.
 * - Si l'utilisateur a refusé ou désactivé les notifications : on ne
 *   redemande jamais automatiquement (il peut les réactiver dans les Réglages).
 * - Écoute des messages du Service Worker pour jouer le son de notification
 *   lorsque l'application est ouverte ou en arrière-plan.
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
  // 1. Écouteur pour jouer le son lorsque le Service Worker envoie le message PLAY_SOUND
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    const handleServiceWorkerMessage = (event) => {
      if (event.data && event.data.type === "PLAY_SOUND") {
        const soundUrl = event.data.sound || "/sounds/baaro_pulse.mp3";
        const audio = new Audio(soundUrl);

        audio.play().catch((err) => {
          console.warn(
            "[push] Lecture du son bloquée (nécessite une interaction utilisateur préalable) :",
            err
          );
        });
      }
    };

    navigator.serviceWorker.addEventListener(
      "message",
      handleServiceWorkerMessage
    );

    return () => {
      navigator.serviceWorker.removeEventListener(
        "message",
        handleServiceWorkerMessage
      );
    };
  }, []);

  // 2. Gestion de la demande de permission Push
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
