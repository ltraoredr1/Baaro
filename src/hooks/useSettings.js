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

/**
 * Hook unique pour les réglages : état React + stockage local + DOM + cloud.
 * Plusieurs composants peuvent l'utiliser : ils restent synchronisés
 * grâce à l'événement "baaro:settings".
 */
export function useSettings() {
  const [settings, setSettings] = useState(() => loadLocalSettings());
  const [loading, setLoading] = useState(true);

  const settingsRef = useRef(settings);
  const dirtyKeysRef = useRef(new Set());
  const saveQueueRef = useRef(Promise.resolve());
  const privateDirtyRef = useRef(false);

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
        dirtyKeysRef.current.clear();
        if (active) setLoading(false);
      }
    }

    void init();

    const { data: authListener } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (event !== "SIGNED_IN" || !session?.user) return;

        setTimeout(() => {
          if (!active) return;
          loadCloud(session.user.id).catch((error) =>
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
        await syncPrivateProfile(userId, !!current.private_profile);
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

  const update = useCallback(
    (patch) => {
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

      setSettings(next);
      saveLocalSettings(next);
      applySettingsToDom(next);
      broadcastSettings(next);

      const task = saveQueueRef.current.then(syncToCloud);
      saveQueueRef.current = task.catch(() => {});
      return task;
    },
    [syncToCloud],
  );

  // Réinitialise (garde la langue courante).
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
