// api/chat.js
// Proxy sécurisé vers l'API Anthropic (Claude).
// La clé ANTHROPIC_API_KEY ne quitte jamais le serveur.

export default async function handler(req, res) {
  // CORS
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

  try {
    const { system, messages, max_tokens } = req.body || {};

    // Validation basique
    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: "messages doit être un tableau non vide" });
    }

    // Limite de sécurité (évite les abus de tokens)
    const safeMaxTokens = Math.min(Number(max_tokens) || 1000, 2000);

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514", // modèle stable recommandé
        max_tokens: safeMaxTokens,
        system: system || "Tu es l'assistant de BAARO, un réseau social engagé et bienveillant.",
        messages,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("Erreur Anthropic:", data);
      return res.status(response.status).json({
        error: data.error?.message || "Erreur lors de l'appel à Claude",
      });
    }

    return res.status(200).json(data);
  } catch (err) {
    console.error("Erreur /api/chat :", err);
    return res.status(500).json({ error: "Erreur serveur lors de l'appel à Claude" });
  }
}
