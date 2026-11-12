/**
 * BAARO — Catalogue et règles des sons de notification (module PUR, sans I/O).
 *
 * Source de vérité côté application. Le serveur a son propre miroir dans
 * api/_lib/push-sounds.js : tests/api/notification-sounds.test.mjs vérifie
 * que les deux catalogues restent identiques.
 *
 * COMPORTEMENT PAR PLATEFORME
 * ─────────────────────────────────────────────────────────────────────────
 * Web, app visible    Le son est joué par l'app (PLAY_SOUND envoyé par le
 *                     service worker). Son choisi, mode silencieux et volume
 *                     BAARO sont appliqués. Le son envoyé par le serveur est
 *                     IGNORÉ. La notification système est muette (pas de
 *                     doublon).
 * Web, arrière-plan   Seul le son système par défaut est possible : un
 *   ou app fermée     navigateur ne joue pas de fichier audio personnalisé
 *                     (l'option `sound` des notifications Web n'est pas
 *                     standard) et une page suspendue ne peut pas jouer de
 *                     son. Son choisi et volume BAARO : non contrôlables.
 *                     En mode silencieux BAARO, la notif est envoyée muette.
 * Téléphone silencieux / Ne pas déranger : l'OS décide, BAARO ne le
 *                     contourne jamais.
 * Android (fond)      Le son appartient au CANAL de notification (Android 8+).
 *                     Un canal par son : baaro_notifications_v3_<soundId>,
 *                     + un canal muet. Le serveur choisit le canal d'après
 *                     les préférences synchronisées. Volume : celui du
 *                     système (non contrôlable par l'app).
 * Android (premier plan) L'app joue le son elle-même : son choisi, silencieux
 *                     et volume BAARO appliqués.
 * iOS                 Fichier <soundId>.wav du bundle ; muet si silencieux.
 *                     Volume : celui du système.
 */

/** Catalogue des sons BAARO (chemins publics Web). */
export const BAARO_SOUNDS = {
  baaro_pulse: {
    id: "baaro_pulse",
    name: "Baaro Pulse",
    path: "/sounds/baaro_pulse.mp3",
    category: "notification",
  },
  sahel_beat: {
    id: "sahel_beat",
    name: "Sahel Beat",
    path: "/sounds/sahel_beat.mp3",
    category: "studio",
  },
  nko_glow: {
    id: "nko_glow",
    name: "N'Ko Glow",
    path: "/sounds/nko_glow.mp3",
    category: "studio",
  },
  market_hustle: {
    id: "market_hustle",
    name: "Market Hustle",
    path: "/sounds/market_hustle.mp3",
    category: "studio",
  },
  live_drop: {
    id: "live_drop",
    name: "Live Drop",
    path: "/sounds/live_drop.mp3",
    category: "notification",
  },
  creator_rise: {
    id: "creator_rise",
    name: "Creator Rise",
    path: "/sounds/creator_rise.mp3",
    category: "studio",
  },
  baaro_signature: {
    id: "baaro_signature",
    name: "Baaro Signature",
    path: "/sounds/baaro_signature.mp3",
    category: "brand",
  },
};

export const DEFAULT_SOUND_ID = "baaro_pulse";

export const DEFAULT_SOUND_PREFS = Object.freeze({
  enabled: true,
  muted: false,
  volume: 70,
  soundId: DEFAULT_SOUND_ID,
});

/** Préfixe des canaux Android. Doit rester identique dans MainActivity.java. */
export const ANDROID_CHANNEL_PREFIX = "baaro_notifications_v3_";
export const ANDROID_SILENT_CHANNEL_ID = `${ANDROID_CHANNEL_PREFIX}silent`;

export function androidChannelIdForSound(soundId) {
  return `${ANDROID_CHANNEL_PREFIX}${soundId}`;
}

/**
 * Accepte un identifiant ("sahel_beat"), un nom de fichier ("sahel_beat.mp3")
 * ou un chemin ("/sounds/sahel_beat.mp3") et renvoie l'identifiant connu,
 * sinon null. Un chemin arbitraire n'est jamais accepté.
 */
export function normalizeSoundId(value) {
  if (typeof value !== "string") return null;

  const cleaned = value
    .trim()
    .replace(/^\/?sounds\//, "")
    .replace(/\.(mp3|wav)$/i, "");

  return Object.prototype.hasOwnProperty.call(BAARO_SOUNDS, cleaned)
    ? cleaned
    : null;
}

export function clampVolume(value, fallback = DEFAULT_SOUND_PREFS.volume) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : fallback;
}

/** Valide un objet de préférences (localStorage, import...). */
export function normalizeSoundPrefs(raw) {
  const source = raw && typeof raw === "object" ? raw : {};

  return {
    enabled: source.enabled !== false,
    muted: !!source.muted,
    volume:
      typeof source.volume === "number"
        ? clampVolume(source.volume)
        : DEFAULT_SOUND_PREFS.volume,
    soundId: normalizeSoundId(source.soundId) || DEFAULT_SOUND_ID,
  };
}

/** Vrai si l'utilisateur ne veut aucun son (désactivé ou silencieux). */
export function isSilent(prefs) {
  return !prefs?.enabled || !!prefs?.muted;
}

/** Ce que l'on synchronise vers le serveur (le volume reste local). */
export function toServerSoundPrefs(prefs) {
  const normalized = normalizeSoundPrefs(prefs);

  return {
    sound_id: normalized.soundId,
    sound_silent: isSilent(normalized),
  };
}

/** Canal Android correspondant aux préférences. */
export function androidChannelForPrefs(prefs) {
  const normalized = normalizeSoundPrefs(prefs);

  return isSilent(normalized)
    ? ANDROID_SILENT_CHANNEL_ID
    : androidChannelIdForSound(normalized.soundId);
}

/** Tous les canaux Android à créer : un par son + le canal muet. */
export function allAndroidChannels() {
  return [
    ...Object.values(BAARO_SOUNDS).map((sound) => ({
      id: androidChannelIdForSound(sound.id),
      name: `Notifications BAARO — ${sound.name}`,
      soundId: sound.id,
    })),
    {
      id: ANDROID_SILENT_CHANNEL_ID,
      name: "Notifications BAARO — Silencieux",
      soundId: null,
    },
  ];
}
