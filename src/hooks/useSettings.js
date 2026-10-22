import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "../supabaseClient.js";
import {
  applySettingsToDom,
  broadcastSettings,
  saveLocalSettings,
  loadLocalSettings,
  loadCloudSettings,
  saveCloudSettings,
  syncPrivateProfile,
  sanitizeSettings,
  DEFAULT_SETTINGS,
  SETTINGS_EVENT,
} from "../lib/appSettings.js";

/** Délai de regroupement des écritures cloud (sélecteur de couleur, toggles rapides). */
const CLOUD_SYNC_DELAY_MS = 600;

/**
 * Hook unique pour les réglages : état React + stockage local + DOM + cloud.
 * Plusieurs composants peuvent l'utiliser : ils restent synchronisés
 * grâce à l'événement "baaro:settings".
 *
 * Local + DOM = immédiat. Cloud = regroupé (une seule écriture par rafale).
 */
export function useSettings() {
  const [settings, setSettings] = useState(() => loadLocalSettings());
  const [loading, setLoading] = useState(true);

  const settingsRef = useRef(settings);
  const dirtyKeysRef = useRef(new Set()); // modifiés localement, pas encore confirmés par le cloud
  const saveQueueRef = useRef(Promise.resolve());
  const privateDirtyRef = useRef(false);
  const timerRef = useRef(null);
  const waitersRef = useRef([]);
  const flushRef = useRef(() => {});

  // Applique à l'interface à chaque changement.
  useEffect(() => {
    settingsRef.current = settings;
    applySettingsToDom(settings);
  }, [settings]);

  // Garde les autres instances du hook synchronisées.
  useEffect(() => {
    const onChange = (event) => {
      const incoming = event?.detail;
      if (!incoming) return;
      if (JSON.stringify(incoming) === JSON.stringify(settingsRef.current)) return;
      settingsRef.current = incoming;
      setSettings(incoming);
    };

    window.addEventListener(SETTINGS_EVENT, onChange);
    return () => window.removeEventListener(SETTINGS_EVENT, onChange);
  }, []);

  const syncToCloud = useCallback(async () => {
    try {
      const {
        data: { session },
        error: authError,
      } = await supabase.auth.getSession();

      if (authError) {
        return { ok: false, localOnly: true, error: authError.message };
      }

      if (!session?.user) return { ok: true, localOnly: true };

      const userId = session.user.id;
      const current = settingsRef.current;

      if (privateDirtyRef.current) {
        privateDirtyRef.current = false;
        try {
          await syncPrivateProfile(userId, !!current.private_profile);
        } catch (e) {
          privateDirtyRef.current = true; // à réessayer
          throw e;
        }
      }

      const result = await saveCloudSettings(userId, current);

      if (!result?.ok) {
        return {
          ok: false,
          localOnly: true,
          error: result?.error || "Échec de synchronisation.",
        };
      }

      return { ok: true };
    } catch (error) {
      console.warn("[useSettings] Synchronisation :", error);
      return {
        ok: false,
        localOnly: true,
        error:
          error instanceof Error
            ? error.message
            : "Erreur lors de la synchronisation.",
      };
    }
  }, []);

  // Envoie immédiatement au cloud et résout toutes les promesses en attente.
  const flushCloud = useCallback(() => {
    window.clearTimeout(timerRef.current);
    timerRef.current = null;

    const waiters = waitersRef.current;
    waitersRef.current = [];
    const keysSnapshot = [...dirtyKeysRef.current];

    const task = saveQueueRef.current
      .then(syncToCloud)
      .then((res) => {
        // Les clés ne sont « propres » que si le cloud a vraiment confirmé :
        // sinon elles gardent la priorité sur un futur rechargement cloud.
        if (res?.ok && !res.localOnly) {
          for (const key of keysSnapshot) dirtyKeysRef.current.delete(key);
        }
        return res;
      });

    saveQueueRef.current = task.catch(() => {});
    task.then((res) => waiters.forEach((resolve) => resolve(res)));
    return task;
  }, [syncToCloud]);

  flushRef.current = flushCloud;

  // Ne perd pas une sauvegarde en attente quand l'app passe en arrière-plan.
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden" && timerRef.current) {
        void flushRef.current();
      }
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", onHide);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", onHide);
    };
  }, []);

  // Chargement initial + rechargement à la connexion.
  useEffect(() => {
    let active = true;

    async function loadCloud(userId) {
      const result = await loadCloudSettings(userId);

      if (!active || !result.ok || !result.data) return;

      const cloud = { ...result.data };
      for (const key of dirtyKeysRef.current) delete cloud[key];

      const merged = { ...settingsRef.current, ...cloud };

      settingsRef.current = merged;
      setSettings(merged);
      saveLocalSettings(merged);
      broadcastSettings(merged);
    }

    async function init() {
      try {
        const {
          data: { session },
          error: authError,
        } = await supabase.auth.getSession();

        if (authError) {
          console.warn("[useSettings] Authentification :", authError.message);
          return;
        }

        if (session?.user && active) await loadCloud(session.user.id);
      } catch (error) {
        console.warn("[useSettings] Chargement des réglages :", error);
      } finally {
        // NB : on ne vide plus dirtyKeysRef ici. Les clés ne sont retirées
        // qu'une fois réellement enregistrées dans le cloud (voir flushCloud).
        if (active) setLoading(false);
      }
    }

    void init();

    const { data: authListener } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (event !== "SIGNED_IN" || !session?.user) return;

        setTimeout(() => {
          if (!active) return;
          loadCloud(session.user.id)
            .then(() => {
              // Les choix faits hors connexion gardent la priorité : on les envoie.
              if (dirtyKeysRef.current.size > 0) void flushRef.current();
            })
            .catch((error) =>
              console.warn("[useSettings] Rechargement :", error),
            );
        }, 0);
      },
    );

    return () => {
      active = false;
      authListener?.subscription?.unsubscribe();
    };
  }, []);

  const update = useCallback((patch) => {
    if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
      return Promise.resolve({ ok: false, error: "Réglages invalides." });
    }

    const clean = sanitizeSettings(patch);
    const keys = Object.keys(clean);

    if (keys.length === 0) {
      return Promise.resolve({ ok: false, error: "Aucun réglage valide." });
    }

    const next = { ...settingsRef.current, ...clean };

    settingsRef.current = next;
    for (const key of keys) dirtyKeysRef.current.add(key);
    if (keys.includes("private_profile")) privateDirtyRef.current = true;

    // Local + interface : immédiat (applySettingsToDom est déjà fait par l'effet).
    setSettings(next);
    saveLocalSettings(next);
    broadcastSettings(next);

    // Cloud : regroupé.
    return new Promise((resolve) => {
      waitersRef.current.push(resolve);
      window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(
        () => void flushRef.current(),
        CLOUD_SYNC_DELAY_MS,
      );
    });
  }, []);

  // Réinitialise (garde la langue courante).
  // Vérifie que sanitizeSettings accepte customTheme: null, sinon le thème
  // personnalisé survit à la réinitialisation.
  const reset = useCallback(
    () =>
      update({
        ...DEFAULT_SETTINGS,
        lang: settingsRef.current.lang,
        customTheme: null,
      }),
    [update],
  );

  return { settings, loading, update, reset };
}
