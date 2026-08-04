// src/lib/webrtc.js
// - join / create Daily
// - co-hôte avec consentement (request / respond)
// - pause / resume room

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

export async function createRoomOnServer({
  userName,
  enableHLS = false,
  title,
  topic,
  mode,
}) {
  return callApi({
    action: "create-room",
    userName,
    enableHLS,
    title,
    topic,
    mode,
  });
}

export async function startLive({
  userName,
  enableHLS = false,
  title,
  topic,
  mode,
}) {
  const { roomUrl, roomName, roomId, token, hlsEnabled, inviteCode } =
    await createRoomOnServer({ userName, enableHLS, title, topic, mode });

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
  const { roomId, roomName, status } = await callApi({
    action: "resolve-code",
    inviteCode,
  });
  return { roomId, roomName, status };
}

export async function joinLive({
  roomId,
  roomName,
  userName,
  audioOnly = true,
}) {
  const { roomUrl, token, role, status } = await callApi({
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

  return { callObject, role, roomId, roomUrl, status };
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

export function findParticipantSessionId(targetUserId) {
  const all = callObject?.participants() || {};
  const match = Object.values(all).find((p) => p.user_id === targetUserId);
  return match?.session_id || null;
}

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

export async function requestCoHost(roomId, targetUserId) {
  return callRolesApi({
    action: "request",
    roomId,
    targetUserId,
  });
}

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

export async function promoteToCoHost(roomId, targetUserId, dailyRoomName) {
  return requestCoHost(roomId, targetUserId);
}

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

/** Met le débat en pause (hôte). */
export async function pauseRoom(roomId) {
  return callApi({ action: "pause-room", roomId });
}

/** Reprend le débat (hôte). */
export async function resumeRoom(roomId) {
  return callApi({ action: "resume-room", roomId });
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
