/**
 * BAARO AI Router - Groq en priorité pour la rapidité, secours avec Mistral & Gemini
 *
 * Priorité globale :
 *  1. GROQ_API_KEY / GROQ_MODEL (ou premier de GROQ_MODELS)
 *  2. MISTRAL_API_KEY / MISTRAL_MODEL
 *  3. GEMINI_API_KEY / GEMINI_MODEL (ou premier de GEMINI_MODELS)
 *  4. GEMINI_FALLBACK_MODEL (modèle léger de secours si configuré)
 */

// ============== CIRCUIT BREAKER =============
const failures = new Map(); // provider → { count, openUntil }

const DEFAULT_COOLDOWN_MS = 60_000; // Cooldown de 1 minute si trop d'échecs
const FAILURE_THRESHOLD = 3;        // Bascule en "Open" après 3 échecs consécutifs

/**
 * Vérifie si le circuit d'un provider est actuellement ouvert (bloqué).
 */
export function isOpen(provider) {
  if (!provider) return false;
  const state = failures.get(provider);
  if (!state) return false;
  if (Date.now() > state.openUntil) {
    failures.delete(provider);
    return false;
  }
  return true;
}

/**
 * Enregistre un échec pour un provider et ouvre le circuit si le seuil est atteint.
 */
export function recordFailure(provider, cooldownMs = DEFAULT_COOLDOWN_MS) {
  if (!provider) return;
  const state = failures.get(provider) || { count: 0, openUntil: 0 };
  state.count += 1;
  if (state.count >= FAILURE_THRESHOLD) {
    state.openUntil = Date.now() + cooldownMs;
  }
  failures.set(provider, state);
}

/**
 * Réinitialise l'état d'un provider après un succès.
 */
export function recordSuccess(provider) {
  if (!provider) return;
  failures.delete(provider);
}

/**
 * Liste des providers actuellement en circuit ouvert (pour le debug/monitoring).
 */
export function openProviders() {
  const now = Date.now();
  const result = [];
  for (const [p, state] of failures) {
    if (now <= state.openUntil) result.push(p);
  }
  return result;
}

// ============== UTILS & CONFIGS =============

export function normalizeCountry(value) {
  const country = String(value || "").trim().toUpperCase();
  return /^[A-Z]{2}$/.test(country) ? country : null;
}

/**
 * Choisit le fournisseur principal disponible et non bloqué par le circuit breaker.
 */
export function chooseProvider() {
  const candidates = ["groq", "mistral", "gemini"];
  for (const p of candidates) {
    if (providerConfig(p) && !isOpen(p)) {
      return p;
    }
  }
  return "groq";
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
        "llama-3.1-8b-instant"
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
        "ministral-3b-latest"
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
        "gemini-2.5-flash-lite"
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
