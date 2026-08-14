import { getAdminClient, requireUser } from "./_supabaseAdmin.js";

const DAILY_API_URL = "https://api.daily.co/v1";

function json(res, status, body) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  return res.status(status).json(body);
}

export default async function handler(req, res) {
  if (req.method === "OPTIONS") return json(res, 200, {});
  if (req.method !== "POST") return json(res, 405, { error: "Méthode non autorisée" });

  const key = process.env.DAILY_API_KEY;
  if (!key) {
    return json(res, 503, {
      error: "Appels non configurés (DAILY_API_KEY manquante sur Vercel)",
    });
  }

  let admin;
  try {
    admin = getAdminClient();
  } catch (e) {
    return json(res, 500, { error: e.message });
  }

  let user;
  try {
    user = await requireUser(req, admin);
  } catch (e) {
    return json(res, e.status || 401, { error: e.message });
  }

  const body = req.body || {};
  const action = body.action || "create";

  try {
    if (action === "create") {
      const roomName = `baaro-call-${user.id.slice(0, 8)}-${Date.now().toString(36)}`;
      const r = await fetch(`${DAILY_API_URL}/rooms`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: roomName,
          privacy: "private",
          properties: {
            exp: Math.floor(Date.now() / 1000) + 60 * 60,
            enable_chat: false,
            start_audio_off: false,
            start_video_off: true,
            max_participants: 2,
          },
        }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        return json(res, 502, { error: data.error || data.info || "Daily error" });
      }

      // token for caller
      const t = await fetch(`${DAILY_API_URL}/meeting-tokens`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          properties: {
            room_name: roomName,
            user_name: body.userName || "BAARO",
            is_owner: true,
          },
        }),
      });
      const tokenData = await t.json().catch(() => ({}));

      return json(res, 200, {
        ok: true,
        roomName,
        url: data.url,
        token: tokenData.token,
      });
    }

    if (action === "join") {
      const roomName = body.roomName;
      if (!roomName || typeof roomName !== "string") {
        return json(res, 400, { error: "roomName requis" });
      }
      const t = await fetch(`${DAILY_API_URL}/meeting-tokens`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          properties: {
            room_name: roomName,
            user_name: body.userName || "BAARO",
          },
        }),
      });
      const tokenData = await t.json().catch(() => ({}));
      if (!t.ok) {
        return json(res, 502, { error: tokenData.error || "Token impossible" });
      }
      return json(res, 200, {
        ok: true,
        roomName,
        token: tokenData.token,
        url: `https://${process.env.DAILY_DOMAIN || "baaro"}.daily.co/${roomName}`,
      });
    }

    return json(res, 400, { error: "Action inconnue" });
  } catch (e) {
    console.error(e);
    return json(res, 500, { error: "Erreur serveur" });
  }
}
