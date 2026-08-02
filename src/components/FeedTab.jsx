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

export function rateLimitMessage(retryAfterSec) {
  if (retryAfterSec <= 1) return "Trop de requêtes. Réessayez dans 1 seconde.";
  if (retryAfterSec < 60) {
    return `Trop de requêtes. Réessayez dans ${retryAfterSec} secondes.`;
  }
  const min = Math.ceil(retryAfterSec / 60);
  return `Trop de requêtes. Réessayez dans \( {min} minute \){min > 1 ? "s" : ""}.`;
}
