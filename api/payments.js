/**
 * BAARO /api/payments - 100% AFRIQUE
 * Secure payment-initiation facade.
 * Providers: stripe, cinetpay, paypal, flutterwave, pawapay, orange_money_direct
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

// --- ENV ---
const CINETPAY_API_KEY = process.env.CINETPAY_API_KEY || "";
const CINETPAY_SITE_ID = process.env.CINETPAY_SITE_ID || "";
const PAYPAL_CLIENT_ID = process.env.PAYPAL_CLIENT_ID || "";
const PAYPAL_CLIENT_SECRET = process.env.PAYPAL_CLIENT_SECRET || "";
const PAYPAL_API_BASE =
  process.env.PAYPAL_ENV === "live"
    ? "https://api-m.paypal.com"
    : "https://api-m.sandbox.paypal.com";
const FLW_SECRET_KEY = process.env.FLUTTERWAVE_SECRET_KEY || "";
const PAWAPAY_API_KEY = process.env.PAWAPAY_API_KEY || "";
const PAWAPAY_BASE =
  process.env.PAWAPAY_ENV === "live"
    ? "https://api.pawapay.io"
    : "https://api.sandbox.pawapay.io";

const PUBLIC_APP_URL = (
  process.env.PUBLIC_APP_URL ||
  process.env.VERCEL_PROJECT_PRODUCTION_URL ||
  process.env.VERCEL_URL ||
  "http://localhost:3000"
)
  .replace(/\/$/, "")
  .replace(/^(?!https?:\/\/)/, "https://");

const XOF_PER_EUR = 655.957;
const PAYPAL_NATIVE_CURRENCIES = ["USD", "EUR", "GBP", "CAD", "AUD", "CHF"];

function json(res, status, body) {
  return res.status(status).json(body);
}

function normalizeProvider(value) {
  const p = String(value || "cinetpay").toLowerCase();
  if (
    ![
      "stripe",
      "cinetpay",
      "paypal",
      "flutterwave",
      "pawapay",
      "orange_money_direct",
      "wave",
      "mpesa",
      "mtn",
      "airtel_money",
      "moov",
    ].includes(p)
  ) {
    const error = new Error(`Fournisseur ${p} non supporté.`);
    error.status = 400;
    throw error;
  }
  // Map alias vers provider réel
  if (
    ["wave", "mpesa", "mtn", "airtel_money", "moov", "orange_money_direct"].includes(
      p
    )
  ) {
    return "pawapay";
  }
  return p;
}

function minorToMajor(amountMinor, currency = "XOF") {
  return Number(amountMinor) / 100;
}

function majorToMinor(amountMajor, currency = "XOF") {
  return Math.round(Number(amountMajor) * 100);
}

// --- RESOLVE PAYMENT ---
async function resolvePayment(admin, user, body) {
  const paymentRef = String(body.payment_ref || body.paymentRef || "").trim();
  const checkoutIntentId = String(
    body.checkout_intent_id || body.checkoutIntentId || ""
  ).trim();

  if (checkoutIntentId || paymentRef.startsWith("checkout_")) {
    const id = checkoutIntentId || paymentRef.slice("checkout_".length);
    const { data, error } = await admin
      .from("monetization_checkout_intents")
      .select(
        "id,user_id,product_code,amount_minor,currency,status,expires_at,metadata"
      )
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    if (!data) return { error: "Checkout introuvable.", status: 404 };
    if (data.user_id !== user.id)
      return { error: "Checkout non autorisé.", status: 403 };
    if (!["pending", "processing"].includes(data.status))
      return { error: "Ce checkout n'est plus payable.", status: 409 };
    if (new Date(data.expires_at).getTime() <= Date.now()) {
      await admin
        .from("monetization_checkout_intents")
        .update({ status: "expired", updated_at: new Date().toISOString() })
        .eq("id", data.id)
        .eq("status", "pending");
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
    if (order.buyer_id !== user.id)
      return { error: "Commande non autorisée.", status: 403 };
    if (order.payment_status === "paid")
      return { error: "Commande déjà payée.", status: 409 };
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
      .select(
        "id,shop_id,amount,currency,payment_ref,status,provider,shops!inner(owner_id,name)"
      )
      .eq("payment_ref", paymentRef)
      .maybeSingle();
    if (error) throw error;
    if (!sub) return { error: "Abonnement boutique introuvable.", status: 404 };
    if (sub.shops?.owner_id !== user.id)
      return { error: "Abonnement non autorisé.", status: 403 };
    if (sub.status !== "pending")
      return { error: "Cet abonnement n'est plus payable.", status: 409 };
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
      .select(
        "id,company_id,amount,currency,payment_ref,status,provider,companies!inner(owner_id,name)"
      )
      .eq("payment_ref", paymentRef)
      .maybeSingle();
    if (error) throw error;
    if (!sub)
      return { error: "Abonnement entreprise introuvable.", status: 404 };
    if (sub.companies?.owner_id !== user.id)
      return { error: "Abonnement non autorisé.", status: 403 };
    if (sub.status !== "pending")
      return { error: "Cet abonnement n'est plus payable.", status: 409 };
    return {
      kind: "company_sub",
      paymentRef,
      amount: majorToMinor(Number(sub.amount), sub.currency || "XOF"),
      currency: sub.currency || "XOF",
      description: `Abonnement entreprise BAARO ${sub.company_id.slice(0, 8)}`,
      companyId: sub.company_id,
    };
  }

  return { error: "Référence invalide.", status: 400 };
}

// --- PROVIDERS ---

async function createCinetPayPayment({ user, payment, channel }) {
  if (!CINETPAY_API_KEY || !CINETPAY_SITE_ID)
    return { error: "CinetPay non configuré.", status: 503 };
  const payload = {
    apikey: CINETPAY_API_KEY,
    site_id: CINETPAY_SITE_ID,
    transaction_id: payment.paymentRef,
    amount: minorToMajor(payment.amount, payment.currency),
    currency: "XOF",
    channels: channel || "ALL",
    description: payment.description,
    client_name: user.user_metadata?.full_name || user.email || "BAARO",
    client_email: user.email,
    notify_url: `${PUBLIC_APP_URL}/api/webhooks`,
    return_url: `\( {PUBLIC_APP_URL}/?payment=return&ref= \){encodeURIComponent(
      payment.paymentRef
    )}`,
    cpm_custom: JSON.stringify({
      userId: user.id,
      kind: payment.kind,
      paymentRef: payment.paymentRef,
    }),
  };
  const r = await fetch("https://api.cinetpay.com/v2/payment", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const result = await r.json().catch(() => ({}));
  if (!r.ok || result.code !== "00")
    return {
      error: result.description || "Erreur CinetPay.",
      status: 502,
      code: result.code,
    };
  return {
    ok: true,
    provider: "cinetpay",
    payment_url: result.data?.payment_url || result.payment_url,
    transaction_id: payment.paymentRef,
    kind: payment.kind,
  };
}

function toPayPalAmount(payment) {
  const cur = String(payment.currency || "XOF").toUpperCase();
  const major = minorToMajor(payment.amount, cur);
  if (["XOF", "XAF"].includes(cur))
    return {
      currency_code: "EUR",
      value: (major / XOF_PER_EUR).toFixed(2),
    };
  if (PAYPAL_NATIVE_CURRENCIES.includes(cur))
    return { currency_code: cur, value: major.toFixed(2) };
  return null;
}

async function getPayPalAccessToken() {
  const basic = Buffer.from(
    `\( {PAYPAL_CLIENT_ID}: \){PAYPAL_CLIENT_SECRET}`
  ).toString("base64");
  const response = await fetch(`${PAYPAL_API_BASE}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.access_token)
    throw new Error("Auth PayPal impossible.");
  return data.access_token;
}

async function createPayPalPayment({ user, payment }) {
  if (!PAYPAL_CLIENT_ID || !PAYPAL_CLIENT_SECRET)
    return { error: "PayPal non configuré.", status: 503 };
  const amount = toPayPalAmount(payment);
  if (!amount || Number(amount.value) <= 0)
    return { error: "Devise non supportée PayPal.", status: 400 };
  try {
    const token = await getPayPalAccessToken();
    const response = await fetch(`${PAYPAL_API_BASE}/v2/checkout/orders`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "PayPal-Request-Id": payment.paymentRef,
      },
      body: JSON.stringify({
        intent: "CAPTURE",
        purchase_units: [
          {
            reference_id: payment.paymentRef,
            custom_id: payment.paymentRef,
            description: String(payment.description).slice(0, 120),
            amount,
          },
        ],
        payment_source: {
          paypal: {
            experience_context: {
              brand_name: "BAARO",
              user_action: "PAY_NOW",
              shipping_preference: "NO_SHIPPING",
              return_url: `\( {PUBLIC_APP_URL}/?payment=return&provider=paypal&ref= \){encodeURIComponent(
                payment.paymentRef
              )}`,
              cancel_url: `\( {PUBLIC_APP_URL}/?payment=cancelled&provider=paypal&ref= \){encodeURIComponent(
                payment.paymentRef
              )}`,
            },
          },
        },
      }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.id)
      return { error: result.message || "Erreur PayPal.", status: 502 };
    const link = (result.links || []).find((l) =>
      ["payer-action", "approve"].includes(l.rel)
    );
    if (!link?.href)
      return { error: "Lien PayPal introuvable.", status: 502 };
    return {
      ok: true,
      provider: "paypal",
      payment_url: link.href,
      paypal_order_id: result.id,
      transaction_id: payment.paymentRef,
      kind: payment.kind,
    };
  } catch (e) {
    console.error("[paypal]", e);
    return { error: "PayPal indisponible.", status: 502 };
  }
}

async function createFlutterwavePayment({ user, payment, body }) {
  if (!FLW_SECRET_KEY)
    return { error: "Flutterwave non configuré.", status: 503 };
  const amountMajor = minorToMajor(payment.amount, payment.currency);
  const payload = {
    tx_ref: payment.paymentRef,
    amount: amountMajor,
    currency: payment.currency || "XOF",
    redirect_url: `\( {PUBLIC_APP_URL}/?payment=return&ref= \){encodeURIComponent(
      payment.paymentRef
    )}`,
    customer: {
      email: user.email,
      name: user.user_metadata?.full_name || "BAARO User",
      phonenumber: body.phone || undefined,
    },
    customizations: {
      title: "BAARO",
      description: payment.description,
      logo: `${PUBLIC_APP_URL}/logo.png`,
    },
    meta: {
      userId: user.id,
      kind: payment.kind,
      paymentRef: payment.paymentRef,
    },
  };
  const r = await fetch("https://api.flutterwave.com/v3/payments", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${FLW_SECRET_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const result = await r.json().catch(() => ({}));
  if (!r.ok || result.status !== "success")
    return { error: result.message || "Erreur Flutterwave.", status: 502 };
  return {
    ok: true,
    provider: "flutterwave",
    payment_url: result.data?.link,
    transaction_id: payment.paymentRef,
    kind: payment.kind,
    flw_ref: result.data?.tx_ref,
  };
}

async function createPawaPayPayment({ user, payment, body }) {
  if (!PAWAPAY_API_KEY)
    return { error: "PawaPay non configuré.", status: 503 };

  const channelMap = {
    orange_money: "ORANGE_MONEY",
    mtn: "MTN_MOMO",
    mpesa: "MPESA",
    airtel_money: "AIRTEL_MONEY",
    wave: "WAVE",
    moov: "MOOV_MONEY",
    orange_money_direct: "ORANGE_MONEY",
  };
  const providerCode =
    channelMap[body.channel] || channelMap[body.provider] || "ORANGE_MONEY";

  const amountMajor = String(minorToMajor(payment.amount, payment.currency));
  const payload = {
    depositId: payment.paymentRef,
    returnUrl: `\( {PUBLIC_APP_URL}/?payment=return&ref= \){encodeURIComponent(
      payment.paymentRef
    )}`,
    amount: amountMajor,
    currency: payment.currency || "XOF",
    country: body.country || "ML",
    correspondent: providerCode,
    payer: {
      type: "MSISDN",
      address: { value: body.phone || user.phone || "" },
    },
    customerTimestamp: new Date().toISOString(),
    statementDescription: `BAARO ${payment.description}`.slice(0, 22),
  };

  if (!payload.payer.address.value) {
    return createFlutterwavePayment({ user, payment, body });
  }

  const r = await fetch(`${PAWAPAY_BASE}/v2/deposits`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${PAWAPAY_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const result = await r.json().catch(() => ({}));
  if (!r.ok)
    return {
      error: result.message || "Erreur PawaPay.",
      status: 502,
      raw: result,
    };

  return {
    ok: true,
    provider: "pawapay",
    transaction_id: payment.paymentRef,
    kind: payment.kind,
    depositId: payload.depositId,
    status: result.status,
    message: `Confirmez sur votre téléphone ${payload.payer.address.value} - ${providerCode}`,
    requiresPhoneConfirmation: true,
  };
}

// --- HANDLER ---
export default async function handler(req, res) {
  if (applyCors(req, res)) return;
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST")
    return json(res, 405, { ok: false, error: "Méthode non autorisée." });

  const limit = await rateLimitAsync(req, {
    key: "payments",
    max: 20,
    windowMs: 60_000,
  });
  if (!limit.ok) {
    Object.entries(limit.headers || {}).forEach(([k, v]) =>
      res.setHeader(k, v)
    );
    return res.status(limit.status).json(limit.body);
  }

  let admin, user;
  try {
    admin = getAdminClient();
    user = await requireUser(req, admin);
  } catch (error) {
    return json(res, error.status || 401, {
      ok: false,
      error: error.message,
      code: "auth_invalid",
    });
  }

  try {
    const body = req.body || {};
    const provider = normalizeProvider(body.provider);
    const payment = await resolvePayment(admin, user, body);
    if (payment.error)
      return json(res, payment.status || 400, {
        ok: false,
        error: payment.error,
      });
    if (!Number.isFinite(payment.amount) || payment.amount <= 0)
      return json(res, 400, { ok: false, error: "Montant invalide." });

    if (payment.kind === "monetization") {
      await admin
        .from("monetization_checkout_intents")
        .update({
          status: "processing",
          provider,
          updated_at: new Date().toISOString(),
        })
        .eq("id", payment.checkoutIntentId)
        .eq("user_id", user.id)
        .eq("status", "pending");
    }

    if (provider === "stripe") {
      try {
        const result = await createCheckoutSession({
          amount: minorToMajor(payment.amount, payment.currency),
          currency: payment.currency,
          paymentRef: payment.paymentRef,
          description: payment.description,
          customerEmail: user.email,
          successUrl: `\( {PUBLIC_APP_URL}/?payment=success&ref= \){encodeURIComponent(
            payment.paymentRef
          )}`,
          cancelUrl: `\( {PUBLIC_APP_URL}/?payment=cancelled&ref= \){encodeURIComponent(
            payment.paymentRef
          )}`,
          metadata: {
            userId: user.id,
            kind: payment.kind,
            checkout_intent_id: payment.checkoutIntentId || "",
            order_id: payment.orderId || "",
          },
        });
        return json(res, 200, {
          ...result,
          provider: "stripe",
          kind: payment.kind,
        });
      } catch (error) {
        if (payment.kind === "monetization") {
          await admin
            .from("monetization_checkout_intents")
            .update({
              status: "pending",
              updated_at: new Date().toISOString(),
            })
            .eq("id", payment.checkoutIntentId)
            .eq("status", "processing");
        }
        const mapped = error.status ? error : mapStripeError(error);
        return json(res, mapped.status || 402, {
          ok: false,
          error: mapped.message,
          code: mapped.code,
          provider: "stripe",
        });
      }
    }

    let result;
    if (provider === "paypal")
      result = await createPayPalPayment({ user, payment });
    else if (provider === "cinetpay")
      result = await createCinetPayPayment({
        user,
        payment,
        channel: body.channel,
      });
    else if (provider === "flutterwave")
      result = await createFlutterwavePayment({ user, payment, body });
    else if (provider === "pawapay")
      result = await createPawaPayPayment({ user, payment, body });
    else
      result = await createCinetPayPayment({
        user,
        payment,
        channel: body.channel,
      });

    if (!result.ok && payment.kind === "monetization") {
      await admin
        .from("monetization_checkout_intents")
        .update({
          status: "pending",
          updated_at: new Date().toISOString(),
        })
        .eq("id", payment.checkoutIntentId)
        .eq("status", "processing");
    }
    return json(res, result.ok ? 200 : result.status || 502, result);
  } catch (error) {
    console.error("[payments]", error);
    return json(res, 500, {
      ok: false,
      error: "Impossible d'initialiser le paiement.",
    });
  }
}
