import { createClient } from '@supabase/supabase-js';
import { constructStripeEvent, mapStripeError } from './_stripe.js';

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const CINETPAY_API_KEY = process.env.CINETPAY_API_KEY;
const CINETPAY_SITE_ID = process.env.CINETPAY_SITE_ID;

function admin() {
  return createClient(supabaseUrl, supabaseServiceKey);
}

export const config = {
  api: {
    bodyParser: false,
  },
};

async function readRawBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Stripe-Signature');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Methode non autorisee' });
  }

  const stripeSig = req.headers['stripe-signature'];

  try {
    if (stripeSig) {
      return await handleStripeWebhook(req, res, stripeSig);
    }
    return await handleCinetPayWebhook(req, res);
  } catch (error) {
    console.error('Erreur Webhook:', error);
    return res.status(500).json({
      code: '01',
      message: 'Erreur serveur',
      error: error.message,
    });
  }
}

async function handleStripeWebhook(req, res, signature) {
  const rawBody = await readRawBody(req);

  let event;
  try {
    event = constructStripeEvent(rawBody, signature);
  } catch (err) {
    console.error('[webhook] Stripe signature invalid', err.message);
    return res.status(400).json({
      error: 'Signature Stripe invalide',
      code: 'stripe_signature_invalid',
    });
  }

  const supabase = admin();

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        if (session.payment_status !== 'paid' && session.payment_status !== 'no_payment_required') {
          return res.status(200).json({ received: true, skipped: 'not_paid' });
        }

        const paymentRef =
          session.client_reference_id ||
          session.metadata?.payment_ref ||
          session.id;
        const kind = session.metadata?.kind || inferKind(paymentRef);
        const userId = session.metadata?.userId;

        await fulfillPayment(supabase, {
          paymentRef,
          kind,
          userId,
          provider: 'stripe',
          amount: session.amount_total,
          currency: (session.currency || 'xof').toUpperCase(),
        });

        return res.status(200).json({ received: true, kind, paymentRef });
      }

      case 'checkout.session.expired': {
        const session = event.data.object;
        const paymentRef = session.client_reference_id || session.metadata?.payment_ref;
        if (paymentRef && String(paymentRef).startsWith('order_')) {
          const match = String(paymentRef).match(/^order_([0-9a-f-]{36})_/i);
          if (match) {
            await supabase
              .from('orders')
              .update({ payment_status: 'failed', updated_at: new Date().toISOString() })
              .eq('id', match[1])
              .eq('payment_status', 'pending');
          }
        }
        return res.status(200).json({ received: true, expired: true });
      }

      case 'payment_intent.payment_failed': {
        const pi = event.data.object;
        console.warn('[webhook] Stripe payment_failed', pi.id, pi.last_payment_error?.message);
        return res.status(200).json({ received: true, failed: true });
      }

      default:
        return res.status(200).json({ received: true, ignored: event.type });
    }
  } catch (err) {
    const mapped = mapStripeError(err);
    console.error('[webhook] Stripe handler error', mapped);
    return res.status(500).json({
      error: mapped.message,
      code: mapped.code || mapped.type,
    });
  }
}

async function handleCinetPayWebhook(req, res) {
  let body = req.body;
  if (Buffer.isBuffer(body) || typeof body === 'string') {
    try {
      body = JSON.parse(body.toString());
    } catch {
      body = {};
    }
  }
  if (!body || Object.keys(body).length === 0) {
    const raw = await readRawBody(req);
    try {
      body = JSON.parse(raw.toString());
    } catch {
      body = {};
    }
  }

  console.log('Webhook CinetPay recu:', body);

  const { cpm_trans_id, cpm_status } = body;

  if (cpm_status && cpm_status !== 'ACCEPTED') {
    return res.status(200).json({ code: '00', message: 'Webhook recu, statut ignore' });
  }

  const verifyResponse = await fetch('https://api-check.cinetpay.com/v2/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      apikey: CINETPAY_API_KEY,
      site_id: CINETPAY_SITE_ID,
      transaction_id: cpm_trans_id,
    }),
  });

  const verifyData = await verifyResponse.json();

  if (verifyData.code !== '00' || verifyData.data?.status !== 'ACCEPTED') {
    console.error('Verification CinetPay echouee:', verifyData);
    return res.status(400).json({ code: '01', message: 'Verification echouee' });
  }

  const supabase = admin();
  const amountPaid = parseFloat(verifyData.data.cpm_amount);
  const rawCustom = verifyData.data.cpm_custom;

  let userId = rawCustom;
  let kind = 'topup';
  let paymentRef = cpm_trans_id;

  try {
    const parsed = JSON.parse(rawCustom);
    if (parsed && typeof parsed === 'object') {
      userId = parsed.userId || userId;
      kind = parsed.kind || kind;
      paymentRef = parsed.paymentRef || paymentRef;
    }
  } catch {
    /* ancien format */
  }

  await fulfillPayment(supabase, {
    paymentRef,
    kind,
    userId,
    provider: 'cinetpay',
    amount: amountPaid,
    currency: 'XOF',
    cpmTransId: cpm_trans_id,
  });

  return res.status(200).json({ code: '00', message: 'Webhook traite', kind, paymentRef });
}

function inferKind(ref) {
  if (!ref) return 'topup';
  if (String(ref).startsWith('order_')) return 'order';
  if (String(ref).startsWith('company_')) return 'company_sub';
  if (String(ref).startsWith('shop_')) return 'shop_sub';
  return 'topup';
}

async function fulfillPayment(supabase, { paymentRef, kind, userId, provider, amount, currency, cpmTransId }) {
  const k = kind || inferKind(paymentRef);

  if (k === 'order' || String(paymentRef).startsWith('order_')) {
    const match = String(paymentRef).match(/^order_([0-9a-f-]{36})_/i);
    if (!match) throw new Error('order_id introuvable dans payment_ref');
    const { error } = await supabase.rpc('mark_order_paid', {
      p_order_id: match[1],
      p_payment_ref: paymentRef,
      p_provider: provider,
    });
    if (error) throw error;
    return;
  }

  if (k === 'shop_sub' || String(paymentRef).startsWith('shop_')) {
    const { data: sub } = await supabase
      .from('shop_subscriptions')
      .select('id, shop_id, amount, currency, was_premium_rate, status')
      .eq('payment_ref', paymentRef)
      .maybeSingle();

    if (sub && sub.status === 'pending') {
      await supabase.rpc('activate_shop_subscription', {
        p_shop_id: sub.shop_id,
        p_payment_ref: paymentRef,
        p_amount: sub.amount,
        p_currency: sub.currency,
        p_provider: provider,
        p_was_premium: sub.was_premium_rate,
      });
    }
    return;
  }

  if (k === 'company_sub' || String(paymentRef).startsWith('company_')) {
    const { data: sub } = await supabase
      .from('company_subscriptions')
      .select('id, company_id, amount, currency, was_premium_rate, status')
      .eq('payment_ref', paymentRef)
      .maybeSingle();

    if (sub && sub.status === 'pending') {
      await supabase.rpc('activate_company_subscription', {
        p_company_id: sub.company_id,
        p_payment_ref: paymentRef,
        p_amount: sub.amount,
        p_currency: sub.currency,
        p_provider: provider,
        p_was_premium: sub.was_premium_rate,
      });
    }
    return;
  }

  if (!userId) throw new Error('userId manquant pour topup');
  const diamondsToAdd = Math.floor(Number(amount) / 10);

  const { error } = await supabase.rpc('add_diamonds_to_wallet', {
    p_user_id: userId,
    p_amount: diamondsToAdd,
    p_transaction_id: cpmTransId || paymentRef,
  });
  if (error) throw error;

  await supabase
    .from('transactions')
    .update({ status: 'completed', diamonds_spent: diamondsToAdd })
    .or(
      `metadata->>cinetpay_transaction_id.eq.${cpmTransId || paymentRef},metadata->>stripe_session_ref.eq.${paymentRef}`
    );
}
