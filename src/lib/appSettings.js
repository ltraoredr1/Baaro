/**
 * BAARO — préférences app (local + cloud user_settings)
 *
 * Corrections :
 * - saveCloudSettings essaie plusieurs formes de clé (user_id / id / les deux)
 *   au lieu d'envoyer toujours les deux colonnes (échec si l'une n'existe pas).
 * - loadCloudSettings ne renvoie plus une erreur pour un nouvel utilisateur sans ligne.
 * - sanitizeSettings : ne garde que les clés connues et du bon type (import, cloud, local).
 * - customTheme est enregistré (colonne jsonb custom_theme, facultative) et validé
 *   (couleurs hexadécimales, URL d'image https:// ou relative).
 * - custom_theme n'est réécrit que s'il a changé ; une colonne absente n'est signalée qu'une fois.
 * - syncPrivateProfile remonte désormais ses erreurs (Supabase renvoie { error }, il ne lance pas).
 * - applySettingsToDom applique tous les réglages et émet "baaro:settings".
 */
import { supabase } from "../supabaseClient.js";

export const STORAGE_KEY = "baaro_settings_v23";
export const SETTINGS_EVENT = "baaro:settings";

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
  // La protection anti-capture doit être activée volontairement par l'utilisateur.
  // Elle ne doit jamais flouter l'écran par défaut, surtout sur Web/PWA.
  block_screenshots: false,
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

export const CLOUD_KEYS = Object.keys(DEFAULT_SETTINGS);

/** Langues écrites de droite à gauche (source unique pour toute l'app). */
export const RTL_LANGS = new Set(["ar", "he", "fa", "ur", "ps", "sd", "ug", "nqo"]);

const LEGACY_KEYS = ["baaro_settings_v22", "baaro_settings_v21", "baaro_settings_v20"];

const HEX_COLOR = /^#[0-9a-f]{3,8}$/i;
const SAFE_URL = /^(https:\/\/|\/)[^"'()\s]+$/;

function isPlainObject(v) {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function sanitizeCustomTheme(v) {
  if (v === null) return null;
  if (!isPlainObject(v)) return undefined;
  const out = {};
  if (typeof v.bgColor === "string" && HEX_COLOR.test(v.bgColor)) out.bgColor = v.bgColor;
  if (typeof v.accent === "string" && HEX_COLOR.test(v.accent)) out.accent = v.accent;
  if (typeof v.fg === "string" && HEX_COLOR.test(v.fg)) out.fg = v.fg;
  if (v.bgImage === null || (typeof v.bgImage === "string" && SAFE_URL.test(v.bgImage))) {
    out.bgImage = v.bgImage;
  }
  return out;
}

/** Garde uniquement les clés connues, avec le même type que la valeur par défaut. */
export function sanitizeSettings(input) {
  const out = {};
  if (!isPlainObject(input)) return out;

  for (const key of CLOUD_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(input, key)) continue;
    const value = input[key];
    if (typeof value === typeof DEFAULT_SETTINGS[key]) out[key] = value;
  }

  if (Object.prototype.hasOwnProperty.call(input, "customTheme")) {
    const ct = sanitizeCustomTheme(input.customTheme);
    if (ct !== undefined) out.customTheme = ct;
  }

  return out;
}

export function loadLocalSettings() {
  try {
    let raw = localStorage.getItem(STORAGE_KEY);
    for (let i = 0; !raw && i < LEGACY_KEYS.length; i++) {
      raw = localStorage.getItem(LEGACY_KEYS[i]);
    }
    if (!raw) return { ...DEFAULT_SETTINGS };
    return { ...DEFAULT_SETTINGS, ...sanitizeSettings(JSON.parse(raw)) };
  } catch (_) {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveLocalSettings(settings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch (_) {}
}

export function applySettingsToDom(settings) {
  try {
    const root = document.documentElement;
    const s = settings || DEFAULT_SETTINGS;
    const flag = (v) => (v ? "1" : "0");

    const langCode = s.lang || "fr";
    const isRtl = RTL_LANGS.has(String(langCode).split("-")[0].toLowerCase());

    root.lang = langCode;
    root.dir = isRtl ? "rtl" : "ltr";
    if (isRtl) root.setAttribute("data-rtl", "1");
    else root.removeAttribute("data-rtl");
    document.body?.classList.toggle("baaro-rtl-text", isRtl);

    root.classList.toggle("baaro-large-text", !!s.large_text);
    root.classList.toggle("baaro-reduce-motion", !!s.reduce_motion);
    if (s.large_text) root.setAttribute("data-large-text", "1");
    else root.removeAttribute("data-large-text");
    if (s.reduce_motion) root.setAttribute("data-reduce-motion", "1");
    else root.removeAttribute("data-reduce-motion");
    root.classList.toggle("baaro-data-saver", !!s.data_saver);
    root.classList.toggle("baaro-private-profile", !!s.private_profile);
    root.classList.toggle("baaro-battery-saver", !!s.battery_saver);
    root.classList.toggle("baaro-low-bandwidth", !!s.low_bandwidth_mode);

    root.dataset.baaroDataSaver = flag(s.data_saver);
    root.dataset.baaroAutoplay = flag(s.autoplay_video);
    root.dataset.baaroOfflineSync = flag(s.offline_sync);
    root.dataset.baaroCountry = s.country || "";
    root.dataset.baaroCurrency = s.currency || "";
    root.dataset.baaroAiRegion = s.ai_region || "auto";
    root.dataset.baaroAiSuggest = flag(s.ai_suggest);
    root.dataset.baaroTheme = s.theme || "midnight";
    root.dataset.baaroAutoTranslate = flag(s.auto_translate);
    root.dataset.baaroTranslateMedia = flag(s.translate_media);
    root.dataset.baaroPreferDebates = flag(s.prefer_debates);
    root.dataset.baaroPreferLocal = flag(s.prefer_local);
    root.dataset.baaroBlockScreenshots = flag(s.block_screenshots);
    root.dataset.baaroBiometric = flag(s.biometric);
    root.dataset.baaroNotifPush = flag(s.notif_push);
    root.dataset.baaroSmartPrefetch = flag(s.smart_prefetch);
    root.dataset.baaroBatterySaver = flag(s.battery_saver);
    root.dataset.baaroLowBandwidth = flag(s.low_bandwidth_mode);
    root.dataset.baaroLocalCache = flag(s.local_cache);
    root.dataset.baaroPrivacyAi = flag(s.privacy_ai);

    // Thème personnalisé : variables CSS utilisables par l'app (voir index.css).
    const ct = s.theme === "custom" ? s.customTheme : null;
    const setVar = (name, value) => {
      if (value) root.style.setProperty(name, value);
      else root.style.removeProperty(name);
    };
    setVar("--baaro-custom-bg", ct?.bgColor);
    setVar("--baaro-custom-accent", ct?.accent);
    setVar("--baaro-custom-image", ct?.bgImage ? `url("${ct.bgImage}")` : "");
  } catch (_) {}
}

/** Prévient les autres instances de useSettings qu'un réglage a changé. */
export function broadcastSettings(settings) {
  try {
    window.dispatchEvent(new CustomEvent(SETTINGS_EVENT, { detail: settings }));
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

/** Utilisée par initPerf.js pour décider du préchargement. */
export function shouldPrefetch() {
  const settings = loadLocalSettings();
  if (!settings.smart_prefetch) return false;
  if (settings.data_saver || settings.low_bandwidth_mode || settings.battery_saver) {
    return false;
  }
  return true;
}

// -----------------------------------------------------------------------------
// Cloud
// -----------------------------------------------------------------------------

// Forme de clé qui fonctionne avec la table : "user_id", "id" ou "both".
let workingKeyMode = null;

// custom_theme : colonne facultative. On évite de la réécrire inutilement.
let customThemeColumnMissing = false;
let lastSavedCustomTheme;

function buildPayload(settings) {
  const payload = { updated_at: new Date().toISOString() };
  for (const k of CLOUD_KEYS) {
    if (k in settings) payload[k] = settings[k];
  }
  return payload;
}

export async function loadCloudSettings(userId) {
  if (!userId) return { ok: false, data: null };

  const query = (column) =>
    supabase.from("user_settings").select("*").eq(column, userId).maybeSingle();

  let res = await query("user_id");

  if (res.error || !res.data) {
    const second = await query("id");

    if (!second.error && second.data) {
      res = second;
    } else if (res.error && second.error) {
      console.warn("[appSettings] loadCloud", res.error.message);
      return { ok: false, error: res.error.message, data: null };
    }
  }

  if (!res.data) return { ok: true, data: null };

  const raw = { ...res.data };
  if (raw.custom_theme !== undefined) raw.customTheme = raw.custom_theme;

  return { ok: true, data: sanitizeSettings(raw) };
}

export async function saveCloudSettings(userId, settings) {
  if (!userId) return { ok: false, error: "Non authentifié" };

  const base = buildPayload(settings || {});

  const attempts = {
    user_id: { payload: { ...base, user_id: userId }, onConflict: "user_id" },
    id: { payload: { ...base, id: userId }, onConflict: "id" },
    both: { payload: { ...base, user_id: userId, id: userId }, onConflict: "user_id" },
  };

  const order = workingKeyMode
    ? [workingKeyMode]
    : ["user_id", "id", "both"];

  let lastError = null;
  let usedMode = null;

  for (const mode of order) {
    const { payload, onConflict } = attempts[mode];
    const { error } = await supabase
      .from("user_settings")
      .upsert(payload, { onConflict });

    if (!error) {
      usedMode = mode;
      lastError = null;
      break;
    }
    lastError = error;
  }

  if (lastError) {
    workingKeyMode = null;
    console.warn("[appSettings] saveCloud", lastError.message);
    return { ok: false, error: lastError.message };
  }

  workingKeyMode = usedMode;

  // Thème personnalisé : colonne jsonb facultative, ne doit jamais faire échouer le reste.
  // Réécrit uniquement si la valeur a changé depuis le dernier envoi réussi.
  if (settings && "customTheme" in settings && !customThemeColumnMissing) {
    const json = JSON.stringify(settings.customTheme ?? null);
    if (json !== lastSavedCustomTheme) {
      const column = usedMode === "id" ? "id" : "user_id";
      const { error } = await supabase
        .from("user_settings")
        .update({ custom_theme: settings.customTheme ?? null })
        .eq(column, userId);

      if (error) {
        if (/custom_theme/i.test(error.message)) customThemeColumnMissing = true;
        console.warn(
          "[appSettings] custom_theme non enregistré (colonne jsonb custom_theme absente ?) :",
          error.message
        );
      } else {
        lastSavedCustomTheme = json;
      }
    }
  }

  return { ok: true };
}

/** Met à jour profiles.is_private. Lance l'erreur pour que l'appelant puisse réessayer. */
export async function syncPrivateProfile(userId, isPrivate) {
  if (!userId) return;
  const { error } = await supabase
    .from("profiles")
    .update({
      is_private: !!isPrivate,
      updated_at: new Date().toISOString(),
    })
    .eq("id", userId);
  if (error) throw error;
}
