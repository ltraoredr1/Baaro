import DailyIframe from "@daily-co/daily-js";
import { supabase } from "../supabaseClient.js";
import { API_BASE } from "../config.js";

let callObject = null;
let myRole = "viewer";

function apiUrl(path) {
  const base = (API_BASE || "").replace(/\/$/, "");
  const p = path.startsWith("/") ? path : "/" + path;
  return base + p;
}

async function authHeaders() {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  return token ? { Authorization: "Bearer " + token } : {};
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
  const data = await res.json().catch(function () {
    return {};
  });
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
  const data = await res.json().catch(function () {
    return {};
  });
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

export async function getLiveToken({
  liveId,
  roomName,
  userName,
  isOwner = false,
}) {
  return callApi({
    action: "token",
    liveId: liveId || roomName,
    roomName: roomName,
    userName: userName || "Participant",
    isOwner: isOwner,
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
    userName: userName,
    enableHLS: enableHLS,
    title: title,
    topic: topic,
    mode: mode,
    inviteCode: inviteCode,
  });

  const roomName = created.roomName || created.daily_room_name;
  const tokenData = await getLiveToken({
    liveId: inviteCode || roomName,
    roomName: roomName,
    userName: userName,
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
    callObject: callObject,
    hlsEnabled: !!enableHLS,
    inviteCode: inviteCode,
    roomUrl: roomUrl,
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
    roomName: roomName,
    userName: userName,
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
    callObject: callObject,
    role: myRole,
    roomId: roomId,
    roomUrl: tokenData.url,
    roomName: tokenData.roomName,
  };
}

export async function joinLiveByCode({ inviteCode, userName, audioOnly = true }) {
  return joinLive({
    inviteCode: inviteCode,
    userName: userName,
    audioOnly: audioOnly,
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
  var audio = document.getElementById("baaro-audio-" + sessionId);
  if (!audio) {
    audio = document.createElement("audio");
    audio.id = "baaro-audio-" + sessionId;
    audio.autoplay = true;
    audio.playsInline = true;
    audio.setAttribute("playsinline", "");
    audio.style.display = "none";
    document.body.appendChild(audio);
  }
  try {
    audio.srcObject = new MediaStream([track]);
    var p = audio.play();
    if (p && p.catch) p.catch(function () {});
  } catch (e) {
    console.warn("attachRemoteAudio", e);
  }
  return audio;
}

export function detachRemoteAudio(sessionId) {
  var audio = document.getElementById("baaro-audio-" + sessionId);
  if (audio) {
    try {
      audio.srcObject = null;
      audio.remove();
    } catch (_) {}
  }
}

export function detachAllRemoteAudio() {
  document.querySelectorAll('[id^="baaro-audio-"]').forEach(function (el) {
    try {
      el.srcObject = null;
      el.remove();
    } catch (_) {}
  });
}

export function subscribeToEvents(handlers) {
  handlers = handlers || {};
  if (!callObject) return;
  if (handlers.onParticipantJoined)
    callObject.on("participant-joined", handlers.onParticipantJoined);
  if (handlers.onParticipantLeft)
    callObject.on("participant-left", handlers.onParticipantLeft);
  if (handlers.onParticipantUpdated)
    callObject.on("participant-updated", handlers.onParticipantUpdated);
  if (handlers.onTrackStarted)
    callObject.on("track-started", handlers.onTrackStarted);
  if (handlers.onTrackStopped)
    callObject.on("track-stopped", handlers.onTrackStopped);
  if (handlers.onError) callObject.on("error", handlers.onError);
  if (handlers.onActiveSpeakerChange)
    callObject.on("active-speaker-change", handlers.onActiveSpeakerChange);
}

export function findParticipantSessionId(targetUserId) {
  var all = (callObject && callObject.participants()) || {};
  var match = Object.values(all).find(function (p) {
    return p.user_id === targetUserId;
  });
  return (match && match.session_id) || null;
}

export async function setParticipantRole(opts) {
  var roomId = opts.roomId;
  var targetUserId = opts.targetUserId;
  var newRole = opts.newRole;
  var dailyRoomName = opts.dailyRoomName;
  if (newRole === "co_host") {
    return callRolesApi({
      action: "request",
      roomId: roomId,
      targetUserId: targetUserId,
    });
  }
  var targetSessionId = findParticipantSessionId(targetUserId);
  return callRolesApi({
    action: "set-role",
    roomId: roomId,
    targetUserId: targetUserId,
    role: newRole,
    targetSessionId: targetSessionId,
    dailyRoomName: dailyRoomName || null,
  });
}

export async function requestCoHost(roomId, targetUserId) {
  return callRolesApi({
    action: "request",
    roomId: roomId,
    targetUserId: targetUserId,
  });
}

export async function respondCoHostRequest(opts) {
  return callRolesApi({
    action: "respond",
    requestId: opts.requestId,
    accept: opts.accept,
    targetSessionId: opts.targetSessionId || null,
    dailyRoomName: opts.dailyRoomName || null,
  });
}

export async function promoteToCoHost(roomId, targetUserId) {
  return requestCoHost(roomId, targetUserId);
}

export async function demoteToViewer(roomId, targetUserId, dailyRoomName) {
  var targetSessionId = findParticipantSessionId(targetUserId);
  return callRolesApi({
    action: "set-role",
    roomId: roomId,
    targetUserId: targetUserId,
    role: "viewer",
    targetSessionId: targetSessionId,
    dailyRoomName: dailyRoomName || null,
  });
}

export async function pauseRoom(roomId) {
  return callApi({ action: "pause-room", roomId: roomId });
}

export async function resumeRoom(roomId) {
  return callApi({ action: "resume-room", roomId: roomId });
}

export async function leaveLive(opts) {
  opts = opts || {};
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
  if (opts.isHost && opts.roomName) {
    await callApi({ action: "delete-room", roomName: opts.roomName }).catch(
      function () {}
    );
  }
}

export function getCallObject() {
  return callObject;
}

export function getParticipants() {
  return (callObject && callObject.participants()) || {};
}
