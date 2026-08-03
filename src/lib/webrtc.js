// src/lib/webrtc.js
import DailyIframe from "@daily-co/daily-js";

let callObject = null;

/**
 * Démarre un live (hôte)
 */
export async function startLive({ userName, enableHLS = false, hostId, debateId }) {
  const res = await fetch("/api/create-room", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "create-room",
      userName,
      enableHLS,
      hostId,
      debateId,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Impossible de créer le live");
  }

  const { roomUrl, roomName, token, hlsEnabled, inviteCode } = await res.json();

  callObject = DailyIframe.createCallObject({
    audioSource: true,
    videoSource: false, // mode vocal = audio uniquement par défaut
  });

  await callObject.join({ url: roomUrl, token });

  return { roomName, callObject, hlsEnabled, inviteCode };
}

export async function startHLSBroadcast() {
  if (!callObject) throw new Error("Aucun live actif");
  return callObject.startLiveStreaming({
    layout: { preset: "default" },
  });
}

export async function stopHLSBroadcast() {
  if (!callObject) return;
  return callObject.stopLiveStreaming();
}

export async function resolveInviteCode(inviteCode) {
  const res = await fetch("/api/create-room", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "resolve-code", inviteCode }),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || "Code d'invitation invalide");
  }
  return data.roomName;
}

export async function joinLive({ roomName, userName, isHost = false, audioOnly = true }) {
  const res = await fetch("/api/create-room", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "join-room",
      roomName,
      userName,
      isHost,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Impossible de rejoindre le live");
  }

  const { roomUrl, token } = await res.json();

  callObject = DailyIframe.createCallObject({
    audioSource: true,
    videoSource: !audioOnly,
  });

  await callObject.join({ url: roomUrl, token });

  return callObject;
}

export async function joinLiveByCode({ inviteCode, userName, isHost = false, audioOnly = true }) {
  const roomName = await resolveInviteCode(inviteCode);
  return joinLive({ roomName, userName, isHost, audioOnly });
}

export function enableMic(enabled) {
  callObject?.setLocalAudio(enabled);
}

export function enableCamera(enabled) {
  callObject?.setLocalVideo(enabled);
}

export function subscribeToEvents({
  onParticipantJoined,
  onParticipantLeft,
  onTrackStarted,
  onTrackStopped,
  onError,
}) {
  if (!callObject) return;

  if (onParticipantJoined) callObject.on("participant-joined", onParticipantJoined);
  if (onParticipantLeft) callObject.on("participant-left", onParticipantLeft);
  if (onTrackStarted) callObject.on("track-started", onTrackStarted);
  if (onTrackStopped) callObject.on("track-stopped", onTrackStopped);
  if (onError) callObject.on("error", onError);
}

export async function leaveLive({ roomName, isHost = false } = {}) {
  if (callObject) {
    try {
      await callObject.leave();
      callObject.destroy();
    } catch (e) {
      console.warn("leaveLive:", e);
    }
    callObject = null;
  }

  if (isHost && roomName) {
    await fetch("/api/create-room", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete-room", roomName }),
    }).catch(() => {});
  }
}

export function getCallObject() {
  return callObject;
}

export function getParticipants() {
  return callObject?.participants() || {};
}
