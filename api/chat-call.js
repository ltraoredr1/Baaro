import { getAdminClient, requireUser } from "./_supabaseAdmin.js";
import { rateLimit } from "./_rateLimit.js";
import { applyCors } from "./_cors.js";

const DAILY_API_URL = "https://api.daily.co/v1";

function json(res, status, body) {
  return res.status(status).json(body);
}

export default async function handler(req, res) {
  if (applyCors(req, res)) return;
  const limit = rateLimit(req, { key: "chat-call", max: 20, windowMs: 60_000 });
  if (!limit.ok) {
    Object.entries(limit.headers || {}).forEach(([k, v]) => res.setHeader(k, v));
    return res.status(limit.status).json(limit.body);
  }
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
      const callId = body.callId;
      if (!roomName || typeof roomName !== "string" || roomName.length > 120) {
        return json(res, 400, { error: "roomName requis" });
      }
      if (!callId || typeof callId !== "string") {
        return json(res, 400, { error: "callId requis" });
      }

      // Seul le destinataire d'un appel en attente peut obtenir son token.
      const { data: call, error: callError } = await admin
        .from("calls")
        .select("id, caller_id, callee_id, daily_room_name, status")
        .eq("id", callId)
        .eq("daily_room_name", roomName)
        .maybeSingle();
      if (callError) return json(res, 500, { error: "Impossible de vérifier l'appel" });
      if (!call || call.callee_id !== user.id || call.status !== "ringing") {
        return json(res, 403, { error: "Accès à cet appel refusé" });
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
