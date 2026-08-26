export async function callOpenAICompatible({ base, key, model, messages, system, maxTokens, headers = {} }) {
  if (!base || !key || !model) throw new Error("Provider IA mal configuré");
  const url = `${String(base).replace(/\/$/, "")}/chat/completions`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}`, ...headers },
    body: JSON.stringify({ model, messages: [{ role: "system", content: system }, ...messages], max_tokens: maxTokens }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(data.error?.message || data.message || "Provider IA indisponible"), { status: response.status });
  return {
    reply: data.choices?.[0]?.message?.content || data.output_text || "Désolé, je n'ai pas pu générer une réponse.",
    raw: data,
  };
}
