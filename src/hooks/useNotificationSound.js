import { useState, useEffect, useCallback } from "react";
import {
  BAARO_SOUNDS,
  DEFAULT_SOUND_ID,
  clampVolume,
  isSilent,
  normalizeSoundId,
} from "../lib/notificationSounds.js";
import {
  getSoundPrefs,
  subscribeSoundPrefs,
  updateSoundPrefs,
} from "../lib/notificationSoundStore.js";

// Rétro-compatibilité : l'ancien import { BAARO_SOUNDS } continue de marcher.
export { BAARO_SOUNDS };

/**
 * BAARO — Lecture des sons de notification DANS L'APPLICATION.
 *
 * Les préférences vivent dans src/lib/notificationSoundStore.js (source
 * unique). Ce fichier ne fait que jouer le son et exposer le hook React.
 * Règles par plateforme : voir src/lib/notificationSounds.js.
 */

// -----------------------------------------------------------------------------
// Lecture audio
// -----------------------------------------------------------------------------

/** Fallback Web Audio si le fichier n'est pas encore chargé */
function playBeep(volumePercent) {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;

    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sine";
    osc.frequency.value = 880;

    const vol = Math.max(0, Math.min(1, (volumePercent || 70) / 100)) * 0.25;

    gain.gain.value = vol;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();

    setTimeout(() => {
      try {
        osc.stop();
        ctx.close();
      } catch {
        /* ignore */
      }
    }, 180);
  } catch {
    /* ignore */
  }
}

const audioCache = new Map();

function getAudio(path) {
  let audio = audioCache.get(path);

  if (!audio) {
    audio = new Audio(path);
    audio.preload = "auto";
    audioCache.set(path, audio);
  }

  return audio;
}

/**
 * Anti-doublon : un même événement peut arriver par plusieurs voies à la fois
 * (temps réel Supabase + message PLAY_SOUND du service worker). Un seul son
 * est joué par fenêtre de 1,5 s.
 */
const DEDUPE_WINDOW_MS = 1500;
let lastPlayedAt = 0;

/**
 * Joue un son BAARO en appliquant TOUJOURS les préférences actuelles
 * (son activé, mode silencieux, volume). Seuls les identifiants du
 * catalogue sont acceptés : un chemin venu du réseau n'est jamais lu.
 */
function playSoundFile(soundId, { force = false } = {}) {
  const prefs = getSoundPrefs();

  if (isSilent(prefs)) return;

  const now = Date.now();

  if (!force && now - lastPlayedAt < DEDUPE_WINDOW_MS) return;

  lastPlayedAt = now;

  const id = normalizeSoundId(soundId) || prefs.soundId || DEFAULT_SOUND_ID;
  const path = (BAARO_SOUNDS[id] || BAARO_SOUNDS[DEFAULT_SOUND_ID]).path;
  const volume = clampVolume(prefs.volume);

  try {
    const audio = getAudio(path);

    audio.volume = volume / 100;
    audio.currentTime = 0;

    const promise = audio.play();

    if (promise && typeof promise.catch === "function") {
      promise.catch(() => playBeep(volume));
    }
  } catch {
    playBeep(volume);
  }
}

/**
 * Amorçage audio au premier geste utilisateur.
 */
let audioPrimed = false;

function primeAudioOnFirstGesture() {
  if (typeof window === "undefined") return;

  const prime = () => {
    if (audioPrimed) return;

    audioPrimed = true;

    window.removeEventListener("pointerdown", prime, true);
    window.removeEventListener("keydown", prime, true);

    try {
      const meta = BAARO_SOUNDS[getSoundPrefs().soundId] || BAARO_SOUNDS[DEFAULT_SOUND_ID];
      const audio = getAudio(meta.path);

      audio.muted = true;

      const promise = audio.play();

      const restore = () => {
        try {
          audio.pause();
          audio.currentTime = 0;
        } catch {
          /* ignore */
        }

        audio.muted = false;
      };

      if (promise && typeof promise.then === "function") {
        promise.then(restore).catch(restore);
      } else {
        restore();
      }
    } catch {
      /* ignore */
    }
  };

  window.addEventListener("pointerdown", prime, true);
  window.addEventListener("keydown", prime, true);
}

primeAudioOnFirstGesture();

// -----------------------------------------------------------------------------
// Messages du Service Worker (Web Push)
//
// UNIQUE écouteur PLAY_SOUND de l'application. Le son envoyé par le serveur
// est ignoré : le son choisi par l'utilisateur, le mode silencieux et le
// volume BAARO s'appliquent toujours.
// -----------------------------------------------------------------------------

/**
 * Le service worker n'envoie PLAY_SOUND que si l'app est visible. Par
 * sécurité, la page ignore aussi un message périmé (page suspendue puis
 * réveillée) ou reçu alors qu'elle est masquée : pas de son surprise.
 */
const PLAY_SOUND_MAX_AGE_MS = 5000;

function shouldHandlePlaySound(data, now = Date.now()) {
  if (!data || data.type !== "PLAY_SOUND") return false;

  if (typeof document !== "undefined" && document.visibilityState === "hidden") {
    return false;
  }

  // Ancien service worker sans horodatage : on joue (comportement historique).
  if (typeof data.sentAt !== "number") return true;

  return now - data.sentAt <= PLAY_SOUND_MAX_AGE_MS;
}

if (typeof window !== "undefined" && "serviceWorker" in navigator) {
  navigator.serviceWorker.addEventListener("message", (event) => {
    if (shouldHandlePlaySound(event.data)) {
      playSoundFile(getSoundPrefs().soundId);
    }
  });
}

// -----------------------------------------------------------------------------
// Hook
// -----------------------------------------------------------------------------

export function useNotificationSound() {
  const [prefs, setPrefs] = useState(getSoundPrefs);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = subscribeSoundPrefs(setPrefs);

    setPrefs(getSoundPrefs());
    setLoading(false);

    return unsubscribe;
  }, []);

  const { enabled, muted, volume, soundId } = prefs;

  const setEnabled = useCallback((v) => updateSoundPrefs({ enabled: !!v }), []);
  const setMuted = useCallback((v) => updateSoundPrefs({ muted: !!v }), []);

  const setVolume = useCallback((v) => {
    updateSoundPrefs({ volume: clampVolume(v) });
  }, []);

  const setSoundId = useCallback((id) => {
    if (normalizeSoundId(id)) updateSoundPrefs({ soundId: id });
  }, []);

  // Test : l'utilisateur écoute explicitement, pas d'anti-doublon.
  const playTest = useCallback(() => {
    playSoundFile(getSoundPrefs().soundId, { force: true });
  }, []);

  // Sans argument : joue le son choisi dans les Réglages. Un identifiant du
  // catalogue peut être passé pour un cas particulier, mais les réglages
  // (silencieux, volume) restent appliqués.
  const playNotification = useCallback((overrideSoundId) => {
    playSoundFile(overrideSoundId || getSoundPrefs().soundId);
  }, []);

  return {
    enabled,
    muted,
    volume,
    soundId,
    loading,
    sounds: BAARO_SOUNDS,
    setEnabled,
    setMuted,
    setVolume,
    setSoundId,
    playTest,
    playNotification,
  };
}

export default useNotificationSound;
