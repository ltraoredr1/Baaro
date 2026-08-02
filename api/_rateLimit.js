// Mémoire simple (1 instance). Pour multi-instances : Upstash Redis.
const store = new Map();

export function rateLimit(req, { key, max = 20, windowMs = 60_000 }) {
  const ip =
    req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
    req.headers["x-real-ip"] ||
    "unknown";

  const bucketKey = `\( {key}: \){ip}`;
  const now = Date.now();
  let bucket = store.get(bucketKey);

  if (!bucket || now - bucket.start >= windowMs) {
    bucket = { start: now, count: 0 };
    store.set(bucketKey, bucket);
  }

  bucket.count += 1;

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
