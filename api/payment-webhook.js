// api/payment-webhook.js
// Reçu par CinetPay après un paiement (notify_url). Ne fait JAMAIS confiance
// au contenu brut du webhook : reconfirme toujours le statut réel via
// l'API "check" de CinetPay avant d'activer quoi que ce soit.

import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { cpm_trans_id: payment_ref } = req.body || {};
  if (!payment_ref) {
    return res.status(400).json({ error: 'payment_ref manquant' });
  }

  // Reconfirmation obligatoire : un tiers pourrait sinon forger une
  // notification de paiement "réussi" en connaissant juste l'URL du webhook.
  const statusRes = await fetch('https://api-checkout.cinetpay.com/v2/payment/check', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      apikey: process.env.CINETPAY_API_KEY,
      site_id: process.env.CINETPAY_SITE_ID,
      transaction_id: payment_ref,
    }),
  });
  const statusData = await statusRes.json();

  if (statusData.data?.status !== 'ACCEPTED') {
    await supabaseAdmin
      .from('shop_subscriptions')
      .update({ status: 'failed' })
      .eq('payment_ref', payment_ref);
    // Toujours répondre 200 pour que CinetPay arrête de retenter,
    // même en cas d'échec du paiement lui-même.
    return res.status(200).json({ ok: true });
  }

  const { data: sub } = await supabaseAdmin
    .from('shop_subscriptions')
    .select('shop_id, amount, currency, was_premium_rate')
    .eq('payment_ref', payment_ref)
    .single();

  if (sub) {
    // Passe par la fonction SQL security definer (voir shops_schema.sql),
    // réservée au service_role — jamais un update direct depuis ici non plus,
    // pour garder un seul point d'activation centralisé et auditable.
    await supabaseAdmin.rpc('activate_shop_subscription', {
      p_shop_id: sub.shop_id,
      p_payment_ref: payment_ref,
      p_amount: sub.amount,
      p_currency: sub.currency,
      p_provider: 'cinetpay',
      p_was_premium: sub.was_premium_rate,
    });
  }

  return res.status(200).json({ ok: true });
}
