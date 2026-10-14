/**
 * BAARO /api/payments - 100% AFRIQUE
 * Secure payment-initiation facade.
 * Providers: stripe, cinetpay, paypal, flutterwave, pawapay, orange_money_direct
 */
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
  .trim()
  .replace(/\/+$/, "")
  .replace(/^(?!https?:\/\/)/i, "https://");

const XOF_PER_EUR = 655.957;
const PAYPAL_NATIVE_CURRENCIES = ["USD", "EUR", "GBP", "CAD", "AUD", "CHF"];

function json(res, status, body) {
  return res.status(status).json(body);
}

function getPublicAppUrl() {
  let parsed;

  try {
    parsed = new URL(PUBLIC_APP_URL);
  } catch {
    throw new Error("PUBLIC_APP_URL est invalide.");
  }

  const production =
    process.env.VERCEL_ENV === "production" ||
    process.env.NODE_ENV === "production";

  if (
    production &&
    (parsed.protocol !== "https:" ||
      parsed.hostname === "localhost" ||
      parsed.hostname === "127.0.0.1")
  ) {
    throw new Error(
      "PUBLIC_APP_URL doit être une URL HTTPS publique en production."
    );
  }

  return PUBLIC_APP_URL;
}

function paymentReturnUrl(paymentRef, status = "return", provider) {
  const url = new URL("/", getPublicAppUrl());
  url.searchParams.set("payment", status);
  url.searchParams.set("ref", paymentRef);

  if (provider) {
    url.searchParams.set("provider", provider);
  }

  return url.toString();
}

function normalizeProvider(value) {
  const p = String(value || "cinetpay").trim().toLowerCase();

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

  if (
    [
      "wave",
      "mpesa",
      "mtn",
      "airtel_money",
      "moov",
      "orange_money_direct",
    ].includes(p)
  ) {
    return "pawapay";
  }

  return p;
}

/**
 * BAARO stores amounts in its existing internal minor-unit convention.
 * Keep these conversions aligned with the database and webhook conventions.
 */
function minorToMajor(amountMinor, _currency = "XOF") {
  return Number(amountMinor) / 100;
}

function majorToMinor(amountMajor, _currency = "XOF") {
  return Math.round(Number(amountMajor) * 100);
}

function isValidPositiveAmount(value) {
  return Number.isFinite(Number(value)) && Number(value) > 0;
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

    if (data.user_id !== user.id) {
      return { error: "Checkout non autorisé.", status: 403 };
    }

    if (!["pending", "processing"].includes(data.status)) {
      return { error: "Ce checkout n'est plus payable.", status: 409 };
    }

    const expiresAt = new Date(data.expires_at).getTime();

    if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
      const { error: expireError } = await admin
        .from("monetization_checkout_intents")
        .update({
          status: "expired",
          updated_at: new Date().toISOString(),
        })
        .eq("id", data.id)
        .eq("status", "pending");

      if (expireError) throw expireError;

      return { error: "Checkout expiré.", status: 410 };
    }

    return {
      kind: "monetization",
      paymentRef: `checkout_${data.id}`,
      amount: Number(data.amount_minor),
      currency: String(data.currency || "XOF").toUpperCase(),
      description: `BAARO — ${data.product_code}`,
      checkoutIntentId: data.id,
      metadata: data.metadata || {},
    };
  }

  if (paymentRef.startsWith("order_")) {
    const match = paymentRef.match(/^order_([0-9a-f-]{36})_/i);

    if (!match) {
      return { error: "Référence commande invalide.", status: 400 };
    }

    const orderId = match[1];

    const { data: order, error } = await admin
      .from("orders")
      .select("id,total_amount,currency,buyer_id,payment_status")
      .eq("id", orderId)
      .maybeSingle();

    if (error) throw error;
    if (!order) return { error: "Commande introuvable.", status: 404 };

    if (order.buyer_id !== user.id) {
      return { error: "Commande non autorisée.", status: 403 };
    }

    if (order.payment_status === "paid") {
      return { error: "Commande déjà payée.", status: 409 };
    }

    return {
      kind: "order",
      paymentRef,
      amount: majorToMinor(
        Number(order.total_amount),
        order.currency || "XOF"
      ),
      currency: String(order.currency || "XOF").toUpperCase(),
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
    if (!sub) {
      return { error: "Abonnement boutique introuvable.", status: 404 };
    }

    if (sub.shops?.owner_id !== user.id) {
      return { error: "Abonnement non autorisé.", status: 403 };
    }

    if (sub.status !== "pending") {
      return { error: "Cet abonnement n'est plus payable.", status: 409 };
    }

    return {
      kind: "shop_sub",
      paymentRef,
      amount: majorToMinor(Number(sub.amount), sub.currency || "XOF"),
      currency: String(sub.currency || "XOF").toUpperCase(),
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

    if (!sub) {
      return {
        error: "Abonnement entreprise introuvable.",
        status: 404,
      };
    }

    if (sub.companies?.owner_id !== user.id) {
      return { error: "Abonnement non autorisé.", status: 403 };
    }

    if (sub.status !== "pending") {
      return { error: "Cet abonnement n'est plus payable.", status: 409 };
    }

    return {
      kind: "company_sub",
      paymentRef,
      amount: majorToMinor(Number(sub.amount), sub.currency || "XOF"),
      currency: String(sub.currency || "XOF").toUpperCase(),
      description: `Abonnement entreprise BAARO ${sub.company_id.slice(0, 8)}`,
      companyId: sub.company_id,
    };
  }

  return { error: "Référence invalide.", status: 400 };
}

// --- CINETPAY ---
async function createCinetPayPayment({ user, payment, channel }) {
  if (!CINETPAY_API_KEY || !CINETPAY_SITE_ID) {
    return { error: "CinetPay non configuré.", status: 503 };
  }

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
    notify_url: `${getPublicAppUrl()}/api/webhooks`,
    return_url: paymentReturnUrl(payment.paymentRef),
    cpm_custom: JSON.stringify({
      userId: user.id,
      kind: payment.kind,
      paymentRef: payment.paymentRef,
    }),
  };

  const response = await fetch("https://api.cinetpay.com/v2/payment", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const result = await response.json().catch(() => ({}));

  if (!response.ok || result.code !== "00") {
    return {
      error: result.description || "Erreur CinetPay.",
      status: 502,
      code: result.code,
    };
  }

  const paymentUrl = result.data?.payment_url || result.payment_url;

  if (typeof paymentUrl !== "string" || !/^https:\/\//i.test(paymentUrl)) {
    return {
      error: "CinetPay n'a pas retourné une URL de paiement valide.",
      status: 502,
    };
  }

  return {
    ok: true,
    provider: "cinetpay",
    payment_url: paymentUrl,
    transaction_id: payment.paymentRef,
    kind: payment.kind,
  };
}

// --- PAYPAL ---
function toPayPalAmount(payment) {
  const currency = String(payment.currency || "XOF").toUpperCase();
  const major = minorToMajor(payment.amount, currency);

  if (!Number.isFinite(major) || major <= 0) return null;

  if (["XOF", "XAF"].includes(currency)) {
    return {
      currency_code: "EUR",
      value: (major / XOF_PER_EUR).toFixed(2),
    };
  }

  if (PAYPAL_NATIVE_CURRENCIES.includes(currency)) {
    return {
      currency_code: currency,
      value: major.toFixed(2),
    };
  }

  return null;
}

async function getPayPalAccessToken() {
  const basic = Buffer.from(
    `${PAYPAL_CLIENT_ID}:${PAYPAL_CLIENT_SECRET}`
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

  if (!response.ok || !data.access_token) {
    // Do not log the token, secret, or Authorization header.
    throw new Error("Authentification PayPal impossible.");
  }

  return data.access_token;
}

async function createPayPalPayment({ payment }) {
  if (!PAYPAL_CLIENT_ID || !PAYPAL_CLIENT_SECRET) {
    return { error: "PayPal non configuré.", status: 503 };
  }

  const amount = toPayPalAmount(payment);

  if (!amount || Number(amount.value) <= 0) {
    return { error: "Devise non supportée PayPal.", status: 400 };
  }

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
              return_url: paymentReturnUrl(
                payment.paymentRef,
                "return",
                "paypal"
              ),
              cancel_url: paymentReturnUrl(
                payment.paymentRef,
                "cancelled",
                "paypal"
              ),
            },
          },
        },
      }),
    });

    const result = await response.json().catch(() => ({}));

    if (!response.ok || !result.id) {
      return {
        error: result.message || "Erreur PayPal.",
        status: 502,
      };
    }

    const link = (result.links || []).find(
      (item) => ["payer-action", "approve"].includes(item.rel)
    );

    if (!link?.href || !/^https:\/\//i.test(link.href)) {
      return { error: "Lien PayPal introuvable ou invalide.", status: 502 };
    }

    return {
      ok: true,
      provider: "paypal",
      payment_url: link.href,
      paypal_order_id: result.id,
      transaction_id: payment.paymentRef,
      kind: payment.kind,
    };
  } catch (error) {
    // Avoid logging request headers, tokens, credentials, or raw provider data.
    console.error("[paypal] Payment initialization failed.");
    return { error: "PayPal indisponible.", status: 502 };
  }
}

// --- FLUTTERWAVE ---
async function createFlutterwavePayment({ user, payment, body }) {
  if (!FLW_SECRET_KEY) {
    return { error: "Flutterwave non configuré.", status: 503 };
  }

  const amountMajor = minorToMajor(payment.amount, payment.currency);

  const payload = {
    tx_ref: payment.paymentRef,
    amount: amountMajor,
    currency: String(payment.currency || "XOF").toUpperCase(),
    redirect_url: paymentReturnUrl(payment.paymentRef),
    customer: {
      email: user.email,
      name: user.user_metadata?.full_name || "BAARO User",
      phonenumber: body.phone || undefined,
    },
    customizations: {
      title: "BAARO",
      description: payment.description,
      logo: `${getPublicAppUrl()}/logo.png`,
    },
    meta: {
      userId: user.id,
      kind: payment.kind,
      paymentRef: payment.paymentRef,
    },
  };

  const response = await fetch("https://api.flutterwave.com/v3/payments", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${FLW_SECRET_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const result = await response.json().catch(() => ({}));

  if (!response.ok || result.status !== "success") {
    return {
      error: result.message || "Erreur Flutterwave.",
      status: 502,
    };
  }

  const paymentUrl = result.data?.link;

  if (typeof paymentUrl !== "string" || !/^https:\/\//i.test(paymentUrl)) {
    return {
      error: "Flutterwave n'a pas retourné une URL de paiement valide.",
      status: 502,
    };
  }

  return {
    ok: true,
    provider: "flutterwave",
    payment_url: paymentUrl,
    transaction_id: payment.paymentRef,
    kind: payment.kind,
    flw_ref: result.data?.tx_ref,
  };
}

// --- PAWAPAY ---
async function createPawaPayPayment({ user, payment, body }) {
  if (!PAWAPAY_API_KEY) {
    return { error: "PawaPay non configuré.", status: 503 };
  }

  const channelMap = {
    orange_money: "ORANGE_MONEY",
    mtn: "MTN_MOMO",
    mpesa: "MPESA",
    airtel_money: "AIRTEL_MONEY",
    wave: "WAVE",
    moov: "MOOV_MONEY",
    orange_money_direct: "ORANGE_MONEY",
  };

  const channel = String(body.channel || body.provider || "orange_money")
    .trim()
    .toLowerCase();

  const providerCode = channelMap[channel] || "ORANGE_MONEY";
  const phone = String(body.phone || user.phone || "").trim();

  if (!phone) {
    // Preserve the existing fallback behavior.
    return createFlutterwavePayment({ user, payment, body });
  }

  const payload = {
    depositId: payment.paymentRef,
    returnUrl: paymentReturnUrl(payment.paymentRef),
    amount: String(minorToMajor(payment.amount, payment.currency)),
    currency: String(payment.currency || "XOF").toUpperCase(),
    country: String(body.country || "ML").toUpperCase(),
    correspondent: providerCode,
    payer: {
      type: "MSISDN",
      address: { value: phone },
    },
    customerTimestamp: new Date().toISOString(),
    statementDescription: `BAARO ${payment.description}`.slice(0, 22),
  };

  const response = await fetch(`${PAWAPAY_BASE}/v2/deposits`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${PAWAPAY_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const result = await response.json().catch(() => ({}));

  if (!response.ok) {
    // Do not send raw provider payloads back to the client.
    return {
      error: result.message || "Erreur PawaPay.",
      status: 502,
    };
  }

  return {
    ok: true,
    provider: "pawapay",
    transaction_id: payment.paymentRef,
    kind: payment.kind,
    depositId: payload.depositId,
    status: result.status || "ACCEPTED",
    message: `Confirmez sur votre téléphone ${phone} - ${providerCode}`,
    requiresPhoneConfirmation: true,
  };
}

// --- HANDLER ---
export default async function handler(req, res) {
  if (applyCors(req, res)) return;

  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST, OPTIONS");
    return json(res, 405, {
      ok: false,
      error: "Méthode non autorisée.",
    });
  }

  const limit = await rateLimitAsync(req, {
    key: "payments",
    max: 20,
    windowMs: 60_000,
  });

  if (!limit.ok) {
    Object.entries(limit.headers || {}).forEach(([key, value]) => {
      res.setHeader(key, value);
    });

    return res.status(limit.status).json(limit.body);
  }

  let admin;
  let user;

  try {
    admin = getAdminClient();
    user = await requireUser(req, admin);
  } catch (error) {
    return json(res, error.status || 401, {
      ok: false,
      error:
        error.status === 401
          ? error.message
          : "Service d'authentification indisponible.",
      code: "auth_invalid",
    });
  }

  try {
    const body = req.body || {};
    const provider = normalizeProvider(body.provider);
    const payment = await resolvePayment(admin, user, body);

    if (payment.error) {
      return json(res, payment.status || 400, {
        ok: false,
        error: payment.error,
      });
    }

    if (!isValidPositiveAmount(payment.amount)) {
      return json(res, 400, {
        ok: false,
        error: "Montant invalide.",
      });
    }

    if (payment.kind === "monetization") {
      const { error: updateError } = await admin
        .from("monetization_checkout_intents")
        .update({
          status: "processing",
          provider,
          updated_at: new Date().toISOString(),
        })
        .eq("id", payment.checkoutIntentId)
        .eq("user_id", user.id)
        .in("status", ["pending", "processing"]);

      if (updateError) {
        console.error("[payments] Could not update checkout status.");

        return json(res, 503, {
          ok: false,
          error: "Impossible de préparer le paiement. Réessaie plus tard.",
        });
      }
    }

    if (provider === "stripe") {
      try {
        const result = await createCheckoutSession({
          amount: minorToMajor(payment.amount, payment.currency),
          currency: payment.currency,
          paymentRef: payment.paymentRef,
          description: payment.description,
          customerEmail: user.email,
          successUrl: paymentReturnUrl(payment.paymentRef, "success", "stripe"),
          cancelUrl: paymentReturnUrl(
            payment.paymentRef,
            "cancelled",
            "stripe"
          ),
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
          const { error: resetError } = await admin
            .from("monetization_checkout_intents")
            .update({
              status: "pending",
              updated_at: new Date().toISOString(),
            })
            .eq("id", payment.checkoutIntentId)
            .eq("status", "processing");

          if (resetError) {
            console.error("[payments] Checkout status reset failed.");
          }
        }

        const mapped =
          error?.status && error?.message ? error : mapStripeError(error);

        return json(res, mapped.status || 402, {
          ok: false,
          error: mapped.message || "Erreur Stripe.",
          code: mapped.code,
          provider: "stripe",
        });
      }
    }

    let result;

    if (provider === "paypal") {
      result = await createPayPalPayment({ user, payment });
    } else if (provider === "cinetpay") {
      result = await createCinetPayPayment({
        user,
        payment,
        channel: body.channel,
      });
    } else if (provider === "flutterwave") {
      result = await createFlutterwavePayment({ user, payment, body });
    } else if (provider === "pawapay") {
      result = await createPawaPayPayment({ user, payment, body });
    } else {
      result = {
        error: "Fournisseur de paiement non pris en charge.",
        status: 400,
      };
    }

    if (!result.ok && payment.kind === "monetization") {
      const { error: resetError } = await admin
        .from("monetization_checkout_intents")
        .update({
          status: "pending",
          updated_at: new Date().toISOString(),
        })
        .eq("id", payment.checkoutIntentId)
        .eq("status", "processing");

      if (resetError) {
        console.error("[payments] Checkout status reset failed.");
      }
    }

    return json(res, result.ok ? 200 : result.status || 502, result);
  } catch (error) {
    // Avoid logging provider credentials, request bodies, or payment details.
    console.error("[payments] Payment initialization failed.");

    return json(res, 500, {
      ok: false,
      error: "Impossible d'initialiser le paiement.",
    });
  }
}
