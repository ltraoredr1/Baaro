/**
 * BAARO AI Router - Groq en priorité pour la rapidité, secours avec Mistral & Gemini
 *
 * Chaîne d'exécutions :
 *  1. GROQ_API_KEY / GROQ_MODEL (ou premier de GROQ_MODELS)
 *  2. MISTRAL_API_KEY / MISTRAL_MODEL
 *  3. GEMINI_API_KEY / GEMINI_MODEL (ou premier de GEMINI_MODELS)
 *  4. GEMINI_FALLBACK_MODEL (modèle léger de secours si configuré)
 */

export function isOpen() {
  return false;
}

export function recordFailure() {}

export function recordSuccess() {}

export function openProviders() {
  return [];
}

export function normalizeCountry(value) {
  const country = String(value || "").trim().toUpperCase();
  return /^[A-Z]{2}$/.test(country) ? country : null;
}

/**
 * Choisit le fournisseur principal par défaut (Groq en premier pour éviter la latence/timeout).
 */
export function chooseProvider() {
  if (process.env.GROQ_API_KEY) return "groq";
  if (process.env.MISTRAL_API_KEY) return "mistral";
  return "gemini";
}

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";

/**
 * Extrait le premier modèle d'une variable qui contient une liste séparée par des virgules,
 * ou renvoie la valeur par défaut.
 */
function getFirstModel(envVar, fallback) {
  if (!envVar) return fallback;
  const first = envVar.split(",")[0]?.trim();
  return first || fallback;
}

export function providerConfig(provider) {
  switch (provider) {
    case "groq": {
      if (!process.env.GROQ_API_KEY) return null;
      const model = getFirstModel(
        process.env.GROQ_MODEL || process.env.GROQ_MODELS,
        "llama-3.3-70b-versatile"
      );
      return {
        key: process.env.GROQ_API_KEY,
        base: "https://api.groq.com/openai/v1",
        model,
      };
    }

    case "mistral": {
      if (!process.env.MISTRAL_API_KEY) return null;
      const model = getFirstModel(
        process.env.MISTRAL_MODEL,
        "mistral-small-latest"
      );
      return {
        key: process.env.MISTRAL_API_KEY,
        base: "https://api.mistral.ai/v1",
        model,
      };
    }

    case "gemini": {
      if (!process.env.GEMINI_API_KEY) return null;
      const model = getFirstModel(
        process.env.GEMINI_MODEL || process.env.GEMINI_MODELS,
        "gemini-3.8-flash"
      );
      return {
        key: process.env.GEMINI_API_KEY,
        base: GEMINI_BASE,
        model,
      };
    }

    // Secours Gemini avec un modèle secondaire léger si spécifié
    case "gemini-fallback": {
      if (!process.env.GEMINI_API_KEY || !process.env.GEMINI_FALLBACK_MODEL) {
        return null;
      }
      return {
        key: process.env.GEMINI_API_KEY,
        base: GEMINI_BASE,
        model: process.env.GEMINI_FALLBACK_MODEL,
      };
    }

    default:
      return null;
  }
}
