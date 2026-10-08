/**
 * BAARO — préférences app (local + cloud user_settings)
 * FIX FINAL: 9 themes + RTL sans ecran noir
 * Thème perso : stocké dans la colonne user_settings.custom_theme (jsonb).
 * Si la colonne n'existe pas encore, les autres réglages sont quand même enregistrés.
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

// THEMES : 8 thèmes fixes + custom calculé
function mix(hex, amt) {
  var h = String(hex).replace("#", "");
  if (h.length === 3) h = h.split("").map(function (c) { return c + c; }).join("");
  var n = parseInt(h, 16);
  if (isNaN(n)) return hex;
  var f = function (v) { return Math.max(0, Math.min(255, Math.round(v + (amt > 0 ? (255 - v) : v) * amt))); };
  var r = f((n >> 16) & 255), g = f((n >> 8) & 255), b = f(n & 255);
  return "#" + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
}

var THEME_MAP = {
  midnight: { bg: "#0B1220", surface: "#111A2C", surface2: "#1A2740", hover: "#203152", fg: "#F4EFE3", muted: "#8A93A6", border: "rgba(255,255,255,0.08)" },
  oled:     { bg: "#000000", surface: "#0A0A0A", surface2: "#151515", hover: "#1F1F1F", fg: "#FFFFFF", muted: "#8A8A8A", border: "rgba(255,255,255,0.10)" },
  emerald:  { bg: "#061A14", surface: "#0B2820", surface2: "#12382D", hover: "#184A3B", fg: "#D1FAE5", muted: "#7FA896", border: "rgba(255,255,255,0.08)" },
  light:    { bg: "#F8FAFC", surface: "#FFFFFF", surface2: "#EEF2F7", hover: "#E2E8F0", fg: "#0F172A", muted: "#64748B", border: "rgba(15,23,42,0.12)" },
  sunset:   { bg: "#2A1215", surface: "#38191D", surface2: "#4A2227", hover: "#5C2C32", fg: "#FFE4E6", muted: "#C79AA0", border: "rgba(255,255,255,0.08)" },
  ocean:    { bg: "#0A1628", surface: "#102240", surface2: "#173158", hover: "#1E4070", fg: "#E0F2FE", muted: "#8FB0CC", border: "rgba(255,255,255,0.08)" },
  forest:   { bg: "#0E1F14", surface: "#15301F", surface2: "#1D4029", hover: "#265234", fg: "#DCFCE7", muted: "#86AE93", border: "rgba(255,255,255,0.08)" },
  desert:   { bg: "#1F1A14", surface: "#2C251C", surface2: "#3A3125", hover: "#4A3E2F", fg: "#FEF3C7", muted: "#B5A585", border: "rgba(255,255,255,0.08)" },
};

function buildTheme(themeId, s) {
  if (themeId === "custom" && s.customTheme) {
    var c = s.customTheme, bg = c.bgColor || "#0B1220";
    var dark = parseInt(bg.replace("#", "").slice(0, 2), 16) < 140;
    return {
      bg: bg, fg: c.fg || (dark ? "#F4EFE3" : "#0F172A"),
      surface: mix(bg, dark ? 0.08 : -0.04), surface2: mix(bg, dark ? 0.16 : -0.09),
      hover: mix(bg, dark ? 0.24 : -0.14),
      muted: dark ? "#9AA3B5" : "#64748B",
      border: dark ? "rgba(255,255,255,0.10)" : "rgba(15,23,42,0.12)",
      bgImage: c.bgImage || null,
    };
  }
  return THEME_MAP[themeId] || THEME_MAP.midnight;
}

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
    root.classList.toggle("baaro-battery-saver",!!s.battery_saver);
    root.classList.toggle("baaro-low-bandwidth",!!s.low_bandwidth_mode);

    // 2. DATASET (pour debug)
    root.dataset.baaroDataSaver = s.data_saver? "1" : "0";
    root.dataset.baaroTheme = themeId;
    root.dataset.baaroCountry = s.country || "";

    // 3. THEME - C'EST ICI QUE CA MARCHE MAINTENANT
    root.setAttribute("data-theme", themeId);
    root.dataset.theme = themeId;
    if (body) body.dataset.theme = themeId;

    var t = buildTheme(themeId, s);
    var set = function (k, v) { root.style.setProperty(k, v); };
    set("--bg", t.bg);
    set("--fg", t.fg);
    set("--surface", t.surface);
    set("--surface2", t.surface2);
    set("--surface-hover", t.hover);
    set("--muted", t.muted);
    set("--muted-light", t.muted);
    set("--border", t.border);
    set("--accent", (themeId === "custom" && s.customTheme && s.customTheme.accent) || "#D9AE52");
    root.style.colorScheme = themeId === "light" ? "light" : "dark";
    if (t.bgImage) {
      root.style.setProperty("--bg-image", 'url("' + t.bgImage + '")');
      if (body) body.style.backgroundImage = 'url("' + t.bgImage + '")';
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

function pickCloudPayload(settings, user_id, withCustomTheme) {
  var payload = { user_id: user_id, id: user_id, updated_at: new Date().toISOString() };
  for (var i = 0; i < CLOUD_KEYS.length; i++) { var k = CLOUD_KEYS[i]; if (k in settings) payload[k] = settings[k]; }
  if (withCustomTheme && settings.customTheme) payload.custom_theme = settings.customTheme;
  if (settings.customTheme) payload.custom_theme = settings.customTheme;
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
  if (res.data.custom_theme && typeof res.data.custom_theme === "object") {
    merged.customTheme = Object.assign({}, DEFAULT_SETTINGS.customTheme, res.data.custom_theme);
  }
  if (res.data.custom_theme) merged.customTheme = res.data.custom_theme;
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
