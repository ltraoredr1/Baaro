import { getAdminClient, requireUser } from "./_supabaseAdmin.js";
import { applyCors } from "./_cors.js";
import { chooseProvider, normalizeCountry } from "./ai/router.js";

const RATE_LIMIT_MS = 20000;
const lastCall = new Map();

async function handleRouting(req, res) {
  if (req.method !== "GET")
    return res.status(405).json({ error: "Méthode non autorisée" });
  let user;
  try {
    user = await requireUser(req);
  } catch (e) {
    return res.status(e.status || 401).json({ error: e.message });
  }
  const country = normalizeCountry(
    req.query?.country || req.headers["x-baaro-country"]
  );
  const provider = chooseProvider({
    country,
    requested: req.query?.provider,
  });
  return res.status(200).json({ country, provider });
}

async function handleDebate(req, res) {
  if (req.method !== "POST")
    return res.status(405).json({ error: "Méthode non autorisée" });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey)
    return res.status(500).json({ error: "ANTHROPIC_API_KEY manquante côté serveur" });

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

  const { roomId, question } = req.body || {};
  if (!roomId || !question || typeof question !== "string") {
    return res.status(400).json({ error: "roomId et question sont requis" });
  }
  const q = question.trim().slice(0, 800);
  if (!q) return res.status(400).json({ error: "Question vide" });

  const rateKey = user.id + ":" + roomId;
  const now = Date.now();
  if (lastCall.has(rateKey) && now - lastCall.get(rateKey) < RATE_LIMIT_MS) {
    return res.status(429).json({
      error: "Attends quelques secondes avant de reposer une question à l'IA",
    });
  }

  const { data: part } = await admin
    .from("debate_participants")
    .select("user_id")
    .eq("room_id", roomId)
    .eq("user_id", user.id)
    .is("left_at", null)
    .maybeSingle();
  if (!part)
    return res.status(403).json({ error: "Tu n'es pas dans ce live" });

  const { data: room } = await admin
    .from("debate_rooms")
    .select("id, title, topic, status, ai_enabled")
    .eq("id", roomId)
    .maybeSingle();
  if (!room || room.status !== "active")
    return res.status(400).json({ error: "Live introuvable ou terminé" });
  if (room.ai_enabled === false)
    return res.status(400).json({ error: "L'IA est désactivée sur ce live" });

  const { data: recent } = await admin
    .from("debate_messages")
    .select("text, sender_type, created_at")
    .eq("room_id", roomId)
    .order("created_at", { ascending: false })
    .limit(12);

  const history = (recent || [])
    .reverse()
    .map((m) => {
      const who =
        m.sender_type === "ai"
          ? "IA"
          : m.sender_type === "system"
            ? "Système"
            : "Participant";
      return who + ": " + m.text;
    })
    .join("\n");

  const systemPrompt =
    "Tu es l'assistant IA du débat live BAARO intitulé « " +
    (room.title || "Débat") +
    " ».\nSujet : " +
    (room.topic || "non précisé") +
    ".\nTu aides TOUS les participants. Réponds en français, clair et concis (2 à 5 phrases).\n\nExtraits récents :\n" +
    (history || "(aucun message encore)");

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 600,
      system: systemPrompt,
      messages: [{ role: "user", content: q }],
    }),
  });
  const data = await response.json();
  if (!response.ok) {
    return res.status(response.status).json({
      error: data.error?.message || "Erreur lors de l'appel à Claude",
    });
  }

  const replyText =
    data.content?.find?.((c) => c.type === "text")?.text ||
    data.content?.[0]?.text ||
    "Désolé, je n'ai pas pu générer une réponse.";

  await admin.from("debate_messages").insert({
    room_id: roomId,
    sender_id: null,
    sender_type: "ai",
    text: replyText,
  });
  lastCall.set(rateKey, now);
  return res.status(200).json({ ok: true, reply: replyText });
}

export default async function handler(req, res) {
  if (applyCors(req, res)) return;
  const path = (req.url || "").split("?")[0];
  try {
    if (req.method === "GET" || path.includes("ai-routing")) {
      return await handleRouting(req, res);
    }
    return await handleDebate(req, res);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Erreur serveur" });
  }
    }
