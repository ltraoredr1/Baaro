// src/lib/webrtc.js
// Ajouts par rapport à la version précédente :
// - setParticipantRole / promoteToCoHost / demoteToViewer : appellent
//   /api/live-roles pour changer le rôle d'un participant. Utilisent
//   findParticipantSessionId() (déjà présent) pour transmettre le
//   session_id Daily courant, ce qui permet au serveur d'appliquer la
//   permission en direct sans attendre une reconnexion.

import DailyIframe from "@daily-co/daily-js";
import { supabase } from "../supabaseClient.js";

let callObject = null;
let myRole = "viewer"; // renseigné au join-room / create-room

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
 * l'appel. À utiliser dans CreateDebateModal.jsx (qui ne doit pas ouvrir
 * la caméra/micro avant que l'utilisateur soit vraiment dans DebateRoom).
 * host_id vient désormais toujours du token d'authentification côté
 * serveur — plus besoin (ni possibilité) de le passer ici.
 */
export async function createRoomOnServer({ userName, enableHLS = false }) {
  return callApi({ action: "create-room", userName, enableHLS });
}

/**
 * Démarre un live ET rejoint immédiatement l'appel (hôte). À utiliser si
 * tu veux fusionner création + entrée en une étape ; DebateRoom.jsx utilise
 * plutôt joinLiveByCode() pour tout le monde y compris l'hôte, une fois la
 * room déjà créée par createRoomOnServer().
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
  try { callObject.setSubscribeToTracksAutomatically(true); } catch (_) {}

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
  const { roomId, roomName } = await callApi({ action: "resolve-code", inviteCode });
  return { roomId, roomName };
}

export async function joinLive({ roomId, roomName, userName, audioOnly = true }) {
  const { roomUrl, token, role } = await callApi({
    action: "join-room",
    roomId,
    roomName,
    userName,
  });

  myRole = role; // 'host' | 'co_host' | 'viewer', calculé côté serveur

  callObject = DailyIframe.createCallObject({
    audioSource: true,
    videoSource: !audioOnly,
    subscribeToTracksAutomatically: true,
  });

  // S'assurer que les pistes distantes sont bien reçues
  try {
    callObject.setSubscribeToTracksAutomatically(true);
  } catch (_) {}

  await callObject.join({ url: roomUrl, token });

  // Active micro/cam selon le rôle
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

export async function joinLiveByCode({ inviteCode, userName, audioOnly = true }) {
  const { roomId, roomName } = await resolveInviteCode(inviteCode);
  return joinLive({ roomId, roomName, userName, audioOnly });
}

export function getMyRole() {
  return myRole;
}

/**
 * À appeler côté client quand on reçoit (via Supabase Realtime sur
 * debate_participants) l'info qu'on vient d'être promu/rétrogradé : Daily
 * a déjà reçu le canSend côté serveur (voir /api/live-roles), donc
 * enableMic/enableCamera fonctionnera désormais réellement.
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

  if (onParticipantJoined) callObject.on("participant-joined", onParticipantJoined);
  if (onParticipantLeft) callObject.on("participant-left", onParticipantLeft);
  if (onParticipantUpdated) callObject.on("participant-updated", onParticipantUpdated);
  if (onTrackStarted) callObject.on("track-started", onTrackStarted);
  if (onTrackStopped) callObject.on("track-stopped", onTrackStopped);
  if (onError) callObject.on("error", onError);
}

/**
 * Retrouve le session_id Daily d'un participant à partir de son user_id
 * Supabase (le token porte désormais user_id, voir api/create-room.js).
 * Nécessaire pour appeler /api/live-roles (promotion/rétrogradation).
 */
export function findParticipantSessionId(targetUserId) {
  const all = callObject?.participants() || {};
  const match = Object.values(all).find((p) => p.user_id === targetUserId);
  return match?.session_id || null;
}

/**
 * Change le rôle d'un participant (promotion ou rétrogradation). Seul
 * l'hôte d'origine du salon peut appeler ceci avec succès (vérifié côté
 * serveur dans /api/live-roles). Transmet automatiquement le session_id
 * Daily courant de la cible, si connu localement, pour une application
 * immédiate des permissions.
 */
export async function setParticipantRole({ roomId, targetUserId, newRole, dailyRoomName }) {
  const targetSessionId = findParticipantSessionId(targetUserId);
  // Aligné sur api/live-roles.js : role, targetSessionId, dailyRoomName
  return callRolesApi({
    roomId,
    targetUserId,
    role: newRole,
    targetSessionId,
    dailyRoomName: dailyRoomName || null,
  });
}

export async function promoteToCoHost(roomId, targetUserId, dailyRoomName) {
  return setParticipantRole({ roomId, targetUserId, newRole: "co_host", dailyRoomName });
}

export async function demoteToViewer(roomId, targetUserId, dailyRoomName) {
  return setParticipantRole({ roomId, targetUserId, newRole: "viewer", dailyRoomName });
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
