// src/lib/chatCalls.js
// Appels vocaux / vidéo 1-1 via Daily.co (api/chat-call.js déjà présent)

import DailyIframe from "@daily-co/daily-js";
import { supabase } from "../supabaseClient.js";

let callObject = null;

async function authHeaders() {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function callApi(body) {
  const base = (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_BASE_URL) || "";
  const res = await fetch(`${base}/api/chat-call`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(await authHeaders()),
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      data.error ||
        (res.status === 503
          ? "Appels non configurés (DAILY_API_KEY manquante sur Vercel)"
          : `Erreur serveur appel (${res.status})`)
    );
  }
  return data;
}

/**
 * Créer une room Daily privée (max 2 participants) + token caller
 */
export async function createCallRoom({ userName }) {
  return callApi({ action: "create", userName: userName || "BAARO" });
}

/**
 * Obtenir un token pour rejoindre une room existante
 */
export async function joinCallRoom({ roomName, callId, userName }) {
  return callApi({
    action: "join",
    roomName,
    callId,
    userName: userName || "BAARO",
  });
}

/**
 * Démarrer l'appel (côté caller)
 * @param {{ roomUrl: string, token: string, video?: boolean }}
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

  await callObject.join({ url: roomUrl, token });
  await callObject.setLocalAudio(true);
  await callObject.setLocalVideo(!!video);

  return callObject;
}

/**
 * Rejoindre un appel (côté callee)
 */
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
  const {
    onParticipantJoined,
    onParticipantLeft,
    onTrackStarted,
    onTrackStopped,
    onError,
    onLeft,
  } = handlers;

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

export function getCallObject() {
  return callObject;
}

export function getParticipants() {
  return callObject?.participants() || {};
}

/**
 * Créer l'enregistrement d'appel dans Supabase
 */
export async function createCallRecord({
  conversationId,
  callerId,
  calleeId,
  type,
  dailyRoomName,
}) {
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
  if (error) throw error;
  return data;
}

export async function updateCallStatus(callId, updates) {
  const { data, error } = await supabase
    .from("calls")
    .update(updates)
    .eq("id", callId)
    .select()
    .single();
  if (error) throw error;
  return data;
}
