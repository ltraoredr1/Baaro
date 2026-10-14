export async function callOpenAICompatible({ key, model, messages, system, maxTokens }) {
  const activeModel = model || process.env.GEMINI_MODEL || "gemini-3.8-flash";
  const apiKey = key || process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw Object.assign(new Error("GEMINI_API_KEY manquante côté serveur"), { status: 503 });
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${activeModel}:generateContent?key=${apiKey}`;

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
    throw Object.assign(new Error(data?.error?.message || "Erreur Gemini"), { status: response.status });
  }

  const reply = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!reply) {
    throw Object.assign(new Error("Réponse vide reçue de Gemini"), { status: 502 });
  }

  return { reply, raw: data };
}
