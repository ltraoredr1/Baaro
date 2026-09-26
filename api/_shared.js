/**
 * CORS partagé, Logging, Rate Limiting, Helpers Stripe & Supabase
 * Fichier : api/_shared.js
 */

// ✅ TOUS LES IMPORTS DOIVENT ÊTRE TOUT EN HAUT
import Stripe from 'stripe';
import { createClient } from "@supabase/supabase-js";

const DEFAULT_ALLOWED = [
  "http://localhost:5173",
  "http://localhost:3000",
  "http://127.0.0.1:5173",
  "http://127.0.0.1:3000",
];

function getAllowedOrigins() {
  const fromEnv = (process.env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return [...new Set([...DEFAULT_ALLOWED, ...fromEnv])];
}

function isProduction() {
  return (
    process.env.VERCEL_ENV === "production" ||
    process.env.NODE_ENV === "production"
  );
}

export function applyCors(req, res) {
  const origin = req.headers.origin || "";
  const allowed = getAllowedOrigins();

  if (allowed.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  } else if (origin && isProduction()) {
    res.setHeader("Vary", "Origin");
    res.status(403).json({ error: "Origin not allowed" });
    return true;
  } else if (!origin) {
    // Requêtes serveur / clients natifs sans header Origin
  } else {
    res.setHeader("Vary", "Origin");
  }

  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, X-Session-Id, X-BAARO-Country"
  );
  res.setHeader("Access-Control-Max-Age", "86400");
  res.setHeader("Vary", "Origin");

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return true;
  }
  return false;
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
}

export async function flushLogs(_timeoutMs = 1500) {
  /* no-op */
}

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

export function rateLimit(req, opts) {
  return memoryLimit(req, opts);
}

function upstashConfigured() {
  return !!(
    process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
  );
}

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

// ==========================================================
// HELPERS STRIPE
// ==========================================================

let _stripe = null;

export function getStripe() {
  if (_stripe) return _stripe;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('STRIPE_SECRET_KEY manquante');
  _stripe = new Stripe(key, {
    apiVersion: '2024-11-20.acacia',
    maxNetworkRetries: 2,
  });
  return _stripe;
}

export function mapStripeError(err) {
  const base = {
    ok: false,
    provider: 'stripe',
    type: err?.type || 'unknown',
    code: err?.code || null,
    decline_code: err?.decline_code || null,
    param: err?.param || null,
    requestId: err?.requestId || err?.raw?.requestId || null,
    message: 'Erreur de paiement. Réessaie ou utilise un autre moyen.',
    status: 402,
  };

  switch (err?.type) {
    case 'StripeCardError':
      return { ...base, status: 402, message: humanCardMessage(err) };
    case 'StripeRateLimitError':
      return { ...base, status: 429, message: 'Trop de tentatives. Attends quelques secondes puis réessaie.' };
    case 'StripeInvalidRequestError':
      return { ...base, status: 400, message: err.message || 'Requête de paiement invalide.' };
    case 'StripeAPIError':
      return { ...base, status: 502, message: 'Service de paiement temporairement indisponible. Réessaie plus tard.' };
    case 'StripeConnectionError':
      return { ...base, status: 503, message: 'Impossible de joindre le service de paiement. Vérifie ta connexion.' };
    case 'StripeAuthenticationError':
      console.error('[Stripe] Authentication error', err.message);
      return { ...base, status: 500, message: 'Configuration paiement invalide. Contacte le support.' };
    case 'StripePermissionError':
      return { ...base, status: 403, message: 'Paiement non autorisé pour ce compte.' };
    case 'StripeIdempotencyError':
      return { ...base, status: 409, message: 'Cette opération a déjà été traitée. Rafraîchis la page.' };
    default:
      if (err?.code === 'ETIMEDOUT' || err?.code === 'ECONNRESET') {
        return { ...base, status: 503, message: 'Délai dépassé avec le service de paiement. Réessaie.' };
      }
      console.error('[Stripe] Unhandled error', err);
      return { ...base, status: 500, message: err?.message || base.message };
  }
}

function humanCardMessage(err) {
  const code = err.decline_code || err.code;
  const map = {
    card_declined: 'Carte refusée par ta banque.',
    insufficient_funds: 'Fonds insuffisants.',
    lost_card: 'Carte signalée comme perdue. Contacte ta banque.',
    stolen_card: 'Carte signalée comme volée. Contacte ta banque.',
    expired_card: 'Carte expirée.',
    incorrect_cvc: 'Code de sécurité (CVC) incorrect.',
    incorrect_number: 'Numéro de carte incorrect.',
    invalid_expiry_month: 'Mois d’expiration invalide.',
    invalid_expiry_year: 'Année d’expiration invalide.',
    processing_error: 'Erreur de traitement. Réessaie dans un instant.',
    fraudulent: 'Paiement bloqué pour suspicion de fraude.',
    do_not_honor: 'Banque a refusé le paiement. Contacte ta banque.',
    generic_decline: 'Paiement refusé. Essaie une autre carte.',
  };
  if (code && map[code]) return map[code];
  if (err.message && err.message.length < 120) return err.message;
  return 'Paiement par carte refusé. Vérifie tes informations ou utilise un autre moyen.';
}

const ZERO_DECIMAL = new Set(['XOF', 'XAF', 'JPY', 'KRW', 'VND']);

export function toStripeAmount(amount, currency) {
  const cur = String(currency || 'XOF').toUpperCase();
  const n = Number(amount);
  if (!Number.isFinite(n) || n <= 0) throw Object.assign(new Error('Montant invalide'), { type: 'StripeInvalidRequestError' });
  if (ZERO_DECIMAL.has(cur)) return Math.round(n);
  return Math.round(n * 100);
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
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: String(currency).toLowerCase(),
            unit_amount: unitAmount,
            product_data: { name: description || 'Paiement BAARO' },
          },
        },
      ],
      success_url: successUrl,
      cancel_url: cancelUrl,
      client_reference_id: paymentRef,
      customer_email: customerEmail || undefined,
      metadata: { payment_ref: paymentRef, ...metadata },
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
  if (!secret) throw new Error('STRIPE_WEBHOOK_SECRET manquante');
  return stripe.webhooks.constructEvent(rawBody, signature, secret);
}

// ==========================================================
// HELPERS SUPABASE
// ==========================================================

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export function getAdminClient() {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    throw new Error(
      "Configuration serveur incomplète : VITE_SUPABASE_URL (ou SUPABASE_URL) et SUPABASE_SERVICE_ROLE_KEY doivent être définies."
    );
  }
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function requireUser(req, admin) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) {
    const err = new Error("Authentification manquante");
    err.status = 401;
    throw err;
  }
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data?.user) {
    const err = new Error("Session invalide ou expirée");
    err.status = 401;
    throw err;
  }
  return data.user;
}
