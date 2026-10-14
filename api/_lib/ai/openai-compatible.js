export async function callOpenAICompatible({ base, key, model, messages, system, maxTokens, headers = {} }) {
  if (!base || !key || !model) throw new Error("Provider IA mal configuré");

  const isGemini = model.includes("gemini") || String(base).includes("generativelanguage");

  // --- GEMINI ---
  if (isGemini) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;

    // Nettoyage et structuration des messages pour l'API native Gemini
    const contents = [];
    if (system) {
      contents.push({ role: "user", parts: [{ text: `Instructions système : ${system}` }] });
      contents.push({ role: "model", parts: [{ text: "Compris. Je respecte ces instructions." }] });
    }

    for (const m of messages) {
      if (m.role === "system") continue;
      contents.push({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: String(m.content || "") }]
      });
    }

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents,
        generationConfig: { maxOutputTokens: maxTokens || 1200, temperature: 0.7 }
      }),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const errorMsg = data?.error?.message || `Erreur Gemini (${response.status})`;
      throw Object.assign(new Error(errorMsg), { status: response.status });
    }

    const reply = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!reply) {
      throw Object.assign(new Error("Réponse vide reçue de Gemini"), { status: 502 });
    }

    return { reply, raw: data };
  }

  // --- OPENAI COMPATIBLE (Groq, Mistral, etc.) ---
  const cleanBase = String(base).replace(/\/$/, "");
  const url = `${cleanBase}/chat/completions`;
  
  const formattedMessages = [
    ...(system ? [{ role: "system", content: system }] : []),
    ...messages.map(m => ({ role: m.role, content: String(m.content || "") }))
  ];

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}`, ...headers },
    body: JSON.stringify({ model, messages: formattedMessages, max_tokens: maxTokens || 1200 }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const e0 = Array.isArray(data) ? data[0] : data;
    const errorMsg = e0?.error?.message || e0?.message || `Erreur fournisseur (${response.status})`;
    throw Object.assign(new Error(errorMsg), { status: response.status });
  }

  const reply = data.choices?.[0]?.message?.content || data.output_text;
  if (!reply) {
    throw Object.assign(new Error("Réponse vide reçue du fournisseur"), { status: 502 });
  }

  return { reply, raw: data };
}
