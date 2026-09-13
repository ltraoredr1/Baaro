import { createClient } from '@supabase/supabase-js';
import { createCheckoutSession, mapStripeError } from './_stripe.js';
import { rateLimitAsync } from './_rateLimit.js';
import { applyCors } from './_cors.js';

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const CINETPAY_API_KEY = process.env.CINETPAY_API_KEY;
const CINETPAY_SITE_ID = process.env.CINETPAY_SITE_ID;
const PUBLIC_APP_URL = (process.env.PUBLIC_APP_URL || process.env.VERCEL_URL || 'http://localhost:3000')
  .replace(/\/$/, '')
  .replace(/^(?!https?:\/\/)/, 'https://');

function admin() {
  return createClient(supabaseUrl, supabaseServiceKey);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();

  // Rate-limit distribué
  const limit = await rateLimitAsync(req, {
    key: 'payments',
    max: 15,
    windowMs: 60_000,
  });
  if (!limit.ok) {
    Object.entries(limit.headers || {}).forEach(([k, v]) => res.setHeader(k, v));
    return res.status(limit.status).json(limit.body);
  }

  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Token manquant', code: 'auth_missing' });
    }

    const token = authHeader.split(' ')[1];
    const supabase = admin();
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return res.status(401).json({ error: 'Non autorisé', code: 'auth_invalid' });
    }

    if (req.method === 'POST') {
      const {
        amount: bodyAmount,
        currency: bodyCurrency = 'XOF',
        package_name,
        provider = 'cinetpay',
        shop_id,
        payment_ref: clientRef,
        channel,
      } = req.body || {};

      let amount = Number(bodyAmount);
      let currency = bodyCurrency;
      let paymentRef =
        clientRef || `BAARO_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
      let description = `Achat ${package_name || 'Diamants Baaro'}`;
      let kind = 'topup';

      if (typeof paymentRef === 'string' && paymentRef.startsWith('order_')) {
        const match = paymentRef.match(/^order_([0-9a-f-]{36})_/i);
        if (!match) {
          return res.status(400).json({ error: 'payment_ref commande invalide', code: 'invalid_ref' });
        }
        const orderId = match[1];
        const { data: order, error } = await supabase
          .from('orders')
          .select('id, total_amount, currency, buyer_id, payment_status')
          .eq('id', orderId)
          .single();

        if (error || !order) {
          return res.status(404).json({ error: 'Commande introuvable', code: 'order_not_found' });
        }
        if (order.buyer_id !== user.id) {
          return res.status(403).json({ error: 'Pas ta commande', code: 'forbidden' });
        }
        if (order.payment_status === 'paid') {
          return res.status(400).json({ error: 'Déjà payée', code: 'already_paid' });
        }

        amount = Number(order.total_amount);
        currency = order.currency || 'XOF';
        description = `Commande BAARO ${orderId.slice(0, 8)}`;
        kind = 'order';
      } else if (shop_id && clientRef) {
        amount = Number(bodyAmount);
        currency = bodyCurrency || 'XOF';
        description = 'Abonnement BAARO';
        kind = clientRef.startsWith('company_') ? 'company_sub' : 'shop_sub';
      } else {
        if (!amount || amount < 100) {
          return res.status(400).json({
            error: 'Montant minimum: 100 FCFA',
            code: 'amount_too_low',
          });
        }
        kind = 'topup';
      }

      if (!amount || amount <= 0) {
        return res.status(400).json({ error: 'Montant invalide', code: 'invalid_amount' });
      }

      // ========== STRIPE ==========
      if (provider === 'stripe') {
        try {
          const result = await createCheckoutSession({
            amount,
            currency,
            paymentRef,
            description,
            customerEmail: user.email,
            successUrl: `${PUBLIC_APP_URL}/?paid=${kind}&ref=${encodeURIComponent(paymentRef)}`,
            cancelUrl: `${PUBLIC_APP_URL}/?cancelled=1`,
            metadata: { userId: user.id, kind },
          });

          if (kind === 'topup') {
            await supabase.from('transactions').insert({
              sender_id: null,
              receiver_id: user.id,
              transaction_type: 'topup',
              amount_xof: currency === 'XOF' ? amount : null,
              status: 'pending',
              metadata: {
                stripe_session_ref: paymentRef,
                provider: 'stripe',
              },
            });
          }

          return res.status(200).json({
            success: true,
            payment_url: result.payment_url,
            transaction_id: result.transaction_id,
            session_id: result.session_id,
            kind,
            provider: 'stripe',
          });
        } catch (stripeErr) {
          const mapped = stripeErr.status ? stripeErr : mapStripeError(stripeErr);
          console.error('[payments] Stripe error', mapped);
          return res.status(mapped.status || 402).json({
            error: mapped.message,
            code: mapped.code || mapped.type,
            decline_code: mapped.decline_code || null,
            provider: 'stripe',
            request_id: mapped.requestId || null,
          });
        }
      }

      // ========== CINETPAY ==========
      try {
        const cinetPayData = {
          apikey: CINETPAY_API_KEY,
          site_id: CINETPAY_SITE_ID,
          transaction_id: paymentRef,
          amount: Math.round(amount),
          currency: currency === 'XOF' ? 'XOF' : currency,
          channels: channel || 'ALL',
          description,
          client_name: user.email || 'Utilisateur',
          cpm_custom: JSON.stringify({ userId: user.id, kind, paymentRef }),
          notify_url: `${PUBLIC_APP_URL}/api/webhooks`,
          return_url: kind === 'order' ? `${PUBLIC_APP_URL}/?paid=order` : 'baaro://wallet',
        };

        const response = await fetch('https://api.cinetpay.com/v2/payment', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify(cinetPayData),
        });

        const result = await response.json();

        if (result.code !== '00') {
          return res.status(402).json({
            error: result.description || 'Erreur CinetPay',
            code: result.code || 'cinetpay_error',
            provider: 'cinetpay',
          });
        }

        if (kind === 'topup') {
          await supabase.from('transactions').insert({
            sender_id: null,
            receiver_id: user.id,
            transaction_type: 'topup',
            amount_xof: amount,
            status: 'pending',
            metadata: { cinetpay_transaction_id: paymentRef, provider: 'cinetpay' },
          });
        }

        return res.status(200).json({
          success: true,
          payment_url: result.data?.payment_url || result.payment_url,
          transaction_id: paymentRef,
          kind,
          provider: 'cinetpay',
        });
      } catch (cinetErr) {
        console.error('[payments] CinetPay error', cinetErr);
        return res.status(502).json({
          error: cinetErr.message || 'Service CinetPay indisponible',
          code: 'cinetpay_network',
          provider: 'cinetpay',
        });
      }
    }

    if (req.method === 'GET') {
      const { data: transactions, error } = await supabase
        .from('transactions')
        .select('*')
        .eq('receiver_id', user.id)
        .eq('transaction_type', 'topup')
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) throw error;
      return res.status(200).json({ success: true, transactions: transactions || [] });
    }

    return res.status(405).json({ error: 'Méthode non autorisée', code: 'method_not_allowed' });
  } catch (error) {
    console.error('Payments API Error:', error);
    return res.status(500).json({
      error: error.message || 'Erreur serveur',
      code: 'server_error',
    });
  }
}
