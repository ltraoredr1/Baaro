import { createClient } from '@supabase/supabase-js';
import { constructStripeEvent, mapStripeError, applyCors } from './_shared.js';

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const CINETPAY_API_KEY = process.env.CINETPAY_API_KEY;
const CINETPAY_SITE_ID = process.env.CINETPAY_SITE_ID;
const SEND_SMS_HOOK_SECRET = process.env.SEND_SMS_HOOK_SECRET;

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
  if (applyCors(req, res)) return;
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Methode non autorisee' });
  }

  const stripeSig = req.headers['stripe-signature'];
  const authHeader = req.headers['authorization'];

  try {
    // 1. Gestion du webhook Stripe
    if (stripeSig) {
      return await handleStripeWebhook(req, res, stripeSig);
    }

    // 2. Gestion du webhook InfiniReach (Vérification du secret pour le 0401)
    if (authHeader) {
      return await handleInfiniReachWebhook(req, res, authHeader);
    }

    // 3. Gestion du webhook CinetPay (par défaut)
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

// ---------------------------------------------------------
// Gestionnaire InfiniReach (Authentification par téléphone)
// ---------------------------------------------------------
async function handleInfiniReachWebhook(req, res, authHeader) {
  const expectedAuth = `Bearer ${SEND_SMS_HOOK_SECRET}`;
  if (authHeader !== expectedAuth) {
    console.error('[webhook] InfiniReach unauthorized: invalid token');
    return res.status(401).json({
      code: 'UNAUTHORIZED_NO_AUTH_HEADER',
      message: 'En-tête d’autorisation invalide ou manquant',
    });
  }

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

  console.log('Webhook InfiniReach reçu:', body);

  const { phone, sender } = body;
  const targetPhone = phone || sender;

  if (!targetPhone) {
    return res.status(400).json({ error: 'Numéro de téléphone introuvable dans le payload' });
  }

  const supabase = admin();

  // Ajustez 'profiles' ou 'companies' selon la table exacte contenant vos numéros
  const { data: userProfile, error: searchError } = await supabase
    .from('profiles') 
    .select('id, phone')
    .eq('phone', targetPhone)
    .maybeSingle();

  if (searchError) throw searchError;

  if (!userProfile) {
    const { data: newUser, error: createError } = await supabase
      .from('profiles')
      .insert([{ phone: targetPhone, created_at: new Date().toISOString() }])
      .select('id')
      .single();

    if (createError) throw createError;

    return res.status(200).json({
      received: true,
      action: 'user_created',
      userId: newUser.id,
    });
  }

  return res.status(200).json({
    received: true,
    action: 'authenticated',
    userId: userProfile.id,
  });
}

// ---------------------------------------------------------
// Gestionnaire Stripe
// ---------------------------------------------------------
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
          amount: providerMajorToMinor(session.amount_total, (session.currency || 'xof').toUpperCase()),
          currency: (session.currency || 'xof').toUpperCase(),
        });

        return res.status(200).json({ received: true, kind, paymentRef });
      }

      case 'checkout.session.expired': {
        const session = event.data.object;
        const paymentRef = session.client_reference_id || session.metadata?.payment_ref;
        const checkoutIntentId = session.metadata?.checkout_intent_id;
        if (checkoutIntentId) {
          await supabase.from('monetization_checkout_intents').update({ status: 'expired', updated_at: new Date().toISOString() }).eq('id', checkoutIntentId).in('status', ['pending','processing']);
        }
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
        const checkoutIntentId = pi.metadata?.checkout_intent_id;
        if (checkoutIntentId) {
          await supabase.from('monetization_checkout_intents').update({ status: 'failed', updated_at: new Date().toISOString() }).eq('id', checkoutIntentId).in('status', ['pending','processing']);
        }
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

// ---------------------------------------------------------
// Gestionnaire CinetPay
// ---------------------------------------------------------
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
    const rawCustom = body.cpm_custom;
    try {
      const parsed = typeof rawCustom === 'string' ? JSON.parse(rawCustom) : rawCustom;
      if (parsed?.checkoutIntentId) {
        const supabase = admin();
        await supabase.from('monetization_checkout_intents').update({ status: 'failed', updated_at: new Date().toISOString() }).eq('id', parsed.checkoutIntentId).in('status', ['pending','processing']);
      }
    } catch {}
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
  const amountPaid = majorToMinor(parseFloat(verifyData.data.cpm_amount), 'XOF');
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

function majorToMinor(amount, currency = 'XOF') {
  const n = Number(amount);
  if (!Number.isFinite(n) || n < 0) throw new Error('MONTANT_PAIEMENT_INVALIDE');
  return Math.round(n * 100);
}

function providerMajorToMinor(amount, currency = 'XOF') {
  return majorToMinor(amount, currency);
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

  // V19 monetization checkout: provider confirmation is the only source of truth.
  if (k === 'monetization' || String(paymentRef).startsWith('checkout_')) {
    const intentId = String(paymentRef).startsWith('checkout_')
      ? String(paymentRef).slice('checkout_'.length)
      : null;
    if (!intentId) throw new Error('checkout_intent_id manquant');

    const { data: intent, error: intentError } = await supabase
      .from('monetization_checkout_intents')
      .select('id,user_id,amount_minor,currency,status,expires_at')
      .eq('id', intentId)
      .maybeSingle();
    if (intentError) throw intentError;
    if (!intent) throw new Error('CHECKOUT_NOT_FOUND');
    if (intent.status === 'paid') return;
    if (!['pending', 'processing'].includes(intent.status)) throw new Error('CHECKOUT_NOT_PAYABLE');
    const expected = Number(intent.amount_minor);
    const paid = Number(amount);
    if (!Number.isFinite(expected) || !Number.isFinite(paid) || Math.abs(expected - paid) > 0.01) throw new Error('MONTANT_PAIEMENT_INATTENDU');
    const expectedCurrency = String(intent.currency || 'XOF').toUpperCase();
    if (String(currency || expectedCurrency).toUpperCase() !== expectedCurrency) throw new Error('DEVISE_PAIEMENT_INATTENDUE');

    const { error: fulfillError } = await supabase.rpc('fulfill_monetization_checkout', {
      p_intent_id: intent.id,
      p_provider: provider,
      p_provider_reference: cpmTransId || paymentRef,
    });
    if (fulfillError) throw fulfillError;
    return;
  }

  if (k === 'order' || String(paymentRef).startsWith('order_')) {
    const match = String(paymentRef).match(/^order_([0-9a-f-]{36})_/i);
    if (!match) throw new Error('order_id introuvable dans payment_ref');
    const { data: order, error: orderError } = await supabase.from('orders').select('id,total_amount,currency,payment_status').eq('id', match[1]).maybeSingle();
    if (orderError) throw orderError;
    if (!order) throw new Error('ORDER_NOT_FOUND');
    if (order.payment_status === 'paid') return;
    const expected = majorToMinor(order.total_amount, order.currency);
    if (Number(amount) !== expected) throw new Error('MONTANT_PAIEMENT_INATTENDU');
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
      if (Number(amount) !== majorToMinor(sub.amount, sub.currency)) throw new Error('MONTANT_PAIEMENT_INATTENDU');
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
      if (Number(amount) !== majorToMinor(sub.amount, sub.currency)) throw new Error('MONTANT_PAIEMENT_INATTENDU');
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

  throw new Error(`Type de paiement non supporté: ${k}`);
}
