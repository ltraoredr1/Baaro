// src/lib/liveRoles.js  (nouveau fichier)
// Wrapper client pour promouvoir/rétrograder un co-hôte, à utiliser dans
// DebateRoom.jsx (boutons visibles seulement si isHost).

import { supabase } from "../supabaseClient.js";
import { findParticipantSessionId } from "./webrtc.js";

async function authHeaders() {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function callApi(body) {
  const res = await fetch("/api/live-roles", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Erreur serveur");
  return data;
}

/** Réservé à l'hôte : invite un spectateur à devenir co-hôte. */
export async function promoteToCoHost({ roomId, dailyRoomName, targetUserId }) {
  const targetSessionId = findParticipantSessionId(targetUserId);
  if (!targetSessionId) {
    throw new Error("Participant introuvable dans le live (pas encore connecté ?)");
  }
  return callApi({
    roomId,
    dailyRoomName,
    targetUserId,
    targetSessionId,
    role: "co_host",
  });
}

/** Réservé à l'hôte : rétrograde un co-hôte en spectateur ("pensionner"). */
export async function demoteToViewer({ roomId, dailyRoomName, targetUserId }) {
  const targetSessionId = findParticipantSessionId(targetUserId);
  if (!targetSessionId) {
    throw new Error("Participant introuvable dans le live");
  }
  return callApi({
    roomId,
    dailyRoomName,
    targetUserId,
    targetSessionId,
    role: "viewer",
  });
}
