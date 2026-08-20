/**
 * paymentProvider.js — point d'entrée UNIQUE pour les paiements boutique BAARO.
 * Destination : src/lib/paymentProvider.js
 */
import { supabase } from "../supabaseClient.js";

/**
 * @param {Object} params
 * @param {'cinetpay'|'stripe'|'paypal'} params.provider
 * @param {string} params.shopId
 * @param {string} params.paymentRef
 * @param {number} params.amount
 * @param {string} params.currency
 * @param {string} [params.channel]
 */
export async function createPayment({
  provider,
  shopId,
  paymentRef,
  amount,
  currency,
  channel,
}) {
  const { data, error } = await supabase.functions.invoke("create-payment", {
    body: {
      provider,
      shop_id: shopId,
      payment_ref: paymentRef,
      amount,
      currency,
      channel,
    },
  });
  if (error) throw error;
  return data;
}

export async function getPaymentStatus(paymentRef) {
  const { data, error } = await supabase
    .from("shop_subscriptions")
    .select("status, provider, currency, amount, period_end")
    .eq("payment_ref", paymentRef)
    .single();
  if (error) throw error;
  return data;
}

/** Fournisseurs affichés selon le pays (indicatif UI). */
export function getAvailableProviders(countryCode) {
  const cc = String(countryCode || "").toUpperCase();
  const westAfrica = ["ML", "CI", "SN", "BF", "BJ", "TG", "GN", "CM", "NE"];
  if (westAfrica.includes(cc)) {
    return [
      { id: "cinetpay", label: "Mobile Money / Carte (CinetPay)" },
      { id: "stripe", label: "Carte bancaire (Stripe)" },
    ];
  }
  return [
    { id: "stripe", label: "Carte bancaire (Stripe)" },
    { id: "paypal", label: "PayPal" },
  ];
}
