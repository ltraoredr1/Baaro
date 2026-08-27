import { useEffect, useState } from "react";
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
  hide_wallet: false,
  show_earnings: false,
  prefer_debates: true,
  prefer_local: true,
  private_profile: false,
  block_screenshots: true,
  biometric: false,
  large_text: false,
  reduce_motion: false,
  notif_push: true,
};

export function useSettings() {
  const [settings, setSettings] = useState(DEFAULT);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const saved =
          localStorage.getItem(STORAGE_KEY) ||
          localStorage.getItem("baaro_settings_v22") ||
          localStorage.getItem("baaro_settings_v21") ||
          localStorage.getItem("baaro_settings_v20");
        if (saved) setSettings((s) => ({ ...s, ...JSON.parse(saved) }));
      } catch {
        /* ignore */
      }

      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
          setLoading(false);
          return;
        }
        const { data } = await supabase
          .from("user_settings")
          .select("*")
          .eq("user_id", user.id)
          .maybeSingle();
        if (data) setSettings((s) => ({ ...s, ...data }));
      } catch {
        /* table may not exist */
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function update(patch) {
    const next = { ...settings, ...patch };
    setSettings(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      await supabase.from("user_settings").upsert({
        user_id: user.id,
        ...next,
        updated_at: new Date().toISOString(),
      });
    } catch {
      /* ignore */
    }
  }

  return { settings, loading, update };
}
