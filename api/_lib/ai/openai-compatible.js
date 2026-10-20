/**
 * BAARO AI — Client OpenAI-compatible + Gemini natif
 * Fournisseurs : Groq, Mistral, Gemini
 */

const GROQ_DEFAULT_MODEL = "openai/gpt-oss-20b";
const MISTRAL_DEFAULT_MODEL = "ministral-3b-latest";
const GEMINI_DEFAULT_MODEL = "gemini-2.5-flash-lite";

function parseModelList(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function getGenericDefaultModel(base) {
  const host = String(base || "").toLowerCase();

  if (host.includes("api.groq.com")) {
    return GROQ_DEFAULT_MODEL;
  }

  if (host.includes("api.mistral.ai")) {
    return MISTRAL_DEFAULT_MODEL;
  }

  return null;
}

function httpError(message, status) {
  return Object.assign(new Error(message), {
    status: status >= 500 ? 502 : status,
  });
}

export async function callOpenAICompatible({
  key,
  base,
  model,
  messages,
  system,
  maxTokens,
}) {
  const isGemini = String(base || "").includes(
    "generativelanguage.googleapis.com"
  );

  const apiKey = key || (isGemini ? process.env.GEMINI_API_KEY : null);

  if (!apiKey) {
    throw Object.assign(
      new Error("Clé API manquante pour le fournisseur IA"),
      { status: 503 }
    );
  }

  if (!Array.isArray(messages) || messages.length === 0) {
    throw Object.assign(
      new Error("Messages IA invalides"),
      { status: 400 }
    );
  }

  const tokenLimit = Math.min(
    Math.max(Number(maxTokens) || 1200, 1),
    2000
  );

  // ============== GROQ / MISTRAL / OPENAI-COMPATIBLE ==============

  if (base && !isGemini) {
    const activeModel =
      String(model || "").trim() ||
      getGenericDefaultModel(base);

    if (!activeModel) {
      throw Object.assign(
        new Error("Modèle IA non configuré pour ce fournisseur"),
        { status: 503 }
      );
    }

    const formattedMessages = [];

    if (system) {
      formattedMessages.push({
        role: "system",
        content: String(system),
      });
    }

    for (const message of messages) {
      if (message.role === "system") continue;

      formattedMessages.push({
        role: message.role === "assistant" ? "assistant" : "user",
        content: String(message.content ?? ""),
      });
    }

    const url =
      `${String(base).replace(/\/+$/, "")}/chat/completions`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: activeModel,
        messages: formattedMessages,
        max_tokens: tokenLimit,
        temperature: 0.7,
      }),
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw httpError(
        data?.error?.message ||
          `Erreur du fournisseur IA (${response.status})`,
        response.status
      );
    }

    const reply = data?.choices?.[0]?.message?.content;

    if (typeof reply !== "string" || !reply.trim()) {
      throw Object.assign(
        new Error("Réponse vide du fournisseur IA"),
        { status: 502 }
      );
    }

    return {
      reply: reply.trim(),
      raw: data,
      modelUsed: activeModel,
    };
  }

  // ============== GEMINI NATIF ==============

  const configuredModels = model
    ? [String(model).trim()]
    : parseModelList(
        process.env.GEMINI_MODEL ||
          process.env.GEMINI_MODELS
      );

  const modelList = [
    ...new Set(
      [
        ...configuredModels,
        GEMINI_DEFAULT_MODEL,
        "gemini-2.5-flash",
      ].filter(Boolean)
    ),
  ];

  const contents = [];

  for (const message of messages) {
    if (message.role === "system") continue;

    contents.push({
      role: message.role === "assistant" ? "model" : "user",
      parts: [{ text: String(message.content ?? "") }],
    });
  }

  const generationConfig = {
    maxOutputTokens: tokenLimit,
    temperature: 0.7,
  };

  let lastError = null;

  for (const currentModel of modelList) {
    const url =
      `https://generativelanguage.googleapis.com/v1beta/models/` +
      `${encodeURIComponent(currentModel)}:generateContent`;

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify({
          ...(system
            ? { systemInstruction: { parts: [{ text: String(system) }] } }
            : {}),
          contents,
          generationConfig,
        }),
      });

      const data = await response.json().catch(() => ({}));

      if (response.ok) {
        const reply = data?.candidates?.[0]?.content?.parts
          ?.map((part) => part.text || "")
          .join("")
          .trim();

        if (reply) {
          return {
            reply,
            raw: data,
            modelUsed: currentModel,
          };
        }

        lastError = Object.assign(
          new Error("Gemini n'a retourné aucun texte"),
          { status: 502 }
        );

        continue;
      }

      lastError = httpError(
        data?.error?.message ||
          `Erreur Gemini ${currentModel} (${response.status})`,
        response.status
      );

      // Un modèle absent ou inaccessible peut être remplacé.
      // Une erreur d'authentification ne sera pas résolue
      // par un changement de modèle.
      if (
        response.status === 401 ||
        response.status === 403 ||
        response.status === 429
      ) {
        throw lastError;
      }
    } catch (error) {
      lastError = error;

      if (
        error.status === 401 ||
        error.status === 403 ||
        error.status === 429
      ) {
        throw error;
      }
    }
  }

  throw Object.assign(
    lastError ||
      new Error("Service IA temporairement indisponible"),
    {
      status: lastError?.status || 503,
    }
  );
}
