export async function callOpenAICompatible({ key, base, model, messages, system, maxTokens }) {
  const apiKey = key || process.env.GEMINI_API_KEY || process.env.API_KEY;
  if (!apiKey) {
    throw Object.assign(new Error("Clé API manquante côté serveur"), { status: 503 });
  }

  // Détecte si l'on utilise un fournisseur OpenAI-compatible (Groq, Mistral, etc.) ou Gemini natif
  const isGenericOpenAI = base && !base.includes("generativelanguage.googleapis.com");

  if (isGenericOpenAI) {
    // Format standard OpenAI / Groq / Mistral
    const formattedMessages = [];
    if (system) {
      formattedMessages.push({ role: "system", content: system });
    }
    for (const m of messages) {
      if (m.role === "system") continue;
      formattedMessages.push({
        role: m.role === "assistant" ? "assistant" : "user",
        content: String(m.content || "")
      });
    }

    // Sélection du modèle avec fallback mis à jour (Fin de llama-3.3-70b-versatile en dur)
    const activeModel = model || process.env.GROQ_MODEL || "llama-3.1-8b-instruct";

    const url = `${base.replace(/\/+$/, "")}/chat/completions`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: activeModel,
        messages: formattedMessages,
        max_tokens: maxTokens || 1200,
        temperature: 0.7
      }),
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      const err = new Error(data?.error?.message || `Erreur fournisseur (${response.status})`);
      err.status = response.status >= 500 ? 502 : response.status;
      throw err;
    }

    const reply = data.choices?.[0]?.message?.content;
    if (!reply) {
      throw Object.assign(new Error("Réponse vide du fournisseur"), { status: 502 });
    }

    return { reply, raw: data, modelUsed: activeModel };
  }

  // --- COMPORTEMENT NATIF GEMINI (Si aucun base URL tiers n'est fourni) ---
  const modelsEnv = process.env.GEMINI_MODELS || model || process.env.GEMINI_MODEL || "gemini-2.5-flash-lite,gemini-2.5-flash";
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

  throw Object.assign(lastError || new Error("Service IA temporairement surchargé. Réessayez dans un instant."), { status: 503 });
}
