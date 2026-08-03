// api/create-room.js
import { getAdminClient, requireUser } from "./_supabaseAdmin.js";

const DAILY_API_URL = "https://api.daily.co/v1";
const INVITE_CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function generateInviteCode(length = 6) {
  let code = "";
  for (let i = 0; i < length; i++) {
    code += INVITE_CODE_CHARS[Math.floor(Math.random() * INVITE_CODE_CHARS.length)];
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

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Méthode non autorisée" });
  }

  const DAILY_API_KEY = process.env.DAILY_API_KEY;
  if (!DAILY_API_KEY) {
    return res.status(500).json({ error: "DAILY_API_KEY manquante côté serveur" });
  }

  let admin;
  try {
    admin = getAdminClient();
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }

  let user = null;
  try {
    user = await requireUser(req, admin);
  } catch {
    // mode anonyme possible
  }

  const {
    action,
    roomName,
    userName,
    isHost,
    enableHLS,
    hostId,
    debateId,
    inviteCode,
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
            ...(streamingEndpoints ? { streaming_endpoints: streamingEndpoints } : {}),
          },
        }),
      });

      if (!roomRes.ok) {
        const err = await roomRes.text();
        return res.status(roomRes.status).json({ error: `Erreur création room Daily: ${err}` });
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
            is_owner: true,
            start_video_off: false,
            start_audio_off: false,
            ...(streamingEndpoints
              ? { permissions: { canAdmin: ["streaming"] } }
              : {}),
          },
        }),
      });

      const tokenData = await tokenRes.json();
      const code = await generateUniqueInviteCode(admin);

      const { error: insertError } = await admin.from("debate_rooms").insert({
        daily_room_name: roomData.name,
        invite_code: code,
        host_id: hostId || user?.id || null,
        title: "Live BAARO",
        status: "active",
        max_participants: 10,
      });

      if (insertError) {
        await fetch(`\( {DAILY_API_URL}/rooms/ \){roomData.name}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${DAILY_API_KEY}` },
        }).catch(() => {});
        throw insertError;
      }

      return res.status(200).json({
        roomUrl: roomData.url,
        roomName: roomData.name,
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
        .select("daily_room_name, status, max_participants")
        .eq("invite_code", inviteCode.trim().toUpperCase())
        .maybeSingle();

      if (error) throw error;
      if (!data || data.status !== "active") {
        return res.status(404).json({ error: "Code invalide ou live terminé" });
      }

      return res.status(200).json({
        roomName: data.daily_room_name,
        maxParticipants: data.max_participants || 10,
      });
    }

    // ---------- JOIN ROOM ----------
    if (action === "join-room") {
      if (!roomName) {
        return res.status(400).json({ error: "roomName requis" });
      }

      const tokenRes = await fetch(`${DAILY_API_URL}/meeting-tokens`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${DAILY_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          properties: {
            room_name: roomName,
            user_name: userName || "Spectateur",
            is_owner: !!isHost,
            start_video_off: true,
            start_audio_off: true,
          },
        }),
      });

      if (!tokenRes.ok) {
        const err = await tokenRes.text();
        return res.status(tokenRes.status).json({ error: `Erreur token Daily: ${err}` });
      }

      const tokenData = await tokenRes.json();

      return res.status(200).json({
        roomUrl: `https://\( {process.env.DAILY_DOMAIN || "baaro"}.daily.co/ \){roomName}`,
        token: tokenData.token,
      });
    }

    // ---------- DELETE ROOM ----------
    if (action === "delete-room") {
      if (!roomName) {
        return res.status(400).json({ error: "roomName requis" });
      }

      await fetch(`\( {DAILY_API_URL}/rooms/ \){roomName}`, {
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
