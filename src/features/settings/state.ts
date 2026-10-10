import { applySettingsToDom } from "../../lib/appSettings.js";
import { STORAGE_KEY, RTL } from "./constants";
import type { CustomTheme } from "./constants";
import { STRINGS } from "./strings";

export type SettingsState = {
  theme: string;
  lang: string;
  country: string;
  currency: string;
  data_saver: boolean;
  autoplay_video: boolean;
  offline_sync: boolean;
  ai_region: string;
  ai_suggest: boolean;
  auto_translate: boolean;
  translate_media: boolean;
  prefer_debates: boolean;
  prefer_local: boolean;
  private_profile: boolean;
  block_screenshots: boolean;
  biometric: boolean;
  large_text: boolean;
  reduce_motion: boolean;
  notif_push: boolean;
  smart_prefetch: boolean;
  battery_saver: boolean;
  low_bandwidth_mode: boolean;
  local_cache: boolean;
  privacy_ai: boolean;
 customTheme?: CustomTheme;
};

export const DEFAULT_CUSTOM_THEME: CustomTheme = { bgColor: "#0B1220", accent: "#2DBFA6", bgImage: null };

export const DEFAULT_SETTINGS: SettingsState = {
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
  customTheme: DEFAULT_CUSTOM_THEME,
};

export function loadLocal(): SettingsState {
  try {
    const raw =
      localStorage.getItem(STORAGE_KEY) ||
      localStorage.getItem("baaro_settings_v21") ||
      localStorage.getItem("baaro_settings_v20");
    if (!raw) return { ...DEFAULT_SETTINGS };
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function uiLang(code: string): string {
  if (code in STRINGS) return code;
  return "fr";
}

export function applyDocumentLang(lang: string) {
  try {
    document.documentElement.lang = lang;
    if (RTL.has(lang)) {
      document.documentElement.setAttribute("data-rtl", "1");
      document.documentElement.dir = "ltr";
      document.body?.classList?.add("baaro-rtl-text");
    } else {
      document.documentElement.removeAttribute("data-rtl");
      document.documentElement.dir = "ltr";
      document.body?.classList?.remove("baaro-rtl-text");
    }
  } catch {
    /* ignore */
  }
}

export function applyA11y(settings: SettingsState) {
  applySettingsToDom(settings);
}

