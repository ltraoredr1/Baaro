import { useState, useEffect, useCallback } from "react";

const STORAGE_KEY = "baaro:notification-sound";

/** Catalogue des 7 sons BAARO Original (chemins publics) */
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

const DEFAULT_SOUND_ID = "baaro_pulse";

const DEFAULT_PREFS = {
  enabled: true,
  muted: false,
  volume: 70,
  soundId: DEFAULT_SOUND_ID,
};

function loadPrefs() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);

    if (!raw) return { ...DEFAULT_PREFS };

    const parsed = JSON.parse(raw);

    return {
      enabled: parsed.enabled !== false,
      muted: !!parsed.muted,
      volume: typeof parsed.volume === "number" ? parsed.volume : 70,
      soundId:
        parsed.soundId && BAARO_SOUNDS[parsed.soundId]
          ? parsed.soundId
          : DEFAULT_SOUND_ID,
    };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

function savePrefs(prefs) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    /* ignore */
  }
}

// -----------------------------------------------------------------------------
// État partagé : toutes les instances du hook voient les mêmes réglages.
// (Avant : chaque composant avait sa propre copie, donc changer le son ou
// couper le son dans les Réglages n'avait aucun effet là où il est joué.)
// -----------------------------------------------------------------------------

let sharedPrefs = loadPrefs();
const subscribers = new Set();

function updateSharedPrefs(patch) {
  sharedPrefs = { ...sharedPrefs, ...patch };
  savePrefs(sharedPrefs);
  subscribers.forEach((notify) => notify(sharedPrefs));
}

// Synchronisation entre onglets / fenêtres.
if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (event.key !== STORAGE_KEY) return;

    sharedPrefs = loadPrefs();
    subscribers.forEach((notify) => notify(sharedPrefs));
  });
}

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

function playSoundFile(soundId, volumePercent) {
  const meta = BAARO_SOUNDS[soundId] || BAARO_SOUNDS[DEFAULT_SOUND_ID];

  try {
    const audio = getAudio(meta.path);

    audio.volume = Math.max(0, Math.min(1, (volumePercent || 70) / 100));
    audio.currentTime = 0;

    const promise = audio.play();

    if (promise && typeof promise.catch === "function") {
      promise.catch(() => playBeep(volumePercent));
    }
  } catch {
    playBeep(volumePercent);
  }
}

/**
 * Les navigateurs bloquent l'audio tant que l'utilisateur n'a pas touché la
 * page. Au premier geste, on "amorce" le son choisi (muet) pour que les
 * notifications suivantes puissent être jouées automatiquement.
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
      const meta = BAARO_SOUNDS[sharedPrefs.soundId] || BAARO_SOUNDS[DEFAULT_SOUND_ID];
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
// Hook
// -----------------------------------------------------------------------------

export function useNotificationSound() {
  const [prefs, setPrefs] = useState(sharedPrefs);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    subscribers.add(setPrefs);

    // Rattrape un changement survenu entre le rendu et l'abonnement.
    setPrefs(sharedPrefs);
    setLoading(false);

    return () => {
      subscribers.delete(setPrefs);
    };
  }, []);

  const { enabled, muted, volume, soundId } = prefs;

  const setEnabled = useCallback((v) => updateSharedPrefs({ enabled: !!v }), []);
  const setMuted = useCallback((v) => updateSharedPrefs({ muted: !!v }), []);

  const setVolume = useCallback((v) => {
    const n = Number(v);

    updateSharedPrefs({
      volume: Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : 70,
    });
  }, []);

  const setSoundId = useCallback((id) => {
    if (BAARO_SOUNDS[id]) updateSharedPrefs({ soundId: id });
  }, []);

  const playTest = useCallback(() => {
    if (!enabled || muted) return;
    playSoundFile(soundId, volume);
  }, [enabled, muted, volume, soundId]);

  const playNotification = useCallback(
    (overrideSoundId) => {
      if (!enabled || muted) return;
      playSoundFile(overrideSoundId || soundId, volume);
    },
    [enabled, muted, volume, soundId]
  );

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
