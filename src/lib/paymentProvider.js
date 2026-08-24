/**
 * Point d'entrée UNIQUE paiements boutique — /api/create-payment (Vercel).
 */
import { supabase } from "../supabaseClient.js";

function apiBase() {
  const base = import.meta.env.VITE_API_BASE_URL || "";
  return base.replace(/\/$/, "");
}

export async function createPayment({
  provider,
  shopId,
  paymentRef,
  channel,
}) {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) {
    throw new Error("Session requise pour le paiement");
  }

  const url = `${apiBase()}/api/create-payment`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({
      provider,
      shop_id: shopId,
      payment_ref: paymentRef,
      channel,
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Erreur paiement (${res.status})`);
  }
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

/** Fournisseurs UI selon pays. */
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
    { id: "cinetpay", label: "Mobile Money (CinetPay)" },
  ];
}
