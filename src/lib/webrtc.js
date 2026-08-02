// src/lib/webrtc.js
// Remplace l'ancienne diffusion WebRTC pair-à-pair en étoile par Daily.co.
// Garde une interface proche de l'ancien module pour limiter les changements
// dans DebatesTab / DebateRoom.
//
// Installation requise : npm install @daily-co/daily-js

import DailyIframe from '@daily-co/daily-js';

let callObject = null;

/**
 * Démarre un live : crée la room côté serveur (api/create-room.js) puis
 * rejoint en tant qu'hôte. Retourne aussi le code d'invitation à partager.
 *
 * @param {boolean} enableHLS - Active le mode diffusion façon TikTok (HLS),
 *   nécessite un bucket S3 déjà configuré côté serveur (DAILY_S3_*).
 */
export async function startLive({ userName, enableHLS = false, hostId, debateId }) {
  const res = await fetch('/api/create-room', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'create-room', userName, enableHLS, hostId, debateId }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Impossible de créer le live");
  }

  const { roomUrl, roomName, token, hlsEnabled, inviteCode } = await res.json();

  callObject = DailyIframe.createCallObject();
  await callObject.join({ url: roomUrl, token });

  return { roomName, callObject, hlsEnabled, inviteCode };
}

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
 * Résout un code d'invitation à 6 caractères en nom de room Daily.
 * Lance une erreur si le code est invalide ou si le débat est terminé.
 */
export async function resolveInviteCode(inviteCode) {
  const res = await fetch('/api/create-room', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'resolve-code', inviteCode }),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || "Code d'invitation invalide");
  }
  return data.roomName;
}

/**
 * Rejoint un live existant en tant que spectateur, via le nom de room
 * Daily déjà résolu.
 */
export async function joinLive({ roomName, userName, isHost = false }) {
  const res = await fetch('/api/create-room', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'join-room', roomName, userName, isHost }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Impossible de rejoindre le live');
  }

  const { roomUrl, token } = await res.json();

  callObject = DailyIframe.createCallObject();
  await callObject.join({ url: roomUrl, token });

  return callObject;
}

/**
 * Rejoint un live directement via son code d'invitation à 6 caractères :
 * résout le code puis rejoint la room. C'est la fonction à utiliser depuis
 * l'UI "Rejoindre avec un code".
 */
export async function joinLiveByCode({ inviteCode, userName, isHost = false }) {
  const roomName = await resolveInviteCode(inviteCode);
  return joinLive({ roomName, userName, isHost });
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
 */
export function subscribeToEvents({ onParticipantJoined, onParticipantLeft, onTrackStarted, onError }) {
  if (!callObject) return;

  if (onParticipantJoined) callObject.on('participant-joined', onParticipantJoined);
  if (onParticipantLeft) callObject.on('participant-left', onParticipantLeft);
  if (onTrackStarted) callObject.on('track-started', onTrackStarted);
  if (onError) callObject.on('error', onError);
}

/** Quitte le live et libère les ressources */
export async function leaveLive({ roomName, isHost = false } = {}) {
  if (callObject) {
    await callObject.leave();
    callObject.destroy();
    callObject = null;
  }

  // Si l'hôte quitte, on détruit la room côté serveur et on marque le débat
  // comme terminé (le code d'invitation devient invalide).
  if (isHost && roomName) {
    await fetch('/api/create-room', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'delete-room', roomName }),
    }).catch(() => {});
  }
}

export function getCallObject() {
  return callObject;
    }
