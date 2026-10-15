let audioContext = null;
let active = false;
let currentMode = null;
let loopTimer = null;

const pendingTimers = new Set();
const oscillators = new Set();

function getCtx() {
  if (typeof window === "undefined") return null;

  const AudioContextClass =
    window.AudioContext || window.webkitAudioContext;

  if (!AudioContextClass) return null;

  try {
    if (!audioContext || audioContext.state === "closed") {
      audioContext = new AudioContextClass();
    }

    if (audioContext.state === "suspended") {
      audioContext.resume().catch(() => {});
    }

    return audioContext;
  } catch (error) {
    console.warn("[callRingtone] Audio indisponible :", error);
    return null;
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
      // L'oscillateur peut déjà être arrêté.
    }

    try {
      oscillator.disconnect();
    } catch {
      // Déjà déconnecté.
    }
  }

  oscillators.clear();
}

function playTone(frequencies, duration = 0.18, volume = 0.12) {
  if (!active) return;

  const ctx = getCtx();
  if (!ctx || ctx.state === "closed") return;

  try {
    const now = ctx.currentTime;
    const master = ctx.createGain();

    master.gain.setValueAtTime(0.0001, now);
    master.gain.exponentialRampToValueAtTime(
      Math.max(0.0001, Math.min(volume, 1)),
      now + 0.02
    );
    master.gain.setValueAtTime(
      Math.max(0.0001, Math.min(volume, 1)),
      now + Math.max(0.03, duration - 0.03)
    );
    master.gain.exponentialRampToValueAtTime(
      0.0001,
      now + duration
    );

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

  playTone([440, 480], 0.22, 0.12);

  scheduleTimer(() => {
    playTone([440, 480], 0.22, 0.12);
  }, 380);
}

function vibrate(pattern) {
  if (typeof navigator === "undefined") return;
  if (typeof navigator.vibrate !== "function") return;

  try {
    navigator.vibrate(pattern);
  } catch {
    // Vibration non prise en charge ou refusée.
  }
}

function startLoop(mode) {
  stopRingtone();

  active = true;
  currentMode = mode;

  const play = () => {
    if (!active || currentMode !== mode) return;

    if (mode === "incoming") {
      playDoubleRing();
      vibrate([250, 120, 250]);
    } else {
      playTone([440], 1.5, 0.08);
    }

    const delay = mode === "incoming" ? 3000 : 3000;

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

  if (typeof navigator !== "undefined" &&
      typeof navigator.vibrate === "function") {
    try {
      navigator.vibrate(0);
    } catch {
      // Vibration non disponible.
    }
  }
}

export function isRingtonePlaying() {
  return active;
}
