// src/lib/paymentProvider.js
import { supabase } from "../supabaseClient.js";
import { requireUser } from "./requireUser.js"; // ← CORRECTION: import ajouté

/**
 * Récupère l'URL de base de l'API
 */
function apiBase() {
  const base = import.meta.env.VITE_API_BASE_URL || "";
  return base.replace(/\/$/, "");
}

/**
 * Crée un paiement (pour boutique ou recharge wallet)
 * Point d'entrée unique pour CinetPay et Stripe
 */
export async function createPayment({
  provider,
  shopId,
  paymentRef,
  channel,
  amount,      // ← CORRECTION: paramètre ajouté
  currency,    // ← CORRECTION: paramètre ajouté
  userId,      // ← CORRECTION: paramètre ajouté (pour les recharges wallet)
}) {
  // CORRECTION: utilisation de requireUser pour satisfaire le linter
  const { user, session, error: authError } = await requireUser();
  
  if (authError || !session?.access_token) {
    console.error("Authentication error:", authError);
    throw new Error("Session requise pour le paiement. Veuillez vous reconnecter.");
  }

  const url = `${apiBase()}/api/payments`;
  
  const requestBody = {
    provider,
    shop_id: shopId,
    payment_ref: paymentRef,
    channel,
    amount,
    currency,
    user_id: userId || user.id,
  };

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
      throw new Error(data.error || `Erreur paiement (${res.status})`);
    }
    
    return data;
  } catch (error) {
    console.error("Create payment error:", error);
    throw error;
  }
}

/**
 * Récupère le statut d'un paiement
 */
export async function getPaymentStatus(paymentRef) {
  try {
    const { data, error } = await supabase
      .from("shop_subscriptions")
      .select("status, provider, currency, amount, period_end")
      .eq("payment_ref", paymentRef)
      .single();
      
    if (error) {
      console.error("Error fetching payment status:", error);
      throw error;
    }
    
    return data;
  } catch (error) {
    console.error("Get payment status error:", error);
    throw error;
  }
}

/**
 * Fournisseurs de paiement disponibles selon le pays
 * CORRECTION: ajout des channels et du flag enabled pour "provider support incomplete"
 */
export function getAvailableProviders(countryCode) {
  const cc = String(countryCode || "").toUpperCase();
  const westAfrica = ["ML", "CI", "SN", "BF", "BJ", "TG", "GN", "CM", "NE"];
  
  if (westAfrica.includes(cc)) {
    return [
      { 
        id: "cinetpay", 
        label: "Mobile Money / Carte (CinetPay)",
        description: "Orange Money, MTN, Wave, Moov, Carte bancaire",
        channels: ["orange_money", "mtn", "moov", "wave", "card"],
        enabled: true,
        icon: "📱"
      },
      { 
        id: "stripe", 
        label: "Carte bancaire internationale (Stripe)",
        description: "Visa, Mastercard, American Express",
        channels: ["card"],
        enabled: true,
        icon: "💳"
      },
    ];
  }
  
  // Pour les autres pays (Europe, Amérique, etc.)
  return [
    { 
      id: "stripe", 
      label: "Carte bancaire (Stripe)",
      description: "Visa, Mastercard",
      channels: ["card"],
      enabled: true,
      icon: "💳"
    },
    { 
      id: "cinetpay", 
      label: "Mobile Money (CinetPay)",
      description: "Paiement mobile africain",
      channels: ["orange_money", "mtn", "wave"],
      enabled: true,
      icon: "📱"
    },
  ];
}

/**
 * Valide qu'un provider est supporté dans un pays donné
 */
export function validateProvider(providerId, countryCode) {
  const providers = getAvailableProviders(countryCode);
  const provider = providers.find(p => p.id === providerId);
  
  if (!provider) {
    throw new Error(`Le moyen de paiement "${providerId}" n'existe pas.`);
  }
  
  if (!provider.enabled) {
    throw new Error(`Le moyen de paiement "${providerId}" n'est pas disponible actuellement.`);
  }
  
  return true;
}

/**
 * Récupère les canaux disponibles pour un provider donné
 */
export function getProviderChannels(providerId, countryCode) {
  const providers = getAvailableProviders(countryCode);
  const provider = providers.find(p => p.id === providerId);
  
  if (!provider) {
    return [];
  }
  
  return provider.channels || [];
}

/**
 * Formatte le montant selon la devise
 */
export function formatAmount(amount, currency) {
  const currencies = {
    XOF: { symbol: "FCFA", decimals: 0 },
    EUR: { symbol: "€", decimals: 2 },
    USD: { symbol: "$", decimals: 2 },
  };
  
  const config = currencies[currency] || { symbol: currency, decimals: 2 };
  return `${amount.toLocaleString('fr-FR')} ${config.symbol}`;
}

/**
 * Calcule les frais de transaction selon le provider
 */
export function calculateFees(amount, provider, currency = "XOF") {
  const feeRates = {
    cinetpay: 0.035, // 3.5% pour CinetPay
    stripe: 0.029,   // 2.9% pour Stripe
  };
  
  const fixedFees = {
    XOF: { cinetpay: 0, stripe: 0 },
    EUR: { cinetpay: 0.25, stripe: 0.25 },
    USD: { cinetpay: 0.30, stripe: 0.30 },
  };
  
  const rate = feeRates[provider] || 0.035;
  const fixed = fixedFees[currency]?.[provider] || 0;
  
  return {
    percentage: rate * amount,
    fixed,
    total: (rate * amount) + fixed,
    net: amount - ((rate * amount) + fixed),
  };
  }
