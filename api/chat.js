// api/chat.js – BAARO AI v5
// Grok | Claude | GPT | Gemini via n8n (si N8N_BAARO_WEBHOOK_URL)
// Sinon fallback Claude direct

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Session-Id");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Méthode non autorisée" });

  const body = req.body || {};
  const { messages, context, max_tokens, mode, system: customSystem, model: bodyModel } = body;

  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: "messages doit être un tableau non vide" });
  }

  const allowed = ["grok", "claude", "gpt", "gemini"];
  const model = allowed.includes((bodyModel || process.env.BAARO_AI_MODEL || "grok").toLowerCase())
    ? (bodyModel || process.env.BAARO_AI_MODEL || "grok").toLowerCase()
    : "grok";

  const n8nUrl = process.env.N8N_BAARO_WEBHOOK_URL;

  if (n8nUrl) {
    try {
      const sessionId =
        req.headers["x-session-id"] ||
        body.sessionId ||
        context?.user_id ||
        context?.handle ||
        `session-\( {Date.now()}- \){Math.random().toString(36).slice(2, 9)}`;

      const response = await fetch(n8nUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Session-Id": sessionId,
          ...(process.env.N8N_WEBHOOK_SECRET ? { "X-N8N-Secret": process.env.N8N_WEBHOOK_SECRET } : {}),
        },
        body: JSON.stringify({
          messages,
          context: context || {},
          max_tokens: max_tokens || 1200,
          mode: mode || "default",
          system: customSystem || null,
          model,
          sessionId,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        return res.status(response.status).json({ error: data.error || data.message || "Erreur agent n8n" });
      }

      const replyText =
        data.reply ||
        data.content?.[0]?.text ||
        data.content?.find?.((c) => c.type === "text")?.text ||
        "Désolé, je n'ai pas pu générer une réponse.";

      res.setHeader("X-Session-Id", data.sessionId || sessionId);
      return res.status(200).json({
        ...data,
        reply: replyText,
        sessionId: data.sessionId || sessionId,
        model: data.model || model,
        provider: data.provider || "n8n",
      });
    } catch (err) {
      return res.status(500).json({ error: "Erreur serveur n8n" });
    }
  }

  // Fallback Claude
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "Ni N8N_BAARO_WEBHOOK_URL ni ANTHROPIC_API_KEY configurés" });
  }

  try {
    const safeMaxTokens = Math.min(Number(max_tokens) || 1200, 2000);
    let systemPrompt =
      customSystem ||
      `Tu es l'assistant officiel de BAARO. Réponds toujours en français, de façon claire et utile.`;

    if (context && typeof context === "object") {
      systemPrompt += `\nContexte: \( {context.display_name || "Membre"}, points= \){context.points ?? 0}`;
    }
    if (mode === "cohost") {
      systemPrompt += `\nTu es co-animatrice d'un live. 1 à 3 phrases max.`;
    }

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: safeMaxTokens,
        system: systemPrompt,
        messages: messages.map((m) => ({
          role: m.role === "assistant" ? "assistant" : "user",
          content: typeof m.content === "string" ? m.content : m.text || "",
        })),
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      return res.status(response.status).json({ error: data.error?.message || "Erreur Claude" });
    }

    const replyText =
      data.content?.[0]?.text ||
      data.content?.find?.((c) => c.type === "text")?.text ||
      "Désolé, je n'ai pas pu générer une réponse.";

    return res.status(200).json({ ...data, reply: replyText, provider: "anthropic-direct" });
  } catch (err) {
    return res.status(500).json({ error: "Erreur serveur" });
  }
}
