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
  LOCAL_ONLY_KEYS,
  SETTINGS_EVENT,
} from "../lib/appSettings.js";

/** Délai de regroupement des écritures cloud (sélecteur de couleur, toggles rapides). */
const CLOUD_SYNC_DELAY_MS = 600;
/** Nouvelle tentative automatique : 2 s, 4 s, 8 s ... plafonné à 60 s. */
const RETRY_BASE_MS = 2000;
const RETRY_MAX_MS = 60000;
/** Clés modifiées localement mais pas encore confirmées par le cloud (persisté). */
export const DIRTY_KEY = "baaro_settings_dirty";

function readDirty() {
  try {
    const raw = JSON.parse(localStorage.getItem(DIRTY_KEY) || "[]");
    return Array.isArray(raw) ? raw.filter((k) => typeof k === "string") : [];
  } catch {
    return [];
  }
}

function writeDirty(set) {
  try {
    if (set.size === 0) localStorage.removeItem(DIRTY_KEY);
    else localStorage.setItem(DIRTY_KEY, JSON.stringify([...set]));
  } catch {
    /* stockage plein ou indisponible */
  }
}

/**
 * Hook unique pour les réglages : état React + stockage local + DOM + cloud.
 *
 * syncStatus :
 *  - "synced"  : tout est enregistré dans le cloud
 *  - "saving"  : envoi en cours
 *  - "pending" : enregistré localement, synchronisation en attente (retry auto)
 *  - "local"   : non connecté, réglages uniquement sur cet appareil
 *
 * Les clés de LOCAL_ONLY_KEYS (biometric, notif_push) ne sont jamais synchronisées.
 */
export function useSettings() {
  const [settings, setSettings] = useState(() => loadLocalSettings());
  const [loading, setLoading] = useState(true);
  const [syncStatus, setSyncStatus] = useState(() =>
    readDirty().length > 0 ? "pending" : "synced",
  );
  const [syncError, setSyncError] = useState(null);

  const settingsRef = useRef(settings);
  const dirtyKeysRef = useRef(new Set(readDirty()));
  const saveQueueRef = useRef(Promise.resolve());
  const privateDirtyRef = useRef(false);
  const timerRef = useRef(null);
  const retryTimerRef = useRef(null);
  const attemptRef = useRef(0);
  const waitersRef = useRef([]);
  const flushRef = useRef(() => {});

  useEffect(() => {
    settingsRef.current = settings;
    applySettingsToDom(settings);
  }, [settings]);

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

      // Pas connecté : réglages locaux uniquement (ce n'est pas une erreur).
      if (!session?.user) return { ok: true, localOnly: true };

      const userId = session.user.id;
      const current = settingsRef.current;

      if (privateDirtyRef.current) {
        privateDirtyRef.current = false;
        try {
          await syncPrivateProfile(userId, !!current.private_profile);
        } catch (e) {
          privateDirtyRef.current = true;
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

  const scheduleRetry = useCallback(() => {
    if (retryTimerRef.current) return;
    const delay = Math.min(RETRY_BASE_MS * 2 ** attemptRef.current, RETRY_MAX_MS);
    attemptRef.current += 1;
    retryTimerRef.current = window.setTimeout(() => {
      retryTimerRef.current = null;
      void flushRef.current();
    }, delay);
  }, []);

  const flushCloud = useCallback(() => {
    window.clearTimeout(timerRef.current);
    timerRef.current = null;
    window.clearTimeout(retryTimerRef.current);
    retryTimerRef.current = null;

    const waiters = waitersRef.current;
    waitersRef.current = [];
    const keysSnapshot = [...dirtyKeysRef.current];

    setSyncStatus("saving");

    const task = saveQueueRef.current.then(syncToCloud).then((res) => {
      if (res?.ok && !res.localOnly) {
        // Confirmé par le cloud : ces clés ne sont plus « en attente ».
        for (const key of keysSnapshot) dirtyKeysRef.current.delete(key);
        writeDirty(dirtyKeysRef.current);
        attemptRef.current = 0;
        setSyncError(null);
        // De nouveaux changements sont arrivés pendant l'envoi : un autre envoi est prévu.
        setSyncStatus(
          timerRef.current || dirtyKeysRef.current.size > 0 ? "pending" : "synced",
        );
      } else if (res?.ok && res.localOnly) {
        setSyncError(null);
        setSyncStatus(dirtyKeysRef.current.size > 0 ? "local" : "synced");
      } else {
        setSyncError(res?.error || "Échec de synchronisation.");
        setSyncStatus("pending");
        scheduleRetry();
      }
      return res;
    });

    saveQueueRef.current = task.catch(() => {});
    task.then((res) => waiters.forEach((resolve) => resolve(res)));
    return task;
  }, [syncToCloud, scheduleRetry]);

  flushRef.current = flushCloud;

  // Arrière-plan : envoyer ce qui attend. Retour au premier plan / réseau : réessayer.
  useEffect(() => {
    const retryIfNeeded = () => {
      if (dirtyKeysRef.current.size === 0 || timerRef.current) return;
      attemptRef.current = 0;
      void flushRef.current();
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        if (timerRef.current) void flushRef.current();
      } else {
        retryIfNeeded();
      }
    };
    const onHide = () => {
      if (timerRef.current) void flushRef.current();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onHide);
    window.addEventListener("online", retryIfNeeded);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onHide);
      window.removeEventListener("online", retryIfNeeded);
      window.clearTimeout(retryTimerRef.current);
    };
  }, []);

  // Chargement initial + rechargement à la connexion.
  useEffect(() => {
    let active = true;

    async function loadCloud(userId) {
      const result = await loadCloudSettings(userId);
      if (!active || !result.ok || !result.data) return;

      const cloud = { ...result.data };
      // Les choix locaux non synchronisés gardent la priorité (même après rechargement).
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

        if (session?.user && active) {
          await loadCloud(session.user.id);
          // Rejoue ce qui était resté en attente avant la fermeture de l'app.
          if (active && dirtyKeysRef.current.size > 0) void flushRef.current();
        }
      } catch (error) {
        console.warn("[useSettings] Chargement des réglages :", error);
      } finally {
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

    // Les réglages propres à l'appareil ne sont jamais « en attente » de synchro.
    const cloudKeys = keys.filter((k) => !LOCAL_ONLY_KEYS.has(k));
    for (const key of cloudKeys) dirtyKeysRef.current.add(key);
    writeDirty(dirtyKeysRef.current);
    if (keys.includes("private_profile")) privateDirtyRef.current = true;

    setSettings(next);
    saveLocalSettings(next);
    broadcastSettings(next);

    if (cloudKeys.length === 0) {
      return Promise.resolve({ ok: true, localOnly: true });
    }

    // Nouvelle modification : on repart sur un délai de retry court.
    attemptRef.current = 0;
    window.clearTimeout(retryTimerRef.current);
    retryTimerRef.current = null;
    setSyncStatus("pending");

    return new Promise((resolve) => {
      waitersRef.current.push(resolve);
      window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(
        () => void flushRef.current(),
        CLOUD_SYNC_DELAY_MS,
      );
    });
  }, []);

  const reset = useCallback(
    () =>
      update({
        ...DEFAULT_SETTINGS,
        lang: settingsRef.current.lang,
        customTheme: null,
      }),
    [update],
  );

  /** Nouvelle tentative manuelle (bouton « Réessayer »). */
  const retrySync = useCallback(() => {
    attemptRef.current = 0;
    return flushRef.current();
  }, []);

  return { settings, loading, update, reset, syncStatus, syncError, retrySync };
}
