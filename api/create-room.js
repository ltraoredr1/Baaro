// api/create-room.js
// - create-room / resolve-code / join-room / delete-room
// - pause-room / resume-room (hôte uniquement)

import { getAdminClient, requireUser } from "./_supabaseAdmin.js";
import { applyCors } from "./_cors.js";
import { rateLimit } from "./_rateLimit.js";

import { randomInt } from "node:crypto";

const DAILY_API_URL = "https://api.daily.co/v1";
const INVITE_CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function generateInviteCode(length = 6) {
  let code = "";
  for (let i = 0; i < length; i++) {
    code += INVITE_CODE_CHARS[randomInt(0, INVITE_CODE_CHARS.length)];
  }
  return code;
}

async function generateUniqueInviteCode(admin) {
  for (let attempt = 0; attempt < 8; attempt++) {
    const code = generateInviteCode();
    const { data } = await admin
      .from("debate_rooms")
      .select("id")
      .eq("invite_code", code)
      .maybeSingle();
    if (!data) return code;
  }
  throw new Error("Impossible de générer un code d'invitation unique");
}

async function getRole(admin, roomId, userId) {
  const { data } = await admin
    .from("debate_participants")
    .select("role")
    .eq("room_id", roomId)
    .eq("user_id", userId)
    .is("left_at", null)
    .maybeSingle();
  return data?.role || "viewer";
}

function canSendForRole(role) {
  return role === "host" || role === "co_host" ? ["video", "audio"] : [];
}

export default async function handler(req, res) {
  if (applyCors(req, res)) return;

  const limit = rateLimit(req, { key: "create-room", max: 12, windowMs: 60_000 });
  if (!limit.ok) {
    Object.entries(limit.headers || {}).forEach(([k, v]) => res.setHeader(k, v));
    return res.status(limit.status).json(limit.body);
  }
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Méthode non autorisée" });
  }

  const DAILY_API_KEY = process.env.DAILY_API_KEY;
  if (!DAILY_API_KEY) {
    return res
      .status(500)
      .json({ error: "DAILY_API_KEY manquante côté serveur" });
  }

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

  const {
    action,
    roomName,
    roomId,
    userName,
    enableHLS,
    inviteCode,
    title,
    topic,
    mode,
  } = req.body || {};

  try {
    // ---------- CREATE ROOM ----------
    if (action === "create-room") {
      const streamingEndpoints =
        enableHLS && process.env.DAILY_S3_BUCKET
          ? [
              {
                name: "baaro-hls",
                type: "hls",
                hls_config: {
                  s3_key_template: "baaro/{room_name}/{epoch}",
                  s3_bucket_name: process.env.DAILY_S3_BUCKET,
                  s3_region: process.env.DAILY_S3_REGION,
                  s3_access_key: process.env.DAILY_S3_ACCESS_KEY,
                  s3_secret_key: process.env.DAILY_S3_SECRET_KEY,
                  save_hls_recording: false,
                },
              },
            ]
          : undefined;

      const roomRes = await fetch(`${DAILY_API_URL}/rooms`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${DAILY_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          privacy: "private",
          properties: {
            exp: Math.floor(Date.now() / 1000) + 60 * 60 * 4,
            enable_chat: false,
            enable_screenshare: false,
            max_participants: 10,
            enable_recording: false,
            ...(streamingEndpoints
              ? { streaming_endpoints: streamingEndpoints }
              : {}),
          },
        }),
      });

      if (!roomRes.ok) {
        const err = await roomRes.text();
        return res
          .status(roomRes.status)
          .json({ error: `Erreur création room Daily: ${err}` });
      }

      const roomData = await roomRes.json();

      const tokenRes = await fetch(`${DAILY_API_URL}/meeting-tokens`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${DAILY_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          properties: {
            room_name: roomData.name,
            user_name: userName || "Hôte",
            user_id: user.id,
            is_owner: true,
            start_video_off: false,
            start_audio_off: false,
            ...(streamingEndpoints
              ? {
                  permissions: {
                    canSend: ["video", "audio"],
                    canAdmin: ["streaming", "participants"],
                  },
                }
              : {
                  permissions: {
                    canSend: ["video", "audio"],
                    canAdmin: ["participants"],
                  },
                }),
          },
        }),
      });

      if (!tokenRes.ok) {
        const err = await tokenRes.text();
        await fetch(`${DAILY_API_URL}/rooms/${roomData.name}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${DAILY_API_KEY}` },
        }).catch(() => {});
        return res
          .status(tokenRes.status)
          .json({ error: `Erreur création token Daily: ${err}` });
      }

      const tokenData = await tokenRes.json();
      const code = await generateUniqueInviteCode(admin);

      const { data: newRoom, error: insertError } = await admin
        .from("debate_rooms")
        .insert({
          daily_room_name: roomData.name,
          invite_code: code,
          host_id: user.id,
          title: (title && String(title).trim()) || "Live BAARO",
          topic: (topic && String(topic).trim()) || null,
          mode: mode === "audio" || mode === "video" ? mode : "video",
          status: "active",
          max_participants: 10,
        })
        .select()
        .single();

      if (insertError) {
        await fetch(`${DAILY_API_URL}/rooms/${roomData.name}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${DAILY_API_KEY}` },
        }).catch(() => {});
        throw insertError;
      }

      await admin.from("debate_participants").insert({
        room_id: newRoom.id,
        user_id: user.id,
        role: "host",
      });

      return res.status(200).json({
        roomUrl: roomData.url,
        roomName: roomData.name,
        roomId: newRoom.id,
        token: tokenData.token,
        inviteCode: code,
        hlsEnabled: !!streamingEndpoints,
      });
    }

    // ---------- RESOLVE CODE ----------
    if (action === "resolve-code") {
      if (!inviteCode) {
        return res.status(400).json({ error: "Code d'invitation requis" });
      }

      const { data, error } = await admin
        .from("debate_rooms")
        .select("id, daily_room_name, status, max_participants")
        .eq("invite_code", inviteCode.trim().toUpperCase())
        .maybeSingle();

      if (error) throw error;
      // active OU paused : on peut toujours rejoindre / se reconnecter
      if (!data || (data.status !== "active" && data.status !== "paused")) {
        return res
          .status(404)
          .json({ error: "Code invalide ou live terminé" });
      }

      return res.status(200).json({
        roomId: data.id,
        roomName: data.daily_room_name,
        maxParticipants: data.max_participants || 10,
        status: data.status,
      });
    }

    // ---------- JOIN ROOM ----------
    if (action === "join-room") {
      if (!roomName || !roomId) {
        return res.status(400).json({ error: "roomName et roomId requis" });
      }

      const { data: joinResult, error: joinError } = await admin.rpc("join_debate_room", {
        p_room_id: roomId,
        p_user_id: user.id,
      });
      if (joinError) {
        const msg = String(joinError.message || joinError);
        if (msg.includes("LIVE_NOT_FOUND")) return res.status(404).json({ error: "Live introuvable ou terminé" });
        if (msg.includes("LIVE_FULL")) return res.status(409).json({ error: "Ce live est complet" });
        throw joinError;
      }
      const roomCheck = joinResult;
      const role = roomCheck.role || "viewer";

      const canSend = canSendForRole(role);
      const canBroadcast = role === "host" || role === "co_host";

      const tokenRes = await fetch(`${DAILY_API_URL}/meeting-tokens`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${DAILY_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          properties: {
            room_name: roomName,
            user_name: userName || "Participant",
            user_id: user.id,
            is_owner: role === "host",
            start_video_off: !canBroadcast,
            start_audio_off: !canBroadcast,
            permissions: { canSend },
          },
        }),
      });

      if (!tokenRes.ok) {
        const err = await tokenRes.text();
        return res
          .status(tokenRes.status)
          .json({ error: `Erreur token Daily: ${err}` });
      }

      const tokenData = await tokenRes.json();

      let roomUrl = `https://${process.env.DAILY_DOMAIN || "baaro"}.daily.co/${roomName}`;
      try {
        const infoRes = await fetch(`${DAILY_API_URL}/rooms/${roomName}`, {
          headers: { Authorization: `Bearer ${DAILY_API_KEY}` },
        });
        if (infoRes.ok) {
          const info = await infoRes.json();
          if (info.url) roomUrl = info.url;
        }
      } catch (_) {}

      return res.status(200).json({
        roomUrl,
        token: tokenData.token,
        role,
        status: roomCheck.status,
      });
    }

    // ---------- PAUSE / RESUME ----------
    if (action === "pause-room" || action === "resume-room") {
      if (!roomId) {
        return res.status(400).json({ error: "roomId requis" });
      }

      const { data: room, error: roomErr } = await admin
        .from("debate_rooms")
        .select("id, host_id, status, daily_room_name")
        .eq("id", roomId)
        .maybeSingle();

      if (roomErr) throw roomErr;
      if (!room) return res.status(404).json({ error: "Live introuvable" });
      if (room.host_id !== user.id) {
        return res
          .status(403)
          .json({ error: "Seul l'hôte peut pause / reprendre" });
      }
      if (room.status === "ended") {
        return res.status(400).json({ error: "Ce live est terminé" });
      }

      const newStatus = action === "pause-room" ? "paused" : "active";

      if (room.status === newStatus) {
        return res.status(200).json({ ok: true, status: newStatus });
      }

      const { error: updErr } = await admin
        .from("debate_rooms")
        .update({ status: newStatus })
        .eq("id", roomId);

      if (updErr) throw updErr;

      await admin.from("debate_messages").insert({
        room_id: roomId,
        sender_id: null,
        sender_type: "system",
        text:
          newStatus === "paused"
            ? "⏸ Le débat est en pause."
            : "▶️ Le débat reprend.",
      });

      return res.status(200).json({ ok: true, status: newStatus });
    }

    // ---------- DELETE ROOM ----------
    if (action === "delete-room") {
      if (!roomName) {
        return res.status(400).json({ error: "roomName requis" });
      }

      const { data: room } = await admin
        .from("debate_rooms")
        .select("id, host_id")
        .eq("daily_room_name", roomName)
        .maybeSingle();

      if (!room || room.host_id !== user.id) {
        return res
          .status(403)
          .json({ error: "Seul l'hôte peut terminer ce live" });
      }

      await fetch(`${DAILY_API_URL}/rooms/${roomName}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${DAILY_API_KEY}` },
      });

      await admin
        .from("debate_rooms")
        .update({ status: "ended", ended_at: new Date().toISOString() })
        .eq("daily_room_name", roomName);

      return res.status(200).json({ success: true });
    }

    return res.status(400).json({ error: "Action inconnue" });
  } catch (error) {
    console.error("Erreur /api/create-room :", error);
    return res.status(500).json({ error: "Erreur serveur" });
  }
}
