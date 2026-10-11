/**
 * BAARO — Sonnerie d'appel (entrant + ringback sortant)
 *
 * Utilise Web Audio API (pas de fichier externe).
 * - Incoming : rythme type téléphone (double bip, pause, boucle) + vibration
 * - Outgoing : ton d'attente (ringback) plus doux
 *
 * Usage :
 *   import { startIncomingRingtone, startOutgoingRingback, stopRingtone } from "../lib/callRingtone.js";
 *   startIncomingRingtone();
 *   // ...
 *   stopRingtone();
 */

let audioCtx = null;
let loopTimer = null;
let oscillators = [];
let gainNodes = [];
let active = false;
let mode = null; // "incoming" | "outgoing"

function getCtx() {
  if (!audioCtx) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    audioCtx = new Ctx();
  }
  if (audioCtx.state === "suspended") {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

function stopOscillators() {
  oscillators.forEach((o) => {
    try {
      o.stop();
      o.disconnect();
    } catch (_) {}
  });
  gainNodes.forEach((g) => {
    try {
      g.disconnect();
    } catch (_) {}
  });
  oscillators = [];
  gainNodes = [];
}

function clearLoop() {
  if (loopTimer) {
    clearTimeout(loopTimer);
    loopTimer = null;
  }
}

/** Vibration native (Android / certains navigateurs) */
function vibrateIncoming() {
  try {
    if (navigator.vibrate) {
      // motif : vibre 400ms, pause 200, vibre 400, pause 1200 (cycle sonnerie)
      navigator.vibrate([400, 200, 400, 1200]);
    }
  } catch (_) {}
}

function vibrateStop() {
  try {
    if (navigator.vibrate) navigator.vibrate(0);
  } catch (_) {}
}

/**
 * Joue un "ring" court (deux tons) — style sonnerie téléphone.
 * freqs: [Hz, Hz], durationMs par bip, gapMs entre les 2 bips.
 */
function playDoubleRing(freqs, durationMs, gapMs, volume) {
  const ctx = getCtx();
  if (!ctx) return;

  const now = ctx.currentTime;
  const vol = Math.max(0.05, Math.min(0.45, volume));

  freqs.forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;

    // Enveloppe douce
    const t0 = now;
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(vol, t0 + 0.03);
    gain.gain.setValueAtTime(vol, t0 + durationMs / 1000 - 0.05);
    gain.gain.linearRampToValueAtTime(0, t0 + durationMs / 1000);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + durationMs / 1000 + 0.02);

    oscillators.push(osc);
    gainNodes.push(gain);
  });

  // 2e bip après gap
  setTimeout(() => {
    if (!active) return;
    const ctx2 = getCtx();
    if (!ctx2) return;
    const t1 = ctx2.currentTime;
    freqs.forEach((freq) => {
      const osc = ctx2.createOscillator();
      const gain = ctx2.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, t1);
      gain.gain.linearRampToValueAtTime(vol, t1 + 0.03);
      gain.gain.setValueAtTime(vol, t1 + durationMs / 1000 - 0.05);
      gain.gain.linearRampToValueAtTime(0, t1 + durationMs / 1000);
      osc.connect(gain);
      gain.connect(ctx2.destination);
      osc.start(t1);
      osc.stop(t1 + durationMs / 1000 + 0.02);
      oscillators.push(osc);
      gainNodes.push(gain);
    });
  }, gapMs);
}

/**
 * Ringback sortant : un seul ton plus long, style "appel en cours…".
 */
function playRingbackTone(volume) {
  const ctx = getCtx();
  if (!ctx) return;
  const now = ctx.currentTime;
  const vol = Math.max(0.04, Math.min(0.28, volume));

  // Deux fréquences classiques ringback (~440 + 480 Hz)
  [440, 480].forEach((freq) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(vol * 0.7, now + 0.05);
    gain.gain.setValueAtTime(vol * 0.7, now + 1.8);
    gain.gain.linearRampToValueAtTime(0, now + 2.0);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 2.05);
    oscillators.push(osc);
    gainNodes.push(gain);
  });
}

function scheduleIncomingLoop() {
  if (!active || mode !== "incoming") return;
  // Double bip (420+480 Hz) ~ 400ms, gap 200ms, puis silence ~1.2s
  playDoubleRing([420, 520], 380, 200, 0.32);
  vibrateIncoming();
  loopTimer = setTimeout(scheduleIncomingLoop, 2000);
}

function scheduleOutgoingLoop() {
  if (!active || mode !== "outgoing") return;
  playRingbackTone(0.22);
  // Ringback : 2s ton + 2s silence (standard)
  loopTimer = setTimeout(scheduleOutgoingLoop, 4000);
}

/** Démarre la sonnerie d'appel entrant (boucle + vibration). */
export function startIncomingRingtone() {
  stopRingtone();
  active = true;
  mode = "incoming";
  getCtx(); // unlock audio context si possible
  scheduleIncomingLoop();
}

/** Démarre le ton d'attente (ringback) pour l'appelant. */
export function startOutgoingRingback() {
  stopRingtone();
  active = true;
  mode = "outgoing";
  getCtx();
  scheduleOutgoingLoop();
}

/** Arrête toute sonnerie / vibration. */
export function stopRingtone() {
  active = false;
  mode = null;
  clearLoop();
  stopOscillators();
  vibrateStop();
}

export function isRingtonePlaying() {
  return active;
}
