import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

/**
 * paymentProvider.js — point d'entrée UNIQUE pour tout paiement dans BAARO.
 *
 * Le front-end ne parle JAMAIS directement à CinetPay, Stripe, PayPal, etc.
 * Il appelle toujours createPayment()/getPaymentStatus(), qui délèguent
 * à l'Edge Function serveur "create-payment". Ça permet d'ajouter de
 * nouveaux moyens de paiement (Stripe, PayPal, Alipay, UPI, PIX...) sans
 * jamais toucher au code des écrans qui déclenchent un paiement.
 *
 * IMPORTANT SÉCURITÉ : le montant et la devise envoyés ici ne sont QUE
 * des indications d'affichage. Le serveur revalide toujours le vrai
 * montant depuis la table shop_subscriptions avant de contacter le
 * fournisseur de paiement — jamais confiance dans ce qui vient du client.
 */

/**
 * @param {Object} params
 * @param {'cinetpay'|'stripe'|'paypal'} params.provider
 * @param {string} params.shopId
 * @param {string} params.paymentRef
 * @param {number} params.amount - indicatif, revalidé côté serveur
 * @param {string} params.currency - indicatif, revalidé côté serveur
 * @param {string} [params.channel] - ex: 'orange_money_ml', 'moov_money_ml' pour CinetPay
 * @returns {Promise<{payment_url: string}>}
 */
export async function createPayment({ provider, shopId, paymentRef, amount, currency, channel }) {
  const { data, error } = await supabase.functions.invoke('create-payment', {
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

/**
 * Lit le statut d'un paiement (mis à jour par le webhook serveur,
 * jamais modifiable directement par le client — RLS en lecture seule).
 */
export async function getPaymentStatus(paymentRef) {
  const { data, error } = await supabase
    .from('shop_subscriptions')
    .select('status, provider, currency, amount, period_end')
    .eq('payment_ref', paymentRef)
    .single();
  if (error) throw error;
  return data;
}

/**
 * Liste les moyens de paiement disponibles pour un pays donné.
 * À enrichir au fur et à mesure qu'on ajoute des providers.
 * (Purement indicatif pour l'UI — la validation réelle du provider
 * autorisé se fait toujours côté serveur.)
 */
export function getAvailableProviders(countryCode) {
  const AFRICA_MOBILE_MONEY = ['ML', 'CI', 'SN', 'BF', 'BJ', 'TG', 'GN', 'CM'];

  const providers = [];

  if (AFRICA_MOBILE_MONEY.includes(countryCode)) {
    providers.push({
      id: 'cinetpay',
      label: 'Mobile Money (Orange Money, Moov Money, Wave...)',
      channels: ['orange_money_ml', 'moov_money_ml'], // adapter selon pays
    });
  }

  // Carte bancaire : disponible partout, ajouté dès que l'implémentation
  // Stripe existe côté serveur.
  // providers.push({ id: 'stripe', label: 'Carte bancaire' });

  return providers;
}
