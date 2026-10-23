// src/lib/liveRoles.js - Gestion rôles live multi-hôtes

import { supabase } from "../supabaseClient.js";
import { API_BASE } from "../config.js";

function apiUrl(path) {
  const base = (API_BASE || "").replace(/\/$/, "");
  const p = path.startsWith("/") ? path : "/" + path;
  return base + p;
}

async function authHeaders() {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  if (!token) throw new Error("Non connecté");
  return {
    Authorization: "Bearer " + token,
    "Content-Type": "application/json",
  };
}

// Appel commun : gère les réponses non-JSON et les erreurs sans message
async function postRole(payload) {
  const headers = await authHeaders();
  const res = await fetch(apiUrl("/api/live-roles"), {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || "Action impossible (" + res.status + ")");
  }
  return data;
}

// Promouvoir un viewer en co-host (host seulement)
export function promoteToCoHost({ roomId, dailyRoomName, targetUserId }) {
  return postRole({
    action: "promote",
    roomId,
    dailyRoomName,
    targetUserId,
    role: "co_host",
  });
}

// Rétrograder co-host -> viewer
export function demoteToViewer({ roomId, dailyRoomName, targetUserId }) {
  return postRole({
    action: "demote",
    roomId,
    dailyRoomName,
    targetUserId,
    role: "viewer",
  });
}

// S'abonner aux changements de rôles en temps réel
// (la colonne s'appelle room_id, pas debate_id)
export function subscribeRoles(roomId, callback) {
  const channel = supabase
    .channel(
      "live-roles-" + roomId + ":" + Math.random().toString(36).slice(2, 7)
    )
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "debate_participants",
        filter: "room_id=eq." + roomId,
      },
      (payload) => {
        callback(payload.new || payload.old);
      }
    )
    .subscribe();
  return () => supabase.removeChannel(channel);
}

// Récupérer les participants actifs avec rôles et profil.
// Deux requêtes plutôt qu'un embed : ça marche même sans clé étrangère
// entre debate_participants.user_id et profiles.
export async function getLiveParticipants(roomId) {
  const { data: parts, error } = await supabase
    .from("debate_participants")
    .select("room_id, user_id, role, joined_at, left_at")
    .eq("room_id", roomId)
    .is("left_at", null);
  if (error || !parts?.length) return [];

  const ids = parts.map((p) => p.user_id);
  let profiles = [];
  try {
    const { data } = await supabase
      .from("profiles")
      .select("id, display_name, avatar_url")
      .in("id", ids);
    profiles = data || [];
  } catch (_) {}

  const byId = new Map(profiles.map((p) => [p.id, p]));
  return parts.map((p) => ({ ...p, profiles: byId.get(p.user_id) || null }));
}
