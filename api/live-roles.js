// api/live-roles.js
import { getAdminClient, requireUser } from "./_supabaseAdmin.js";

const DAILY_API_URL = "https://api.daily.co/v1";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") return res.status(200).end();
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
  const action = body.action || "set-role"; // request | respond | set-role

  try {
    if (action === "request") {
      return await handleRequest(admin, user, body, res);
    }
    if (action === "respond") {
      return await handleRespond(admin, user, body, res, DAILY_API_KEY);
    }
    // Rétrogradation directe (hôte seulement) ou legacy
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
  const { roomId, targetUserId } = body;
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

  // Annuler d'éventuelles demandes pending précédentes
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
  const { requestId, accept, targetSessionId, dailyRoomName } = body;
  if (!requestId || typeof accept !== "boolean") {
    return res.status(400).json({ error: "requestId et accept requis" });
  }

  const { data: reqRow, error } = await admin
    .from("debate_role_requests")
    .select("*")
    .eq("id", requestId)
    .eq("status", "pending")
    .maybeSingle();

  if (error) throw error;
  if (!reqRow) {
    return res.status(404).json({ error: "Demande introuvable ou déjà traitée" });
  }
  if (reqRow.to_user_id !== user.id) {
    return res.status(403).json({ error: "Cette demande ne t'est pas adressée" });
  }

  const room = await getActiveRoom(admin, reqRow.room_id);
  if (!room || room.status !== "active") {
    await admin
      .from("debate_role_requests")
      .update({ status: "cancelled", responded_at: new Date().toISOString() })
      .eq("id", requestId);
    return res.status(400).json({ error: "Live terminé" });
  }

  if (!accept) {
    await admin
      .from("debate_role_requests")
      .update({ status: "refused", responded_at: new Date().toISOString() })
      .eq("id", requestId);
    return res.status(200).json({ ok: true, status: "refused" });
  }

  // Acceptation → promotion serveur
  const { error: updErr } = await admin
    .from("debate_participants")
    .update({ role: "co_host" })
    .eq("room_id", reqRow.room_id)
    .eq("user_id", user.id);

  if (updErr) throw updErr;

  await admin
    .from("debate_role_requests")
    .update({ status: "accepted", responded_at: new Date().toISOString() })
    .eq("id", requestId);

  // Permissions Daily immédiates
  const sessionId = targetSessionId || null;
  const roomName = dailyRoomName || room.daily_room_name;
  if (sessionId && roomName && DAILY_API_KEY) {
    try {
      await fetch(`\( {DAILY_API_URL}/rooms/ \){roomName}/update-permissions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${DAILY_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          data: { [sessionId]: { canSend: ["video", "audio"] } },
        }),
      });
    } catch (e) {
      console.error("Daily permissions:", e);
    }
  }

  return res.status(200).json({ ok: true, status: "accepted", role: "co_host" });
}

async function handleSetRole(admin, user, body, res, DAILY_API_KEY) {
  // Uniquement pour RÉTROGRADER (viewer). La promotion passe par request/respond.
  const roomId = body.roomId;
  const targetUserId = body.targetUserId;
  const role = body.role || body.newRole;
  const targetSessionId =
    body.targetSessionId || body.dailySessionId || null;
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

  const { error: updateError } = await admin
    .from("debate_participants")
    .update({ role: "viewer" })
    .eq("room_id", roomId)
    .eq("user_id", targetUserId);

  if (updateError) throw updateError;

  // Annuler demandes pending
  await admin
    .from("debate_role_requests")
    .update({ status: "cancelled", responded_at: new Date().toISOString() })
    .eq("room_id", roomId)
    .eq("to_user_id", targetUserId)
    .eq("status", "pending");

  if (targetSessionId && (dailyRoomName || room.daily_room_name) && DAILY_API_KEY) {
    const name = dailyRoomName || room.daily_room_name;
    await fetch(`\( {DAILY_API_URL}/rooms/ \){name}/update-permissions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${DAILY_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        data: { [targetSessionId]: { canSend: [] } },
      }),
    }).catch((e) => console.error("Daily:", e));
  }

  return res.status(200).json({ ok: true, role: "viewer" });
             }
