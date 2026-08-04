// api/debate-ai.js
// IA accessible à TOUS les participants d'un débat live.
// La réponse est écrite en base avec sender_type = 'ai' (service_role).

import { getAdminClient, requireUser } from "./_supabaseAdmin.js";

const RATE_LIMIT_MS = 20000;
const lastCall = new Map();

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Méthode non autorisée" });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "ANTHROPIC_API_KEY manquante côté serveur" });
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

  const { roomId, question } = req.body || {};
  if (!roomId || !question || typeof question !== "string") {
    return res.status(400).json({ error: "roomId et question sont requis" });
  }

  const q = question.trim().slice(0, 800);
  if (!q) {
    return res.status(400).json({ error: "Question vide" });
  }

  const rateKey = user.id + ":" + roomId;
  const now = Date.now();
  if (lastCall.has(rateKey) && now - lastCall.get(rateKey) < RATE_LIMIT_MS) {
    return res.status(429).json({
      error: "Attends quelques secondes avant de reposer une question à l'IA",
    });
  }

  try {
    const { data: part } = await admin
      .from("debate_participants")
      .select("user_id")
      .eq("room_id", roomId)
      .eq("user_id", user.id)
      .is("left_at", null)
      .maybeSingle();

    if (!part) {
      return res.status(403).json({ error: "Tu n'es pas dans ce live" });
    }

    const { data: room } = await admin
      .from("debate_rooms")
      .select("id, title, topic, status, ai_enabled")
      .eq("id", roomId)
      .maybeSingle();

    if (!room || room.status !== "active") {
      return res.status(400).json({ error: "Live introuvable ou terminé" });
    }

    if (room.ai_enabled === false) {
      return res.status(400).json({ error: "L'IA est désactivée sur ce live" });
    }

    const { data: recent } = await admin
      .from("debate_messages")
      .select("text, sender_type, created_at")
      .eq("room_id", roomId)
      .order("created_at", { ascending: false })
      .limit(12);

    const history = (recent || [])
      .reverse()
      .map(function (m) {
        var who =
          m.sender_type === "ai"
            ? "IA"
            : m.sender_type === "system"
              ? "Système"
              : "Participant";
        return who + ": " + m.text;
      })
      .join("\n");

    var systemPrompt =
      "Tu es l'assistant IA du débat live BAARO intitulé « " +
      (room.title || "Débat") +
      " ».\n" +
      "Sujet : " +
      (room.topic || "non précisé") +
      ".\n" +
      "Tu aides TOUS les participants : réponses, confirmations factuelles, recherches, nuances.\n" +
      "Réponds en français, de façon claire, neutre et concise (2 à 5 phrases max).\n" +
      "Si tu n'es pas sûr d'un fait, dis-le explicitement.\n" +
      "Ne prends pas parti de façon agressive ; reste utile au débat.\n\n" +
      "Extraits récents du chat :\n" +
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
      console.error("Erreur Anthropic:", data);
      return res.status(response.status).json({
        error: data.error?.message || "Erreur lors de l'appel à Claude",
      });
    }

    const replyText =
      (data.content && data.content[0] && data.content[0].text) ||
      (data.content &&
        data.content.find &&
        data.content.find(function (c) {
          return c.type === "text";
        }) &&
        data.content.find(function (c) {
          return c.type === "text";
        }).text) ||
      "Désolé, je n'ai pas pu générer une réponse.";

    const { error: insErr } = await admin.from("debate_messages").insert({
      room_id: roomId,
      sender_id: null,
      sender_type: "ai",
      text: replyText,
    });

    if (insErr) {
      console.error("Insert AI msg:", insErr);
    }

    lastCall.set(rateKey, now);

    return res.status(200).json({
      ok: true,
      reply: replyText,
    });
  } catch (err) {
    console.error("Erreur /api/debate-ai :", err);
    return res.status(500).json({ error: "Erreur serveur lors de l'appel à Claude" });
  }
      }
