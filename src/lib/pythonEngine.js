import { supabase } from "@/supabaseClient.js";

async function runPython(task, text, extra = {}) {
  const value = String(text ?? "");

  if (value.length > 20000) {
    throw new Error("Texte trop long (20 000 caractères maximum).");
  }

  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;

  const token = data?.session?.access_token;
  if (!token) throw new Error("Connexion BAARO requise.");

  const response = await fetch("/api/media", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      task,
      input: { ...extra, text: value },
    }),
  });

  const result = await response.json().catch(() => ({}));

  if (!response.ok || result.success !== true) {
    throw new Error(result.detail || result.error || "Service Python indisponible.");
  }

  return result.result;
}

export async function normalizeText(text) {
  try {
    return {
      value: await runPython("text.normalize", text),
      engine: "python",
    };
  } catch (error) {
    console.warn("[BAARO Python normalize]", error);
    return {
      value: String(text ?? "").normalize("NFC").trim(),
      engine: "javascript",
    };
  }
}

export async function analyzeText(text) {
  try {
    return {
      ...await runPython("text.analyze", text),
      engine: "python",
    };
  } catch (error) {
    console.warn("[BAARO Python analyze]", error);
    const value = String(text ?? "");
    return {
      characters: value.length,
      words: value.trim() ? value.trim().split(/\s+/u).length : 0,
      lines: value ? value.split(/\r\n|\r|\n/u).length : 0,
      engine: "javascript",
    };
  }
}

export async function transformText(task, text, language = "fr") {
  if (!["text.correct", "text.rewrite", "text.translate"].includes(task)) {
    throw new Error("Opération Python non autorisée.");
  }

  const result = await runPython(task, text, { language });

  if (!result || typeof result.text !== "string" || !result.text.trim()) {
    throw new Error("Réponse Python invalide.");
  }

  return result;
}
