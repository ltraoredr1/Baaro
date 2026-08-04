// src/lib/webrtc.js
// - setParticipantRole / requestCoHost / respondCoHostRequest / demoteToViewer
// - Consentement obligatoire pour devenir co-hôte

import DailyIframe from "@daily-co/daily-js";
import { supabase } from "../supabaseClient.js";

let callObject = null;
let myRole = "viewer";

async function authHeaders() {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function callApi(body) {
  const res = await fetch("/api/create-room", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || "Erreur serveur");
  }
  return data;
}

async function callRolesApi(body) {
  const res = await fetch("/api/live-roles", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || "Erreur serveur");
  }
  return data;
}

/**
 * Crée la room Daily + la ligne debate_rooms côté serveur, SANS rejoindre
 * l'appel. À utiliser dans CreateDebateModal.jsx.
 */
export async function createRoomOnServer({ userName, enableHLS = false }) {
  return callApi({ action: "create-room", userName, enableHLS });
}

/**
 * Démarre un live ET rejoint immédiatement l'appel (hôte).
 */
export async function startLive({ userName, enableHLS = false }) {
  const { roomUrl, roomName, roomId, token, hlsEnabled, inviteCode } =
    await createRoomOnServer({ userName, enableHLS });

  myRole = "host";

  callObject = DailyIframe.createCallObject({
    audioSource: true,
    videoSource: false,
    subscribeToTracksAutomatically: true,
  });
  try {
    callObject.setSubscribeToTracksAutomatically(true);
  } catch (_) {}

  await callObject.join({ url: roomUrl, token });

  return { roomName, roomId, callObject, hlsEnabled, inviteCode };
}

export async function startHLSBroadcast() {
  if (!callObject) throw new Error("Aucun live actif");
  return callObject.startLiveStreaming({ layout: { preset: "default" } });
}

export async function stopHLSBroadcast() {
  if (!callObject) return;
  return callObject.stopLiveStreaming();
}

export async function resolveInviteCode(inviteCode) {
  const { roomId, roomName } = await callApi({
    action: "resolve-code",
    inviteCode,
  });
  return { roomId, roomName };
}

export async function joinLive({
  roomId,
  roomName,
  userName,
  audioOnly = true,
}) {
  const { roomUrl, token, role } = await callApi({
    action: "join-room",
    roomId,
    roomName,
    userName,
  });

  myRole = role;

  callObject = DailyIframe.createCallObject({
    audioSource: true,
    videoSource: !audioOnly,
    subscribeToTracksAutomatically: true,
  });

  try {
    callObject.setSubscribeToTracksAutomatically(true);
  } catch (_) {}

  await callObject.join({ url: roomUrl, token });

  const canSend = role === "host" || role === "co_host";
  try {
    await callObject.setLocalAudio(!!canSend);
    if (!audioOnly) {
      await callObject.setLocalVideo(!!canSend);
    }
  } catch (e) {
    console.warn("setLocalAudio/Video:", e);
  }

  return { callObject, role, roomId, roomUrl };
}

export async function joinLiveByCode({
  inviteCode,
  userName,
  audioOnly = true,
}) {
  const { roomId, roomName } = await resolveInviteCode(inviteCode);
  return joinLive({ roomId, roomName, userName, audioOnly });
}

export function getMyRole() {
  return myRole;
}

/**
 * À appeler quand Realtime signale une promotion / rétrogradation.
 */
export function upgradeLocalRole(newRole) {
  myRole = newRole;
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
  onParticipantUpdated,
  onTrackStarted,
  onTrackStopped,
  onError,
}) {
  if (!callObject) return;

  if (onParticipantJoined)
    callObject.on("participant-joined", onParticipantJoined);
  if (onParticipantLeft) callObject.on("participant-left", onParticipantLeft);
  if (onParticipantUpdated)
    callObject.on("participant-updated", onParticipantUpdated);
  if (onTrackStarted) callObject.on("track-started", onTrackStarted);
  if (onTrackStopped) callObject.on("track-stopped", onTrackStopped);
  if (onError) callObject.on("error", onError);
}

/**
 * Retrouve le session_id Daily d'un participant via son user_id Supabase.
 */
export function findParticipantSessionId(targetUserId) {
  const all = callObject?.participants() || {};
  const match = Object.values(all).find((p) => p.user_id === targetUserId);
  return match?.session_id || null;
}

/**
 * Change le rôle.
 * - co_host → envoie une demande (consentement)
 * - viewer → rétrogradation immédiate
 */
export async function setParticipantRole({
  roomId,
  targetUserId,
  newRole,
  dailyRoomName,
}) {
  if (newRole === "co_host") {
    return callRolesApi({
      action: "request",
      roomId,
      targetUserId,
    });
  }

  const targetSessionId = findParticipantSessionId(targetUserId);
  return callRolesApi({
    action: "set-role",
    roomId,
    targetUserId,
    role: newRole,
    targetSessionId,
    dailyRoomName: dailyRoomName || null,
  });
}

/** L'hôte propose à un spectateur de devenir co-hôte. */
export async function requestCoHost(roomId, targetUserId) {
  return callRolesApi({
    action: "request",
    roomId,
    targetUserId,
  });
}

/** Le spectateur accepte ou refuse la proposition. */
export async function respondCoHostRequest({
  requestId,
  accept,
  targetSessionId = null,
  dailyRoomName = null,
}) {
  return callRolesApi({
    action: "respond",
    requestId,
    accept,
    targetSessionId,
    dailyRoomName,
  });
}

/** Alias : promotion = demande de consentement. */
export async function promoteToCoHost(roomId, targetUserId, dailyRoomName) {
  return requestCoHost(roomId, targetUserId);
}

/** Rétrogradation immédiate (hôte seulement). */
export async function demoteToViewer(roomId, targetUserId, dailyRoomName) {
  const targetSessionId = findParticipantSessionId(targetUserId);
  return callRolesApi({
    action: "set-role",
    roomId,
    targetUserId,
    role: "viewer",
    targetSessionId,
    dailyRoomName: dailyRoomName || null,
  });
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
  myRole = "viewer";

  if (isHost && roomName) {
    await callApi({ action: "delete-room", roomName }).catch(() => {});
  }
}

export function getCallObject() {
  return callObject;
}

export function getParticipants() {
  return callObject?.participants() || {};
}
