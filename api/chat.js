// api/chat.js
// Proxy sécurisé vers Claude (Anthropic).
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
    const { messages, context, max_tokens, mode, system: customSystem } = req.body || {};

    // Validation
    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: "messages doit être un tableau non vide" });
    }

    // Limite de sécurité
    const safeMaxTokens = Math.min(Number(max_tokens) || 1200, 2000);

    // System prompt de base
    let systemPrompt = customSystem || `Tu es l'assistant officiel de BAARO, un réseau social mondial avec portefeuille de points, crypto interne BARO Coin, messagerie chiffrée et débats live.
Tu es bienveillant, concis, actionnable et expert en engagement communautaire.
Réponds toujours en français, de façon claire, motivante et utile.
Tu peux proposer des actions concrètes (créer un débat, publier, gagner des points, etc.).`;

    // Ajout du contexte utilisateur si fourni
    if (context && typeof context === "object") {
      systemPrompt += `\n\nContexte utilisateur actuel :
- Nom : ${context.display_name || "Membre"}
- Handle : ${context.handle || "non renseigné"}
- Solde points : ${context.points ?? 0}
- Solde BARO : ${context.baro ?? 0}
- Bio : ${context.bio || "non renseignée"}
- Débats récents : ${context.recent_debates || "aucun"}`;
    }

    // Mode spécial "co-animatrice" pour les débats
    if (mode === "cohost") {
      systemPrompt += `\n\nTu es actuellement la co-animatrice IA d'un débat live.
Sois dynamique, pose des questions pertinentes, relance le débat, félicite les bons arguments et reste neutre.
Réponds en 1 à 3 phrases maximum pour ne pas monopoliser le chat.`;
    }

    // Appel à Anthropic
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
      console.error("Erreur Anthropic:", data);
      return res.status(response.status).json({
        error: data.error?.message || "Erreur lors de l'appel à Claude",
      });
    }

    // Format de réponse unifié (compatible avec l'ancien et le nouveau code)
    const replyText =
      data.content?.[0]?.text ||
      data.content?.find?.((c) => c.type === "text")?.text ||
      "Désolé, je n'ai pas pu générer une réponse.";

    return res.status(200).json({
      ...data,
      reply: replyText,
    });
  } catch (err) {
    console.error("Erreur /api/chat :", err);
    return res.status(500).json({ error: "Erreur serveur lors de l'appel à Claude" });
  }
}
