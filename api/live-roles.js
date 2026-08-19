// api/live-roles.js
// - action: "request"  → l'hôte propose un co-hôte (consentement)
// - action: "respond"  → le spectateur accepte ou refuse
// - action: "set-role" → l'hôte rétrograde un co-hôte en viewer

import { getAdminClient, requireUser } from "./_supabaseAdmin.js";
import { applyCors } from "./_cors.js";
import { rateLimit } from "./_rateLimit.js";

const DAILY_API_URL = "https://api.daily.co/v1";

export default async function handler(req, res) {
  if (applyCors(req, res)) return;
  const limit = rateLimit(req, { key: "live-roles", max: 30, windowMs: 60_000 });
  if (!limit.ok) {
    Object.entries(limit.headers || {}).forEach(([k, v]) => res.setHeader(k, v));
    return res.status(limit.status).json(limit.body);
  }
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Méthode non autorisée" });
  }

  const DAILY_API_KEY = process.env.DAILY_API_KEY;

  let admin;
  try {
    admin = getAdminClient();
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }

  let user;
  try {
    user = await requireUser(req, admin);
  } catch (e) {
    return res.status(e.status || 401).json({ error: e.message });
  }

  const body = req.body || {};
  const action = body.action || "set-role";

  try {
    if (action === "request") {
      return await handleRequest(admin, user, body, res);
    }
    if (action === "respond") {
      return await handleRespond(admin, user, body, res, DAILY_API_KEY);
    }
    return await handleSetRole(admin, user, body, res, DAILY_API_KEY);
  } catch (error) {
    console.error("Erreur /api/live-roles :", error);
    return res.status(500).json({ error: "Erreur serveur" });
  }
}

async function getActiveRoom(admin, roomId) {
  const { data: room, error } = await admin
    .from("debate_rooms")
    .select("id, host_id, status, daily_room_name")
    .eq("id", roomId)
    .maybeSingle();
  if (error) throw error;
  return room;
}

async function handleRequest(admin, user, body, res) {
  const roomId = body.roomId;
  const targetUserId = body.targetUserId;

  if (!roomId || !targetUserId) {
    return res.status(400).json({ error: "roomId et targetUserId requis" });
  }
  if (targetUserId === user.id) {
    return res.status(400).json({ error: "Impossible de se proposer soi-même" });
  }

  const room = await getActiveRoom(admin, roomId);
  if (!room) return res.status(404).json({ error: "Live introuvable" });
  if (room.host_id !== user.id) {
    return res.status(403).json({ error: "Seul l'hôte peut proposer un co-hôte" });
  }
  if (room.status !== "active") {
    return res.status(400).json({ error: "Live terminé" });
  }

  const { data: target } = await admin
    .from("debate_participants")
    .select("user_id, role")
    .eq("room_id", roomId)
    .eq("user_id", targetUserId)
    .is("left_at", null)
    .maybeSingle();

  if (!target) {
    return res.status(404).json({ error: "Ce participant n'est pas dans le live" });
  }
  if (target.role === "host" || target.role === "co_host") {
    return res.status(400).json({ error: "Cette personne est déjà co-hôte ou hôte" });
  }

  await admin
    .from("debate_role_requests")
    .update({ status: "cancelled", responded_at: new Date().toISOString() })
    .eq("room_id", roomId)
    .eq("to_user_id", targetUserId)
    .eq("status", "pending");

  const { data: reqRow, error } = await admin
    .from("debate_role_requests")
    .insert({
      room_id: roomId,
      user_id: targetUserId,
      from_user_id: user.id,
      to_user_id: targetUserId,
      requested_role: "co_host",
      status: "pending",
    })
    .select("id")
    .single();

  if (error) throw error;

  return res.status(200).json({ ok: true, requestId: reqRow.id });
}

async function handleRespond(admin, user, body, res, DAILY_API_KEY) {
  const requestId = body.requestId;
  const accept = body.accept;
  const targetSessionId = body.targetSessionId || body.dailySessionId || null;
  const dailyRoomName = body.dailyRoomName || body.roomName || null;

  if (!requestId || typeof accept !== "boolean") {
    return res.status(400).json({ error: "requestId et accept requis" });
  }

  const { data, error } = await admin.rpc("respond_debate_role_request", {
    p_request_id: requestId,
    p_user_id: user.id,
    p_accept: accept,
  });
  if (error) {
    const msg = String(error.message || error);
    if (msg.includes("ROLE_REQUEST_NOT_FOUND")) return res.status(404).json({ error: "Demande introuvable ou déjà traitée" });
    if (msg.includes("ROLE_REQUEST_FORBIDDEN")) return res.status(403).json({ error: "Cette demande ne t'est pas adressée" });
    if (msg.includes("LIVE_NOT_FOUND")) return res.status(400).json({ error: "Live terminé" });
    throw error;
  }

  if (!accept) return res.status(200).json({ ok: true, status: "refused" });

  const roomName = dailyRoomName || data.daily_room_name;
  if (targetSessionId && roomName && DAILY_API_KEY) {
    try {
      const dailyRes = await fetch(`${DAILY_API_URL}/rooms/${roomName}/update-permissions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${DAILY_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ data: { [targetSessionId]: { canSend: ["video", "audio"] } } }),
      });
      if (!dailyRes.ok) console.error("Daily permissions response:", await dailyRes.text());
    } catch (e) {
      console.error("Daily permissions:", e);
    }
  }

  return res.status(200).json({ ok: true, status: "accepted", role: "co_host" });
}

async function handleSetRole(admin, user, body, res, DAILY_API_KEY) {
  const roomId = body.roomId;
  const targetUserId = body.targetUserId;
  const role = body.role || body.newRole;
  const targetSessionId = body.targetSessionId || body.dailySessionId || null;
  const dailyRoomName = body.dailyRoomName || body.roomName || null;

  if (!roomId || !targetUserId || !role) {
    return res
      .status(400)
      .json({ error: "Paramètres manquants (roomId, targetUserId, role)" });
  }

  if (role !== "viewer") {
    return res.status(400).json({
      error:
        "Pour promouvoir en co-hôte, utilise action: 'request' (consentement requis)",
    });
  }

  if (targetUserId === user.id) {
    return res.status(400).json({ error: "Impossible de modifier son propre rôle" });
  }

  const room = await getActiveRoom(admin, roomId);
  if (!room) return res.status(404).json({ error: "Live introuvable" });
  if (room.host_id !== user.id) {
    return res.status(403).json({ error: "Seul l'hôte peut gérer les co-hôtes" });
  }
  if (room.status !== "active") {
    return res.status(400).json({ error: "Live terminé" });
  }

  const { data: participant, error: participantError } = await admin
    .from("debate_participants")
    .select("user_id, role")
    .eq("room_id", roomId)
    .eq("user_id", targetUserId)
    .is("left_at", null)
    .maybeSingle();
  if (participantError) throw participantError;
  if (!participant) return res.status(404).json({ error: "Participant introuvable" });
  if (participant.role === "host") return res.status(400).json({ error: "Impossible de rétrograder l'hôte" });

  const { error: updateError } = await admin
    .from("debate_participants")
    .update({ role: "viewer" })
    .eq("room_id", roomId)
    .eq("user_id", targetUserId);

  if (updateError) throw updateError;

  await admin
    .from("debate_role_requests")
    .update({ status: "cancelled", responded_at: new Date().toISOString() })
    .eq("room_id", roomId)
    .eq("to_user_id", targetUserId)
    .eq("status", "pending");

  const name = dailyRoomName || room.daily_room_name;
  if (targetSessionId && name && DAILY_API_KEY) {
    try {
      await fetch(DAILY_API_URL + "/rooms/" + name + "/update-permissions", {
        method: "POST",
        headers: {
          Authorization: "Bearer " + DAILY_API_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          data: {
            [targetSessionId]: { canSend: [] },
          },
        }),
      });
    } catch (e) {
      console.error("Daily:", e);
    }
  }

  return res.status(200).json({ ok: true, role: "viewer" });
}
