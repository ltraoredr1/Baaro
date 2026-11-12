/**
 * BAARO — Son des notifications push, côté serveur (module PUR).
 *
 * Miroir de src/lib/notificationSounds.js (le test
 * tests/api/notification-sounds.test.mjs vérifie que les deux catalogues
 * restent identiques).
 *
 * Les préférences viennent de la ligne notification_preferences de
 * l'utilisateur : sound_id (texte) et sound_silent (booléen). Ces colonnes
 * sont écrites par l'application à chaque changement de réglage.
 *
 * Tant qu'un utilisateur n'a pas de sound_id (ancienne version de l'app,
 * migration SQL non appliquée), le comportement historique est conservé :
 * son baaro_pulse sur le canal Android historique.
 *
 * COMPORTEMENT PAR PLATEFORME
 * - Web     : payload.sound = chemin du son choisi, ou "none" + silent:true
 *             en mode silencieux. (L'app ouverte joue de toute façon son
 *             propre son avec ses réglages ; le serveur ne fait que ne pas
 *             faire sonner l'OS à tort.)
 * - Android : le son appartient au canal : un canal par son + un canal muet.
 * - iOS     : fichier <soundId>.wav du bundle ; pas de son en silencieux.
 * Le volume BAARO n'est jamais appliqué aux sons système (Android/iOS/
 * navigateur fermé) : c'est une limite de la plateforme.
 */

export const SOUND_IDS = Object.freeze([
  "baaro_pulse",
  "sahel_beat",
  "nko_glow",
  "market_hustle",
  "live_drop",
  "creator_rise",
  "baaro_signature",
]);

export const DEFAULT_SOUND_ID = "baaro_pulse";

/** Doit rester identique à src/lib/notificationSounds.js et MainActivity.java. */
export const ANDROID_CHANNEL_PREFIX = "baaro_notifications_v3_";
export const ANDROID_SILENT_CHANNEL_ID = `${ANDROID_CHANNEL_PREFIX}silent`;

/** Canal historique (appareils dont l'app n'a pas encore synchronisé son réglage). */
export const LEGACY_ANDROID_CHANNEL_ID = "baaro_notifications_v2";

export function androidChannelIdForSound(soundId) {
  return `${ANDROID_CHANNEL_PREFIX}${soundId}`;
}

/**
 * Accepte "sahel_beat", "sahel_beat.mp3" ou "/sounds/sahel_beat.mp3" et
 * renvoie l'identifiant connu, sinon null. Jamais de chemin arbitraire.
 */
export function normalizeSoundId(value) {
  if (typeof value !== "string") return null;

  const cleaned = value
    .trim()
    .replace(/^\/?sounds\//, "")
    .replace(/\.(mp3|wav)$/i, "");

  return SOUND_IDS.includes(cleaned) ? cleaned : null;
}

/**
 * Lit les préférences de son d'une ligne notification_preferences.
 *
 * @returns {{ synced: boolean, soundId: string, silent: boolean }}
 *   synced = false → l'app n'a jamais synchronisé : comportement historique.
 */
export function readSoundPreference(row) {
  const soundId = normalizeSoundId(row?.sound_id);

  if (!soundId) {
    return { synced: false, soundId: DEFAULT_SOUND_ID, silent: false };
  }

  return { synced: true, soundId, silent: row?.sound_silent === true };
}

/**
 * Applique la préférence à un payload Web Push (copie, l'original n'est
 * pas modifié). Sans préférence synchronisée : payload inchangé.
 */
export function applyWebSound(payload, preference) {
  if (!preference?.synced) return payload;

  const sound = preference.silent
    ? "none"
    : `/sounds/${preference.soundId}.mp3`;

  return {
    ...payload,
    sound,
    ...(preference.silent ? { silent: true } : {}),
    data: { ...(payload?.data || {}), sound },
  };
}

/**
 * Champs FCM propres à la plateforme.
 *
 * @returns {{ androidChannelId: string, androidSound: string|undefined,
 *             apnsSound: string|undefined }}
 */
export function fcmSoundFields(preference) {
  if (!preference?.synced) {
    return {
      androidChannelId: LEGACY_ANDROID_CHANNEL_ID,
      androidSound: DEFAULT_SOUND_ID,
      apnsSound: `${DEFAULT_SOUND_ID}.wav`,
    };
  }

  if (preference.silent) {
    return {
      androidChannelId: ANDROID_SILENT_CHANNEL_ID,
      androidSound: undefined,
      apnsSound: undefined,
    };
  }

  return {
    androidChannelId: androidChannelIdForSound(preference.soundId),
    // Android < 8 n'a pas de canaux : le son du message est alors utilisé.
    androidSound: preference.soundId,
    apnsSound: `${preference.soundId}.wav`,
  };
}
