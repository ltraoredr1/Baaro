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

function loadPrefs() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return { enabled: true, muted: false, volume: 70, soundId: DEFAULT_SOUND_ID };
    }
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
    return { enabled: true, muted: false, volume: 70, soundId: DEFAULT_SOUND_ID };
  }
}

function savePrefs(prefs) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    /* ignore */
  }
}

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
  let a = audioCache.get(path);
  if (!a) {
    a = new Audio(path);
    a.preload = "auto";
    audioCache.set(path, a);
  }
  return a;
}

function playSoundFile(soundId, volumePercent) {
  const meta = BAARO_SOUNDS[soundId] || BAARO_SOUNDS[DEFAULT_SOUND_ID];
  try {
    const audio = getAudio(meta.path);
    audio.volume = Math.max(0, Math.min(1, (volumePercent || 70) / 100));
    audio.currentTime = 0;
    const p = audio.play();
    if (p && typeof p.catch === "function") {
      p.catch(() => playBeep(volumePercent));
    }
  } catch {
    playBeep(volumePercent);
  }
}

export function useNotificationSound() {
  const initial = loadPrefs();

  const [enabled, setEnabledState] = useState(initial.enabled);
  const [muted, setMutedState] = useState(initial.muted);
  const [volume, setVolumeState] = useState(initial.volume);
  const [soundId, setSoundIdState] = useState(initial.soundId);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(false);
  }, []);

  useEffect(() => {
    savePrefs({ enabled, muted, volume, soundId });
  }, [enabled, muted, volume, soundId]);

  const setEnabled = useCallback((v) => setEnabledState(!!v), []);
  const setMuted = useCallback((v) => setMutedState(!!v), []);
  const setVolume = useCallback((v) => {
    const n = Number(v);
    setVolumeState(Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : 70);
  }, []);
  const setSoundId = useCallback((id) => {
    if (BAARO_SOUNDS[id]) setSoundIdState(id);
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
