import { useEffect, useState, useCallback } from "react";
import { supabase } from "../../../supabaseClient.js";

const STORAGE_KEY = "baaro_settings_v23";

const DEFAULT = {
  theme: "midnight",
  lang: "fr",
  country: "ML",
  currency: "XOF",
  data_saver: true,
  autoplay_video: false,
  offline_sync: true,
  ai_region: "auto",
  ai_suggest: true,
  auto_translate: true,
  translate_media: true,
  prefer_debates: true,
  prefer_local: true,
  private_profile: false,
  block_screenshots: true,
  biometric: false,
  large_text: false,
  reduce_motion: false,
  notif_push: true,
  // 🆕 NOUVEAU : Préférences sonores (doit correspondre au SQL)
  sound_enabled: true,
  sound_volume: 70,
  message_sound: true,
  social_sound: true,
  smart_prefetch: true,
  battery_saver: false,
  low_bandwidth_mode: false,
  local_cache: true,
  privacy_ai: true,
};

export function useSettings() {
  const [settings, setSettings] = useState(DEFAULT);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const loadSettings = async () => {
      // 1. Charger depuis le stockage local (avec fallback des anciennes versions)
      try {
        const saved =
          localStorage.getItem(STORAGE_KEY) ||
          localStorage.getItem("baaro_settings_v22") ||
          localStorage.getItem("baaro_settings_v21") ||
          localStorage.getItem("baaro_settings_v20");
        
        if (saved && isMounted) {
          setSettings((prev) => ({ ...prev, ...JSON.parse(saved) }));
        }
      } catch (e) {
        console.warn("[useSettings] Erreur lecture localStorage:", e);
      }

      // 2. Charger depuis Supabase si l'utilisateur est connecté
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user || !isMounted) {
          if (isMounted) setLoading(false);
          return;
        }

        const { data } = await supabase
          .from("user_settings")
          .select("*")
          .eq("user_id", user.id)
          .maybeSingle();

        if (data && isMounted) {
          setSettings((prev) => ({ ...prev, ...data }));
        }
      } catch (e) {
        console.warn("[useSettings] Erreur lecture Supabase (table peut-être inexistante):", e);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadSettings();

    return () => {
      isMounted = false;
    };
  }, []);

  // 🆕 Utilisation de useCallback et de la forme fonctionnelle pour éviter les "stale closures"
  const update = useCallback(async (patch) => {
    let nextSettings;
    
    // Mise à jour optimiste de l'UI
    setSettings((prev) => {
      nextSettings = { ...prev, ...patch };
      return nextSettings;
      });

    // Sauvegarde locale
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(nextSettings));
    } catch (e) {
      console.warn("[useSettings] Erreur sauvegarde localStorage:", e);
    }

    // Sauvegarde distante (si connecté)
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      await supabase.from("user_settings").upsert({
        user_id: user.id,
        ...nextSettings,
        updated_at: new Date().toISOString(),
      });
    } catch (e) {
      console.warn("[useSettings] Erreur sauvegarde Supabase:", e);
    }
  }, []);

  return { settings, loading, update };
}
