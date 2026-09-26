// src/lib/chatCalls.js
// Appels vocaux / vidéo 1-1 via Daily.co

import DailyIframe from "@daily-co/daily-js";
import { supabase } from "../supabaseClient.js";

let callObject = null;

async function authHeaders() {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function callApi(body) {
  // ✅ FORCER l'URL vers baaro-xi (URL principale de production)
  const base = "https://baaro-xi.vercel.app";
  const endpoint = `${base}/api/create-room`;
  
  console.log("📞 Appel API vers :", endpoint);

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(await authHeaders()),
      },
      body: JSON.stringify(body),
    });

    const contentType = res.headers.get("content-type");
    let data;
    if (contentType && contentType.includes("application/json")) {
      data = await res.json();
    } else {
      const text = await res.text();
      throw new Error(`Réponse non-JSON du serveur (${res.status}): ${text.substring(0, 150)}`);
    }

    if (!res.ok) {
      throw new Error(data.error || `Erreur serveur appel (${res.status})`);
    }
    return data;
  } catch (error) {
    console.error("🔴 ERREUR RÉSEAU APPEL (chatCalls.js):", error);
    if (error.message.includes("Failed to fetch") || error.message.includes("NetworkError")) {
      throw new Error(`Impossible de contacter le serveur (${endpoint}). Vérifiez votre connexion.`);
    }
    throw error;
  }
}

/**
 * 1. Créer la room Daily (Correspond à handleCreateRoom dans api/live.js)
 */
export async function createCallRoom({ userName, mode = "video" }) {
  const inviteCode = `call-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  
  return callApi({ 
    action: "create-room", // ✅ CORRESPOND À api/live.js
    mode: mode,
    inviteCode: inviteCode,
    userName: userName || "BAARO" 
  });
}

/**
 * 2. Obtenir le token pour la room (Correspond à handleToken dans api/live.js)
 */
export async function getCallToken({ roomName, userName, isOwner = true }) {
  return callApi({
    action: "token", // ✅ DÉCLENCHE handleToken dans api/live.js
    liveId: roomName,
    roomName: roomName,
    userName: userName || "BAARO",
    isOwner: isOwner
  });
}

/**
 * 3. Démarrer l'appel côté UI
 */
export async function startCall({ roomUrl, token, video = false }) {
  if (callObject) {
    try {
      await callObject.leave();
      callObject.destroy();
    } catch (_) {}
    callObject = null;
  }

  callObject = DailyIframe.createCallObject({
    audioSource: true,
    videoSource: !!video,
    subscribeToTracksAutomatically: true,
    dailyConfig: { avoidEval: true },
  });

  try {
    callObject.setSubscribeToTracksAutomatically(true);
  } catch (_) {}

  // Le token est OBLIGATOIRE ici pour que Daily.co accepte la connexion
  await callObject.join({ url: roomUrl, token });
  await callObject.setLocalAudio(true);
  if (video) {
    await callObject.setLocalVideo(true);
  }

  return callObject;
}

export async function joinCall({ roomUrl, token, video = false }) {
  return startCall({ roomUrl, token, video });
}

export function enableMic(enabled) {
  if (!callObject) return Promise.resolve();
  return callObject.setLocalAudio(!!enabled);
}

export function enableCamera(enabled) {
  if (!callObject) return Promise.resolve();
  return callObject.setLocalVideo(!!enabled);
}

export function subscribeCallEvents(handlers = {}) {
  if (!callObject) return;
  const { onParticipantJoined, onParticipantLeft, onTrackStarted, onTrackStopped, onError, onLeft } = handlers;

  if (onParticipantJoined) callObject.on("participant-joined", onParticipantJoined);
  if (onParticipantLeft) callObject.on("participant-left", onParticipantLeft);
  if (onTrackStarted) callObject.on("track-started", onTrackStarted);
  if (onTrackStopped) callObject.on("track-stopped", onTrackStopped);
  if (onError) callObject.on("error", onError);
  if (onLeft) callObject.on("left-meeting", onLeft);
}

export async function leaveCall() {
  if (!callObject) return;
  try {
    await callObject.leave();
    callObject.destroy();
  } catch (e) {
    console.warn("leaveCall:", e);
  }
  callObject = null;
}

export function getCallObject() { return callObject; }
export function getParticipants() { return callObject?.participants() || {}; }

/**
 * 4. Enregistrement BDD
 */
export async function createCallRecord({ conversationId, callerId, calleeId, type, dailyRoomName }) {
  const { data, error } = await supabase
    .from("calls")
    .insert({
      conversation_id: conversationId,
      caller_id: callerId,
      callee_id: calleeId,
      type: type === "video" ? "video" : "voice",
      status: "ringing",
      daily_room_name: dailyRoomName,
    })
    .select()
    .single();
    
  if (error) {
    console.error("Erreur création enregistrement appel:", error);
    return { id: null }; 
  }
  return data;
}

export async function updateCallStatus(callId, updates) {
  if (!callId) return null;
  const { data, error } = await supabase
    .from("calls")
    .update(updates)
    .eq("id", callId)
    .select()
    .single();
  if (error) throw error;
  return data;
}
