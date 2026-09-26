/**
 * /api/live.js - FUSION FINALE v2
 * Fusion de: ai.js + chat.js (BAARO AI Gateway v2) + live.js (Daily)
 * Garde ton code exact, respecte auth.users.id
 * 1 endpoint au lieu de 3 → tu passes de 10 à 8 endpoints (sous les 12)
 * 
 * Routes via vercel.json:
 *   /api/live, /api/ai, /api/chat, /api/create-room, /api/live-roles -> ce fichier
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
import { chooseProvider, normalizeCountry, providerConfig } from "./_lib/ai/router.js";
import { callOpenAICompatible } from "./_lib/ai/openai-compatible.js";
import { isOpen, recordFailure, recordSuccess } from "./_lib/ai/circuit.js";

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
  return `https://\( {d}.daily.co/ \){roomName}`;
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
    const get = await fetch(`\( {DAILY_API}/rooms/ \){encodeURIComponent(roomName)}`, { headers: dailyHeaders() });
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

// ============== AI GATEWAY v2 HELPERS (ton code exact) ==============
function safeMaxTokens(value) { return Math.min(Math.max(Number(value) || 1200, 1), 2000); }
function safeCountry(req, context) {
  return normalizeCountry(context?.country) || normalizeCountry(req.headers["x-baaro-country"]) || null;
}
function buildSystem(customSystem, mode, context) {
  let system = customSystem || "Tu es l'assistant officiel de BAARO. Réponds de façon claire, utile et respectueuse.";
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
async function callAnthropic({ apiKey, messages, system, maxTokens }) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-20250514", max_tokens: maxTokens, system, messages }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(data.error?.message || "Erreur Anthropic"), { status: response.status });
  return { reply: data.content?.find?.((c) => c.type === "text")?.text || data.content?.[0]?.text || "Désolé, je n'ai pas pu générer une réponse.", raw: data };
}
async function callN8n({ url, secret, sessionId, payload }) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Session-Id": sessionId, ...(secret ? { "X-N8N-Secret": secret } : {}) },
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(data.error || data.message || "Erreur agent n8n"), { status: response.status });
  return { reply: data.reply || data.content?.[0]?.text || "Désolé, je n'ai pas pu générer une réponse.", raw: data, sessionId: data.sessionId || sessionId, provider: data.provider || "n8n" };
}
async function invokeProvider(provider, ctx) {
  const { normalizedMessages, system, maxTokens, sessionId, country, profile, mode, publicModel } = ctx;
  if (provider === "n8n") {
    return callN8n({
      url: process.env.N8N_BAARO_WEBHOOK_URL, secret: process.env.N8N_WEBHOOK_SECRET, sessionId,
      payload: {
        messages: normalizedMessages,
        context: { country, user_id: ctx.userId, language: profile.language || null },
        max_tokens: maxTokens, mode: mode || "default", system,
        model: publicModel || process.env.BAARO_AI_MODEL || null, provider, sessionId,
      },
    });
  }
  if (provider === "anthropic") return callAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY, messages: normalizedMessages, system, maxTokens });
  const cfg = providerConfig(provider);
  if (!cfg?.key || !cfg?.base) throw Object.assign(new Error(`Provider ${provider} mal configuré`), { status: 503 });
  return callOpenAICompatible({ base: cfg.base, key: cfg.key, model: publicModel || cfg.model, messages: normalizedMessages, system, maxTokens });
}

// ============== HANDLERS ==============
const RATE_LIMIT_DEBATE_MS = 20000;
const lastDebateCall = new Map();

async function handleAiRouting(req, res, user) {
  if (req.method !== "GET") return res.status(405).json({ error: "Méthode non autorisée" });
  const country = normalizeCountry(req.query?.country || req.headers["x-baaro-country"]);
  const provider = chooseProvider({ country, requested: req.query?.provider });
  return res.status(200).json({ country, provider });
}

async function handleAiDebateLegacy(req, res, admin, user) {
  // Ton ancien ai.js - gardé pour compatibilité
  if (req.method !== "POST") return res.status(405).json({ error: "Méthode non autorisée" });
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "ANTHROPIC_API_KEY manquante" });
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
  const systemPrompt = `Tu es l'assistant IA du débat live BAARO intitulé « ${room.title || "Débat"} ».\nSujet : \( {room.topic || "non précisé"}.\nTu aides TOUS les participants. Réponds en français, clair et concis (2 à 5 phrases).\n\nExtraits récents :\n \){history || "(aucun)"}`;
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST", headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: 600, system: systemPrompt, messages: [{ role: "user", content: q }] }),
  });
  const data = await response.json();
  if (!response.ok) return res.status(response.status).json({ error: data.error?.message || "Erreur Claude" });
  const replyText = data.content?.find?.((c) => c.type === "text")?.text || data.content?.[0]?.text || "Désolé, je n'ai pas pu générer une réponse.";
  await admin.from("debate_messages").insert({ room_id: roomId, sender_id: null, sender_type: "ai", text: replyText });
  lastDebateCall.set(rateKey, now);
  return res.status(200).json({ ok: true, reply: replyText });
}

async function handleAiGateway(req, res, admin, user) {
  // Ton BAARO AI Gateway v2 exact
  const body = req.body || {};
  const { messages, context, max_tokens, mode, system: customSystem, model: requestedModel, provider: requestedProvider } = body;
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
  const publicModel = requestedModel && requestedProvider ? String(requestedModel).slice(0, 120) : undefined;
  const ctx = { normalizedMessages, system, maxTokens, sessionId, country, profile, mode, publicModel, userId: user.id };
  const start = Date.now(); const tried = []; let lastError = null; let result = null; let usedProvider = null;
  for (let i = 0; i < 4; i++) {
    const provider = chooseProvider({ country, requested: i === 0 ? requestedProvider || requestedModel : undefined, exclude: tried });
    if (!provider) break;
    if (isOpen(provider)) { tried.push(provider); logWarn("chat", `Circuit open for ${provider}`, { userId: user.id }); continue; }
    tried.push(provider);
    try { result = await invokeProvider(provider, ctx); recordSuccess(provider); usedProvider = result.provider || provider; break; }
    catch (err) { lastError = err; recordFailure(provider); logWarn("chat", `Provider ${provider} failed`, { userId: user.id, status: err?.status, message: err?.message }); }
  }
  const latency = Date.now() - start;
  if (!result) { logError("chat", lastError || new Error("No provider"), { userId: user.id, country, tried }); return res.status(502).json({ error: "Fournisseur IA temporairement indisponible", tried }); }
  res.setHeader("X-BAARO-AI-Provider", usedProvider);
  res.setHeader("X-BAARO-AI-Country", country || "unknown");
  res.setHeader("X-BAARO-AI-Latency-Ms", String(latency));
  res.setHeader("X-BAARO-AI-Tried", tried.join(","));
  return res.status(200).json({ reply: result.reply, sessionId: result.sessionId || sessionId, provider: usedProvider, model: publicModel || usedProvider, country: country || null, latencyMs: latency });
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
  const { data: room } = await admin.from("debate_rooms").select("id, host_id, daily_room_name, invite_code, status, mode").or(`invite_code.eq.\( {liveId},id.eq. \){liveId},daily_room_name.eq.${liveId}`).maybeSingle();
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

// ============== MAIN HANDLER - FUSION ==============
export default async function handler(req, res) {
  if (applyCors(req, res)) return;

  const urlPath = (req.url || "").split("?")[0];
  const isRouting = req.method === "GET" || urlPath.includes("ai-routing") || urlPath.includes("routing");

  // Rate limit différent selon type
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
    // 1. Routing IA (GET)
    if (isRouting) return await handleAiRouting(req, res, user);

    const body = req.body || {};
    const action = (body.action || "").toLowerCase();

    // 2. Live Daily
    if (urlPath.includes("create-room") || action === "create-room" || action === "create_room") {
      return await handleCreateRoom(req, res, user, admin);
    }
    if (urlPath.includes("live-roles") || action === "roles") {
      logInfo("live", "roles action", { userId: user.id, action: body.action });
      return res.status(200).json({ ok: true, message: "Utilise les RPC Supabase pour les rôles" });
    }
    if (body.liveId || body.roomName || action === "token" || urlPath.includes("live")) {
      // Si c'est un token Daily (a liveId) on priorise token, sauf si messages présent
      if (!body.messages) return await handleToken(req, res, user, admin);
    }

    // 3. AI Gateway v2 (messages array)
    if (Array.isArray(body.messages)) {
      return await handleAiGateway(req, res, admin, user);
    }

    // 4. Legacy debate (roomId + question)
    if (body.roomId && body.question) {
      return await handleAiDebateLegacy(req, res, admin, user);
    }

    return res.status(400).json({ error: "Body invalide: messages[] pour AI Gateway, ou liveId pour token, ou roomId+question pour débat" });
  } catch (err) {
    logError(rateKey, err, { userId: user?.id });
    return res.status(err.status || 500).json({ error: err.message || "Erreur serveur" });
  }
}
