/**
 * BAARO AI Router - Gemini en priorité, avec secours optionnels
 *
 * Chaque secours n'est actif que si sa clé (et son modèle) existent
 * dans les variables d'environnement. Sans rien configurer, le
 * comportement reste 100 % Gemini comme avant.
 *
 *  - GEMINI_API_KEY / GEMINI_MODEL            : principal
 *  - GEMINI_FALLBACK_MODEL                    : 2e modèle Gemini (même clé), ex. une version "lite"
 *  - GROQ_API_KEY / GROQ_MODEL                : secours Groq (optionnel)
 *  - MISTRAL_API_KEY / MISTRAL_MODEL          : secours Mistral (optionnel)
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

export function chooseProvider() {
  return "gemini";
}

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";

export function providerConfig(provider) {
  switch (provider) {
    case "gemini":
      return {
        key: process.env.GEMINI_API_KEY,
        base: GEMINI_BASE,
        model: process.env.GEMINI_MODEL || "gemini-3.8-flash",
      };

    // Même clé Gemini, autre modèle : secours si le principal est saturé.
    case "gemini-fallback":
      if (!process.env.GEMINI_FALLBACK_MODEL) return null;
      return {
        key: process.env.GEMINI_API_KEY,
        base: GEMINI_BASE,
        model: process.env.GEMINI_FALLBACK_MODEL,
      };

    case "groq":
      if (!process.env.GROQ_API_KEY) return null;
      return {
        key: process.env.GROQ_API_KEY,
        base: "https://api.groq.com/openai/v1",
        model: process.env.GROQ_MODEL || "llama-3.3-70b-versatile",
      };

    case "mistral":
      if (!process.env.MISTRAL_API_KEY) return null;
      return {
        key: process.env.MISTRAL_API_KEY,
        base: "https://api.mistral.ai/v1",
        model: process.env.MISTRAL_MODEL || "mistral-small-latest",
      };

    default:
      return null;
  }
}
