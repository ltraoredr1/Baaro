/**
 * Logging structuré + Sentry optionnel pour les API BAARO.
 * Compatible Vercel / logs JSON.
 * Sentry : activer uniquement si SENTRY_DSN est défini (pas de nouveau fichier).
 */
import * as Sentry from "@sentry/node";

let sentryReady = false;

function ensureSentry() {
  if (sentryReady) return;
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;
  try {
    Sentry.init({
      dsn,
      environment: process.env.VERCEL_ENV || process.env.NODE_ENV || "production",
      tracesSampleRate: 0.1,
      beforeSend(event) {
        if (event.request?.headers) {
          delete event.request.headers["authorization"];
          delete event.request.headers["Authorization"];
          delete event.request.headers["cookie"];
        }
        return event;
      },
    });
    sentryReady = true;
  } catch {
    /* ignore init errors */
  }
}

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

  // Sentry optionnel (même fichier, pas de nouvel endpoint)
  ensureSentry();
  if (process.env.SENTRY_DSN) {
    try {
      Sentry.withScope((scope) => {
        scope.setTag("context", context);
        Object.entries(extra).forEach(([k, v]) => {
          if (v !== undefined) scope.setExtra(k, v);
        });
        Sentry.captureException(err instanceof Error ? err : new Error(String(err)));
      });
    } catch {
      /* ignore */
    }
  }
}

/** À appeler avant de renvoyer une réponse 5xx en serverless */
export async function flushLogs(timeoutMs = 1500) {
  if (!process.env.SENTRY_DSN) return;
  try {
    ensureSentry();
    await Sentry.flush(timeoutMs);
  } catch {
    /* ignore */
  }
}
```