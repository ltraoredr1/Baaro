/**
 * BAARO — préférences app (local + cloud user_settings)
 */
import { supabase } from "../supabaseClient.js";

export const STORAGE_KEY = "baaro_settings_v23";

export const DEFAULT_SETTINGS = {
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
  smart_prefetch: true,
  battery_saver: false,
  low_bandwidth_mode: false,
  local_cache: true,
  privacy_ai: true,
};

var CLOUD_KEYS = [
  "theme",
  "lang",
  "country",
  "currency",
  "data_saver",
  "autoplay_video",
  "offline_sync",
  "ai_region",
  "ai_suggest",
  "auto_translate",
  "translate_media",
  "prefer_debates",
  "prefer_local",
  "private_profile",
  "block_screenshots",
  "biometric",
  "large_text",
  "reduce_motion",
  "notif_push",
  "smart_prefetch",
  "battery_saver",
  "low_bandwidth_mode",
  "local_cache",
  "privacy_ai",
];

export function loadLocalSettings() {
  try {
    var raw =
      localStorage.getItem(STORAGE_KEY) ||
      localStorage.getItem("baaro_settings_v21") ||
      localStorage.getItem("baaro_settings_v20");
    if (!raw) return Object.assign({}, DEFAULT_SETTINGS);
    return Object.assign({}, DEFAULT_SETTINGS, JSON.parse(raw));
  } catch (_) {
    return Object.assign({}, DEFAULT_SETTINGS);
  }
}

export function saveLocalSettings(settings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch (_) {}
}

export function applySettingsToDom(settings) {
  try {
    var root = document.documentElement;
    var s = settings || DEFAULT_SETTINGS;

    root.lang = s.lang || "fr";
    root.dir = (s.lang === "ar" || s.lang === "nqo") ? "rtl" : "ltr";

    root.classList.toggle("baaro-large-text", !!s.large_text);
    root.classList.toggle("baaro-reduce-motion", !!s.reduce_motion);
    root.classList.toggle("baaro-data-saver", !!s.data_saver);
    root.classList.toggle("baaro-private-profile", !!s.private_profile);

    root.dataset.baaroDataSaver = s.data_saver ? "1" : "0";
    root.dataset.baaroAutoplay = s.autoplay_video ? "1" : "0";
    root.dataset.baaroOfflineSync = s.offline_sync ? "1" : "0";
    root.dataset.baaroCountry = s.country || "";
    root.dataset.baaroCurrency = s.currency || "";
    root.dataset.baaroAiRegion = s.ai_region || "auto";
    root.dataset.baaroTheme = s.theme || "midnight";
    root.dataset.baaroPreferDebates = s.prefer_debates ? "1" : "0";
    root.dataset.baaroPreferLocal = s.prefer_local ? "1" : "0";
    root.dataset.baaroSmartPrefetch = s.smart_prefetch ? "1" : "0";
    root.dataset.baaroBatterySaver = s.battery_saver ? "1" : "0";
    root.dataset.baaroLowBandwidth = s.low_bandwidth_mode ? "1" : "0";
    root.dataset.baaroLocalCache = s.local_cache ? "1" : "0";
    root.dataset.baaroPrivacyAi = s.privacy_ai ? "1" : "0";
  } catch (_) {}
}

export function getSetting(key) {
  return loadLocalSettings()[key];
}

export function isDataSaverOn() {
  return !!getSetting("data_saver");
}

export function isAutoplayOn() {
  return !!getSetting("autoplay_video");
}

function pickCloudPayload(settings, userId) {
  var payload = {
    user_id: userId,
    id: userId,
    updated_at: new Date().toISOString(),
  };
  for (var i = 0; i < CLOUD_KEYS.length; i++) {
    var k = CLOUD_KEYS[i];
    if (k in settings) payload[k] = settings[k];
  }
  return payload;
}

export async function loadCloudSettings(userId) {
  if (!userId) return { ok: false, data: null };

  var res = await supabase
    .from("user_settings")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (res.error || !res.data) {
    res = await supabase
      .from("user_settings")
      .select("*")
      .eq("id", userId)
      .maybeSingle();
  }

  if (res.error) {
    console.warn("[appSettings] loadCloud", res.error.message);
    return { ok: false, error: res.error.message, data: null };
  }

  if (!res.data) return { ok: true, data: null };

  var merged = {};
  for (var i = 0; i < CLOUD_KEYS.length; i++) {
    var k = CLOUD_KEYS[i];
    if (k in res.data && res.data[k] !== null && res.data[k] !== undefined) {
      merged[k] = res.data[k];
    }
  }
  return { ok: true, data: merged };
}

export async function saveCloudSettings(userId, settings) {
  if (!userId) return { ok: false, error: "Non authentifie" };

  var payload = pickCloudPayload(settings, userId);

  var res = await supabase
    .from("user_settings")
    .upsert(payload, { onConflict: "user_id" });

  if (res.error) {
    res = await supabase
      .from("user_settings")
      .upsert(payload, { onConflict: "id" });
  }

  if (res.error) {
    console.warn("[appSettings] saveCloud", res.error.message);
    return { ok: false, error: res.error.message };
  }
  return { ok: true };
}

export async function syncPrivateProfile(userId, isPrivate) {
  if (!userId) return;
  try {
    await supabase
      .from("profiles")
      .update({
        is_private: !!isPrivate,
        updated_at: new Date().toISOString(),
      })
      .eq("id", userId);
  } catch (_) {}
}
