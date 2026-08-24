/**
 * Rate limiter par IP + clé métier.
 * - Si UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN → Redis distribué (prod multi-instance)
 * - Sinon → Map mémoire (dev / single instance)
 *
 * Usage synchrone pour compatibilité handlers existants :
 *   export function rateLimit(...)  → mémoire
 *   export async function rateLimitAsync(...) → Redis si dispo, sinon mémoire
 *
 * Les routes peuvent migrer vers rateLimitAsync progressivement.
 */

const store = new Map();

function clientIp(req) {
  return (
    req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
    req.headers["x-real-ip"] ||
    "unknown"
  );
}

function memoryLimit(req, { key, max = 20, windowMs = 60_000 }) {
  const ip = clientIp(req);
  const bucketKey = `${key}:${ip}`;
  const now = Date.now();
  let bucket = store.get(bucketKey);

  if (!bucket || now - bucket.start >= windowMs) {
    bucket = { start: now, count: 0 };
    store.set(bucketKey, bucket);
  }

  bucket.count += 1;

  if (store.size > 5000) {
    for (const [k, value] of store) {
      if (now - value.start >= windowMs) store.delete(k);
    }
  }

  if (bucket.count > max) {
    const retryAfter = Math.ceil((windowMs - (now - bucket.start)) / 1000);
    return {
      ok: false,
      status: 429,
      body: { error: "Trop de requêtes", retryAfter },
      headers: {
        "Retry-After": String(retryAfter),
        "X-RateLimit-Limit": String(max),
        "X-RateLimit-Remaining": "0",
      },
    };
  }

  return { ok: true, remaining: max - bucket.count };
}

/** Sync — mémoire uniquement (rétrocompat). */
export function rateLimit(req, opts) {
  return memoryLimit(req, opts);
}

function upstashConfigured() {
  return !!(
    process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
  );
}

/**
 * Async — Upstash REST (INCR + EXPIRE) si configuré, sinon mémoire.
 */
export async function rateLimitAsync(req, { key, max = 20, windowMs = 60_000 }) {
  if (!upstashConfigured()) {
    return memoryLimit(req, { key, max, windowMs });
  }

  const ip = clientIp(req);
  const redisKey = `rl:${key}:${ip}`;
  const url = process.env.UPSTASH_REDIS_REST_URL.replace(/\/$/, "");
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  const windowSec = Math.max(1, Math.ceil(windowMs / 1000));

  try {
    // Pipeline: INCR puis EXPIRE si première fois (TTL)
    const incrRes = await fetch(`${url}/incr/${encodeURIComponent(redisKey)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const incrData = await incrRes.json();
    const count = Number(incrData?.result ?? 0);

    if (count === 1) {
      await fetch(
        `${url}/expire/${encodeURIComponent(redisKey)}/${windowSec}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
    }

    if (count > max) {
      const retryAfter = windowSec;
      return {
        ok: false,
        status: 429,
        body: { error: "Trop de requêtes", retryAfter },
        headers: {
          "Retry-After": String(retryAfter),
          "X-RateLimit-Limit": String(max),
          "X-RateLimit-Remaining": "0",
        },
      };
    }

    return { ok: true, remaining: Math.max(0, max - count) };
  } catch (e) {
    console.error("rateLimitAsync Upstash fallback memory:", e?.message || e);
    return memoryLimit(req, { key, max, windowMs });
  }
}
