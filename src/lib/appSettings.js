/**
 * BAARO — préférences app (local + cloud user_settings)
 * FIX FINAL: 9 themes + RTL sans ecran noir
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
  customTheme: { bgColor: "#0B1220", accent: "#2DBFA6", bgImage: null, fg: "#F4EFE3" },
};

var CLOUD_KEYS = [
  "theme","lang","country","currency","data_saver","autoplay_video","offline_sync",
  "ai_region","ai_suggest","auto_translate","translate_media","prefer_debates",
  "prefer_local","private_profile","block_screenshots","biometric","large_text",
  "reduce_motion","notif_push","smart_prefetch","battery_saver","low_bandwidth_mode",
  "local_cache","privacy_ai","customTheme",
];

export function loadLocalSettings() {
  try {
    var raw = localStorage.getItem(STORAGE_KEY) ||
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
    localStorage.setItem("baaro_theme", settings.theme || "midnight");
  } catch (_) {}
}

// THEME MAP - 9 themes
var THEME_MAP = {
  midnight: { bg: "#0B1220", fg: "#F4EFE3", accent: "#D9AE52" },
  oled: { bg: "#000000", fg: "#ffffff", accent: "#D9AE52" },
  emerald: { bg: "#061A14", fg: "#d1fae5", accent: "#2DBFA6" },
  light: { bg: "#F8FAFC", fg: "#111827", accent: "#7c3aed" },
  sunset: { bg: "#2A1215", fg: "#ffe4e6", accent: "#f43f5e" },
  ocean: { bg: "#0A1628", fg: "#e0f2fe", accent: "#0ea5e9" },
  forest: { bg: "#0E1F14", fg: "#dcfce7", accent: "#22c55e" },
  desert: { bg: "#1F1A14", fg: "#fef3c7", accent: "#f59e0b" },
};

export function applySettingsToDom(settings) {
  try {
    var root = document.documentElement;
    var body = document.body;
    var s = settings || DEFAULT_SETTINGS;
    var themeId = s.theme || "midnight";

    // 1. A11Y
    root.classList.toggle("baaro-large-text",!!s.large_text);
    root.classList.toggle("baaro-reduce-motion",!!s.reduce_motion);
    root.classList.toggle("baaro-data-saver",!!s.data_saver);
    root.classList.toggle("baaro-private-profile",!!s.private_profile);

    // 2. DATASET (pour debug)
    root.dataset.baaroDataSaver = s.data_saver? "1" : "0";
    root.dataset.baaroTheme = themeId;
    root.dataset.baaroCountry = s.country || "";

    // 3. THEME - C'EST ICI QUE CA MARCHE MAINTENANT
    root.setAttribute("data-theme", themeId);
    root.dataset.theme = themeId;
    if (body) body.dataset.theme = themeId;

    var t = THEME_MAP[themeId];
    if (themeId === "custom" && s.customTheme) {
      t = {
        bg: s.customTheme.bgColor || "#0B1220",
        fg: s.customTheme.fg || "#F4EFE3",
        accent: s.customTheme.accent || "#2DBFA6",
        bgImage: s.customTheme.bgImage || null,
      };
    }
    if (!t) t = THEME_MAP.midnight;

    root.style.setProperty("--bg", t.bg);
    root.style.setProperty("--fg", t.fg);
    root.style.setProperty("--accent", t.accent);
    root.style.setProperty("--surface", t.bg);
    if (t.bgImage) {
      root.style.setProperty("--bg-image", `url(${t.bgImage})`);
      if (body) body.style.backgroundImage = `url(${t.bgImage})`;
    } else {
      root.style.removeProperty("--bg-image");
      if (body) body.style.backgroundImage = "";
    }
    if (body) {
      body.style.backgroundColor = t.bg;
      body.style.color = t.fg;
    }

    // 4. LANGUE + RTL SANS ECRAN NOIR
    root.lang = s.lang || "fr";
    var isRTL = s.lang === "ar" || s.lang === "nqo";
    if (isRTL) {
      // On garde layout en LTR pour éviter écran noir, mais texte en RTL
      root.setAttribute("data-rtl", "1");
      root.dir = "ltr";
      body?.classList.add("baaro-rtl-text");
    } else {
      root.removeAttribute("data-rtl");
      root.dir = "ltr";
      body?.classList.remove("baaro-rtl-text");
    }
  } catch (e) {
    console.error("[appSettings] apply error", e);
  }
}

export function getSetting(key) { return loadLocalSettings()[key]; }
export function isDataSaverOn() { return!!getSetting("data_saver"); }
export function isAutoplayOn() { return!!getSetting("autoplay_video"); }

function pickCloudPayload(settings, user_id) {
  var payload = { user_id: user_id, id: user_id, updated_at: new Date().toISOString() };
  for (var i = 0; i < CLOUD_KEYS.length; i++) { var k = CLOUD_KEYS[i]; if (k in settings) payload[k] = settings[k]; }
  return payload;
}

export async function loadCloudSettings(user_id) {
  if (!user_id) return { ok: false, data: null };
  var res = await supabase.from("user_settings").select("*").eq("user_id", user_id).maybeSingle();
  if (res.error ||!res.data) { res = await supabase.from("user_settings").select("*").eq("id", user_id).maybeSingle(); }
  if (res.error) return { ok: false, error: res.error.message, data: null };
  if (!res.data) return { ok: true, data: null };
  var merged = {};
  for (var i = 0; i < CLOUD_KEYS.length; i++) { var k = CLOUD_KEYS[i]; if (k in res.data && res.data[k]!= null) merged[k] = res.data[k]; }
  return { ok: true, data: merged };
}

export async function saveCloudSettings(user_id, settings) {
  if (!user_id) return { ok: false, error: "Non authentifie" };
  var payload = pickCloudPayload(settings, user_id);
  var res = await supabase.from("user_settings").upsert(payload, { onConflict: "user_id" });
  if (res.error) { res = await supabase.from("user_settings").upsert(payload, { onConflict: "id" }); }
  if (res.error) return { ok: false, error: res.error.message };
  return { ok: true };
}

export async function syncPrivateProfile(user_id, isPrivate) {
  if (!user_id) return;
  try { await supabase.from("profiles").update({ is_private:!!isPrivate, updated_at: new Date().toISOString() }).eq("id", user_id); } catch (_) {}
}
