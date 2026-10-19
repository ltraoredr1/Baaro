import { useEffect, useState, useCallback } from "react";
import { supabase } from "../supabaseClient.js";
import {
  applySettingsToDom,
  saveLocalSettings,
  loadLocalSettings,
  saveCloudSettings,
  DEFAULT_SETTINGS,
} from "../lib/appSettings.js";

export function useSettings() {
  const [settings, setSettings] = useState(() => loadLocalSettings());
  const [loading, setLoading] = useState(true);

  // Applique immédiatement les réglages locaux à l'interface.
  useEffect(() => {
    applySettingsToDom(settings);
  }, [settings]);

  // Charge les réglages locaux, puis les réglages du compte connecté.
  useEffect(() => {
    let active = true;

    async function loadSettings() {
      try {
        const localSettings = loadLocalSettings();

        if (active) {
          setSettings(localSettings);
          applySettingsToDom(localSettings);
        }

        const {
          data: { user },
          error: authError,
        } = await supabase.auth.getUser();

        if (authError) {
          console.warn("[useSettings] Authentification :", authError.message);
          return;
        }

        if (!user || !active) return;

        const { data, error } = await supabase
          .from("user_settings")
          .select("*")
          .eq("user_id", user.id)
          .maybeSingle();

        if (error) {
          console.warn("[useSettings] Chargement cloud :", error.message);
          return;
        }

        if (!data || !active) return;

        // Ne fusionne que les réglages connus pour éviter de mettre
        // des colonnes Supabase étrangères dans l'état de l'application.
        const cloudSettings = {};

        for (const key of Object.keys(DEFAULT_SETTINGS)) {
          if (data[key] !== null && data[key] !== undefined) {
            cloudSettings[key] = data[key];
          }
        }

        const merged = {
          ...localSettings,
          ...cloudSettings,
        };

        if (!active) return;

        setSettings(merged);
        saveLocalSettings(merged);
        applySettingsToDom(merged);
      } catch (error) {
        console.warn("[useSettings] Chargement des réglages :", error);
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadSettings();

    return () => {
      active = false;
    };
  }, []);

  // Met à jour l'interface et l'appareil immédiatement,
  // puis synchronise les réglages avec le compte si connecté.
  const update = useCallback(async (patch) => {
    if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
      return { ok: false, error: "Réglages invalides." };
    }

    let nextSettings;

    setSettings((previous) => {
      nextSettings = { ...previous, ...patch };
      saveLocalSettings(nextSettings);
      applySettingsToDom(nextSettings);
      return nextSettings;
    });

    // La mise à jour React est asynchrone : calcule aussi la prochaine
    // valeur depuis le stockage local pour la synchronisation.
    const currentSettings = loadLocalSettings();
    nextSettings = { ...currentSettings, ...patch };

    saveLocalSettings(nextSettings);
    applySettingsToDom(nextSettings);

    try {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError) {
        console.warn("[useSettings] Authentification :", authError.message);
        return { ok: false, localOnly: true, error: authError.message };
      }

      if (!user) {
        return { ok: true, localOnly: true };
      }

      const result = await saveCloudSettings(user.id, nextSettings);

      if (!result.ok) {
        console.warn("[useSettings] Synchronisation cloud :", result.error);
        return {
          ok: false,
          localOnly: true,
          error: result.error || "Échec de synchronisation.",
        };
      }

      return { ok: true };
    } catch (error) {
      console.warn("[useSettings] Mise à jour :", error);

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

  return { settings, loading, update };
}
