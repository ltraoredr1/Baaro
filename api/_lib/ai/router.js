/**
 * BAARO AI Router — Configuration des fournisseurs et Circuit Breaker
 *
 * Priorité configurable :
 * BAARO_AI_PROVIDER_ORDER=groq,mistral,gemini
 *
 * Fournisseurs : Groq → Mistral → Gemini
 * Gemini par défaut : gemini-3.8-flash
 */

const failures = new Map();

const DEFAULT_COOLDOWN_MS = 60_000;
const FAILURE_THRESHOLD = 3;

const GEMINI_BASE =
  "https://generativelanguage.googleapis.com/v1beta";

const DEFAULT_MODELS = {
  groq: "openai/gpt-oss-20b",
  mistral: "ministral-3b-latest",
  gemini: "gemini-3.8-flash",
};

const DEFAULT_PROVIDER_ORDER = [
  "groq",
  "mistral",
  "gemini",
];

const VALID_PROVIDERS = new Set([
  "groq",
  "mistral",
  "gemini",
  "gemini-fallback",
]);

const OBSOLETE_GEMINI_MODELS = new Set([
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
]);

function getFirstModel(value, fallback) {
  const first = String(value || "")
    .split(",")[0]
    .trim();

  return first || fallback;
}

function normalizeGeminiModel(value) {
  const model = String(value || "")
    .trim()
    .replace(/^models\//, "");

  if (!model || OBSOLETE_GEMINI_MODELS.has(model)) {
    return DEFAULT_MODELS.gemini;
  }

  return model;
}

/**
 * Retourne true si le circuit du fournisseur est ouvert.
 */
export function isOpen(provider) {
  const state = failures.get(provider);

  if (!state) return false;

  if (state.openUntil && Date.now() >= state.openUntil) {
    failures.delete(provider);
    return false;
  }

  return Boolean(state.openUntil && Date.now() < state.openUntil);
}

/**
 * Enregistre un échec et ouvre le circuit après plusieurs échecs.
 */
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

/**
 * Réinitialise le circuit après un succès.
 */
export function recordSuccess(provider) {
  if (provider) {
    failures.delete(provider);
  }
}

/**
 * Liste les fournisseurs dont le circuit est actuellement ouvert.
 */
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

/**
 * Normalise un code pays ISO à deux lettres.
 */
export function normalizeCountry(value) {
  const country = String(value || "")
    .trim()
    .toUpperCase();

  return /^[A-Z]{2}$/.test(country) ? country : null;
}

/**
 * Retourne la configuration d'un fournisseur.
 * Renvoie null si la clé API nécessaire est absente.
 */
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

      const configuredModel = getFirstModel(
        process.env.GEMINI_MODEL || process.env.GEMINI_MODELS,
        DEFAULT_MODELS.gemini
      );

      return {
        key,
        base: GEMINI_BASE,
        model: normalizeGeminiModel(configuredModel),
      };
    }

    case "gemini-fallback": {
      const key = process.env.GEMINI_API_KEY;

      if (!key) return null;

      const configuredModel = getFirstModel(
        process.env.GEMINI_FALLBACK_MODEL,
        ""
      );

      if (!configuredModel) return null;

      return {
        key,
        base: GEMINI_BASE,
        model: normalizeGeminiModel(configuredModel),
      };
    }

    default:
      return null;
  }
}

/**
 * Lit et valide l'ordre configuré dans l'environnement.
 *
 * Exemple :
 * BAARO_AI_PROVIDER_ORDER=groq,mistral,gemini
 *
 * Les noms invalides et les doublons sont ignorés.
 * Si aucune valeur valide n'est fournie, l'ordre par défaut est utilisé.
 */
function getProviderOrder() {
  const configured = String(
    process.env.BAARO_AI_PROVIDER_ORDER || ""
  )
    .split(",")
    .map((provider) => provider.trim().toLowerCase())
    .filter(
      (provider) =>
        provider && VALID_PROVIDERS.has(provider)
    );

  const uniqueConfigured = [...new Set(configured)];

  return uniqueConfigured.length
    ? uniqueConfigured
    : [...DEFAULT_PROVIDER_ORDER];
}

/**
 * Sélectionne le premier fournisseur configuré et disponible.
 *
 * Important : cette fonction choisit le fournisseur.
 * Le basculement après un échec de requête doit être géré
 * par le code appelant, avec recordFailure/recordSuccess.
 */
export function chooseProvider() {
  for (const provider of getProviderOrder()) {
    if (providerConfig(provider) && !isOpen(provider)) {
      return provider;
    }
  }

  return null;
}
