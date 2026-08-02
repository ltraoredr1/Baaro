/**
 * Rate limiter simple en mémoire (par clé).
 * Exemple : max 5 actions / 60 secondes pour "post", "like", etc.
 */
const buckets = new Map();

export function checkRateLimit(key, { max = 10, windowMs = 60_000 } = {}) {
  const now = Date.now();
  let bucket = buckets.get(key);

  if (!bucket || now - bucket.start >= windowMs) {
    bucket = { start: now, count: 0 };
    buckets.set(key, bucket);
  }

  if (bucket.count >= max) {
    const retryAfterMs = windowMs - (now - bucket.start);
    return {
      allowed: false,
      retryAfterMs,
      retryAfterSec: Math.ceil(retryAfterMs / 1000),
    };
  }

  bucket.count += 1;
  return { allowed: true, remaining: max - bucket.count };
}

/** Message FR pour l'utilisateur */
export function rateLimitMessage(retryAfterSec) {
  if (retryAfterSec <= 1) return "Trop de requêtes. Réessayez dans 1 seconde.";
  if (retryAfterSec < 60) {
    return `Trop de requêtes. Réessayez dans ${retryAfterSec} secondes.`;
  }
  const min = Math.ceil(retryAfterSec / 60);
  return `Trop de requêtes. Réessayez dans \( {min} minute \){min > 1 ? "s" : ""}.`;
}

/**
 * Debounce : évite d'appeler une fonction trop souvent.
 */
export function debounce(fn, delayMs = 400) {
  let timer = null;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delayMs);
  };
}

/**
 * Throttle : au plus 1 appel par intervalle.
 */
export function throttle(fn, intervalMs = 1000) {
  let last = 0;
  let pending = null;
  return (...args) => {
    const now = Date.now();
    if (now - last >= intervalMs) {
      last = now;
      return fn(...args);
    }
    clearTimeout(pending);
    pending = setTimeout(() => {
      last = Date.now();
      fn(...args);
    }, intervalMs - (now - last));
  };
}
