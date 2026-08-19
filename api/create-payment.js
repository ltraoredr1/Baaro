// api/create-payment.js
// Route serveur Vercel (jamais exécutée côté client).
// Reçoit une demande de paiement, revalide tout côté base de données,
// puis contacte le vrai fournisseur (ici CinetPay pour le mobile money).
//
// Variables d'environnement nécessaires (côté Vercel, jamais exposées au client) :
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//   CINETPAY_API_KEY, CINETPAY_SITE_ID
//   PUBLIC_APP_URL (ex: https://baaro.app)

import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Providers activés. Ajouter 'stripe', 'paypal' etc. ici au fur et à
// mesure qu'ils sont réellement implémentés — jamais avant.
const ALLOWED_PROVIDERS = ['cinetpay'];

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { provider, shop_id, payment_ref, channel } = req.body || {};

  if (!ALLOWED_PROVIDERS.includes(provider)) {
    return res.status(400).json({ error: `Provider non supporté: ${provider}` });
  }

  // On ne fait JAMAIS confiance au montant/devise envoyés par le client.
  // On relit la ligne shop_subscriptions créée précédemment côté serveur.
  const { data: sub, error: subError } = await supabaseAdmin
    .from('shop_subscriptions')
    .select('id, shop_id, amount, currency, status')
    .eq('payment_ref', payment_ref)
    .eq('shop_id', shop_id)
    .single();

  if (subError || !sub) {
    return res.status(404).json({ error: 'Abonnement introuvable' });
  }
  if (sub.status !== 'pending') {
    return res.status(409).json({ error: 'Ce paiement a déjà été traité' });
  }

  try {
    if (provider === 'cinetpay') {
      const result = await createCinetPayPayment({
        payment_ref,
        amount: sub.amount,
        currency: sub.currency,
        channel,
      });
      return res.status(200).json(result);
    }
  } catch (err) {
    console.error('create-payment error:', err);
    return res.status(502).json({ error: 'Échec de création du paiement' });
  }
}

async function createCinetPayPayment({ payment_ref, amount, currency, channel }) {
  const response = await fetch('https://api-checkout.cinetpay.com/v2/payment', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      apikey: process.env.CINETPAY_API_KEY,
      site_id: process.env.CINETPAY_SITE_ID,
      transaction_id: payment_ref,
      amount,
      currency, // ex: 'XOF'
      channels: channel || 'ALL', // ex: 'ORANGE_MONEY_CI', 'MOOV_MONEY_ML' — voir doc CinetPay pour la liste exacte par pays
      notify_url: `${process.env.PUBLIC_APP_URL}/api/payment-webhook`,
      return_url: `${process.env.PUBLIC_APP_URL}/shop/payment-return`,
    }),
  });

  const data = await response.json();
  if (data.code !== '201') {
    throw new Error(data.message || 'Erreur CinetPay');
  }
  return { payment_url: data.data.payment_url };
}
