/**
 * Logging structuré pour les API BAARO.
 * Compatible Vercel / logs JSON.
 */

export function logInfo(context, message, extra = {}) {
  console.log(
    JSON.stringify({
      level: "info",
      service: "baaro-api",
      context,
      message,
      ...extra,
      ts: new Date().toISOString(),
    })
  );
}

export function logWarn(context, message, extra = {}) {
  console.warn(
    JSON.stringify({
      level: "warn",
      service: "baaro-api",
      context,
      message,
      ...extra,
      ts: new Date().toISOString(),
    })
  );
}

export function logError(context, err, extra = {}) {
  console.error(
    JSON.stringify({
      level: "error",
      service: "baaro-api",
      context,
      message: err?.message || String(err),
      stack: err?.stack?.slice?.(0, 800) || undefined,
      ...extra,
      ts: new Date().toISOString(),
    })
  );
}
