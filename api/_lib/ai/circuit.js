/**
 * Circuit breaker simple pour les providers IA.
 * Mémoire process (suffisant sur Vercel serverless + cold starts).
 * Après 3 échecs consécutifs → open pendant cooldownMs.
 */

const failures = new Map(); // provider → { count, openUntil }

const DEFAULT_COOLDOWN_MS = 60_000; // 1 minute
const FAILURE_THRESHOLD = 3;

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

export function recordFailure(provider, cooldownMs = DEFAULT_COOLDOWN_MS) {
  if (!provider) return;
  const state = failures.get(provider) || { count: 0, openUntil: 0 };
  state.count += 1;
  if (state.count >= FAILURE_THRESHOLD) {
    state.openUntil = Date.now() + cooldownMs;
  }
  failures.set(provider, state);
}

export function recordSuccess(provider) {
  if (!provider) return;
  failures.delete(provider);
}

/** Liste des providers actuellement en circuit ouvert (debug). */
export function openProviders() {
  const now = Date.now();
  const result = [];
  for (const [p, state] of failures) {
    if (now <= state.openUntil) result.push(p);
  }
  return result;
}
