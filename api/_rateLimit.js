// Mémoire simple (1 instance). Pour multi-instances en production :
// remplacer par Upstash Redis ou un store partagé.
const store = new Map();

/**
 * Rate limiter simple par IP + clé métier.
 *
 * @param {object} req - Requête (headers)
 * @param {object} options
 * @param {string} options.key - Identifiant de la route (ex: "wallet", "chat")
 * @param {number} [options.max=20] - Nombre max de requêtes
 * @param {number} [options.windowMs=60000] - Fenêtre en ms
 * @returns {{ ok: true, remaining: number } | { ok: false, status: 429, body: object, headers: object }}
 */
export function rateLimit(req, { key, max = 20, windowMs = 60_000 }) {
  const ip =
    req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
    req.headers["x-real-ip"] ||
    "unknown";

  const bucketKey = `${key}:${ip}`;
  const now = Date.now();
  let bucket = store.get(bucketKey);

  if (!bucket || now - bucket.start >= windowMs) {
    bucket = { start: now, count: 0 };
    store.set(bucketKey, bucket);
  }

  bucket.count += 1;

  // Évite qu'un trafic distribué fasse grossir la Map indéfiniment.
  if (store.size > 5000) {
    for (const [key, value] of store) {
      if (now - value.start >= windowMs) store.delete(key);
    }
  }

  if (bucket.count > max) {
    const retryAfter = Math.ceil((windowMs - (now - bucket.start)) / 1000);
    return {
      ok: false,
      status: 429,
      body: {
        error: "Trop de requêtes",
        retryAfter,
      },
      headers: {
        "Retry-After": String(retryAfter),
        "X-RateLimit-Limit": String(max),
        "X-RateLimit-Remaining": "0",
      },
    };
  }

  return {
    ok: true,
    remaining: max - bucket.count,
  };
}
