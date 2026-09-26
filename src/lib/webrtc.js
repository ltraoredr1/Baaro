// src/lib/webrtc.js
import DailyIframe from "@daily-co/daily-js";
import { supabase } from "../supabaseClient.js";
import { API_BASE } from "../config.js";

let callObject = null;
let myRole = "viewer";

function apiUrl(path) {
  const base = (API_BASE || "").replace(/\/$/, "");
  return `\( {base} \){path.startsWith("/") ? path : `/${path}`}`;
}

async function authHeaders() {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function callApi(body) {
  const res = await fetch(apiUrl("/api/create-room"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(await authHeaders()),
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Erreur serveur");
  return data;
}

async function callRolesApi(body) {
  const res = await fetch(apiUrl("/api/live-roles"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(await authHeaders()),
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Erreur serveur");
  return data;
}

export async function createRoomOnServer({
  userName,
  enableHLS = false,
  title,
  topic,
  mode,
  inviteCode,
}) {
  return callApi({
    action: "create-room",
    userName,
    enableHLS,
    title,
    topic,
    mode,
    inviteCode,
  });
}

/** Token Daily pour une salle déjà en BDD */
export async function getLiveToken({
  liveId,
  roomName,
  userName,
  isOwner = false,
}) {
  return callApi({
    action: "token",
    liveId: liveId || roomName,
    roomName,
    userName: userName || "Participant",
    isOwner,
  });
}

export async function startLive({
  userName,
  enableHLS = false,
  title,
  topic,
  mode,
  inviteCode,
}) {
  const created = await createRoomOnServer({
    userName,
    enableHLS,
    title,
    topic,
    mode,
    inviteCode,
  });

  const roomName = created.roomName || created.daily_room_name;
  const tokenData = await getLiveToken({
    liveId: inviteCode || roomName,
    roomName,
    userName,
    isOwner: true,
  });

  myRole = "host";
  callObject = DailyIframe.createCallObject({
    audioSource: true,
    videoSource: mode !== "audio",
    subscribeToTracksAutomatically: true,
    dailyConfig: { avoidEval: true },
  });
  try {
    callObject.setSubscribeToTracksAutomatically(true);
  } catch (_) {}

  const roomUrl = tokenData.url || created.url;
  await callObject.join({ url: roomUrl, token: tokenData.token });

  return {
    roomName: tokenData.roomName || roomName,
    roomId: created.roomId,
    callObject,
    hlsEnabled: !!enableHLS,
    inviteCode,
    roomUrl,
  };
}

export async function joinLive({
  roomId,
  roomName,
  inviteCode,
  userName,
  audioOnly = true,
  isHost = false,
}) {
  const tokenData = await getLiveToken({
    liveId: inviteCode || roomId || roomName,
    roomName,
    userName,
    isOwner: isHost,
  });

  myRole = isHost ? "host" : "viewer";

  callObject = DailyIframe.createCallObject({
    audioSource: true,
    videoSource: !audioOnly,
    subscribeToTracksAutomatically: true,
    dailyConfig: { avoidEval: true },
  });
  try {
    callObject.setSubscribeToTracksAutomatically(true);
  } catch (_) {}

  await callObject.join({ url: tokenData.url, token: tokenData.token });

  try {
    await callObject.setLocalAudio(true);
    if (!audioOnly) await callObject.setLocalVideo(true);
  } catch (e) {
    console.warn("setLocalAudio/Video:", e);
  }

  return {
    callObject,
    role: myRole,
    roomId,
    roomUrl: tokenData.url,
    roomName: tokenData.roomName,
  };
}

export async function joinLiveByCode({ inviteCode, userName, audioOnly = true }) {
  return joinLive({
    inviteCode,
    userName,
    audioOnly,
  });
}

export function getMyRole() {
  return myRole;
}
export function upgradeLocalRole(newRole) {
  myRole = newRole;
}
export function enableMic(enabled) {
  if (!callObject) return Promise.resolve();
  return callObject.setLocalAudio(!!enabled);
}
export function enableCamera(enabled) {
  if (!callObject) return Promise.resolve();
  return callObject.setLocalVideo(!!enabled);
}

export function attachRemoteAudio(sessionId, track) {
  if (!track || track.kind !== "audio") return null;
  let audio = document.getElementById(`baaro-audio-${sessionId}`);
  if (!audio) {
    audio = document.createElement("audio");
    audio.id = `baaro-audio-${sessionId}`;
    audio.autoplay = true;
    audio.playsInline = true;
    audio.setAttribute("playsinline", "");
    audio.style.display = "none";
    document.body.appendChild(audio);
  }
  try {
    audio.srcObject = new MediaStream([track]);
    const p = audio.play();
    if (p?.catch) p.catch(() => {});
  } catch (e) {
    console.warn("attachRemoteAudio", e);
  }
  return audio;
}

export function detachRemoteAudio(sessionId) {
  const audio = document.getElementById(`baaro-audio-${sessionId}`);
  if (audio) {
    try {
      audio.srcObject = null;
      audio.remove();
    } catch (_) {}
  }
}

export function detachAllRemoteAudio() {
  document.querySelectorAll('[id^="baaro-audio-"]').forEach((el) => {
    try {
      el.srcObject = null;
      el.remove();
    } catch (_) {}
  });
}

export function subscribeToEvents(handlers = {}) {
  if (!callObject) return;
  const {
    onParticipantJoined,
    onParticipantLeft,
    onParticipantUpdated,
    onTrackStarted,
    onTrackStopped,
    onError,
    onActiveSpeakerChange,
  } = handlers;
  if (onParticipantJoined) callObject.on("participant-joined", onParticipantJoined);
  if (onParticipantLeft) callObject.on("participant-left", onParticipantLeft);
  if (onParticipantUpdated) callObject.on("participant-updated", onParticipantUpdated);
  if (onTrackStarted) callObject.on("track-started", onTrackStarted);
  if (onTrackStopped) callObject.on("track-stopped", onTrackStopped);
  if (onError) callObject.on("error", onError);
  if (onActiveSpeakerChange) callObject.on("active-speaker-change", onActiveSpeakerChange);
}

export function findParticipantSessionId(targetUserId) {
  const all = callObject?.participants() || {};
  const match = Object.values(all).find((p) => p.user_id === targetUserId);
  return match?.session_id || null;
}

export async function setParticipantRole({ roomId, targetUserId, newRole, dailyRoomName }) {
  if (newRole === "co_host") {
    return callRolesApi({ action: "request", roomId, targetUserId });
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
  return callRolesApi({ action: "request", roomId, targetUserId });
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

export async function pauseRoom(roomId) {
  return callApi({ action: "pause-room", roomId });
}

export async function resumeRoom(roomId) {
  return callApi({ action: "resume-room", roomId });
}

export async function leaveLive({ roomName, isHost = false } = {}) {
  detachAllRemoteAudio();
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
