import { useEffect, useState, useCallback } from "react";
import { supabase } from "../supabaseClient.js";
import {
  applySettingsToDom,
  saveLocalSettings,
  loadLocalSettings,
  saveCloudSettings,
  DEFAULT_SETTINGS,
} from "./appSettings.js";

export function useSettings() {
  const [settings, setSettings] = useState(() => {
    const initial = loadLocalSettings();
    applySettingsToDom(initial);
    return initial;
  });

  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    async function loadSettings() {
      try {
        const localSettings = loadLocalSettings();

        if (isMounted) {
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

        if (!user || !isMounted) return;

        const result = await supabase
          .from("user_settings")
          .select("*")
          .eq("user_id", user.id)
          .maybeSingle();

        if (result.error) {
          console.warn("[useSettings] Chargement cloud :", result.error.message);
          return;
        }

        if (result.data && isMounted) {
          const cloudSettings = {};

          for (const key of Object.keys(DEFAULT_SETTINGS)) {
            if (
              Object.prototype.hasOwnProperty.call(result.data, key) &&
              result.data[key] !== null &&
              result.data[key] !== undefined
            ) {
              cloudSettings[key] = result.data[key];
            }
          }

          const merged = { ...localSettings, ...cloudSettings };

          setSettings(merged);
          saveLocalSettings(merged);
          applySettingsToDom(merged);
        }
      } catch (error) {
        console.warn("[useSettings] Chargement :", error);
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    void loadSettings();

    return () => {
      isMounted = false;
    };
  }, []);

  const update = useCallback(async (patch) => {
    let nextSettings;

    setSettings((previous) => {
      nextSettings = { ...previous, ...patch };

      saveLocalSettings(nextSettings);
      applySettingsToDom(nextSettings);

      return nextSettings;
    });

    // La sauvegarde locale reste prioritaire même si le cloud est indisponible.
    try {
      const previous = loadLocalSettings();
      nextSettings = { ...previous, ...patch };

      saveLocalSettings(nextSettings);
      applySettingsToDom(nextSettings);
    } catch (error) {
      console.warn("[useSettings] Sauvegarde locale :", error);
    }

    try {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError) {
        console.warn("[useSettings] Authentification :", authError.message);
        return { ok: false, error: authError.message };
      }

      if (!user) {
        return { ok: true, localOnly: true };
      }

      const result = await saveCloudSettings(user.id, nextSettings);

      if (!result.ok) {
        console.warn("[useSettings] Sauvegarde cloud :", result.error);
      }

      return result;
    } catch (error) {
      console.warn("[useSettings] Mise à jour :", error);
      return {
        ok: false,
        error: error instanceof Error ? error.message : "Erreur inconnue",
      };
    }
  }, []);

  return { settings, loading, update };
}
