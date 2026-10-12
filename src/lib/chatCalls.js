/**
 * src/lib/chatCalls.js — VERSION COMPLÈTE CORRIGÉE
 * Appels vocaux / vidéo 1-1 via Daily.co
 * + push notify_call via /api/live (app fermée)
 *
 * Correction « Duplicate DailyIframe instances are not allowed » :
 * - Daily n'autorise qu'UNE instance d'appel par page. Avant chaque appel,
 *   toute instance existante (même issue d'une tentative échouée) est détruite
 *   via DailyIframe.getCallInstance().
 * - Si le join échoue, l'instance créée est détruite (plus d'instance fantôme).
 * - Les démarrages simultanés sont mis en file (verrou), pour éviter les doublons.
 */
import DailyIframe from "@daily-co/daily-js";
import { supabase } from "../supabaseClient.js";

let callObject = null;
let startingLock = null;

async function authHeaders() {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function callApi(body) {
  const base =
    (typeof window !== "undefined" && window.location?.origin) ||
    "https://baaro-xi.vercel.app";
  const endpoint = `${base}/api/live`;

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
      throw new Error(
        `Réponse non-JSON du serveur (${res.status}): ${text.substring(0, 150)}`
      );
    }

    if (!res.ok) {
      throw new Error(data.error || `Erreur serveur appel (${res.status})`);
    }
    return data;
  } catch (error) {
    console.error("[chatCalls]", error);
    if (
      error.message?.includes("Failed to fetch") ||
      error.message?.includes("NetworkError")
    ) {
      throw new Error(
        `Impossible de contacter le serveur (${endpoint}). Vérifiez votre connexion.`
      );
    }
    throw error;
  }
}

/**
 * Détruit toute instance Daily présente sur la page (appel, Live, tentative échouée).
 * Chaque étape est protégée séparément : un échec de leave() n'empêche pas destroy().
 */
async function destroyExistingCall() {
  const instances = [];
  try {
    const existing = DailyIframe.getCallInstance();
    if (existing) instances.push(existing);
  } catch (_) {}
  if (callObject && !instances.includes(callObject)) instances.push(callObject);

  for (const inst of instances) {
    try {
      await inst.leave();
    } catch (_) {}
    try {
      inst.destroy();
    } catch (_) {}
  }
  callObject = null;
}

/** 1. Créer la room Daily */
export async function createCallRoom({ userName, mode = "video" }) {
  const inviteCode = `call-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  return callApi({
    action: "create-room",
    mode,
    inviteCode,
    userName: userName || "BAARO",
  });
}

/** 2. Token Daily */
export async function getCallToken({ roomName, userName, isOwner = true }) {
  return callApi({
    action: "token",
    liveId: roomName,
    roomName,
    userName: userName || "BAARO",
    isOwner,
  });
}

async function startCallInternal({ roomUrl, token, video = false }) {
  await destroyExistingCall();

  callObject = DailyIframe.createCallObject({
    audioSource: true,
    videoSource: !!video,
    subscribeToTracksAutomatically: true,
    dailyConfig: { avoidEval: true },
  });

  try {
    callObject.setSubscribeToTracksAutomatically(true);
  } catch (_) {}

  try {
    await callObject.join({ url: roomUrl, token });
    await callObject.setLocalAudio(true);
    if (video) {
      await callObject.setLocalVideo(true);
    }
  } catch (error) {
    // Pas d'instance fantôme après un échec
    await destroyExistingCall();
    throw error;
  }
  return callObject;
}

/** 3. Démarrer / rejoindre l'appel (démarrages mis en file) */
export async function startCall(opts) {
  if (startingLock) {
    try {
      await startingLock;
    } catch (_) {}
  }
  startingLock = startCallInternal(opts);
  try {
    return await startingLock;
  } finally {
    startingLock = null;
  }
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
  if (!callObject) return () => {};
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

  return () => {
    try {
      if (onParticipantJoined) callObject?.off?.("participant-joined", onParticipantJoined);
      if (onParticipantLeft) callObject?.off?.("participant-left", onParticipantLeft);
      if (onTrackStarted) callObject?.off?.("track-started", onTrackStarted);
      if (onTrackStopped) callObject?.off?.("track-stopped", onTrackStopped);
      if (onError) callObject?.off?.("error", onError);
      if (onLeft) callObject?.off?.("left-meeting", onLeft);
    } catch (_) {}
  };
}

export async function leaveCall() {
  await destroyExistingCall();
}

export function getCallObject() {
  return callObject;
}

export function getParticipants() {
  return callObject?.participants() || {};
}

/**
 * Push destinataire (app fermée) via /api/live action notify_call
 * Fire-and-forget — ne bloque pas l'UI.
 */
export async function notifyCalleeOfIncomingCall({
  callee_id,
  caller_id,
  call_id,
  call_type,
  daily_room_name,
  caller_name,
}) {
  try {
    const data = await callApi({
      action: "notify_call",
      callee_id,
      caller_id,
      call_id,
      call_type: call_type === "video" ? "video" : "voice",
      daily_room_name: daily_room_name || "",
      caller_name: caller_name || "",
    });
    return data;
  } catch (e) {
    console.warn("[notify_call]", e?.message || e);
    return { ok: false, error: e?.message };
  }
}

/** 4. Enregistrement BDD + push */
export async function createCallRecord({
  conversation_id,
  caller_id,
  callee_id,
  type,
  dailyRoomName,
  caller_name,
}) {
  const { data, error } = await supabase
    .from("calls")
    .insert({
      conversation_id,
      caller_id,
      callee_id,
      type: type === "video" ? "video" : "voice",
      status: "ringing",
      daily_room_name: dailyRoomName,
    })
    .select()
    .single();

  if (error) {
    console.error("Erreur création enregistrement appel:", error);
    throw new Error("calls : " + error.message);
  }

  notifyCalleeOfIncomingCall({
    callee_id,
    caller_id,
    call_id: data.id,
    call_type: type,
    daily_room_name: dailyRoomName,
    caller_name,
  }).catch(() => {});

  return data;
}

export async function updateCallStatus(call_id, updates) {
  if (!call_id) return null;
  const { data, error } = await supabase
    .from("calls")
    .update(updates)
    .eq("id", call_id)
    .select()
    .single();
  if (error) throw error;
  return data;
}
