/**
 * Circuit breaker simple - Optimisé Vercel
 */

const failures = new Map();

const DEFAULT_COOLDOWN_MS = 60_000;
const FAILURE_THRESHOLD = 3;

export function isOpen(provider) {
  if (!provider) return false;
  const state = failures.get(provider);
  if (!state) return false;

  // Si cooldown passé → on autorise 1 essai (half-open)
  if (Date.now() > state.openUntil) {
    if (state.count >= FAILURE_THRESHOLD) {
      // On passe en half-open: on laisse passer mais on garde le count
      return false;
    }
    failures.delete(provider);
    return false;
  }
  return true;
}

export function recordFailure(provider, cooldownMs = DEFAULT_COOLDOWN_MS) {
  if (!provider) return;
  const prev = failures.get(provider) || { count: 0, openUntil: 0 };
  const count = prev.count + 1;

  const openUntil = count >= FAILURE_THRESHOLD
   ? Date.now() + cooldownMs
    : 0; // on n'ouvre qu'après threshold

  failures.set(provider, { count, openUntil });

  if (count >= FAILURE_THRESHOLD) {
    console.warn(`[CB] OPEN ${provider} for ${cooldownMs}ms after ${count} fails`);
  }
}

export function recordSuccess(provider) {
  if (!provider) return;
  if (failures.has(provider)) {
    console.log(`[CB] CLOSED ${provider} - success`);
  }
  failures.delete(provider);
}

export function openProviders() {
  const now = Date.now();
  return [...failures.entries()]
   .filter(([, s]) => now <= s.openUntil)
   .map(([p]) => p);
}

// Pour ton /api/chat Gemini
export function getNextProvider(providers) {
  for (const p of providers) {
    if (!isOpen(p)) return p;
  }
  // Tous ouverts → on force le premier qui a expiré
  return providers[0];
}
