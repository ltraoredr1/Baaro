export async function callOpenAICompatible({ base, key, model, messages, system, maxTokens, headers = {} }) {
  if (!base ||!key ||!model) throw new Error("Provider IA mal configuré");

  const isGemini = model.includes("gemini") || String(base).includes("generativelanguage");

  // --- GEMINI 3.8 ---
  if (isGemini) {
    const cleanBase = String(base).replace(/\/$/, "").replace(/\/v1beta$/, "").replace(/\/v1$/, "");
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;

    const contents = [
     ...(system? [{ role: "user", parts: [{ text: `SYSTEM: ${system}` }] }, { role: "model", parts: [{ text: "Compris." }] }] : []),
     ...messages.filter(m => m.role!== "system").map(m => ({
        role: m.role === "assistant"? "model" : "user",
        parts: [{ text: m.content }]
      }))
    ];

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents,
        generationConfig: { maxOutputTokens: maxTokens || 1024, temperature: 0.7 }
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw Object.assign(new Error(data?.error?.message || "Gemini indisponible"), { status: response.status });
    }
    return {
      reply: data.candidates?.[0]?.content?.parts?.[0]?.text || "Désolé, je n'ai pas pu générer une réponse.",
      raw: data,
    };
  }

  // --- OPENAI COMPATIBLE (Groq etc) ---
  const url = `${String(base).replace(/\/$/, "")}/chat/completions`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}`,...headers },
    body: JSON.stringify({ model, messages: [{ role: "system", content: system },...messages], max_tokens: maxTokens }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const e0 = Array.isArray(data)? data[0] : data;
    throw Object.assign(new Error(e0?.error?.message || e0?.message || "Provider IA indisponible"), { status: response.status });
  }
  return {
    reply: data.choices?.[0]?.message?.content || data.output_text || "Désolé, je n'ai pas pu générer une réponse.",
    raw: data,
  };
}
