// src/lib/paymentProvider.js
import { supabase } from "../supabaseClient.js";

const PAYPAL_ENABLED = import.meta.env.VITE_PAYPAL_ENABLED === "true";
const FLUTTERWAVE_ENABLED = import.meta.env.VITE_FLUTTERWAVE_ENABLED!== "false"; // activé par défaut

function apiBase() {
  const base = (import.meta.env.VITE_API_BASE_URL || "").trim().replace(/\/$/, "");
  return base;
}

async function getAuthenticatedSession() {
  const { data, error } = await supabase.auth.getSession();
  if (error) {
    console.error("[BAARO] Auth error:", error);
    throw new Error("Impossible de récupérer la session.");
  }
  const session = data?.session;
  if (!session?.access_token) {
    throw new Error("Session requise. Veuillez vous reconnecter.");
  }
  return session;
}

async function fetchWithTimeout(url, options, ms = 20000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), ms);
  try {
    const res = await fetch(url, {...options, signal: controller.signal });
    return res;
  } finally {
    clearTimeout(id);
  }
}

/**
 * Crée un paiement - 100% Afrique
 * provider: stripe | cinetpay | 【entity-paypal¦canonical_name=PayPal】 | flutterwave | pawapay
 * channel: orange_money | wave | mtn | moov | mpesa | airtel_money | card etc
 * phone: requis pour pawapay (ex: 22370123456)
 */
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
  phone,
  country,
}) {
  const session = await getAuthenticatedSession();
  const authenticatedUserId = session.user?.id;

  if (!authenticatedUserId &&!user_id) {
    throw new Error("Utilisateur authentifié introuvable.");
  }
  if (!amount || Number(amount) <= 0) {
    throw new Error("Montant invalide.");
  }

  // Map alias vers provider backend réel
  let realProvider = String(provider || "cinetpay").toLowerCase();
  let realChannel = channel;

  // Alias mobiles -> pawapay
  const mobileAlias = {
    orange_money: "pawapay",
    orange_money_direct: "pawapay",
    wave: "pawapay",
    mtn: "pawapay",
    mpesa: "pawapay",
    airtel_money: "pawapay",
    moov: "pawapay",
  };
  if (mobileAlias[realProvider]) {
    realChannel = realProvider;
    realProvider = "pawapay";
  }

  const base = apiBase();
  const url = base? `${base}/api/payments` : `/api/payments`;

  const requestBody = {
    provider: realProvider,
    shop_id: shopId,
    payment_ref: paymentRef,
    channel: realChannel || channel,
    amount: Number(amount),
    currency: (currency || "XOF").toUpperCase(),
    user_id: user_id || authenticatedUserId,
    company_id: companyId,
    order_id: orderId,
    payment_type: paymentType,
    checkout_intent_id: checkoutIntentId,
    phone: phone? String(phone).replace(/[^0-9]/g, "") : undefined,
    country: country? String(country).toUpperCase() : undefined,
  };

  Object.keys(requestBody).forEach((key) => {
    if (
      requestBody[key] === undefined ||
      requestBody[key] === null ||
      requestBody[key] === "" ||
      (Array.isArray(requestBody[key]) && requestBody[key].length === 0)
    ) {
      delete requestBody[key];
    }
  });

  try {
    const res = await fetchWithTimeout(
      url,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(requestBody),
      },
      20000
    );

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      console.error("[BAARO] Payment API error:", data);
      throw new Error(data?.error || data?.message || `Erreur paiement (${res.status})`);
    }

    return data;
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error("Délai dépassé, réessayez.");
    }
    console.error("[BAARO] Create payment error:", error);
    throw error;
  }
}

export async function getPaymentStatus(paymentRef) {
  if (!paymentRef) throw new Error("Référence requise.");

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
   .select("status, provider, currency, amount, period_end, payment_ref")
   .eq("payment_ref", paymentRef)
   .maybeSingle();

  if (error) throw error;
  return data;
}

// --- CATALOGUE 100% AFRIQUE ---
const PROVIDER_DEFS = {
  orange_money: {
    id: "orange_money",
    label: "Orange Money",
    description: "Mali, CI, SN, BF - #144#",
    channels: ["orange_money"],
    enabled: true,
    icon: "🟠",
    badge: "POPULAIRE",
    countries: ["ML", "CI", "SN", "BF", "BJ"],
    fees: 0.02,
  },
  wave: {
    id: "wave",
    label: "Wave",
    description: "CI, SN - 0% frais, instantané",
    channels: ["wave"],
    enabled: true,
    icon: "🐧",
    badge: "0% FRAIS",
    countries: ["CI", "SN", "BF", "ML"],
    fees: 0.01,
  },
  mtn: {
    id: "mtn",
    label: "MTN MoMo",
    description: "BJ, GN, CI, CM, GH, UG, NG",
    channels: ["mtn"],
    enabled: true,
    icon: "💛",
    countries: ["BJ", "CI", "CM", "GH", "UG", "NG"],
    fees: 0.02,
  },
  moov: {
    id: "moov",
    label: "Moov Money",
    description: "ML, CI, BJ, TG - Malitel",
    channels: ["moov"],
    enabled: true,
    icon: "🔵",
    countries: ["ML", "CI", "BJ", "TG"],
    fees: 0.02,
  },
  mpesa: {
    id: "mpesa",
    label: "M-Pesa",
    description: "Kenya, Tanzanie, RDC - 50M users",
    channels: ["mpesa"],
    enabled: true,
    icon: "🟢",
    badge: "EST AFRIQUE",
    countries: ["KE", "TZ", "CD", "MZ"],
    fees: 0.015,
  },
  airtel_money: {
    id: "airtel_money",
    label: "Airtel Money",
    description: "14 pays Afrique",
    channels: ["airtel_money"],
    enabled: true,
    icon: "🔴",
    countries: ["KE", "UG", "ZM", "CD", "NE", "ML"],
    fees: 0.02,
  },
  cinetpay: {
    id: "cinetpay",
    label: "CinetPay - Mobile + Carte",
    description: "XOF/XAF: OM, MTN, Wave, Moov, Visa",
    channels: ["orange_money", "mtn", "moov", "wave", "card"],
    enabled: true,
    icon: "📱",
    badge: "XOF",
    countries: ["ML", "CI", "SN", "BF", "BJ", "TG", "CM", "CD"],
    fees: 0.035,
  },
  flutterwave: {
    id: "flutterwave",
    label: "Flutterwave - 34 pays",
    description: "Carte, Mobile Money, Bank, USSD",
    channels: ["card", "mobile_money", "bank", "ussd"],
    enabled: FLUTTERWAVE_ENABLED,
    icon: "🌍",
    badge: "PAN-AFRIQUE",
    countries: ["NG", "GH", "KE", "ZA", "UG", "RW", "ZM", "ALL"],
    fees: 0.038,
  },
  paystack: {
    id: "paystack",
    label: "Paystack",
    description: "NG, GH, ZA, KE - Stripe",
    channels: ["card", "bank", "ussd", "mobile_money"],
    enabled: true,
    icon: "💳",
    countries: ["NG", "GH", "ZA", "KE"],
    fees: 0.039,
  },
  stripe: {
    id: "stripe",
    label: "Carte Internationale",
    description: "Visa, Mastercard, Amex",
    channels: ["card"],
    enabled: true,
    icon: "💳",
    countries: ["ALL"],
    fees: 0.029,
  },
  paypal: {
    id: "paypal",
    label: "PayPal",
    description: "Compte PayPal ou carte via PayPal",
    channels: [],
    enabled: PAYPAL_ENABLED,
    icon: "🅿️",
    badge: "INTL",
    countries: ["ALL"],
    fees: 0.044,
  },
};

const COUNTRY_MAP = {
  ML: ["orange_money", "wave", "moov", "cinetpay", "flutterwave", "stripe"],
  CI: ["wave", "orange_money", "mtn", "moov", "cinetpay", "flutterwave"],
  SN: ["wave", "orange_money", "cinetpay", "flutterwave"],
  BF: ["orange_money", "moov", "wave", "cinetpay"],
  BJ: ["mtn", "moov", "cinetpay", "flutterwave"],
  TG: ["moov", "mtn", "cinetpay"],
  CM: ["mtn", "orange_money", "flutterwave", "cinetpay"],
  GH: ["mtn", "flutterwave", "paystack"],
  NG: ["flutterwave", "paystack", "mtn"],
  KE: ["mpesa", "airtel_money", "flutterwave", "paystack"],
  TZ: ["mpesa", "airtel_money", "flutterwave"],
  CD: ["mpesa", "airtel_money", "orange_money", "flutterwave"],
  ZA: ["paystack", "flutterwave", "stripe"],
  DEFAULT: ["flutterwave", "cinetpay", "stripe", "paypal"],
};

export function getAvailableProviders(countryCode) {
  const cc = String(countryCode || "").toUpperCase();
  const ids = COUNTRY_MAP[cc] || COUNTRY_MAP.DEFAULT;

  const list = ids
   .map((id) => PROVIDER_DEFS[id])
   .filter((p) => p && p.enabled);

  // Toujours ajouter PayPal si activé et pas déjà présent
  if (PAYPAL_ENABLED &&!list.find((p) => p.id === "paypal")) {
    const pp = PROVIDER_DEFS.paypal;
    if (pp.enabled) list.push(pp);
  }

  // Déduplication
  const seen = new Set();
  return list.filter((p) => {
    if (seen.has(p.id)) return false;
    seen.add(p.id);
    return true;
  });
}

export function validateProvider(providerId, countryCode) {
  const list = getAvailableProviders(countryCode);
  const provider = list.find((item) => item.id === providerId);
  if (!provider) {
    throw new Error(`Le moyen "${providerId}" n'existe pas pour ${countryCode}.`);
  }
  if (!provider.enabled) {
    throw new Error(`"${providerId}" indisponible actuellement.`);
  }
  return provider;
}

export function getProviderChannels(providerId, countryCode) {
  const p = getAvailableProviders(countryCode).find((item) => item.id === providerId);
  return p?.channels || [];
}

export function formatAmount(amount, currency) {
  const numericAmount = Number(amount);
  if (!Number.isFinite(numericAmount)) return `0 ${currency || ""}`.trim();

  const currencies = {
    XOF: { symbol: "FCFA", decimals: 0 },
    XAF: { symbol: "FCFA", decimals: 0 },
    EUR: { symbol: "€", decimals: 2 },
    USD: { symbol: "$", decimals: 2 },
    KES: { symbol: "KSh", decimals: 2 },
    NGN: { symbol: "₦", decimals: 2 },
    GHS: { symbol: "₵", decimals: 2 },
    ZAR: { symbol: "R", decimals: 2 },
  };

  const config = currencies[(currency || "").toUpperCase()] || {
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
    return { percentage: 0, fixed: 0, total: 0, net: 0, rate: 0 };
  }

  const def = PROVIDER_DEFS[provider];
  const rate = def?.fees?? 0.035;

  const fixedFees = {
    XOF: { cinetpay: 0, orange_money: 0, wave: 0, stripe: 0, paypal: 230, flutterwave: 0, mpesa: 0 },
    EUR: { cinetpay: 0.25, stripe: 0.25, paypal: 0.35, flutterwave: 0.3 },
    USD: { cinetpay: 0.3, stripe: 0.3, paypal: 0.49, flutterwave: 0.3 },
  };

  const cur = (currency || "XOF").toUpperCase();
  const fixed = fixedFees[cur]?.[provider]?? fixedFees.XOF[provider]?? 0;
  const percentage = rate * numericAmount;
  const total = percentage + fixed;

  return {
    percentage,
    fixed,
    total,
    net: Math.max(0, numericAmount - total),
    rate,
  };
}

export async function pollPaymentStatus(paymentRef, { interval = 3000, maxAttempts = 20 } = {}) {
  for (let i = 0; i < maxAttempts; i++) {
    const status = await getPaymentStatus(paymentRef);
    const s = String(status?.status || "").toLowerCase();
    if (["completed", "active", "paid", "success", "successful"].includes(s)) {
      return status;
    }
    if (["failed", "cancelled", "canceled", "expired"].includes(s)) {
      throw new Error(`Paiement ${s}`);
    }
    await new Promise((r) => setTimeout(r, interval));
  }
  throw new Error("Vérification en attente, vous recevrez une notification.");
}

// Helper pour UI: besoin de numéro?
export function requiresPhoneNumber(providerId) {
  return ["orange_money", "wave", "mtn", "moov", "mpesa", "airtel_money"].includes(providerId);
}

// Helper pour afficher instruction USSD
export function getPaymentInstruction(providerId, phone) {
  const instructions = {
    orange_money: `Composez #144# ou confirmez le SMS sur ${phone}`,
    wave: `Ouvrez Wave et confirmez le paiement sur ${phone}`,
    mtn: `Composez *126# et confirmez sur ${phone}`,
    mpesa: `Vous recevrez une demande M-Pesa sur ${phone} - Entrez votre PIN`,
    moov: `Confirmez via *155# sur ${phone}`,
    airtel_money: `Confirmez via *500# sur ${phone}`,
  };
  return instructions[providerId] || `Confirmez le paiement sur votre téléphone ${phone}`;
}
