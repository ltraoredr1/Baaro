/**
 * BAARO — Magasin unique des préférences de son de notification.
 *
 * Pas de React ici : utilisé par le hook useNotificationSound, par
 * pushNotifications.js (canaux Android + synchro serveur) et par le lecteur
 * audio. Toutes les instances voient les mêmes réglages.
 */

import {
  DEFAULT_SOUND_PREFS,
  isSilent,
  normalizeSoundId,
  normalizeSoundPrefs,
  clampVolume,
} from "./notificationSounds.js";

export const SOUND_STORAGE_KEY = "baaro:notification-sound";

function loadPrefs() {
  try {
    const raw = localStorage.getItem(SOUND_STORAGE_KEY);

    if (!raw) return { ...DEFAULT_SOUND_PREFS };

    return normalizeSoundPrefs(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_SOUND_PREFS };
  }
}

function savePrefs(prefs) {
  try {
    localStorage.setItem(SOUND_STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    /* ignore */
  }
}

let sharedPrefs = loadPrefs();
const subscribers = new Set();

function emit() {
  subscribers.forEach((notify) => {
    try {
      notify(sharedPrefs);
    } catch {
      /* un abonné défaillant ne doit pas bloquer les autres */
    }
  });
}

export function getSoundPrefs() {
  return sharedPrefs;
}

/** S'abonne aux changements ; renvoie la fonction de désabonnement. */
export function subscribeSoundPrefs(listener) {
  subscribers.add(listener);

  return () => {
    subscribers.delete(listener);
  };
}

export function updateSoundPrefs(patch) {
  const next = { ...sharedPrefs };

  if ("enabled" in patch) next.enabled = !!patch.enabled;
  if ("muted" in patch) next.muted = !!patch.muted;
  if ("volume" in patch) next.volume = clampVolume(patch.volume, next.volume);
  if ("soundId" in patch) {
    const id = normalizeSoundId(patch.soundId);
    if (id) next.soundId = id;
  }

  sharedPrefs = next;
  savePrefs(sharedPrefs);
  emit();
}

/** Remplace les préférences (ex. valeurs reçues du serveur à la connexion). */
export function replaceSoundPrefs(prefs) {
  sharedPrefs = normalizeSoundPrefs(prefs);
  savePrefs(sharedPrefs);
  emit();
}

/**
 * Vrai si l'utilisateur a déjà réglé le son sur CET appareil. Sinon (nouvel
 * appareil) on reprend plutôt le réglage enregistré sur le serveur, pour ne
 * pas l'écraser avec les valeurs par défaut.
 */
export function hasStoredSoundPrefs() {
  try {
    return localStorage.getItem(SOUND_STORAGE_KEY) !== null;
  } catch {
    return true;
  }
}

export function soundsAreSilent() {
  return isSilent(sharedPrefs);
}

// Synchronisation entre onglets / fenêtres.
if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (event.key !== SOUND_STORAGE_KEY) return;

    sharedPrefs = loadPrefs();
    emit();
  });
}
