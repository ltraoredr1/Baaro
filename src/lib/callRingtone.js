/**
 * BAARO — Generateur de tonalités pour appels audio/vidéo (Web Audio API).
 */

let audioContext = null;
let active = false;
let currentMode = null;
let loopTimer = null;

const pendingTimers = new Set();
const oscillators = new Set();

/** Volumes par défaut pour les tonalités d'appel */
let volumeIncoming = 0.4;
let volumeOutgoing = 0.25;

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
    console.warn("[callRingtone] AudioContext indisponible :", error);
    return null;
  }
}

/**
 * Débloque le contexte audio (politique Autoplay des navigateurs).
 * À appeler idéalement au premier clic / touch de l'utilisateur.
 */
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

/**
 * Ajuste les volumes des tonalités d'appel.
 */
export function setRingtoneVolume(incoming = 0.4, outgoing = 0.25) {
  volumeIncoming = Math.max(0, Math.min(1, incoming));
  volumeOutgoing = Math.max(0, Math.min(1, outgoing));
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

function playTone(frequencies, duration = 0.18, volume = volumeIncoming) {
  if (!active) return;

  const ctx = getCtx();
  if (!ctx || ctx.state === "closed") return;

  // Tentative de reprise si le contexte est suspendu
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

  playTone([440, 480], 0.22, volumeIncoming);

  scheduleTimer(() => {
    playTone([440, 480], 0.22, volumeIncoming);
  }, 380);
}

function vibrate(pattern) {
  if (typeof navigator === "undefined") return;
  if (typeof navigator.vibrate !== "function") return;

  try {
    navigator.vibrate(pattern);
  } catch {
    // Non supporté ou bloqué par le navigateur.
  }
}

function startLoop(mode) {
  stopRingtone();

  active = true;
  currentMode = mode;

  // Débloquer l'audio au démarrage du ringtone
  unlockAudio().catch(() => {});

  const play = () => {
    if (!active || currentMode !== mode) return;

    if (mode === "incoming") {
      playDoubleRing();
      vibrate([250, 120, 250, 120, 250]);
    } else {
      playTone([440], 1.5, volumeOutgoing);
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

/** Démarrer la sonnerie pour un appel entrant */
export function startIncomingRingtone() {
  startLoop("incoming");
}

/** Démarrer le signal sonore pour un appel sortant */
export function startOutgoingRingback() {
  startLoop("outgoing");
}

/** Arrêter la sonnerie et les vibrations d'appel */
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

/** Vérifier si une sonnerie est actuellement en cours */
export function isRingtonePlaying() {
  return active;
}
