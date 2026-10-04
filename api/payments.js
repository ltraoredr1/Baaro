/**
 * BAARO /api/payments
 * Secure payment-initiation facade.
 *
 * Rules:
 * - never trusts a client supplied amount for an existing resource;
 * - authenticates the user with Supabase;
 * - supports monetization checkout intents, orders, shops and companies;
 * - Stripe/CinetPay only; no wallet/crypto/top-up surface;
 * - provider webhooks remain the source of truth for settlement.
 */
import { createClient } from "@supabase/supabase-js";
import {
  applyCors,
  getAdminClient,
  requireUser,
  rateLimitAsync,
  createCheckoutSession,
  mapStripeError,
} from "./_shared.js";

const CINETPAY_API_KEY = process.env.CINETPAY_API_KEY || "";
const CINETPAY_SITE_ID = process.env.CINETPAY_SITE_ID || "";
const PUBLIC_APP_URL = (
  process.env.PUBLIC_APP_URL ||
  process.env.VERCEL_PROJECT_PRODUCTION_URL ||
  process.env.VERCEL_URL ||
  "http://localhost:3000"
).replace(/\/$/, "").replace(/^(?!https?:\/\/)/, "https://");

function json(res, status, body) {
  return res.status(status).json(body);
}

function normalizeProvider(value) {
  const provider = String(value || "cinetpay").toLowerCase();
  if (!['stripe', 'cinetpay'].includes(provider)) {
    const error = new Error("Fournisseur de paiement non supporté.");
    error.status = 400;
    throw error;
  }
  return provider;
}

function publicReference(kind, id) {
  return `${kind}_${id}_${Date.now()}`;
}

// BAARO stores monetary values internally in minor units.
// XOF has zero provider decimals, so 150000 internal minor = 1500 XOF.
function minorToMajor(amountMinor, currency = "XOF") {
  const cur = String(currency || "XOF").toUpperCase();
  return ["JPY", "KRW", "XOF", "XAF"].includes(cur)
    ? Number(amountMinor) / 100
    : Number(amountMinor) / 100;
}

function majorToMinor(amountMajor, currency = "XOF") {
  const cur = String(currency || "XOF").toUpperCase();
  return ["JPY", "KRW", "XOF", "XAF"].includes(cur)
    ? Math.round(Number(amountMajor) * 100)
    : Math.round(Number(amountMajor) * 100);
}

async function resolvePayment(admin, user, body) {
  const paymentRef = String(body.payment_ref || body.paymentRef || "").trim();
  const checkoutIntentId = String(body.checkout_intent_id || body.checkoutIntentId || "").trim();

  if (checkoutIntentId || paymentRef.startsWith("checkout_")) {
    const id = checkoutIntentId || paymentRef.slice("checkout_".length);
    const { data, error } = await admin
      .from("monetization_checkout_intents")
      .select("id,user_id,product_code,amount_minor,currency,status,expires_at,metadata")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    if (!data) return { error: "Checkout introuvable.", status: 404 };
    if (data.user_id !== user.id) return { error: "Checkout non autorisé.", status: 403 };
    if (!['pending', 'processing'].includes(data.status)) {
      return { error: "Ce checkout n'est plus payable.", status: 409 };
    }
    if (new Date(data.expires_at).getTime() <= Date.now()) {
      await admin.from("monetization_checkout_intents").update({ status: "expired", updated_at: new Date().toISOString() }).eq("id", data.id).eq("status", "pending");
      return { error: "Checkout expiré.", status: 410 };
    }
    return {
      kind: "monetization",
      paymentRef: `checkout_${data.id}`,
      amount: Number(data.amount_minor),
      currency: data.currency || "XOF",
      description: `BAARO — ${data.product_code}`,
      checkoutIntentId: data.id,
      metadata: data.metadata || {},
    };
  }

  if (paymentRef.startsWith("order_")) {
    const match = paymentRef.match(/^order_([0-9a-f-]{36})_/i);
    if (!match) return { error: "Référence commande invalide.", status: 400 };
    const orderId = match[1];
    const { data: order, error } = await admin
      .from("orders")
      .select("id,total_amount,currency,buyer_id,payment_status")
      .eq("id", orderId)
      .maybeSingle();
    if (error) throw error;
    if (!order) return { error: "Commande introuvable.", status: 404 };
    if (order.buyer_id !== user.id) return { error: "Commande non autorisée.", status: 403 };
    if (order.payment_status === "paid") return { error: "Commande déjà payée.", status: 409 };
    return {
      kind: "order",
      paymentRef,
      amount: majorToMinor(Number(order.total_amount), order.currency || "XOF"),
      currency: order.currency || "XOF",
      description: `Commande BAARO ${order.id.slice(0, 8)}`,
      orderId: order.id,
    };
  }

  if (paymentRef.startsWith("shop_")) {
    const { data: sub, error } = await admin
      .from("shop_subscriptions")
      .select("id,shop_id,amount,currency,payment_ref,status,provider,shops!inner(owner_id,name)")
      .eq("payment_ref", paymentRef)
      .maybeSingle();
    if (error) throw error;
    if (!sub) return { error: "Abonnement boutique introuvable.", status: 404 };
    if (sub.shops?.owner_id !== user.id) return { error: "Abonnement non autorisé.", status: 403 };
    if (sub.status !== "pending") return { error: "Cet abonnement n'est plus payable.", status: 409 };
    return {
      kind: "shop_sub",
      paymentRef,
      amount: majorToMinor(Number(sub.amount), sub.currency || "XOF"),
      currency: sub.currency || "XOF",
      description: `Abonnement boutique BAARO ${sub.shop_id.slice(0, 8)}`,
      shopId: sub.shop_id,
    };
  }

  if (paymentRef.startsWith("company_")) {
    const { data: sub, error } = await admin
      .from("company_subscriptions")
      .select("id,company_id,amount,currency,payment_ref,status,provider,companies!inner(owner_id,name)")
      .eq("payment_ref", paymentRef)
      .maybeSingle();
    if (error) throw error;
    if (!sub) return { error: "Abonnement entreprise introuvable.", status: 404 };
    if (sub.companies?.owner_id !== user.id) return { error: "Abonnement non autorisé.", status: 403 };
    if (sub.status !== "pending") return { error: "Cet abonnement n'est plus payable.", status: 409 };
    return {
      kind: "company_sub",
      paymentRef,
      amount: majorToMinor(Number(sub.amount), sub.currency || "XOF"),
      currency: sub.currency || "XOF",
      description: `Abonnement entreprise BAARO ${sub.company_id.slice(0, 8)}`,
      companyId: sub.company_id,
    };
  }

  return { error: "Référence de paiement invalide. Utilisez un checkout BAARO, une commande ou un abonnement existant.", status: 400 };
}

async function createCinetPayPayment({ user, payment, channel }) {
  if (!CINETPAY_API_KEY || !CINETPAY_SITE_ID) {
    return { error: "CinetPay n'est pas configuré côté serveur.", status: 503 };
  }
  if (payment.currency !== "XOF") {
    return { error: "CinetPay est actuellement configuré pour les paiements XOF.", status: 400 };
  }

  const payload = {
    apikey: CINETPAY_API_KEY,
    site_id: CINETPAY_SITE_ID,
    transaction_id: payment.paymentRef,
    amount: minorToMajor(payment.amount, payment.currency),
    currency: "XOF",
    channels: channel || "ALL",
    description: payment.description,
    client_name: user.user_metadata?.full_name || user.email || "Utilisateur BAARO",
    client_email: user.email || undefined,
    cpm_custom: JSON.stringify({
      userId: user.id,
      kind: payment.kind,
      paymentRef: payment.paymentRef,
      checkoutIntentId: payment.checkoutIntentId || null,
      orderId: payment.orderId || null,
    }),
    notify_url: `${PUBLIC_APP_URL}/api/webhooks`,
    return_url: `${PUBLIC_APP_URL}/?payment=return&ref=${encodeURIComponent(payment.paymentRef)}`,
  };

  const response = await fetch("https://api.cinetpay.com/v2/payment", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(payload),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result.code !== "00") {
    return {
      error: result.description || "Erreur CinetPay.",
      status: 502,
      code: result.code || "cinetpay_error",
    };
  }
  return {
    ok: true,
    provider: "cinetpay",
    payment_url: result.data?.payment_url || result.payment_url || null,
    transaction_id: payment.paymentRef,
    kind: payment.kind,
  };
}

export default async function handler(req, res) {
  if (applyCors(req, res)) return;
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return json(res, 405, { ok: false, error: "Méthode non autorisée." });

  const limit = await rateLimitAsync(req, { key: "payments", max: 12, windowMs: 60_000 });
  if (!limit.ok) {
    Object.entries(limit.headers || {}).forEach(([k, v]) => res.setHeader(k, v));
    return res.status(limit.status).json(limit.body);
  }

  let admin;
  let user;
  try {
    admin = getAdminClient();
    user = await requireUser(req, admin);
  } catch (error) {
    return json(res, error.status || 401, { ok: false, error: error.message, code: "auth_invalid" });
  }

  try {
    const body = req.body || {};
    const provider = normalizeProvider(body.provider);
    const payment = await resolvePayment(admin, user, body);
    if (payment.error) return json(res, payment.status || 400, { ok: false, error: payment.error });
    if (!Number.isFinite(payment.amount) || payment.amount <= 0) return json(res, 400, { ok: false, error: "Montant serveur invalide." });

    if (payment.kind === "monetization") {
      const { error } = await admin
        .from("monetization_checkout_intents")
        .update({ status: "processing", provider, updated_at: new Date().toISOString() })
        .eq("id", payment.checkoutIntentId)
        .eq("user_id", user.id)
        .eq("status", "pending");
      if (error) throw error;
    }

    if (provider === "stripe") {
      try {
        const result = await createCheckoutSession({
          amount: minorToMajor(payment.amount, payment.currency),
          currency: payment.currency,
          paymentRef: payment.paymentRef,
          description: payment.description,
          customerEmail: user.email,
          successUrl: `${PUBLIC_APP_URL}/?payment=success&ref=${encodeURIComponent(payment.paymentRef)}`,
          cancelUrl: `${PUBLIC_APP_URL}/?payment=cancelled&ref=${encodeURIComponent(payment.paymentRef)}`,
          metadata: {
            userId: user.id,
            kind: payment.kind,
            checkout_intent_id: payment.checkoutIntentId || "",
            order_id: payment.orderId || "",
          },
        });
        return json(res, 200, { ...result, provider: "stripe", kind: payment.kind });
      } catch (error) {
        if (payment.kind === "monetization") {
          await admin.from("monetization_checkout_intents").update({ status: "pending", updated_at: new Date().toISOString() }).eq("id", payment.checkoutIntentId).eq("status", "processing");
        }
        const mapped = error.status ? error : mapStripeError(error);
        return json(res, mapped.status || 402, { ok: false, error: mapped.message, code: mapped.code || mapped.type, provider: "stripe" });
      }
    }

    const result = await createCinetPayPayment({ user, payment, channel: body.channel });
    if (!result.ok && payment.kind === "monetization") {
      await admin.from("monetization_checkout_intents").update({ status: "pending", updated_at: new Date().toISOString() }).eq("id", payment.checkoutIntentId).eq("status", "processing");
    }
    return json(res, result.ok ? 200 : (result.status || 502), result);
  } catch (error) {
    console.error("[payments]", error);
    return json(res, 500, { ok: false, error: "Impossible d'initialiser le paiement." });
  }
}
