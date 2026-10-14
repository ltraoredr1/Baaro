
/**
 * CORS partagé, Logging, Rate Limiting, Helpers Stripe & Supabase
 * Fichier : api/_shared.js
 */

import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

const DEFAULT_ALLOWED = [
  "https://localhost",
  "capacitor://localhost",
];

const DEVELOPMENT_ALLOWED = [
  "http://localhost:5173",
  "http://localhost:3000",
  "http://127.0.0.1:5173",
  "http://127.0.0.1:3000",
  "http://localhost",
];

function normalizeOrigin(value) {
  const raw = String(value || "").trim();

  if (!raw) return "";

  try {
    return new URL(raw.includes("://") ? raw : `https://${raw}`).origin;
  } catch {
    return "";
  }
}

function isProduction() {
  return (
    process.env.VERCEL_ENV === "production" ||
    process.env.NODE_ENV === "production"
  );
}

function getAllowedOrigins() {
  const fromEnv = (process.env.ALLOWED_ORIGINS || "")
    .split(",")
    .map(normalizeOrigin)
    .filter(Boolean);

  const vercelOrigins = [
    normalizeOrigin(process.env.VERCEL_URL),
    normalizeOrigin(process.env.VERCEL_PROJECT_PRODUCTION_URL),
    normalizeOrigin(process.env.PUBLIC_APP_URL),
  ].filter(Boolean);

  const defaults = isProduction()
    ? DEFAULT_ALLOWED
    : [...DEFAULT_ALLOWED, ...DEVELOPMENT_ALLOWED];

  return [...new Set([...defaults, ...fromEnv, ...vercelOrigins])];
}

export function applyCors(req, res) {
  const origin = String(req.headers.origin || "").trim();
  const allowed = getAllowedOrigins();

  res.setHeader("Vary", "Origin");

  if (origin) {
    if (allowed.includes(origin)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
    } else if (isProduction()) {
      return res.status(403).json({
        ok: false,
        error: "Origin not allowed",
      });
    }
  }

  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET, POST, PUT, PATCH, DELETE, OPTIONS"
  );

  res.setHeader(
    "Access-Control-Allow-Headers",
    [
      "Content-Type",
      "Authorization",
      "X-Session-Id",
      "X-BAARO-Country",
    ].join(", ")
  );

  res.setHeader("Access-Control-Max-Age", "86400");

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return true;
  }

  return false;
}

// ==========================================================
// LOGGING
// ==========================================================

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

export async function flushLogs(_timeoutMs = 1500) {
  // no-op
}

// ==========================================================
// RATE LIMITING
// ==========================================================

const store = new Map();

function clientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];

  if (typeof forwarded === "string" && forwarded.trim()) {
    return forwarded.split(",")[0].trim();
  }

  const realIp = req.headers["x-real-ip"];

  if (typeof realIp === "string" && realIp.trim()) {
    return realIp.trim();
  }

  return "unknown";
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
    for (const [storedKey, value] of store) {
      if (now - value.start >= windowMs) {
        store.delete(storedKey);
      }
    }
  }

  if (bucket.count > max) {
    const retryAfter = Math.max(
      1,
      Math.ceil((windowMs - (now - bucket.start)) / 1000)
    );

    return {
      ok: false,
      status: 429,
      body: {
        ok: false,
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
    remaining: Math.max(0, max - bucket.count),
  };
}

/**
 * Limiteur historique synchrone.
 * Il utilise la mémoire du processus : il n'est pas partagé
 * entre plusieurs instances serverless.
 *
 * En production, préférer rateLimitAsync().
 */
export function rateLimit(req, opts) {
  return memoryLimit(req, opts);
}

function upstashConfigured() {
  return Boolean(
    String(process.env.UPSTASH_REDIS_REST_URL || "").trim() &&
      String(process.env.UPSTASH_REDIS_REST_TOKEN || "").trim()
  );
}

function rateLimitUnavailable() {
  return {
    ok: false,
    status: 503,
    body: {
      ok: false,
      error: "Protection anti-abus temporairement indisponible.",
      code: "rate_limit_unavailable",
    },
    headers: {
      "Retry-After": "5",
      "Cache-Control": "no-store",
    },
  };
}

function getUpstashConfig() {
  const rawUrl = String(
    process.env.UPSTASH_REDIS_REST_URL || ""
  ).trim();

  const token = String(
    process.env.UPSTASH_REDIS_REST_TOKEN || ""
  ).trim();

  let parsed;

  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error("URL Upstash invalide.");
  }

  if (parsed.protocol !== "https:") {
    throw new Error("Upstash doit utiliser HTTPS.");
  }

  if (!token) {
    throw new Error("Jeton Upstash manquant.");
  }

  return {
    url: rawUrl.replace(/\/+$/, ""),
    token,
  };
}

/**
 * Exécute une commande via l'API REST Upstash.
 *
 * Les commandes sont intégrées au chemin URL :
 * GET /incr/<clé>
 * GET /expire/<clé>/<secondes>
 */
async function upstashCommand(url, token) {
  const response = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Upstash HTTP ${response.status}`);
  }

  const data = await response.json().catch(() => null);

  if (!data || data.error) {
    throw new Error("Réponse Upstash invalide.");
  }

  return data.result;
}

export async function rateLimitAsync(
  req,
  { key, max = 20, windowMs = 60_000 } = {}
) {
  const safeKey = String(key || "").trim();

  if (
    !safeKey ||
    !Number.isFinite(max) ||
    max < 1 ||
    !Number.isFinite(windowMs) ||
    windowMs <= 0
  ) {
    return {
      ok: false,
      status: 500,
      body: {
        ok: false,
        error: "Configuration de limitation invalide.",
      },
    };
  }

  const windowSec = Math.max(1, Math.ceil(windowMs / 1000));

  if (!upstashConfigured()) {
    if (isProduction()) {
      console.error("[rate-limit] Upstash is not configured.");
      return rateLimitUnavailable();
    }

    return memoryLimit(req, {
      key: safeKey,
      max,
      windowMs,
    });
  }

  try {
    const { url, token } = getUpstashConfig();
    const ip = clientIp(req);
    const redisKey = `rl:${safeKey}:${ip}`;
    const encodedKey = encodeURIComponent(redisKey);

    const countResult = await upstashCommand(
      `${url}/incr/${encodedKey}`,
      token
    );

    const count = Number(countResult);

    if (!Number.isSafeInteger(count) || count < 1) {
      throw new Error("Compteur Upstash invalide.");
    }

    /*
     * L'expiration est rafraîchie à chaque requête.
     * Cela évite de laisser un compteur sans expiration si une commande
     * EXPIRE précédente a échoué. Cette stratégie correspond à une
     * fenêtre glissante : l'expiration est prolongée par chaque requête.
     */
    const expiryResult = await upstashCommand(
      `${url}/expire/${encodedKey}/${windowSec}`,
      token
    );

    if (Number(expiryResult) !== 1) {
      throw new Error("Expiration du compteur Upstash non confirmée.");
    }

    const headers = {
      "X-RateLimit-Limit": String(max),
      "X-RateLimit-Remaining": String(Math.max(0, max - count)),
      "Cache-Control": "no-store",
    };

    if (count > max) {
      return {
        ok: false,
        status: 429,
        body: {
          ok: false,
          error: "Trop de requêtes",
          retryAfter: windowSec,
        },
        headers: {
          ...headers,
          "Retry-After": String(windowSec),
          "X-RateLimit-Remaining": "0",
        },
      };
    }

    return {
      ok: true,
      remaining: Math.max(0, max - count),
      headers,
    };
  } catch {
    console.error(
      "[rate-limit] Distributed limiter unavailable; request blocked."
    );

    // En production, ne pas contourner Upstash avec un compteur local.
    if (isProduction()) {
      return rateLimitUnavailable();
    }

    return memoryLimit(req, {
      key: safeKey,
      max,
      windowMs,
    });
  }
}

// ==========================================================
// STRIPE
// ==========================================================

let _stripe = null;

export function getStripe() {
  if (_stripe) return _stripe;

  const key = process.env.STRIPE_SECRET_KEY;

  if (!key) {
    throw new Error("STRIPE_SECRET_KEY manquante");
  }

  _stripe = new Stripe(key, {
    apiVersion: "2024-11-20.acacia",
    maxNetworkRetries: 2,
  });

  return _stripe;
}

export function mapStripeError(err) {
  const base = {
    ok: false,
    provider: "stripe",
    type: err?.type || "unknown",
    code: err?.code || null,
    decline_code: err?.decline_code || null,
    param: err?.param || null,
    requestId: err?.requestId || err?.raw?.requestId || null,
    message: "Erreur de paiement. Réessaie ou utilise un autre moyen.",
    status: 402,
  };

  switch (err?.type) {
    case "StripeCardError":
      return {
        ...base,
        status: 402,
        message: humanCardMessage(err),
      };

    case "StripeRateLimitError":
      return {
        ...base,
        status: 429,
        message: "Trop de tentatives. Attends quelques secondes puis réessaie.",
      };

    case "StripeInvalidRequestError":
      return {
        ...base,
        status: 400,
        message: err.message || "Requête de paiement invalide.",
      };

    case "StripeAPIError":
      return {
        ...base,
        status: 502,
        message:
          "Service de paiement temporairement indisponible. Réessaie plus tard.",
      };

    case "StripeConnectionError":
      return {
        ...base,
        status: 503,
        message:
          "Impossible de joindre le service de paiement. Vérifie ta connexion.",
      };

    case "StripeAuthenticationError":
      console.error("[Stripe] Authentication error.");

      return {
        ...base,
        status: 500,
        message: "Configuration paiement invalide. Contacte le support.",
      };

    case "StripePermissionError":
      return {
        ...base,
        status: 403,
        message: "Paiement non autorisé pour ce compte.",
      };

    case "StripeIdempotencyError":
      return {
        ...base,
        status: 409,
        message:
          "Cette opération a déjà été traitée. Rafraîchis la page.",
      };

    default:
      if (err?.code === "ETIMEDOUT" || err?.code === "ECONNRESET") {
        return {
          ...base,
          status: 503,
          message:
            "Délai dépassé avec le service de paiement. Réessaie.",
        };
      }

      console.error("[Stripe] Unhandled error.");

      return {
        ...base,
        status: 500,
        message: "Erreur interne du service de paiement.",
      };
  }
}

function humanCardMessage(err) {
  const code = err?.decline_code || err?.code;

  const messages = {
    card_declined: "Carte refusée par ta banque.",
    insufficient_funds: "Fonds insuffisants.",
    lost_card: "Carte signalée comme perdue. Contacte ta banque.",
    stolen_card: "Carte signalée comme volée. Contacte ta banque.",
    expired_card: "Carte expirée.",
    incorrect_cvc: "Code de sécurité (CVC) incorrect.",
    incorrect_number: "Numéro de carte incorrect.",
    invalid_expiry_month: "Mois d’expiration invalide.",
    invalid_expiry_year: "Année d’expiration invalide.",
    processing_error: "Erreur de traitement. Réessaie dans un instant.",
    fraudulent: "Paiement bloqué pour suspicion de fraude.",
    do_not_honor: "Banque a refusé le paiement. Contacte ta banque.",
    generic_decline: "Paiement refusé. Essaie une autre carte.",
  };

  if (code && messages[code]) {
    return messages[code];
  }

  if (err?.message && err.message.length < 120) {
    return err.message;
  }

  return "Paiement par carte refusé. Vérifie tes informations ou utilise un autre moyen.";
}

const ZERO_DECIMAL = new Set(["XOF", "XAF", "JPY", "KRW", "VND"]);

export function toStripeAmount(amount, currency) {
  const cur = String(currency || "XOF").toUpperCase();
  const number = Number(amount);

  if (!Number.isFinite(number) || number <= 0) {
    throw Object.assign(new Error("Montant invalide"), {
      type: "StripeInvalidRequestError",
    });
  }

  if (ZERO_DECIMAL.has(cur)) {
    return Math.round(number);
  }

  return Math.round(number * 100);
}

export async function createCheckoutSession({
  amount,
  currency,
  paymentRef,
  description,
  customerEmail,
  successUrl,
  cancelUrl,
  metadata = {},
}) {
  const stripe = getStripe();
  const unitAmount = toStripeAmount(amount, currency);

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: String(currency).toLowerCase(),
            unit_amount: unitAmount,
            product_data: {
              name: description || "Paiement BAARO",
            },
          },
        },
      ],
      success_url: successUrl,
      cancel_url: cancelUrl,
      client_reference_id: paymentRef,
      customer_email: customerEmail || undefined,
      metadata: {
        payment_ref: paymentRef,
        ...metadata,
      },
    });

    return {
      ok: true,
      payment_url: session.url,
      session_id: session.id,
      transaction_id: paymentRef,
    };
  } catch (err) {
    throw mapStripeError(err);
  }
}

export function constructStripeEvent(rawBody, signature) {
  const stripe = getStripe();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!secret) {
    throw new Error("STRIPE_WEBHOOK_SECRET manquante");
  }

  return stripe.webhooks.constructEvent(rawBody, signature, secret);
}

// ==========================================================
// SUPABASE
// ==========================================================

const SUPABASE_URL =
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;

const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export function getAdminClient() {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    throw new Error(
      "Configuration serveur incomplète : SUPABASE_URL (ou VITE_SUPABASE_URL) et SUPABASE_SERVICE_ROLE_KEY doivent être définies."
    );
  }

  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export async function requireUser(req, admin) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";

  if (!token) {
    const error = new Error("Authentification manquante");
    error.status = 401;
    throw error;
  }

  const { data, error } = await admin.auth.getUser(token);

  if (error || !data?.user) {
    const authError = new Error("Session invalide ou expirée");
    authError.status = 401;
    throw authError;
  }

  return data.user;
}
