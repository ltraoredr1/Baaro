/**
 * /api/live.js - FUSION FINALE v2.1 CORRIGÉE
 * Routes: /api/live, /api/ai, /api/chat, /api/create-room, /api/live-roles
 */

import * as shared from "./_shared.js";
import { chooseProvider, normalizeCountry, providerConfig } from "./_lib/ai/router.js";
import { callOpenAICompatible } from "./_lib/ai/openai-compatible.js";
import { isOpen, recordFailure, recordSuccess } from "./_lib/ai/circuit.js";

const { getAdminClient, requireUser, applyCors } = shared;
const rateLimitAsync = shared.rateLimitAsync || (async (req, opts) => (shared.rateLimit? shared.rateLimit(req, opts) : { ok: true }));
const logError = shared.logError || ((s, e, m) => console.error(`[${s}]`, e?.message || e, m));
const logInfo = shared.logInfo || ((s, msg, m) => console.log(`[${s}]`, msg, m));
const logWarn = shared.logWarn || ((s, msg, m) => console.warn(`[${s}]`, msg, m));

const DEFAULT_CLAUDE_MODEL = "claude-sonnet-5-5";
function claudeModel() {
  return String(process.env.ANTHROPIC_MODEL || "").replace(/["'\s]/g, "") || DEFAULT_CLAUDE_MODEL;
}
function ensureFirstUser(list) {
  const out = [...list];
  while (out.length > 1 && out[0].role!== "user") out.shift();
  if (out[0] && out[0].role!== "user") out[0] = {...out[0], role: "user" };
  return out;
}

// ============== DAILY ==============
const DAILY_API = "https://api.daily.co/v1";
const TOKEN_TTL_SEC = 60 * 60 * 4;

function dailyHeaders() {
  const key = process.env.DAILY_API_KEY;
  if (!key) throw Object.assign(new Error("DAILY_API_KEY manquante"), { status: 503 });
  return { Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
}
function domain() {
  return (process.env.DAILY_DOMAIN || process.env.VITE_DAILY_DOMAIN || "").replace(/\.daily\.co$/i, "").trim();
}
function roomUrl(roomName) {
  const d = domain();
  return d? `https://${d}.daily.co/${roomName}` : null;
}
function sanitizeRoomName(raw) {
  return String(raw || "").toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || `baaro-${Date.now().toString(36)}`;
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
    if (!get.ok) throw Object.assign(new Error(existing.error || "Room introuvable"), { status: get.status });
    return existing;
  }
  if (!res.ok) throw Object.assign(new Error(data.error || data.info || `Daily ${res.status}`), { status: res.status >= 500? 502 : 400 });
  return data;
}
async function createMeetingToken(roomName, { userId, userName, isOwner }) {
  const exp = Math.floor(Date.now() / 1000) + TOKEN_TTL_SEC;
  const res = await fetch(`${DAILY_API}/meeting-tokens`, {
    method: "POST", headers: dailyHeaders(),
    body: JSON.stringify({
      properties: {
        room_name: roomName, exp, is_owner:!!isOwner,
        user_id: String(userId || "").slice(0, 64) || undefined,
        user_name: String(userName || "Participant").slice(0, 80),
        enable_screenshare: true, start_video_off: false, start_audio_off: false,
      },
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok ||!data.token) throw Object.assign(new Error(data.error || "Token Daily impossible"), { status: res.status >= 500? 502 : 400 });
  return data.token;
}

// ============== AI GATEWAY ==============
function safeMaxTokens(v) { return Math.min(Math.max(Number(v) || 1200, 1), 2000); }
function safeCountry(req, context) {
  return normalizeCountry(context?.country) || normalizeCountry(req.headers["x-baaro-country"]) || null;
}
const BAARO_ASSISTANT_BASE = `Tu es l'assistant officiel de BAARO, plateforme sociale internationale. Tutoie, chaleureux, 3 à 6 phrases. Langue de l'utilisateur, français par défaut. N'invente jamais de fonction, montant ou date.`;
function buildSystem(customSystem, mode, context) {
  let s = BAARO_ASSISTANT_BASE;
  if (customSystem?.trim()) s += `\n\nConsignes app: ${String(customSystem).trim()}`;
  if (context?.display_name) s += `\nUtilisateur: ${String(context.display_name).slice(0, 100)}`;
  if (context?.language) s += `\nLangue: ${String(context.language).slice(0, 20)}`;
  if (mode === "cohost") s += "\nCo-animatrice live, 1 à 3 phrases max.";
  return s.slice(0, 12000);
}
async function loadCountry(admin, userId) {
  try { const { data } = await admin.from("profiles").select("country, language").eq("id", userId).maybeSingle(); return data || {}; } catch { return {}; }
}
async function callAnthropic({ apiKey, messages, system, maxTokens }) {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST", headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: claudeModel(), max_tokens: maxTokens, system, messages: ensureFirstUser(messages) }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(d.error?.message || "Erreur Anthropic"), { status: r.status });
  return { reply: d.content?.find(c => c.type === "text")?.text || d.content?.[0]?.text || "...", raw: d };
}
async function callN8n({ url, secret, sessionId, payload }) {
  const r = await fetch(url, {
    method: "POST", headers: { "Content-Type": "application/json", "X-Session-Id": sessionId,...(secret? { "X-N8N-Secret": secret } : {}) },
    body: JSON.stringify(payload),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(d.error || "Erreur n8n"), { status: r.status });
  return { reply: d.reply || d.content?.[0]?.text || "...", raw: d, sessionId: d.sessionId || sessionId, provider: d.provider || "n8n" };
}
async function invokeProvider(provider, ctx) {
  const { normalizedMessages, system, maxTokens, sessionId, country, profile, mode, publicModel } = ctx;
  if (provider === "n8n") {
    return callN8n({
      url: process.env.N8N_BAARO_WEBHOOK_URL, secret: process.env.N8N_WEBHOOK_SECRET, sessionId,
      payload: { messages: normalizedMessages, context: { country, user_id: ctx.userId, language: profile.language || null }, max_tokens: maxTokens, mode: mode || "default", system, model: publicModel || process.env.BAARO_AI_MODEL || null, provider, sessionId },
    });
  }
  if (provider === "anthropic") return callAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY, messages: normalizedMessages, system, maxTokens });
  const cfg = providerConfig(provider);
  if (!cfg?.key ||!cfg?.base) throw Object.assign(new Error(`Provider ${provider} mal configuré`), { status: 503 });
  const list = String(process.env[provider.toUpperCase() + "_MODELS"] || "").split(",").map(x => x.trim()).filter(Boolean);
  const clean = m => String(m || "").replace(/["'\s]/g, "").replace(/^models\//, "");
  const models = (publicModel? [publicModel] : list.length? list : [cfg.model]).map(clean).filter(Boolean);
  let lastErr;
  for (const model of models) {
    try { return await callOpenAICompatible({ base: cfg.base, key: cfg.key, model, messages: normalizedMessages, system, maxTokens }); }
    catch (e) { lastErr = e; if (e?.status === 401 || e?.status === 403) break; }
  }
  throw lastErr;
}

// ============== HANDLERS ==============
const RATE_LIMIT_DEBATE_MS = 20000;
const lastDebateCall = new Map();

async function handleAiRouting(req, res) {
  if (req.method!== "GET") return res.status(405).json({ error: "Méthode non autorisée" });
  const country = normalizeCountry(req.query?.country || req.headers["x-baaro-country"]);
  const provider = chooseProvider({ country, requested: req.query?.provider });
  return res.status(200).json({ country, provider });
}

async function handleAiDebateLegacy(req, res, admin, user) {
  if (req.method!== "POST") return res.status(405).json({ error: "Méthode non autorisée" });
  if (!process.env.ANTHROPIC_API_KEY) return res.status(500).json({ error: "ANTHROPIC_API_KEY manquante" });
  const { roomId, question } = req.body || {};
  if (!roomId ||!question) return res.status(400).json({ error: "roomId et question requis" });
  const q = question.trim().slice(0, 800);
  const rateKey = `${user.id}:${roomId}`;
  if (lastDebateCall.has(rateKey) && Date.now() - lastDebateCall.get(rateKey) < RATE_LIMIT_DEBATE_MS) {
    return res.status(429).json({ error: "Attends quelques secondes" });
  }
  const { data: part } = await admin.from("debate_participants").select("user_id").eq("room_id", roomId).eq("user_id", user.id).is("left_at", null).maybeSingle();
  if (!part) return res.status(403).json({ error: "Tu n'es pas dans ce live" });
  const { data: room } = await admin.from("debate_rooms").select("*").eq("id", roomId).maybeSingle();
  if (!room || room.status === "ended") return res.status(400).json({ error: "Live introuvable ou terminé" });
  const { data: recent } = await admin.from("debate_messages").select("text, sender_type").eq("room_id", roomId).order("created_at", { ascending: false }).limit(12);
  const history = (recent || []).reverse().map(m => `${m.sender_type}: ${m.text}`).join("\n");
  const systemPrompt = `Assistant IA du débat BAARO "${room.title || "Débat"}". Sujet: ${room.topic || "non précisé"}. 2-5 phrases max.\n${history}`;
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST", headers: { "Content-Type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: claudeModel(), max_tokens: 600, system: systemPrompt, messages: [{ role: "user", content: q }] }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) return res.status(response.status).json({ error: data.error?.message || "Erreur Claude" });
  const replyText = data.content?.find(c => c.type === "text")?.text || data.content?.[0]?.text || "...";
  await admin.from("debate_messages").insert({ room_id: roomId, sender_id: null, sender_type: "ai", text: replyText });
  lastDebateCall.set(rateKey, Date.now());
  return res.status(200).json({ ok: true, reply: replyText });
}

async function handleAiGateway(req, res, admin, user) {
  const body = req.body || {};
  const { messages, context, max_tokens, mode, system: customSystem, model: requestedModel, provider: requestedProvider } = body;
  if (!Array.isArray(messages) || messages.length < 1 || messages.length > 30) {
    return res.status(400).json({ error: "messages doit contenir entre 1 et 30 éléments" });
  }
  const normalizedMessages = ensureFirstUser(messages.map(m => ({ role: m?.role === "assistant"? "assistant" : "user", content: String(m?.content?? m?.text?? "").slice(0, 8000) })));
  if (normalizedMessages.some(m =>!m.content.trim())) return res.status(400).json({ error: "Message vide" });
  const profile = await loadCountry(admin, user.id);
  const country = safeCountry(req, {...(context || {}), country: context?.country || profile.country });
  const maxTokens = safeMaxTokens(max_tokens);
  const system = buildSystem(customSystem, mode, {...(context || {}), language: context?.language || profile.language });
  const sessionId = String(req.headers["x-session-id"] || body.sessionId || `user-${user.id}`).slice(0, 160);
  const publicModel = requestedModel && requestedProvider? String(requestedModel).slice(0, 120) : undefined;
  const ctx = { normalizedMessages, system, maxTokens, sessionId, country, profile, mode, publicModel, userId: user.id };
  const start = Date.now(); const tried = []; let lastError = null; let result = null; let usedProvider = null;
  for (let i = 0; i < 4; i++) {
    const provider = chooseProvider({ country, requested: i === 0? requestedProvider || requestedModel : undefined, exclude: tried });
    if (!provider) break;
    if (isOpen(provider)) { tried.push(provider); logWarn("chat", `Circuit open ${provider}`, { userId: user.id }); continue; }
    tried.push(provider);
    try { result = await invokeProvider(provider, ctx); recordSuccess(provider); usedProvider = result.provider || provider; break; }
    catch (err) { lastError = err; recordFailure(provider); logWarn("chat", `Provider ${provider} failed`, { userId: user.id, status: err?.status, message: err?.message }); }
  }
  const latency = Date.now() - start;
  if (!result) { logError("chat", lastError || new Error("No provider"), { userId: user.id, country, tried }); return res.status(502).json({ error: "IA temporairement indisponible", tried }); }
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
  const mode = ["text", "audio", "video"].includes(body.mode)? body.mode : "video";
  const inviteCode = sanitizeRoomName(body.inviteCode || body.invite_code);
  const maxParticipants = Math.min(Math.max(Number(body.maxParticipants) || 12, 2), 50);
  let dailyRoomName = null; let dailyUrl = null;
  if (mode!== "text") {
    try { const room = await createDailyRoom(inviteCode, { maxParticipants }); dailyRoomName = room.name; dailyUrl = room.url || roomUrl(room.name); }
    catch (e) { logWarn("live", "Daily create-room failed", { message: e.message, userId: user.id }); }
  }
  logInfo("live", "create-room ok", { userId: user.id, inviteCode, dailyRoomName, mode });
  return res.status(200).json({ ok: true, roomName: dailyRoomName, daily_room_name: dailyRoomName, url: dailyUrl, inviteCode, title, topic, mode });
}

async function handleToken(req, res, user, admin) {
  const body = req.body || {};
  let liveId = String(body.liveId || body.roomName || body.inviteCode || "").trim();
  if (!liveId) return res.status(400).json({ error: "liveId requis" });

  // Sécurité: sanitize
  liveId = liveId.slice(0, 100);

  if (liveId.startsWith("call-")) {
    const safeName = sanitizeRoomName(liveId);
    const { data: call } = await admin.from("calls").select("caller_id, callee_id, daily_room_name").eq("daily_room_name", safeName).maybeSingle();
    if (!call) return res.status(404).json({ error: "Appel introuvable" });
    if (call.caller_id!== user.id && call.callee_id!== user.id) return res.status(403).json({ error: "Tu ne fais pas partie de cet appel" });
    try { await createDailyRoom(safeName, { maxParticipants: 2 }); } catch {}
    const isCaller = call.caller_id === user.id;
    const callToken = await createMeetingToken(safeName, { userId: user.id, userName: body.userName || "BAARO", isOwner: isCaller });
    return res.status(200).json({ ok: true, token: callToken, roomName: safeName, url: roomUrl(safeName), isOwner: isCaller });
  }

  // Live normal - recherche sécurisée sans.or() injectable
  const invite = liveId.toLowerCase().slice(0, 40);
  let room = null;

  // 1. Cherche par invite_code
  const { data: byInvite } = await admin.from("debate_rooms").select("*").eq("invite_code", invite).maybeSingle();
  if (byInvite) room = byInvite;

  // 2. Sinon par daily_room_name
  if (!room) {
    const { data: byDaily } = await admin.from("debate_rooms").select("*").eq("daily_room_name", liveId).maybeSingle();
    if (byDaily) room = byDaily;
  }

  // 3. Sinon par id si UUID
  if (!room && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(liveId)) {
    const { data: byId } = await admin.from("debate_rooms").select("*").eq("id", liveId).maybeSingle();
    if (byId) room = byId;
  }

  if (!room || room.status === "ended") return res.status(404).json({ error: "Live introuvable ou terminé" });

  const isHost = room.host_id === user.id;
  if (!isHost) {
    const { data: part } = await admin.from("debate_participants").select("user_id").eq("room_id", room.id).eq("user_id", user.id).is("left_at", null).maybeSingle();
    if (!part) return res.status(403).json({ error: "Tu n'es pas participant" });
  }

  const roomName = room.daily_room_name || sanitizeRoomName(room.invite_code || liveId);
  try { await createDailyRoom(roomName); } catch (e) { logWarn("live", "ensure room", { message: e.message }); }
  if (!room.daily_room_name) await admin.from("debate_rooms").update({ daily_room_name: roomName }).eq("id", room.id);

  const token = await createMeetingToken(roomName, { userId: user.id, userName: body.userName || (isHost? "Hôte" : "Participant"), isOwner: isHost });
  return res.status(200).json({ ok: true, token, roomName, url: roomUrl(roomName), isOwner: isHost });
}

// ============== MAIN - ORDRE FIXÉ ==============
export default async function handler(req, res) {
  if (applyCors(req, res)) return;

  const urlPath = (req.url || "").split("?")[0].toLowerCase();
  const isRouting = req.method === "GET" && (urlPath.includes("ai-routing") || urlPath.includes("routing"));

  const rateKey = isRouting? "ai-routing" : (urlPath.includes("live") || urlPath.includes("create-room") || req.body?.liveId || req.body?.roomName)? "live" : "chat";
  const limit = await rateLimitAsync(req, { key: rateKey, max: rateKey === "chat"? 20 : 30, windowMs: 60000 });
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
    // GET /api/ai-routing
    if (isRouting) return await handleAiRouting(req, res);

    const body = req.body || {};

    // PRIORITÉ 1: AI Gateway (messages array) - DOIT être avant token
    if (Array.isArray(body.messages)) {
      return await handleAiGateway(req, res, admin, user);
    }

    // PRIORITÉ 2: Legacy debate
    if (body.roomId && body.question) {
      return await handleAiDebateLegacy(req, res, admin, user);
    }

    // PRIORITÉ 3: Tout le reste = Daily Live (token, create-room, roles)
    const action = String(body.action || "").toLowerCase();
    if (action === "create-room" || action === "create_room" || urlPath.includes("create-room")) {
      return await handleCreateRoom(req, res, user, admin);
    }

    if (action === "roles" || urlPath.includes("live-roles")) {
      return res.status(200).json({ ok: true, message: "Utilise les RPC Supabase pour les rôles" });
    }

    // Par défaut = token Daily
    return await handleToken(req, res, user, admin);

  } catch (err) {
    logError(rateKey, err, { userId: user?.id });
    return res.status(err.status || 500).json({ error: err.message || "Erreur serveur" });
  }
}
