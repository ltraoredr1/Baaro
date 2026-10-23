let audioContext = null;
let active = false;
let currentMode = null;
let loopTimer = null;

const pendingTimers = new Set();
const oscillators = new Set();

/** Volume plus audible (0.12 était trop bas) */
const VOLUME_INCOMING = 0.4;
const VOLUME_OUTGOING = 0.25;

function getCtx() {
  if (typeof window === "undefined") return null;

  const AudioContextClass =
    window.AudioContext || window.webkitAudioContext;

  if (!AudioContextClass) return null;

  try {
    if (!audioContext || audioContext.state === "closed") {
      audioContext = new AudioContextClass();
    }

    return audioContext;
  } catch (error) {
    console.warn("[callRingtone] Audio indisponible :", error);
    return null;
  }
}

/** Débloque le contexte (autoplay policy). À appeler aussi au premier geste UI. */
export async function unlockAudio() {
  const ctx = getCtx();
  if (!ctx) return false;

  try {
    if (ctx.state === "suspended") {
      await ctx.resume();
    }
    return ctx.state === "running";
  } catch {
    return false;
  }
}

function clearPendingTimers() {
  for (const timer of pendingTimers) {
    clearTimeout(timer);
  }

  pendingTimers.clear();

  if (loopTimer !== null) {
    clearTimeout(loopTimer);
    loopTimer = null;
  }
}

function stopOscillators() {
  for (const oscillator of oscillators) {
    try {
      oscillator.stop();
    } catch {
      // Déjà arrêté.
    }

    try {
      oscillator.disconnect();
    } catch {
      // Déjà déconnecté.
    }
  }

  oscillators.clear();
}

function playTone(frequencies, duration = 0.18, volume = VOLUME_INCOMING) {
  if (!active) return;

  const ctx = getCtx();
  if (!ctx || ctx.state === "closed") return;

  // Tentative de reprise si encore suspendu
  if (ctx.state === "suspended") {
    ctx.resume().catch(() => {});
  }

  try {
    const now = ctx.currentTime;
    const master = ctx.createGain();

    const vol = Math.max(0.0001, Math.min(volume, 1));

    master.gain.setValueAtTime(0.0001, now);
    master.gain.exponentialRampToValueAtTime(vol, now + 0.02);
    master.gain.setValueAtTime(vol, now + Math.max(0.03, duration - 0.03));
    master.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    master.connect(ctx.destination);

    for (const frequency of frequencies) {
      const oscillator = ctx.createOscillator();
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(frequency, now);
      oscillator.connect(master);

      oscillators.add(oscillator);

      oscillator.onended = () => {
        oscillators.delete(oscillator);

        try {
          oscillator.disconnect();
        } catch {
          // Déjà déconnecté.
        }
      };

      oscillator.start(now);
      oscillator.stop(now + duration);
    }

    const cleanupTimer = setTimeout(() => {
      pendingTimers.delete(cleanupTimer);

      try {
        master.disconnect();
      } catch {
        // Déjà déconnecté.
      }
    }, Math.ceil((duration + 0.1) * 1000));

    pendingTimers.add(cleanupTimer);
  } catch (error) {
    console.warn("[callRingtone] Lecture audio impossible :", error);
  }
}

function scheduleTimer(callback, delay) {
  const timer = setTimeout(() => {
    pendingTimers.delete(timer);

    if (!active) return;

    callback();
  }, delay);

  pendingTimers.add(timer);
  return timer;
}

function playDoubleRing() {
  if (!active) return;

  playTone([440, 480], 0.22, VOLUME_INCOMING);

  scheduleTimer(() => {
    playTone([440, 480], 0.22, VOLUME_INCOMING);
  }, 380);
}

function vibrate(pattern) {
  if (typeof navigator === "undefined") return;
  if (typeof navigator.vibrate !== "function") return;

  try {
    navigator.vibrate(pattern);
  } catch {
    // Non supporté.
  }
}

function startLoop(mode) {
  stopRingtone();

  active = true;
  currentMode = mode;

  // Débloquer le contexte dès le démarrage
  unlockAudio().catch(() => {});

  const play = () => {
    if (!active || currentMode !== mode) return;

    if (mode === "incoming") {
      playDoubleRing();
      vibrate([250, 120, 250]);
    } else {
      playTone([440], 1.5, VOLUME_OUTGOING);
    }

    const delay = 3000;

    loopTimer = setTimeout(() => {
      loopTimer = null;

      if (active && currentMode === mode) {
        play();
      }
    }, delay);
  };

  play();
}

export function startIncomingRingtone() {
  startLoop("incoming");
}

export function startOutgoingRingback() {
  startLoop("outgoing");
}

export function stopRingtone() {
  active = false;
  currentMode = null;

  clearPendingTimers();
  stopOscillators();

  if (
    typeof navigator !== "undefined" &&
    typeof navigator.vibrate === "function"
  ) {
    try {
      navigator.vibrate(0);
    } catch {
      // Non disponible.
    }
  }
}

export function isRingtonePlaying() {
  return active;
}
