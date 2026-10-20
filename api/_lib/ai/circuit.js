/**
 * BAARO AI Router — Configuration des fournisseurs et Circuit Breaker
 * Priorité : Groq → Mistral → Gemini → Gemini fallback
 */

const failures = new Map();

const DEFAULT_COOLDOWN_MS = 60_000;
const FAILURE_THRESHOLD = 3;

const GEMINI_BASE =
  "https://generativelanguage.googleapis.com/v1beta";

const DEFAULT_MODELS = {
  groq: "openai/gpt-oss-20b",
  mistral: "ministral-3b-latest",
  gemini: "gemini-2.5-flash-lite",
};

export function isOpen(provider) {
  const state = failures.get(provider);
  if (!state) return false;

  if (state.openUntil && Date.now() >= state.openUntil) {
    failures.delete(provider);
    return false;
  }

  return Boolean(state.openUntil && Date.now() < state.openUntil);
}

export function recordFailure(
  provider,
  cooldownMs = DEFAULT_COOLDOWN_MS
) {
  if (!provider) return;

  const state = failures.get(provider) || {
    count: 0,
    openUntil: 0,
  };

  state.count += 1;

  if (state.count >= FAILURE_THRESHOLD) {
    state.openUntil = Date.now() + cooldownMs;
  }

  failures.set(provider, state);
}

export function recordSuccess(provider) {
  if (provider) failures.delete(provider);
}

export function openProviders() {
  const now = Date.now();
  const result = [];

  for (const [provider, state] of failures) {
    if (state.openUntil > now) {
      result.push(provider);
    } else if (state.openUntil) {
      failures.delete(provider);
    }
  }

  return result;
}

export function normalizeCountry(value) {
  const country = String(value || "").trim().toUpperCase();
  return /^[A-Z]{2}$/.test(country) ? country : null;
}

function getFirstModel(value, fallback) {
  const first = String(value || "")
    .split(",")[0]
    .trim();

  return first || fallback;
}

export function providerConfig(provider) {
  switch (provider) {
    case "groq": {
      const key = process.env.GROQ_API_KEY;
      if (!key) return null;

      return {
        key,
        base: "https://api.groq.com/openai/v1",
        model: getFirstModel(
          process.env.GROQ_MODEL || process.env.GROQ_MODELS,
          DEFAULT_MODELS.groq
        ),
      };
    }

    case "mistral": {
      const key = process.env.MISTRAL_API_KEY;
      if (!key) return null;

      return {
        key,
        base: "https://api.mistral.ai/v1",
        model: getFirstModel(
          process.env.MISTRAL_MODEL,
          DEFAULT_MODELS.mistral
        ),
      };
    }

    case "gemini": {
      const key = process.env.GEMINI_API_KEY;
      if (!key) return null;

      return {
        key,
        base: GEMINI_BASE,
        model: getFirstModel(
          process.env.GEMINI_MODEL || process.env.GEMINI_MODELS,
          DEFAULT_MODELS.gemini
        ),
      };
    }

    case "gemini-fallback": {
      const key = process.env.GEMINI_API_KEY;
      const model = String(
        process.env.GEMINI_FALLBACK_MODEL || ""
      ).trim();

      if (!key || !model) return null;

      return {
        key,
        base: GEMINI_BASE,
        model,
      };
    }

    default:
      return null;
  }
}

export function chooseProvider() {
  const candidates = [
    "groq",
    "mistral",
    "gemini",
    "gemini-fallback",
  ];

  for (const provider of candidates) {
    if (providerConfig(provider) && !isOpen(provider)) {
      return provider;
    }
  }

  // Aucun fournisseur utilisable : signaler l'indisponibilité.
  return null;
}
