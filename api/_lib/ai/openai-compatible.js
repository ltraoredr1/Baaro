export async function callOpenAICompatible({ key, model, messages, system, maxTokens }) {
  const apiKey = key || process.env.GEMINI_API_KEY || process.env.API_KEY;
  if (!apiKey) {
    throw Object.assign(new Error("GEMINI_API_KEY manquante côté serveur"), { status: 503 });
  }

  // Liste de secours ordonnée : si le 1er bloque, on essaie le 2ème, puis le 3ème
  const modelsEnv = process.env.GEMINI_MODELS || model || process.env.GEMINI_MODEL || "gemini-3.8-flash,gemini-3.5-flash-lite,gemini-3.1-flash-lite";
  const modelList = modelsEnv.split(",").map(m => m.trim()).filter(Boolean);

  let lastError = null;

  const contents = [];
  if (system) {
    contents.push({ role: "user", parts: [{ text: `System: ${system}` }] });
    contents.push({ role: "model", parts: [{ text: "Compris." }] });
  }

  for (const m of messages) {
    if (m.role === "system") continue;
    contents.push({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: String(m.content || "") }]
    });
  }

  // Boucle de sécurité : essaie chaque modèle de la liste l'un après l'autre
  for (const currentModel of modelList) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${currentModel}:generateContent?key=${apiKey}`;

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents,
          generationConfig: { maxOutputTokens: maxTokens || 1200, temperature: 0.7 }
        }),
      });

      const data = await response.json().catch(() => ({}));

      if (response.ok) {
        const reply = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (reply) {
          return { reply, raw: data, modelUsed: currentModel };
        }
      }

      // Si l'API renvoie une erreur (ex: 429 trop de requêtes ou 503), on enregistre et on teste le modèle suivant
      lastError = new Error(data?.error?.message || `Erreur ${currentModel} (${response.status})`);
      lastError.status = response.status;
    } catch (err) {
      lastError = err;
    }
  }

  // Uniquement si TOUS les modèles de la liste ont échoué en même temps
  throw Object.assign(lastError || new Error("Service IA temporairement surchargé. Réessayez dans un instant."), { status: 503 });
}
