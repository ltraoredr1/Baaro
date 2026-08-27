import { getAdminClient, requireUser } from "./_supabaseAdmin.js";
import { rateLimit, rateLimitAsync } from "./_rateLimit.js";
import { applyCors } from "./_cors.js";

const ALLOWED_PROVIDERS = ["cinetpay", "stripe"];
const CASH_OPTIONS = {
  r1: { cost: 500, amountCents: 500, label: "Carte cadeau partenaire — 5 €", currency: "eur" },
  r2: { cost: 1000, amountCents: 1000, label: "Virement — 10 €", currency: "eur" },
};
const MIN_ACCOUNT_AGE_MS = 3 * 24 * 60 * 60 * 1000;

function jsonError(res, status, message) {
  return res.status(status).json({ error: message });
}

async function createPayment(req, res) {
  if (req.method !== "POST") return jsonError(res, 405, "Method not allowed");

  let limit;
  try {
    limit = await rateLimitAsync(req, { key: "create-payment", max: 15, windowMs: 60_000 });
  } catch {
    limit = rateLimit(req, { key: "create-payment", max: 15, windowMs: 60_000 });
  }
  if (!limit.ok) {
    Object.entries(limit.headers || {}).forEach(([k, v]) => res.setHeader(k, v));
    return res.status(limit.status).json(limit.body);
  }

  const admin = getAdminClient();
  const user = await requireUser(req, admin);
  if (user.is_anonymous === true) return jsonError(res, 403, "Créez un compte pour payer un abonnement boutique");

  const { provider, shop_id, payment_ref, channel } = req.body || {};
  if (!ALLOWED_PROVIDERS.includes(provider)) return jsonError(res, 400, `Provider non supporté: ${provider}`);
  if (!shop_id || !payment_ref) return jsonError(res, 400, "shop_id et payment_ref requis");

  const { data: sub, error: subError } = await admin
    .from("shop_subscriptions")
    .select("id, shop_id, amount, currency, status, shops!inner(owner_id)")
    .eq("payment_ref", payment_ref)
    .eq("shop_id", shop_id)
    .maybeSingle();

  if (subError || !sub) return jsonError(res, 404, "Abonnement introuvable");
  if (sub.status !== "pending") return jsonError(res, 409, "Ce paiement a déjà été traité");
  if (sub.shops?.owner_id !== user.id) return jsonError(res, 403, "Vous n'êtes pas le propriétaire de cette boutique");

  try {
    if (provider === "cinetpay") {
      return res.status(200).json(await createCinetPayPayment({
        payment_ref, amount: sub.amount, currency: sub.currency, channel
      }));
    }
    return res.status(200).json(await createStripeCheckout({
      payment_ref, amount: sub.amount, currency: sub.currency,
      shop_id, userEmail: user.email
    }));
  } catch (err) {
    console.error("create-payment error:", err?.message || err);
    return jsonError(res, 502, "Échec de création du paiement");
  }
}

async function createCinetPayPayment({ payment_ref, amount, currency, channel }) {
  const publicUrl = process.env.PUBLIC_APP_URL;
  if (!publicUrl) throw new Error("PUBLIC_APP_URL manquant");
  if (!process.env.CINETPAY_API_KEY || !process.env.CINETPAY_SITE_ID) {
    throw new Error("CinetPay non configuré");
  }

  const response = await fetch("https://api-checkout.cinetpay.com/v2/payment", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      apikey: process.env.CINETPAY_API_KEY,
      site_id: process.env.CINETPAY_SITE_ID,
      transaction_id: payment_ref,
      amount,
      currency,
      channels: channel || "ALL",
      notify_url: `${publicUrl.replace(/\/$/, "")}/api/payment-webhook`,
      return_url: `${publicUrl.replace(/\/$/, "")}/shop/payment-return`,
    }),
  });

  const data = await response.json().catch(() => ({}));
  if (data.code !== "201") throw new Error(data.message || "Erreur CinetPay");
  return { payment_url: data.data.payment_url };
}

async function createStripeCheckout({ payment_ref, amount, currency, shop_id, userEmail }) {
  const secret = process.env.STRIPE_SECRET_KEY;
  const publicUrl = process.env.PUBLIC_APP_URL;
  if (!secret) throw new Error("STRIPE_SECRET_KEY manquant");
  if (!publicUrl) throw new Error("PUBLIC_APP_URL manquant");

  const cur = String(currency || "eur").toLowerCase();
  const zeroDecimal = new Set(["xof", "xaf", "jpy", "krw"]);
  const unitAmount = zeroDecimal.has(cur)
    ? Math.round(Number(amount))
    : Math.round(Number(amount) * 100);

  const params = new URLSearchParams();
  params.append("mode", "payment");
  params.append(
    "success_url",
    `${publicUrl.replace(/\/$/, "")}/shop/payment-return?ref=${encodeURIComponent(payment_ref)}&ok=1`
  );
  params.append(
    "cancel_url",
    `${publicUrl.replace(/\/$/, "")}/shop/payment-return?ref=${encodeURIComponent(payment_ref)}&ok=0`
  );
  params.append("client_reference_id", payment_ref);
  params.append("metadata[payment_ref]", payment_ref);
  params.append("metadata[shop_id]", shop_id);
  params.append("line_items[0][price_data][currency]", cur);
  params.append(
    "line_items[0][price_data][product_data][name]",
    "BAARO — Abonnement boutique 1 an"
  );
  params.append("line_items[0][price_data][unit_amount]", String(unitAmount));
  params.append("line_items[0][quantity]", "1");
  if (userEmail) params.append("customer_email", userEmail);

  const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.url) {
    throw new Error(data.error?.message || "Erreur Stripe Checkout");
  }
  return { payment_url: data.url, session_id: data.id };
}

async function getProfile(admin, userId) {
  const { data } = await admin
    .from("profiles")
    .select("created_at, restricted, display_name")
    .eq("user_id", userId)
    .maybeSingle();
  return data;
}

async function assertCashEligible(admin, user) {
  if (user?.is_anonymous === true) {
    return { ok: false, reason: "Créez un compte pour les rachats cash" };
  }
  const profile = await getProfile(admin, user.id);
  if (!profile) return { ok: false, reason: "Profil introuvable" };
  if (profile.restricted) return { ok: false, reason: "Compte restreint" };

  const age = Date.now() - new Date(profile.created_at).getTime();
  if (age < MIN_ACCOUNT_AGE_MS) {
    return { ok: false, reason: "Compte trop récent (3 jours requis)" };
  }
  return { ok: true, profile };
}

async function handleStripeRedeem(req, res) {
  if (req.method !== "POST") return jsonError(res, 405, "Méthode non autorisée");

  const limit = rateLimit(req, {
    key: "stripe-redeem",
    max: 10,
    windowMs: 60_000,
  });
  if (!limit.ok) {
    Object.entries(limit.headers || {}).forEach(([k, v]) => res.setHeader(k, v));
    return res.status(limit.status).json(limit.body);
  }

  const admin = getAdminClient();
  const user = await requireUser(req, admin);
  const body = req.body || {};

  if (body.action !== "create-session") {
    return jsonError(res, 400, "Action inconnue");
  }

  const opt = CASH_OPTIONS[body.optionId];
  if (!opt) return jsonError(res, 400, "Option de rachat inconnue");

  const eligibility = await assertCashEligible(admin, user);
  if (!eligibility.ok) return jsonError(res, 403, eligibility.reason);

  if (!process.env.STRIPE_SECRET_KEY) {
    return jsonError(
      res,
      503,
      "Le service de rachat est temporairement indisponible : STRIPE_SECRET_KEY n'est pas configurée."
    );
  }

  if (process.env.BAARO_PAYOUT_ENABLED !== "true") {
    return jsonError(
      res,
      503,
      "Les rachats cash ne sont pas encore activés. Configurez le système de payout BAARO avant la mise en production."
    );
  }

  return jsonError(
    res,
    501,
    "Payout non implémenté : utilisez Stripe Connect + webhook idempotent avant activation."
  );
}

export default async function handler(req, res) {
  if (applyCors(req, res)) return;

  const route = new URL(
    req.url || "/api/payments",
    "http://localhost"
  ).searchParams.get("route");

  try {
    if (route === "stripe-redeem") {
      return await handleStripeRedeem(req, res);
    }
    return await createPayment(req, res);
  } catch (e) {
    console.error("/api/payments:", e);
    return jsonError(res, e.status || 500, e.message || "Erreur serveur");
  }
}
