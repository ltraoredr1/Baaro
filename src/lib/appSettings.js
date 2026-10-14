/**
 * BAARO — préférences app (local + cloud user_settings)
 * Thème unique : clair (crème / or), forcé quels que soient les réglages enregistrés.
 * Thème perso : colonne user_settings.custom_theme (jsonb), conservée pour compatibilité
 * mais non utilisée à l'affichage.
 */
import { supabase } from "../supabaseClient.js";
import { applyNativeSettings } from "./nativeSettings.js";

export const STORAGE_KEY = "baaro_settings_v23";

export const DEFAULT_SETTINGS = {
  theme: "light",
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
  customTheme: { bgColor: "#FAF7F0", accent: "#C99A2E", bgImage: null, fg: "#14213D" },
};

// Colonnes à plat de user_settings (customTheme est géré à part → custom_theme)
var CLOUD_KEYS = [
  "theme","lang","country","currency","data_saver","autoplay_video","offline_sync",
  "ai_region","ai_suggest","auto_translate","translate_media","prefer_debates",
  "prefer_local","private_profile","block_screenshots","biometric","large_text",
  "reduce_motion","notif_push","smart_prefetch","battery_saver","low_bandwidth_mode",
  "local_cache","privacy_ai",
];

export function loadLocalSettings() {
  try {
    var raw = localStorage.getItem(STORAGE_KEY) ||
      localStorage.getItem("baaro_settings_v22") ||
      localStorage.getItem("baaro_settings_v21") ||
      localStorage.getItem("baaro_settings_v20");
    if (!raw) return Object.assign({}, DEFAULT_SETTINGS);
    var merged = Object.assign({}, DEFAULT_SETTINGS, JSON.parse(raw));
    merged.theme = "light";
    return merged;
  } catch (_) {
    return Object.assign({}, DEFAULT_SETTINGS);
  }
}

export function saveLocalSettings(settings) {
  try {
    var toSave = Object.assign({}, settings, { theme: "light" });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
    localStorage.setItem("baaro_theme", "light");
  } catch (_) {}
}

// THEME UNIQUE : clair ivoire / or
var LIGHT_THEME = {
  bg: "#FAF7F0",
  surface: "#FFFFFF",
  surface2: "#F3EEE2",
  hover: "#EDE6D5",
  fg: "#14213D",
  muted: "#6B7385",
  border: "rgba(20,33,61,0.10)",
  bgImage: null,
  dark: false,
};

function buildTheme() {
  return LIGHT_THEME;
}

export function applySettingsToDom(settings) {
  try {
    var root = document.documentElement;
    var body = document.body;
    var s = settings || DEFAULT_SETTINGS;
    var themeId = "light";

    // 1. A11Y
    root.classList.toggle("baaro-large-text",!!s.large_text);
    root.classList.toggle("baaro-reduce-motion",!!s.reduce_motion);
    root.classList.toggle("baaro-data-saver",!!s.data_saver);
    root.classList.toggle("baaro-private-profile",!!s.private_profile);
    root.classList.toggle("baaro-battery-saver",!!s.battery_saver);
    root.classList.toggle("baaro-low-bandwidth",!!s.low_bandwidth_mode);

    // 2. DATASET (pour debug)
    root.dataset.baaroDataSaver = s.data_saver? "1" : "0";
    root.dataset.baaroTheme = themeId;
    root.dataset.baaroCountry = s.country || "";

    // 3. THEME (clair uniquement)
    root.setAttribute("data-theme", themeId);
    root.dataset.theme = themeId;
    if (body) body.dataset.theme = themeId;

    var t = buildTheme();
    root.setAttribute("data-mode", "light");
    var set = function (k, v) { root.style.setProperty(k, v); };
    set("--bg", t.bg);
    set("--fg", t.fg);
    set("--surface", t.surface);
    set("--surface2", t.surface2);
    set("--surface-hover", t.hover);
    set("--muted", t.muted);
    set("--muted-light", "#4B5468");
    set("--border", t.border);
    set("--accent", "#C99A2E");
    root.style.colorScheme = "light";

    // Pas d'image de fond en thème unique
    root.style.removeProperty("--bg-image");
    if (body) {
      body.style.backgroundImage = "";
      body.style.backgroundColor = t.bg;
      body.style.color = t.fg;
    }

    // Barre d'état mobile / PWA alignée sur le thème
    var metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) metaTheme.setAttribute("content", t.bg);

    applyNativeSettings(s);

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

function pickCloudPayload(settings, user_id, withCustomTheme) {
  var payload = { user_id: user_id, id: user_id, updated_at: new Date().toISOString() };
  for (var i = 0; i < CLOUD_KEYS.length; i++) { var k = CLOUD_KEYS[i]; if (k in settings) payload[k] = settings[k]; }
  payload.theme = "light";
  if (withCustomTheme && settings.customTheme) payload.custom_theme = settings.customTheme;
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
  merged.theme = "light";
  if (res.data.custom_theme && typeof res.data.custom_theme === "object") {
    merged.customTheme = Object.assign({}, DEFAULT_SETTINGS.customTheme, res.data.custom_theme);
  }
  return { ok: true, data: merged };
}

async function upsertSettings(payload) {
  var res = await supabase.from("user_settings").upsert(payload, { onConflict: "user_id" });
  if (res.error) { res = await supabase.from("user_settings").upsert(payload, { onConflict: "id" }); }
  return res;
}

export async function saveCloudSettings(user_id, settings) {
  if (!user_id) return { ok: false, error: "Non authentifie" };
  var res = await upsertSettings(pickCloudPayload(settings, user_id, true));
  // Colonne custom_theme pas encore créée : on enregistre au moins tous les autres réglages
  if (res.error && /custom_theme/i.test(String(res.error.message || ""))) {
    res = await upsertSettings(pickCloudPayload(settings, user_id, false));
  }
  if (res.error) return { ok: false, error: res.error.message };
  return { ok: true };
}

export async function syncPrivateProfile(user_id, isPrivate) {
  if (!user_id) return;
  return;
}

export function shouldPrefetch() {
  var s = loadLocalSettings();
  return !!s.smart_prefetch && !s.data_saver && !s.low_bandwidth_mode && !s.battery_saver;
}
export function isLocalCacheOn() { return !!getSetting("local_cache"); }
