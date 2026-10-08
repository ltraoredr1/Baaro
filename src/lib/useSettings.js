import { useEffect, useState, useCallback } from "react";
import { supabase } from "../supabaseClient.js";
import { applySettingsToDom, saveLocalSettings, DEFAULT_SETTINGS } from "./appSettings.js";

const STORAGE_KEY = "baaro_settings_v23";

const DEFAULT = DEFAULT_SETTINGS;

export function useSettings() {
  const [settings, setSettings] = useState(DEFAULT);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    const loadSettings = async () => {
      try {
        const saved = localStorage.getItem(STORAGE_KEY) ||
          localStorage.getItem("baaro_settings_v22") ||
          localStorage.getItem("baaro_settings_v21") ||
          localStorage.getItem("baaro_settings_v20");
        if (saved && isMounted) {
          const parsed = { ...DEFAULT, ...JSON.parse(saved) };
          setSettings(parsed);
          applySettingsToDom(parsed); // <-- FIX: applique direct au chargement
        } else {
          applySettingsToDom(DEFAULT);
        }
      } catch (e) { console.warn(e); applySettingsToDom(DEFAULT); }

      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user || !isMounted) { if (isMounted) setLoading(false); return; }
        const { data } = await supabase.from("user_settings").select("*").eq("user_id", user.id).maybeSingle();
        if (data && isMounted) {
          const merged = { ...DEFAULT, ...data };
          setSettings(merged);
          saveLocalSettings(merged);
          applySettingsToDom(merged); // <-- FIX: applique aussi depuis Supabase
        }
      } catch (e) { console.warn(e); }
      finally { if (isMounted) setLoading(false); }
    };
    loadSettings();
    return () => { isMounted = false; };
  }, []);

  const update = useCallback(async (patch) => {
    let nextSettings;
    setSettings((prev) => {
      nextSettings = { ...prev, ...patch };
      // FIX: applique immédiatement à l'écran
      applySettingsToDom(nextSettings);
      saveLocalSettings(nextSettings);
      return nextSettings;
    });
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(nextSettings));
    } catch {}
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      await supabase.from("user_settings").upsert({
        user_id: user.id,
        ...nextSettings,
        updated_at: new Date().toISOString(),
      });
    } catch (e) { console.warn(e); }
  }, []);

  return { settings, loading, update };
}
