/**
 * BAARO Live API
 * Routes (via vercel.json) :
 *   POST /api/live          → actions token | create-room | roles
 *   POST /api/create-room   → rewrite → /api/live
 *   POST /api/live/token    → peut être géré via body.action = "token"
 *   POST /api/live-roles    → rewrite → /api/live
 *
 * Variables requises :
 *   DAILY_API_KEY
 *   DAILY_DOMAIN          (ex: "baaro" → https://baaro.daily.co/...)
 *   SUPABASE_SERVICE_ROLE_KEY + VITE_SUPABASE_URL (ou SUPABASE_URL)
 */
import {
  applyCors,
  getAdminClient,
  requireUser,
  rateLimitAsync,
  logError,
  logInfo,
  logWarn,
} from "./_shared.js";

const DAILY_API = "https://api.daily.co/v1";
const TOKEN_TTL_SEC = 60 * 60 * 4; // 4 h

function dailyHeaders() {
  const key = process.env.DAILY_API_KEY;
  if (!key) {
    const err = new Error("DAILY_API_KEY manquante côté serveur");
    err.status = 503;
    throw err;
  }
  return {
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
  };
}

function domain() {
  return (process.env.DAILY_DOMAIN || process.env.VITE_DAILY_DOMAIN || "")
    .replace(/\.daily\.co$/i, "")
    .trim();
}

function roomUrl(roomName) {
  const d = domain();
  if (!d) return null;
  return `https://\( {d}.daily.co/ \){roomName}`;
}

/** Crée une room Daily (idempotent si le name existe déjà). */
async function createDailyRoom(roomName, { maxParticipants = 50, expHours = 12 } = {}) {
  const exp = Math.floor(Date.now() / 1000) + expHours * 3600;
  const res = await fetch(`${DAILY_API}/rooms`, {
    method: "POST",
    headers: dailyHeaders(),
    body: JSON.stringify({
      name: roomName,
      privacy: "private",
      properties: {
        exp,
        enable_chat: true,
        enable_screenshare: true,
        enable_knocking: false,
        start_video_off: false,
        start_audio_off: false,
        max_participants: Math.min(Math.max(maxParticipants, 2), 200),
        eject_at_room_exp: true,
      },
    }),
  });

  const data = await res.json().catch(() => ({}));

  // Room déjà existante → on la récupère
  if (res.status === 400 && /already exists/i.test(data?.info || data?.error || "")) {
    const get = await fetch(`\( {DAILY_API}/rooms/ \){encodeURIComponent(roomName)}`, {
      headers: dailyHeaders(),
    });
    const existing = await get.json().catch(() => ({}));
    if (!get.ok) {
      throw Object.assign(new Error(existing.error || "Room Daily introuvable"), {
        status: get.status,
      });
    }
    return existing;
  }

  if (!res.ok) {
    throw Object.assign(
      new Error(data.error || data.info || `Daily create room ${res.status}`),
      { status: res.status >= 500 ? 502 : 400 }
    );
  }
  return data;
}

/** Génère un meeting token Daily. */
async function createMeetingToken(roomName, { userId, userName, isOwner }) {
  const exp = Math.floor(Date.now() / 1000) + TOKEN_TTL_SEC;
  const res = await fetch(`${DAILY_API}/meeting-tokens`, {
    method: "POST",
    headers: dailyHeaders(),
    body: JSON.stringify({
      properties: {
        room_name: roomName,
        exp,
        is_owner: !!isOwner,
        user_id: String(userId || "").slice(0, 64) || undefined,
        user_name: String(userName || "Participant").slice(0, 80),
        enable_screenshare: true,
        start_video_off: false,
        start_audio_off: false,
      },
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.token) {
    throw Object.assign(
      new Error(data.error || data.info || "Impossible de créer le token Daily"),
      { status: res.status >= 500 ? 502 : 400 }
    );
  }
  return data.token;
}

/** Normalise le nom de room Daily (alphanum + tirets, max 40). */
function sanitizeRoomName(raw) {
  const s = String(raw || "")
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  return s || `baaro-${Date.now().toString(36)}`;
}

// ─── Actions ───────────────────────────────────────────────────────────

async function handleCreateRoom(req, res, user, admin) {
  const body = req.body || {};
  const title = String(body.title || "Live").slice(0, 120);
  const topic = String(body.topic || "").slice(0, 300);
  const mode = ["text", "audio", "video"].includes(body.mode) ? body.mode : "video";
  const inviteCode = sanitizeRoomName(body.inviteCode || body.invite_code);
  const maxParticipants = Math.min(Math.max(Number(body.maxParticipants) || 12, 2), 50);

  // 1) Créer / récupérer la room Daily (sauf mode texte pur)
  let dailyRoomName = null;
  let dailyUrl = null;
  if (mode !== "text") {
    try {
      const room = await createDailyRoom(inviteCode, { maxParticipants });
      dailyRoomName = room.name;
      dailyUrl = room.url || roomUrl(room.name);
    } catch (e) {
      logWarn("live", "Daily create-room failed (continuing without video)", {
        message: e.message,
        userId: user.id,
      });
      // On ne bloque pas : la salle texte/chat reste utilisable
    }
  }

  // 2) Upsert éventuel en base si le client n'a pas encore créé la ligne
  //    (le modal actuel crée déjà en base ; on met juste à jour daily_room_name)
  if (dailyRoomName && inviteCode) {
    try {
      await admin
        .from("debate_rooms")
        .update({ daily_room_name: dailyRoomName })
        .eq("invite_code", inviteCode)
        .eq("host_id", user.id);
    } catch (e) {
      logWarn("live", "update daily_room_name failed", { message: e.message });
    }
  }

  logInfo("live", "create-room ok", {
    userId: user.id,
    inviteCode,
    dailyRoomName,
    mode,
  });

  return res.status(200).json({
    ok: true,
    roomName: dailyRoomName,
    daily_room_name: dailyRoomName,
    url: dailyUrl,
    inviteCode,
    title,
    topic,
    mode,
  });
}

async function handleToken(req, res, user, admin) {
  const body = req.body || {};
  const liveId = String(body.liveId || body.roomName || body.inviteCode || "").trim();
  if (!liveId) {
    return res.status(400).json({ error: "liveId requis" });
  }

  // Vérifier que l'utilisateur a le droit (host ou participant)
  const { data: room } = await admin
    .from("debate_rooms")
    .select("id, host_id, daily_room_name, invite_code, status, mode")
    .or(`invite_code.eq.\( {liveId},id.eq. \){liveId},daily_room_name.eq.${liveId}`)
    .maybeSingle();

  if (!room || room.status === "ended") {
    return res.status(404).json({ error: "Live introuvable ou terminé" });
  }

  const isHost = room.host_id === user.id;
  if (!isHost) {
    const { data: part } = await admin
      .from("debate_participants")
      .select("user_id")
      .eq("room_id", room.id)
      .eq("user_id", user.id)
      .is("left_at", null)
      .maybeSingle();
    if (!part) {
      return res.status(403).json({ error: "Tu n'es pas participant de ce live" });
    }
  }

  const roomName = room.daily_room_name || sanitizeRoomName(room.invite_code || liveId);

  // S'assurer que la room Daily existe
  try {
    await createDailyRoom(roomName);
  } catch (e) {
    logWarn("live", "ensure Daily room", { message: e.message });
  }

  const isOwner = body.isOwner === true || isHost;
  const token = await createMeetingToken(roomName, {
    userId: user.id,
    userName: body.userName || (isOwner ? "Hôte" : "Participant"),
    isOwner,
  });

  return res.status(200).json({
    ok: true,
    token,
    roomName,
    url: roomUrl(roomName),
    isOwner,
  });
}

async function handleRoles(req, res, user, admin) {
  // Stub minimal — les rôles passent surtout par les RPC Supabase
  // (respond_debate_role_request). On accepte la route pour éviter 404.
  const body = req.body || {};
  logInfo("live", "roles action", { userId: user.id, action: body.action });
  return res.status(200).json({ ok: true, message: "Utilise les RPC Supabase pour les rôles" });
}

// ─── Handler principal ─────────────────────────────────────────────────

export default async function handler(req, res) {
  if (applyCors(req, res)) return;

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Méthode non autorisée" });
  }

  const limit = await rateLimitAsync(req, {
    key: "live",
    max: 30,
    windowMs: 60_000,
  });
  if (!limit.ok) {
    Object.entries(limit.headers || {}).forEach(([k, v]) => res.setHeader(k, v));
    return res.status(limit.status).json(limit.body);
  }

  let admin, user;
  try {
    admin = getAdminClient();
    user = await requireUser(req, admin);
  } catch (e) {
    return res.status(e.status || 500).json({ error: e.message });
  }

  const body = req.body || {};
  // Détection de l'action : body.action, path, ou rewrite
  const urlPath = (req.url || "").split("?")[0];
  let action = body.action || "token";

  if (urlPath.includes("create-room") || action === "create-room") {
    action = "create-room";
  } else if (urlPath.includes("live-roles") || action === "roles") {
    action = "roles";
  } else if (action === "token" || body.liveId || body.roomName) {
    action = "token";
  }

  try {
    if (action === "create-room") {
      return await handleCreateRoom(req, res, user, admin);
    }
    if (action === "roles") {
      return await handleRoles(req, res, user, admin);
    }
    return await handleToken(req, res, user, admin);
  } catch (err) {
    logError("live", err, { userId: user?.id, action });
    return res.status(err.status || 500).json({
      error: err.message || "Erreur live",
    });
  }
}
