// Constantes des Réglages BAARO (thèmes, langues, pays, devises…)

export const STORAGE_KEY = "baaro_settings_v23";
export const APP_VERSION = "2.0.0-v23";

export const THEMES = [
  { id: "midnight", labelKey: "theme_midnight", bg: "#0B1220" },
  { id: "oled", labelKey: "theme_oled", bg: "#000000" },
  { id: "emerald", labelKey: "theme_emerald", bg: "#061A14" },
  { id: "light", labelKey: "theme_light", bg: "#F8FAFC" },
  { id: "sunset", labelKey: "theme_sunset", bg: "#2A1215" },
  { id: "ocean", labelKey: "theme_ocean", bg: "#0A1628" },
  { id: "forest", labelKey: "theme_forest", bg: "#0E1F14" },
  { id: "desert", labelKey: "theme_desert", bg: "#1F1A14" },
  { id: "custom", labelKey: "theme_custom", bg: "custom" },
] as const;

export type CustomTheme = { bgImage?: string | null; bgColor: string; accent: string; fg?: string };



/** Taille max de l'image de fond perso (envoyée sur R2, seule l'URL est gardée dans les réglages). */
export const MAX_CUSTOM_IMAGE_BYTES = 10 * 1024 * 1024;

/** UI complète : fr / en / ar / bm. Autres = préférence contenu. */
export const LANGUAGES = [
  { code: "fr", label: "Français", fullUi: true },
  { code: "en", label: "English", fullUi: true },
  { code: "ar", label: "العربية", fullUi: true },
  { code: "bm", label: "Bamanankan", fullUi: true },
  { code: "nqo", label: "ߒߞߏ", fullUi: true },
  { code: "boz", label: "Bozo", fullUi: true },
  { code: "dog", label: "Dogon", fullUi: false },
  { code: "snk", label: "Soninké", fullUi: false },
  { code: "wo", label: "Wolof", fullUi: false },
  { code: "ha", label: "Hausa", fullUi: false },
  { code: "ff", label: "Fulfulde", fullUi: false },
  { code: "sw", label: "Kiswahili", fullUi: false },
  { code: "pt", label: "Português", fullUi: false },
  { code: "es", label: "Español", fullUi: false },
] as const;

/** Traductions provisoires en attente de validation par des locuteurs. */
export const BETA_LANGS = new Set<string>(["nqo", "boz", "dog", "snk"]);

export const ALL_COUNTRY_CODES = "AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW".split(" ");
export const PRIORITY_COUNTRIES = ["ML","SN","CI","BF","GN","NE","TG","BJ","CM","NG","GH","MA"];
export const countryFlag = (c: string) => String.fromCodePoint(...c.split("").map((x) => 127397 + x.charCodeAt(0)));
export const countryName = (c: string) => {
  try { return new Intl.DisplayNames(["fr"], { type: "region" }).of(c) || c; } catch { return c; }
};
export const COUNTRIES: { code: string; flag: string; label: string }[] = [
  ...PRIORITY_COUNTRIES,
  ...ALL_COUNTRY_CODES.filter((c) => !PRIORITY_COUNTRIES.includes(c))
    .sort((a, b) => countryName(a).localeCompare(countryName(b), "fr")),
].map((code) => ({ code, flag: countryFlag(code), label: countryName(code) }))
  .concat([{ code: "OTHER", flag: "🌍", label: "Autre" }]);

export const CURRENCIES = [
  { code: "XOF", label: "Franc CFA (XOF)" },
  { code: "NGN", label: "Naira (NGN)" },
  { code: "GHS", label: "Cedi (GHS)" },
  { code: "MAD", label: "Dirham (MAD)" },
  { code: "EUR", label: "Euro (EUR)" },
  { code: "USD", label: "Dollar (USD)" },
] as const;

export const AI_REGIONS = [
  { id: "auto", labelKey: "ai_auto" },
  { id: "west_africa", labelKey: "ai_west_africa" },
  { id: "global", labelKey: "ai_global" },
] as const;

export const RTL = new Set(["ar", "nqo"]);

// Traductions en cours de validation par des locuteurs


