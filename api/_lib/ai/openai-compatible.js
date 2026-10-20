/**
 * Appel Gemini avec gestion des fallbacks multi-modèles (Cascade)
 */
export async function callOpenAICompatible({ key, model, messages, system, maxTokens }) {
  const apiKey = key || process.env.GEMINI_API_KEY || process.env.API_KEY;
  if (!apiKey) {
    throw Object.assign(new Error("GEMINI_API_KEY manquante côté serveur"), { status: 503 });
  }

  // Liste de modèles de repli (fallback ordonné)
  const modelsEnv = process.env.GEMINI_MODELS || model || process.env.GEMINI_MODEL || "gemini-2.5-flash,gemini-2.0-flash,gemini-1.5-flash";
  const modelList = modelsEnv.split(",").map(m => m.trim()).filter(Boolean);

  let lastError = null;

  // Préparation de la structure des messages pour Gemini REST API
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

  // Boucle de bascule automatique d'un modèle à l'autre en cas d'erreur
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

      lastError = new Error(data?.error?.message || `Erreur ${currentModel} (${response.status})`);
      lastError.status = response.status;
    } catch (err) {
      lastError = err;
    }
  }

  throw Object.assign(lastError || new Error("Tous les modèles Gemini sont temporairement indisponibles"), { status: 503 });
}
