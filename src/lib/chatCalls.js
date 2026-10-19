/**
 * src/lib/chatCalls.js - V5 - Envoie callee_id + conversation_id pour fix RLS
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
    (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_BASE_URL) ||
    (typeof window !== "undefined" && window.location?.origin) ||
    "https://baaro-xi.vercel.app";
  const endpoint = `${base.replace(/\/$/, "")}/api/live`;
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(async () => ({ error: await res.text() }));
  if (!res.ok) throw new Error(data.error || `Erreur ${res.status}`);
  return data;
}

async function destroyExistingCall() {
  const instances = [];
  try { const ex = DailyIframe.getCallInstance(); if (ex) instances.push(ex); } catch {}
  if (callObject && !instances.includes(callObject)) instances.push(callObject);
  for (const inst of instances) { try { await inst.leave(); } catch {} try { inst.destroy(); } catch {} }
  callObject = null;
}

export async function createCallRoom({ userName, mode = "video", callee_id, conversation_id }) {
  const inviteCode = `call-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  return callApi({
    action: "create-room",
    mode,
    inviteCode,
    userName: userName || "BAARO",
    callee_id,
    conversation_id
  });
}

export async function getCallToken({ roomName, userName, isOwner = true }) {
  return callApi({ action: "token", liveId: roomName, roomName, userName: userName || "BAARO", isOwner });
}

async function startCallInternal({ roomUrl, token, video = false }) {
  await destroyExistingCall();
  callObject = DailyIframe.createCallObject({
    audioSource: true, videoSource: !!video, subscribeToTracksAutomatically: true, dailyConfig: { avoidEval: true },
  });
  try { callObject.setSubscribeToTracksAutomatically(true); } catch {}
  try {
    await callObject.join({ url: roomUrl, token });
    await callObject.setLocalAudio(true);
    if (video) await callObject.setLocalVideo(true);
    try { await callObject.updateInputSettings({ audio: { processor: { type: "noise-cancellation" } } }); } catch {}
  } catch (e) { await destroyExistingCall(); throw e; }
  return callObject;
}

export async function startCall(opts) {
  if (startingLock) { try { await startingLock; } catch {} }
  startingLock = startCallInternal(opts);
  try { return await startingLock; } finally { startingLock = null; }
}

export async function joinCall({ roomUrl, token, video = false }) { return startCall({ roomUrl, token, video }); }
export function enableMic(enabled) { if (!callObject) return Promise.resolve(); return callObject.setLocalAudio(!!enabled); }
export function enableCamera(enabled) { if (!callObject) return Promise.resolve(); return callObject.setLocalVideo(!!enabled); }
export function subscribeCallEvents(handlers = {}) {
  if (!callObject) return () => {};
  const { onParticipantJoined, onParticipantLeft, onTrackStarted, onTrackStopped, onError, onLeft } = handlers;
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
    } catch {}
  };
}
export async function leaveCall() { await destroyExistingCall(); }
export function getCallObject() { return callObject; }
export function getParticipants() { return callObject?.participants() || {}; }
export function canSelectAudioOutput() { return typeof HTMLMediaElement !== "undefined" && "setSinkId" in HTMLMediaElement.prototype; }
export async function listAudioOutputs() {
  try { if (!navigator.mediaDevices?.enumerateDevices) return []; const devices = await navigator.mediaDevices.enumerateDevices(); return devices.filter((d) => d.kind === "audiooutput"); } catch { return []; }
}
export async function notifyCalleeOfIncomingCall({ callee_id, caller_id, call_id, call_type, daily_room_name, caller_name }) {
  try { return await callApi({ action: "notify_call", callee_id, caller_id, call_id, call_type: call_type === "video" ? "video" : "voice", daily_room_name: daily_room_name || "", caller_name: caller_name || "" }); }
  catch (e) { return { ok: false, error: e?.message }; }
}
export async function createCallRecord({ conversation_id, caller_id, callee_id, type, dailyRoomName, caller_name }) {
  // Maintenant l'insert est fait côté serveur dans /api/live, on garde juste le notify
  return { id: dailyRoomName, daily_room_name: dailyRoomName };
}
export async function updateCallStatus(call_id, updates) {
  if (!call_id) return null;
  const { data, error } = await supabase.from("calls").update(updates).eq("id", call_id).select().single();
  if (error) throw error;
  return data;
}
