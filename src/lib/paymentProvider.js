// src/lib/paymentProvider.js
import { supabase } from "../supabaseClient.js";

// PayPal n'apparaît dans l'app que si VITE_PAYPAL_ENABLED=true (à mettre sur Vercel
// une fois les clés PayPal configurées côté serveur, puis redéployer).
const PAYPAL_ENABLED = import.meta.env.VITE_PAYPAL_ENABLED === "true";

function apiBase() {
  const base = import.meta.env.VITE_API_BASE_URL || "";
  return base.replace(/\/$/, "");
}

async function getAuthenticatedSession() {
  const { data, error } = await supabase.auth.getSession();

  if (error) {
    console.error("Authentication error:", error);
    throw new Error("Impossible de récupérer la session.");
  }

  const session = data?.session;

  if (!session?.access_token) {
    throw new Error("Session requise pour le paiement. Veuillez vous reconnecter.");
  }

  return session;
}

export async function createPayment({
  provider,
  shopId,
  paymentRef,
  channel,
  amount,
  currency,
  user_id,
  companyId,
  orderId,
  paymentType,
  checkoutIntentId,
}) {
  const session = await getAuthenticatedSession();
  const authenticatedUserId = session.user?.id;

  if (!authenticatedUserId && !user_id) {
    throw new Error("Utilisateur authentifié introuvable.");
  }

  const url = `${apiBase()}/api/payments`;

  const requestBody = {
    provider,
    shop_id: shopId,
    payment_ref: paymentRef,
    channel,
    amount,
    currency,
    user_id: user_id || authenticatedUserId,
    company_id: companyId,
    order_id: orderId,
    payment_type: paymentType,
    checkout_intent_id: checkoutIntentId,
  };

  Object.keys(requestBody).forEach((key) => {
    if (
      requestBody[key] === undefined ||
      requestBody[key] === null ||
      requestBody[key] === ""
    ) {
      delete requestBody[key];
    }
  });

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify(requestBody),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      console.error("Payment API error:", data);
      throw new Error(data?.error || `Erreur paiement (${res.status})`);
    }

    return data;
  } catch (error) {
    console.error("Create payment error:", error);
    throw error;
  }
}

export async function getPaymentStatus(paymentRef) {
  if (!paymentRef) {
    throw new Error("Référence de paiement requise.");
  }

  if (paymentRef.startsWith("checkout_")) {
    const id = paymentRef.slice("checkout_".length);
    const { data, error } = await supabase
      .from("monetization_checkout_intents")
      .select("id, product_code, status, provider, provider_reference, amount_minor, currency, expires_at")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  const { data, error } = await supabase
    .from("shop_subscriptions")
    .select("status, provider, currency, amount, period_end")
    .eq("payment_ref", paymentRef)
    .maybeSingle();

  if (error) {
    console.error("Error fetching payment status:", error);
    throw error;
  }

  return data;
}

export function getAvailableProviders(countryCode) {
  const cc = String(countryCode || "").toUpperCase();
  const westAfrica = ["ML", "CI", "SN", "BF", "BJ", "TG", "GN", "CM", "NE"];

  const paypal = PAYPAL_ENABLED
    ? [
        {
          id: "paypal",
          label: "PayPal",
          description: "Compte PayPal ou carte via PayPal",
          channels: [],
          enabled: true,
          icon: "🅿️",
        },
      ]
    : [];

  if (westAfrica.includes(cc)) {
    return [
      {
        id: "cinetpay",
        label: "Mobile Money / Carte (CinetPay)",
        description: "Orange Money, MTN, Wave, Moov, Carte bancaire",
        channels: ["orange_money", "mtn", "moov", "wave", "card"],
        enabled: true,
        icon: "📱",
      },
      {
        id: "stripe",
        label: "Carte bancaire internationale (Stripe)",
        description: "Visa, Mastercard, American Express",
        channels: ["card"],
        enabled: true,
        icon: "💳",
      },
      ...paypal,
    ];
  }

  return [
    {
      id: "stripe",
      label: "Carte bancaire (Stripe)",
      description: "Visa, Mastercard",
      channels: ["card"],
      enabled: true,
      icon: "💳",
    },
    ...paypal,
    {
      id: "cinetpay",
      label: "Mobile Money (CinetPay)",
      description: "Paiement mobile africain",
      channels: ["orange_money", "mtn", "wave"],
      enabled: true,
      icon: "📱",
    },
  ];
}

export function validateProvider(providerId, countryCode) {
  const provider = getAvailableProviders(countryCode).find(
    (item) => item.id === providerId
  );

  if (!provider) {
    throw new Error(`Le moyen de paiement "${providerId}" n'existe pas.`);
  }

  if (!provider.enabled) {
    throw new Error(
      `Le moyen de paiement "${providerId}" n'est pas disponible actuellement.`
    );
  }

  return true;
}

export function getProviderChannels(providerId, countryCode) {
  const provider = getAvailableProviders(countryCode).find(
    (item) => item.id === providerId
  );

  return provider?.channels || [];
}

export function formatAmount(amount, currency) {
  const numericAmount = Number(amount);

  if (!Number.isFinite(numericAmount)) {
    return `0 ${currency || ""}`.trim();
  }

  const currencies = {
    XOF: { symbol: "FCFA", decimals: 0 },
    EUR: { symbol: "€", decimals: 2 },
    USD: { symbol: "$", decimals: 2 },
  };

  const config = currencies[currency] || {
    symbol: currency || "",
    decimals: 2,
  };

  return `${numericAmount.toLocaleString("fr-FR", {
    minimumFractionDigits: config.decimals,
    maximumFractionDigits: config.decimals,
  })} ${config.symbol}`.trim();
}

export function calculateFees(amount, provider, currency = "XOF") {
  const numericAmount = Number(amount);

  if (!Number.isFinite(numericAmount) || numericAmount < 0) {
    return { percentage: 0, fixed: 0, total: 0, net: 0 };
  }

  // Estimations d'affichage uniquement. Les frais PayPal sont à vérifier
  // dans ton compte PayPal Business (ils varient selon le pays et la devise).
  const feeRates = {
    cinetpay: 0.035,
    stripe: 0.029,
    paypal: 0.044,
  };

  const fixedFees = {
    XOF: { cinetpay: 0, stripe: 0, paypal: 230 },
    EUR: { cinetpay: 0.25, stripe: 0.25, paypal: 0.35 },
    USD: { cinetpay: 0.3, stripe: 0.3, paypal: 0.49 },
  };

  const rate = feeRates[provider] ?? 0.035;
  const fixed = fixedFees[currency]?.[provider] ?? 0;
  const percentage = rate * numericAmount;
  const total = percentage + fixed;

  return {
    percentage,
    fixed,
    total,
    net: Math.max(0, numericAmount - total),
  };
}
