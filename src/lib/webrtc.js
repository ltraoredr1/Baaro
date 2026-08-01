// src/lib/webrtc.js
// Remplace l'ancienne diffusion WebRTC pair-à-pair en étoile par Daily.co.
// Garde une interface proche de l'ancien module pour limiter les changements
// dans DebatesTab / DebateRoom (src/App.jsx).
//
// Installation requise : npm install @daily-co/daily-js

import DailyIframe from '@daily-co/daily-js';

let callObject = null;

/**
 * Démarre un live : crée la room côté serveur (api/create-room.js) puis
 * rejoint en tant qu'hôte. Appelé par l'hôte quand il lance le live.
 *
 * @param {boolean} enableHLS - Active le mode diffusion façon TikTok (HLS),
 *   nécessite un bucket S3 déjà configuré côté serveur (DAILY_S3_*).
 *   Laissez à false pour rester en WebRTC classique (gratuit, latence basse,
 *   suffisant jusqu'à ~20 spectateurs simultanés).
 */
export async function startLive({ userName, enableHLS = false }) {
  const res = await fetch('/api/create-room', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'create-room', userName, enableHLS }),
  });

  if (!res.ok) {
    throw new Error("Impossible de créer le live (vérifiez DAILY_API_KEY côté serveur)");
  }

  const { roomUrl, roomName, token, hlsEnabled } = await res.json();

  callObject = DailyIframe.createCallObject();
  await callObject.join({ url: roomUrl, token });

  return { roomName, callObject, hlsEnabled };
}

/**
 * Bascule le live en diffusion HLS (façon TikTok) : à utiliser quand le
 * nombre de spectateurs dépasse ce que le WebRTC en étoile encaisse
 * confortablement (~20). Attention : 12-20 secondes de délai pour les
 * spectateurs une fois en HLS, contre quasi temps réel en WebRTC.
 * Nécessite d'avoir créé la room avec enableHLS: true.
 */
export async function startHLSBroadcast() {
  if (!callObject) throw new Error('Aucun live actif');
  return callObject.startLiveStreaming({
    layout: { preset: 'default' },
  });
}

export async function stopHLSBroadcast() {
  if (!callObject) return;
  return callObject.stopLiveStreaming();
}

/**
 * Rejoint un live existant en tant que spectateur (ou hôte qui se
 * reconnecte). roomName vient du code d'invitation à 8 caractères déjà
 * vérifié côté serveur par votre logique existante.
 */
export async function joinLive({ roomName, userName, isHost = false }) {
  const res = await fetch('/api/create-room', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'join-room', roomName, userName, isHost }),
  });

  if (!res.ok) {
    throw new Error('Impossible de rejoindre le live');
  }

  const { roomUrl, token } = await res.json();

  callObject = DailyIframe.createCallObject();
  await callObject.join({ url: roomUrl, token });

  return callObject;
}

/** Le spectateur active son micro/caméra (si l'hôte autorise l'interaction) */
export function enableMic(enabled) {
  callObject?.setLocalAudio(enabled);
}
export function enableCamera(enabled) {
  callObject?.setLocalVideo(enabled);
}

/**
 * Attache les écouteurs d'événements Daily aux callbacks de votre UI.
 * Remplace l'ancienne gestion manuelle des connexions pair-à-pair.
 */
export function subscribeToEvents({ onParticipantJoined, onParticipantLeft, onTrackStarted, onError }) {
  if (!callObject) return;

  if (onParticipantJoined) callObject.on('participant-joined', onParticipantJoined);
  if (onParticipantLeft) callObject.on('participant-left', onParticipantLeft);
  if (onTrackStarted) callObject.on('track-started', onTrackStarted);
  if (onError) callObject.on('error', onError);
}

/** Quitte le live et libère les ressources (appelé au départ de l'hôte ou du spectateur) */
export async function leaveLive({ roomName, isHost = false } = {}) {
  if (callObject) {
    await callObject.leave();
    callObject.destroy();
    callObject = null;
  }

  // Si l'hôte quitte, on détruit la room côté serveur pour ne pas
  // laisser de rooms orphelines facturées inutilement.
  if (isHost && roomName) {
    await fetch('/api/create-room', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'delete-room', roomName }),
    });
  }
}

export function getCallObject() {
  return callObject;
}
