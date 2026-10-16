/**
 * /api/live.js - FUSION FINALE v2 (Mode Exclusif Gemini)
 * Fusion de: ai.js + chat.js (BAARO AI Gateway v2) + live.js (Daily)
 */

import {
  getAdminClient,
  requireUser,
  rateLimitAsync,
  applyCors,
  logError,
  logInfo,
  logWarn,
} from "./_shared.js";
import { normalizeCountry, providerConfig } from "./_lib/ai/router.js";
import { callOpenAICompatible } from "./_lib/ai/openai-compatible.js";

// ============== DAILY CONFIG ==============
const DAILY_API = "https://api.daily.co/v1";
const TOKEN_TTL_SEC = 60 * 60 * 4;

function dailyHeaders() {
  const key = process.env.DAILY_API_KEY;
  if (!key) {
    const err = new Error("DAILY_API_KEY manquante côté serveur");
    err.status = 503;
    throw err;
  }
  return { Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
}
function domain() {
  return (process.env.DAILY_DOMAIN || process.env.VITE_DAILY_DOMAIN || "")
    .replace(/\.daily\.co$/i, "").trim();
}
function roomUrl(roomName) {
  const d = domain();
  if (!d) return null;
  return `https://${d}.daily.co/${roomName}`;
}
function sanitizeRoomName(raw) {
  const s = String(raw || "").toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
  return s || `baaro-${Date.now().toString(36)}`;
}
async function createDailyRoom(roomName, { maxParticipants = 50, expHours = 12 } = {}) {
  const exp = Math.floor(Date.now() / 1000) + expHours * 3600;
  const res = await fetch(`${DAILY_API}/rooms`, {
    method: "POST", headers: dailyHeaders(),
    body: JSON.stringify({
      name: roomName, privacy: "private",
      properties: {
        exp, enable_chat: true, enable_screenshare: true, enable_knocking: false,
        start_video_off: false, start_audio_off: false,
        max_participants: Math.min(Math.max(maxParticipants, 2), 200),
        eject_at_room_exp: true,
      },
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 400 && /already exists/i.test(data?.info || data?.error || "")) {
    const get = await fetch(`${DAILY_API}/rooms/${encodeURIComponent(roomName)}`, { headers: dailyHeaders() });
    const existing = await get.json().catch(() => ({}));
    if (!get.ok) throw Object.assign(new Error(existing.error || "Room Daily introuvable"), { status: get.status });
    return existing;
  }
  if (!res.ok) throw Object.assign(new Error(data.error || data.info || `Daily create room ${res.status}`), { status: res.status >= 500 ? 502 : 400 });
  return data;
}
async function createMeetingToken(roomName, { userId, userName, isOwner }) {
  const exp = Math.floor(Date.now() / 1000) + TOKEN_TTL_SEC;
  const res = await fetch(`${DAILY_API}/meeting-tokens`, {
    method: "POST", headers: dailyHeaders(),
    body: JSON.stringify({
      properties: {
        room_name: roomName, exp, is_owner: !!isOwner,
        user_id: String(userId || "").slice(0, 64) || undefined,
        user_name: String(userName || "Participant").slice(0, 80),
        enable_screenshare: true, start_video_off: false, start_audio_off: false,
      },
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.token) throw Object.assign(new Error(data.error || data.info || "Impossible de créer le token Daily"), { status: res.status >= 500 ? 502 : 400 });
  return data.token;
}

// ============== AI HELPERS (GEMINI EXCLUSIF) ==============
function safeMaxTokens(value) { return Math.min(Math.max(Number(value) || 1200, 1), 2000); }
function safeCountry(req, context) {
  return normalizeCountry(context?.country) || normalizeCountry(req.headers["x-baaro-country"]) || null;
}

// 🟢 MISE À JOUR DU PROMPT SYSTÈME POUR DÉBLOQUER LA CRÉATION DE CONTENU
function buildSystem(customSystem, mode, context) {
  let system = customSystem || `Tu es l'Assistant IA officiel et le Moteur Créatif de l'application BAARO.
Tu aides les utilisateurs à concevoir du contenu (scripts, idées de visuels, histoires, débats).
Lorsque l'utilisateur te demande de générer un visuel, une story ou une vidéo :
1. Rédige un script ou un texte percutant avec titre et description.
2. Propose le visuel sous forme textuelle ou d'idée d'image claire.
L'application BAARO intègre un studio de rendu multimédia qui transformera automatiquement tes propositions et scripts en contenus visuels et vidéos publiés sur la plateforme. Ne dis jamais que tu es un simple assistant textuel incapable de créer des images ou vidéos.`;

  if (context && typeof context === "object") {
    if (context.display_name) system += `\nUtilisateur: ${String(context.display_name).slice(0, 100)}`;
    if (context.language) system += `\nLangue préférée: ${String(context.language).slice(0, 20)}`;
  }
  if (mode === "cohost") system += "\nTu es co-animatrice d'un live. Réponds en 1 à 3 phrases maximum.";
  return system.slice(0, 12000);
}

async function loadCountry(admin, userId) {
  try { const { data } = await admin.from("profiles").select("country, language").eq("id", userId).maybeSingle(); return data || {}; } catch { return {}; }
}

async function invokeGemini(ctx) {
  const { normalizedMessages, system, maxTokens, publicModel } = ctx;
  const cfg = providerConfig("gemini");
  
  return callOpenAICompatible({
    key: cfg?.key || process.env.GEMINI_API_KEY,
    model: publicModel || cfg?.model || process.env.GEMINI_MODEL || "gemini-3.8-flash",
    messages: normalizedMessages,
    system,
    maxTokens
  });
}

// ============== HANDLERS ==============
const RATE_LIMIT_DEBATE_MS = 20000;
const lastDebateCall = new Map();

async function handleAiRouting(req, res, user) {
  if (req.method !== "GET") return res.status(405).json({ error: "Méthode non autorisée" });
  const country = normalizeCountry(req.query?.country || req.headers["x-baaro-country"]);
  return res.status(200).json({ country, provider: "gemini" });
}

async function handleAiDebateLegacy(req, res, admin, user) {
  if (req.method !== "POST") return res.status(405).json({ error: "Méthode non autorisée" });
  const { roomId, question } = req.body || {};
  if (!roomId || !question) return res.status(400).json({ error: "roomId et question requis" });
  const q = question.trim().slice(0, 800);
  const rateKey = user.id + ":" + roomId;
  const now = Date.now();
  if (lastDebateCall.has(rateKey) && now - lastDebateCall.get(rateKey) < RATE_LIMIT_DEBATE_MS) {
    return res.status(429).json({ error: "Attends quelques secondes" });
  }
  const { data: part } = await admin.from("debate_participants").select("user_id").eq("room_id", roomId).eq("user_id", user.id).is("left_at", null).maybeSingle();
  if (!part) return res.status(403).json({ error: "Tu n'es pas dans ce live" });
  const { data: room } = await admin.from("debate_rooms").select("id, title, topic, status, ai_enabled").eq("id", roomId).maybeSingle();
  if (!room || room.status !== "active") return res.status(400).json({ error: "Live introuvable ou terminé" });
  if (room.ai_enabled === false) return res.status(400).json({ error: "L'IA est désactivée" });
  const { data: recent } = await admin.from("debate_messages").select("text, sender_type, created_at").eq("room_id", roomId).order("created_at", { ascending: false }).limit(12);
  const history = (recent || []).reverse().map(m => `${m.sender_type === "ai" ? "IA" : m.sender_type === "system" ? "Système" : "Participant"}: ${m.text}`).join("\n");
  const systemPrompt = `Tu es l'assistant IA du débat live BAARO intitulé « ${room.title || "Débat"} ».\nSujet : ${room.topic || "non précisé"}.\nTu aides TOUS les participants. Réponds en français, clair et concis (2 à 5 phrases).\n\nExtraits récents :\n${history || "(aucun)"}`;
  
  const result = await invokeGemini({
    normalizedMessages: [{ role: "user", content: q }],
    system: systemPrompt,
    maxTokens: 600,
    userId: user.id
  });

  await admin.from("debate_messages").insert({ room_id: roomId, sender_id: null, sender_type: "ai", text: result.reply });
  lastDebateCall.set(rateKey, now);
  return res.status(200).json({ ok: true, reply: result.reply });
}

async function handleAiGateway(req, res, admin, user) {
  const body = req.body || {};
  const { messages, context, max_tokens, mode, system: customSystem, model: requestedModel } = body;
  if (!Array.isArray(messages) || messages.length < 1 || messages.length > 30) {
    return res.status(400).json({ error: "messages doit contenir entre 1 et 30 éléments" });
  }
  const normalizedMessages = messages.map((m) => ({ role: m?.role === "assistant" ? "assistant" : "user", content: String(m?.content ?? m?.text ?? "").slice(0, 8000) }));
  if (normalizedMessages.some((m) => !m.content.trim())) return res.status(400).json({ error: "Message vide" });
  
  const profile = await loadCountry(admin, user.id);
  const country = safeCountry(req, { ...(context || {}), country: context?.country || profile.country });
  const maxTokens = safeMaxTokens(max_tokens);
  const system = buildSystem(customSystem, mode, { ...(context || {}), language: context?.language || profile.language });
  const sessionId = String(req.headers["x-session-id"] || body.sessionId || `user-${user.id}`).slice(0, 160);
  const publicModel = requestedModel ? String(requestedModel).slice(0, 120) : undefined;
  
  const ctx = { normalizedMessages, system, maxTokens, sessionId, country, profile, mode, publicModel, userId: user.id };
  const start = Date.now();

  try {
    const result = await invokeGemini(ctx);
    const latency = Date.now() - start;

    res.setHeader("X-BAARO-AI-Provider", "gemini");
    res.setHeader("X-BAARO-AI-Country", country || "unknown");
    res.setHeader("X-BAARO-AI-Latency-Ms", String(latency));

    return res.status(200).json({
      reply: result.reply,
      sessionId,
      provider: "gemini",
      model: publicModel || process.env.GEMINI_MODEL || "gemini-3.8-flash",
      country: country || null,
      latencyMs: latency
    });
  } catch (err) {
    logError("chat", err, { userId: user.id, country });
    return res.status(err.status || 502).json({ error: err.message || "Fournisseur IA temporairement indisponible" });
  }
}

async function handleCreateRoom(req, res, user, admin) {
  const body = req.body || {};
  const title = String(body.title || "Live").slice(0, 120);
  const topic = String(body.topic || "").slice(0, 300);
  const mode = ["text", "audio", "video"].includes(body.mode) ? body.mode : "video";
  const inviteCode = sanitizeRoomName(body.inviteCode || body.invite_code);
  const maxParticipants = Math.min(Math.max(Number(body.maxParticipants) || 12, 2), 50);
  let dailyRoomName = null; let dailyUrl = null;
  if (mode !== "text") {
    try { const room = await createDailyRoom(inviteCode, { maxParticipants }); dailyRoomName = room.name; dailyUrl = room.url || roomUrl(room.name); }
    catch (e) { logWarn("live", "Daily create-room failed", { message: e.message, userId: user.id }); }
  }
  if (dailyRoomName && inviteCode) {
    try { await admin.from("debate_rooms").update({ daily_room_name: dailyRoomName }).eq("invite_code", inviteCode).eq("host_id", user.id); }
    catch (e) { logWarn("live", "update daily_room_name failed", { message: e.message }); }
  }
  logInfo("live", "create-room ok", { userId: user.id, inviteCode, dailyRoomName, mode });
  return res.status(200).json({ ok: true, roomName: dailyRoomName, daily_room_name: dailyRoomName, url: dailyUrl, inviteCode, title, topic, mode });
}

async function handleToken(req, res, user, admin) {
  const body = req.body || {};
  const liveId = String(body.liveId || body.roomName || body.inviteCode || "").trim();
  if (!liveId) return res.status(400).json({ error: "liveId requis" });
  const { data: room } = await admin.from("debate_rooms").select("id, host_id, daily_room_name, invite_code, status, mode").or(`invite_code.eq.${liveId},id.eq.${liveId},daily_room_name.eq.${liveId}`).maybeSingle();
  if (!room || room.status === "ended") return res.status(404).json({ error: "Live introuvable ou terminé" });
  const isHost = room.host_id === user.id;
  if (!isHost) {
    const { data: part } = await admin.from("debate_participants").select("user_id").eq("room_id", room.id).eq("user_id", user.id).is("left_at", null).maybeSingle();
    if (!part) return res.status(403).json({ error: "Tu n'es pas participant de ce live" });
  }
  const roomName = room.daily_room_name || sanitizeRoomName(room.invite_code || liveId);
  try { await createDailyRoom(roomName); } catch (e) { logWarn("live", "ensure Daily room", { message: e.message }); }
  const isOwner = isHost || body.isOwner === true;
  const token = await createMeetingToken(roomName, { userId: user.id, userName: body.userName || (isOwner ? "Hôte" : "Participant"), isOwner });
  return res.status(200).json({ ok: true, token, roomName, url: roomUrl(roomName), isOwner });
}

// ============== MAIN HANDLER ==============
export default async function handler(req, res) {
  if (applyCors(req, res)) return;

  const urlPath = (req.url || "").split("?")[0];
  const isRouting = req.method === "GET" || urlPath.includes("ai-routing") || urlPath.includes("routing");

  const rateKey = isRouting ? "ai-routing" : urlPath.includes("live") || req.body?.liveId ? "live" : "chat";
  const limit = await rateLimitAsync(req, { key: rateKey, max: rateKey === "chat" ? 20 : 30, windowMs: 60_000 });
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

  try {
    if (isRouting) return await handleAiRouting(req, res, user);

    const body = req.body || {};
    const action = (body.action || "").toLowerCase();

    if (urlPath.includes("create-room") || action === "create-room" || action === "create_room") {
      return await handleCreateRoom(req, res, user, admin);
    }
    if (urlPath.includes("live-roles") || action === "roles") {
      logInfo("live", "roles action", { userId: user.id, action: body.action });
      return res.status(200).json({ ok: true, message: "Utilise les RPC Supabase pour les rôles" });
    }
    if (body.liveId || body.roomName || action === "token" || urlPath.includes("live")) {
      if (!body.messages) return await handleToken(req, res, user, admin);
    }

    if (Array.isArray(body.messages)) {
      return await handleAiGateway(req, res, admin, user);
    }

    if (body.roomId && body.question) {
      return await handleAiDebateLegacy(req, res, admin, user);
    }

    return res.status(400).json({ error: "Body invalide: messages[] pour AI Gateway, ou liveId pour token, ou roomId+question pour débat" });
  } catch (err) {
    logError(rateKey, err, { userId: user?.id });
    return res.status(err.status || 500).json({ error: err.message || "Erreur serveur" });
  }
}
