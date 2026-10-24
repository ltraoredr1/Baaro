import { createClient } from '@supabase/supabase-js';
import crypto from 'node:crypto';
import {
  constructStripeEvent,
  mapStripeError,
  applyCors,
  rateLimitAsync,
  logError,
  logWarn,
} from './_shared.js';

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const CINETPAY_API_KEY = process.env.CINETPAY_API_KEY;
const CINETPAY_SITE_ID = process.env.CINETPAY_SITE_ID;
const SEND_SMS_HOOK_SECRET = process.env.SEND_SMS_HOOK_SECRET;

const PAYPAL_CLIENT_ID = process.env.PAYPAL_CLIENT_ID || '';
const PAYPAL_CLIENT_SECRET = process.env.PAYPAL_CLIENT_SECRET || '';
const PAYPAL_WEBHOOK_ID = process.env.PAYPAL_WEBHOOK_ID || '';
const PAYPAL_API_BASE =
  process.env.PAYPAL_ENV === 'live'
    ? 'https://api-m.paypal.com'
    : 'https://api-m.sandbox.paypal.com';

const MAX_WEBHOOK_BYTES = 512 * 1024;
const WEBHOOK_PROCESSING_TIMEOUT_MS = 10 * 60 * 1000;

// Doit rester identique à api/payments.js (même taux, mêmes devises, même arrondi).
const XOF_PER_EUR = 655.957;
const PAYPAL_NATIVE_CURRENCIES = ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'CHF'];

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
  let total = 0;
  for await (const chunk of req) chunks.push(chunk);
  for (const chunk of chunks) total += Buffer.byteLength(chunk);
  if (total > MAX_WEBHOOK_BYTES) {
    const error = new Error('Payload webhook trop volumineux.');
    error.status = 413;
    throw error;
  }
  return Buffer.concat(chunks, total);
}

function hashBody(rawBody) {
  return crypto.createHash('sha256').update(rawBody || Buffer.alloc(0)).digest('hex');
}

async function claimWebhookEvent(supabase, { provider, eventId, rawBody }) {
  const cleanProvider = String(provider || '').trim().toLowerCase();
  const cleanEventId = String(eventId || '').trim().slice(0, 255);
  if (!cleanProvider || !cleanEventId) throw new Error('WEBHOOK_EVENT_ID_MANQUANT');

  const now = new Date().toISOString();
  const row = {
    provider: cleanProvider,
    event_id: cleanEventId,
    payload_hash: hashBody(rawBody),
    status: 'processing',
    started_at: now,
    updated_at: now,
  };

  const { error } = await supabase.from('payment_webhook_events').insert(row);
  if (!error) return { claimed: true, duplicate: false };
  if (error.code !== '23505') throw error;

  const { data: existing, error: readError } = await supabase
    .from('payment_webhook_events')
    .select('status, payload_hash, started_at')
    .eq('provider', cleanProvider)
    .eq('event_id', cleanEventId)
    .maybeSingle();
  if (readError) throw readError;
  if (existing?.payload_hash && existing.payload_hash !== row.payload_hash) {
    throw new Error('WEBHOOK_EVENT_PAYLOAD_CHANGED');
  }
  if (existing?.status === 'completed') return { claimed: false, duplicate: true };

  const startedAt = new Date(existing?.started_at || 0).getTime();
  if (existing?.status === 'processing' && Date.now() - startedAt < WEBHOOK_PROCESSING_TIMEOUT_MS) {
    return { claimed: false, duplicate: true, processing: true };
  }

  const { error: takeoverError } = await supabase
    .from('payment_webhook_events')
    .update({ status: 'processing', started_at: now, updated_at: now })
    .eq('provider', cleanProvider)
    .eq('event_id', cleanEventId);
  if (takeoverError) throw takeoverError;
  return { claimed: true, duplicate: false, retry: true };
}

async function completeWebhookEvent(supabase, provider, eventId) {
  const { error } = await supabase
    .from('payment_webhook_events')
    .update({ status: 'completed', completed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('provider', provider)
    .eq('event_id', eventId);
  if (error) throw error;
}

async function failWebhookEvent(supabase, provider, eventId, error) {
  await supabase.from('payment_webhook_events').update({
    status: 'failed',
    error_code: String(error?.code || error?.message || 'WEBHOOK_FAILED').slice(0, 200),
    updated_at: new Date().toISOString(),
  }).eq('provider', provider).eq('event_id', eventId);
}

export default async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Methode non autorisee' });
  }

  const limit = await rateLimitAsync(req, {
    key: 'payment-webhook',
    max: 120,
    windowMs: 60_000,
  });
  if (!limit.ok) {
    Object.entries(limit.headers || {}).forEach(([key, value]) => res.setHeader(key, value));
    return res.status(limit.status).json(limit.body);
  }

  const stripeSig = req.headers['stripe-signature'];
  const paypalTransmissionId = req.headers['paypal-transmission-id'];
  const authHeader = req.headers['authorization'];

  try {
    // 1. Gestion du webhook Stripe
    if (stripeSig) {
      return await handleStripeWebhook(req, res, stripeSig);
    }

    // 2. Gestion du webhook PayPal
    if (paypalTransmissionId) {
      return await handlePayPalWebhook(req, res);
    }

    // 3. Gestion du webhook InfiniReach (Vérification du secret pour le 0401)
    if (authHeader) {
      return await handleInfiniReachWebhook(req, res, authHeader);
    }

    // 4. Gestion du webhook CinetPay (par défaut)
    return await handleCinetPayWebhook(req, res);
  } catch (error) {
    if (error?.status) return res.status(error.status).json({ error: error.message });
    logError('payment-webhook', error);
    return res.status(500).json({
      code: '01',
      message: 'Erreur serveur',
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
        const claim = await claimWebhookEvent(supabase, {
          provider: 'stripe',
          eventId: event.id,
          rawBody,
        });
        if (claim.duplicate) return res.status(claim.processing ? 409 : 200).json({ received: true, duplicate: true, processing: Boolean(claim.processing) });
        if (session.payment_status !== 'paid' && session.payment_status !== 'no_payment_required') {
          await completeWebhookEvent(supabase, 'stripe', event.id);
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

        await completeWebhookEvent(supabase, 'stripe', event.id);

        return res.status(200).json({ received: true, kind, paymentRef });
      }

      case 'checkout.session.expired': {
        const session = event.data.object;
        const claim = await claimWebhookEvent(supabase, {
          provider: 'stripe',
          eventId: event.id,
          rawBody,
        });
        if (claim.duplicate) return res.status(claim.processing ? 409 : 200).json({ received: true, duplicate: true, processing: Boolean(claim.processing) });
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
        await completeWebhookEvent(supabase, 'stripe', event.id);
        return res.status(200).json({ received: true, expired: true });
      }

      case 'payment_intent.payment_failed': {
        const pi = event.data.object;
        const claim = await claimWebhookEvent(supabase, {
          provider: 'stripe',
          eventId: event.id,
          rawBody,
        });
        if (claim.duplicate) return res.status(claim.processing ? 409 : 200).json({ received: true, duplicate: true, processing: Boolean(claim.processing) });
        const checkoutIntentId = pi.metadata?.checkout_intent_id;
        if (checkoutIntentId) {
          await supabase.from('monetization_checkout_intents').update({ status: 'failed', updated_at: new Date().toISOString() }).eq('id', checkoutIntentId).in('status', ['pending','processing']);
        }
        logWarn('payment-webhook', 'Stripe payment failed', { provider: 'stripe', eventId: event.id });
        await completeWebhookEvent(supabase, 'stripe', event.id);
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
// Gestionnaire PayPal
// ---------------------------------------------------------
async function getPayPalAccessToken() {
  const basic = Buffer.from(`${PAYPAL_CLIENT_ID}:${PAYPAL_CLIENT_SECRET}`).toString('base64');
  const response = await fetch(`${PAYPAL_API_BASE}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.access_token) throw new Error('Authentification PayPal impossible.');
  return data.access_token;
}

async function paypalRequest(method, path, { body, headers } = {}) {
  const accessToken = await getPayPalAccessToken();
  const response = await fetch(`${PAYPAL_API_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(headers || {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json().catch(() => ({}));
  return { ok: response.ok, status: response.status, data };
}

// Vérifie que l'événement vient bien de PayPal (signature validée par PayPal lui-même).
async function verifyPayPalSignature(req, event) {
  const h = req.headers;
  const required = [
    'paypal-auth-algo',
    'paypal-cert-url',
    'paypal-transmission-id',
    'paypal-transmission-sig',
    'paypal-transmission-time',
  ];
  if (required.some((name) => !String(h[name] || '').trim())) return false;
  const { ok, data } = await paypalRequest('POST', '/v1/notifications/verify-webhook-signature', {
    body: {
      auth_algo: h['paypal-auth-algo'],
      cert_url: h['paypal-cert-url'],
      transmission_id: h['paypal-transmission-id'],
      transmission_sig: h['paypal-transmission-sig'],
      transmission_time: h['paypal-transmission-time'],
      webhook_id: PAYPAL_WEBHOOK_ID,
      webhook_event: event,
    },
  });
  return ok && data.verification_status === 'SUCCESS';
}

async function markPaymentFailed(supabase, paymentRef) {
  const ref = String(paymentRef || '');
  if (ref.startsWith('checkout_')) {
    await supabase
      .from('monetization_checkout_intents')
      .update({ status: 'failed', updated_at: new Date().toISOString() })
      .eq('id', ref.slice('checkout_'.length))
      .in('status', ['pending', 'processing']);
  } else if (ref.startsWith('order_')) {
    const match = ref.match(/^order_([0-9a-f-]{36})_/i);
    if (match) {
      await supabase
        .from('orders')
        .update({ payment_status: 'failed', updated_at: new Date().toISOString() })
        .eq('id', match[1])
        .eq('payment_status', 'pending');
    }
  }
}

async function handlePayPalWebhook(req, res) {
  if (!PAYPAL_CLIENT_ID || !PAYPAL_CLIENT_SECRET || !PAYPAL_WEBHOOK_ID) {
    return res.status(503).json({ error: 'PayPal non configuré.', code: 'paypal_not_configured' });
  }

  const raw = await readRawBody(req);
  let event;
  try {
    event = JSON.parse(raw.toString());
  } catch {
    return res.status(400).json({ error: 'Payload PayPal invalide.' });
  }

  let verified = false;
  try {
    verified = await verifyPayPalSignature(req, event);
  } catch (err) {
    console.error('[webhook] PayPal verification error', err.message);
    return res.status(500).json({ error: 'Vérification PayPal impossible.' });
  }
  if (!verified) {
    console.error('[webhook] PayPal signature invalid');
    return res.status(400).json({ error: 'Signature PayPal invalide', code: 'paypal_signature_invalid' });
  }

  const supabase = admin();
  const resource = event.resource || {};

  const eventId = String(event.id || req.headers['paypal-transmission-id'] || '').trim();
  const claim = await claimWebhookEvent(supabase, {
    provider: 'paypal',
    eventId,
    rawBody: raw,
  });
  if (claim.duplicate) return res.status(claim.processing ? 409 : 200).json({ received: true, duplicate: true, processing: Boolean(claim.processing) });

  switch (event.event_type) {
    // Le client a approuvé le paiement chez PayPal : on capture côté serveur.
    // Le règlement BAARO se fait uniquement sur PAYMENT.CAPTURE.COMPLETED.
    case 'CHECKOUT.ORDER.APPROVED': {
      const orderId = resource.id;
      if (!orderId) return res.status(400).json({ error: 'order_id manquant' });
      const capture = await paypalRequest('POST', `/v2/checkout/orders/${orderId}/capture`, {
        headers: { 'PayPal-Request-Id': `capture_${orderId}` },
      });
      if (capture.ok) {
        await completeWebhookEvent(supabase, 'paypal', eventId);
        return res.status(200).json({ received: true, captured: true });
      }
      const issue = capture.data?.details?.[0]?.issue || capture.data?.name;
      if (issue === 'ORDER_ALREADY_CAPTURED') {
        await completeWebhookEvent(supabase, 'paypal', eventId);
        return res.status(200).json({ received: true, captured: true });
      }
      if (capture.status === 422) {
        // Refus de capture (ex. instrument refusé) : le client peut souvent réessayer
        // chez PayPal avec un autre moyen de paiement. On ne marque donc rien en échec ici
        // (sinon un paiement réussi ensuite ne pourrait plus être réglé). Seul
        // PAYMENT.CAPTURE.DENIED marque un échec définitif.
        console.warn('[webhook] PayPal capture refused', orderId, issue);
        await completeWebhookEvent(supabase, 'paypal', eventId);
        return res.status(200).json({ received: true, refused: true, issue });
      }
      console.error('[webhook] PayPal capture error', orderId, capture.status, issue);
      return res.status(500).json({ error: 'Capture PayPal impossible.' });
    }

    case 'PAYMENT.CAPTURE.COMPLETED': {
      if (resource.status !== 'COMPLETED') {
        return res.status(200).json({ received: true, skipped: 'not_completed' });
      }

      // custom_id = référence BAARO posée par /api/payments
      let paymentRef = resource.custom_id;
      if (!paymentRef) {
        const orderId = resource.supplementary_data?.related_ids?.order_id;
        if (orderId) {
          const order = await paypalRequest('GET', `/v2/checkout/orders/${orderId}`);
          paymentRef = order.data?.purchase_units?.[0]?.custom_id;
        }
      }
      if (!paymentRef) {
        console.error('[webhook] PayPal capture sans référence BAARO', resource.id);
        return res.status(200).json({ received: true, skipped: 'no_reference' });
      }

      const kind = inferKind(paymentRef);
      await fulfillPayment(supabase, {
        paymentRef,
        kind,
        provider: 'paypal',
        amount: majorToMinor(resource.amount?.value, resource.amount?.currency_code),
        currency: String(resource.amount?.currency_code || 'EUR').toUpperCase(),
        paypalPaid: {
          value: resource.amount?.value,
          currency_code: String(resource.amount?.currency_code || '').toUpperCase(),
        },
        cpmTransId: resource.id,
      });

      await completeWebhookEvent(supabase, 'paypal', eventId);
      return res.status(200).json({ received: true, kind, paymentRef });
    }

    case 'PAYMENT.CAPTURE.DENIED':
    case 'PAYMENT.CAPTURE.DECLINED': {
      await markPaymentFailed(supabase, resource.custom_id);
      await completeWebhookEvent(supabase, 'paypal', eventId);
      return res.status(200).json({ received: true, failed: true });
    }

    default:
      await completeWebhookEvent(supabase, 'paypal', eventId);
      return res.status(200).json({ received: true, ignored: event.event_type });
  }
}

// ---------------------------------------------------------
// Gestionnaire CinetPay
// ---------------------------------------------------------
async function handleCinetPayWebhook(req, res) {
  if (!CINETPAY_API_KEY || !CINETPAY_SITE_ID) {
    return res.status(503).json({ code: 'CINETPAY_NOT_CONFIGURED', message: 'CinetPay non configuré.' });
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

  const { cpm_trans_id, cpm_status } = body;
  if (!String(cpm_trans_id || '').trim()) {
    return res.status(400).json({ code: 'TRANSACTION_ID_MANQUANT', message: 'Identifiant de transaction manquant.' });
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

  const verifyData = await verifyResponse.json().catch(() => ({}));
  const verifiedSiteId = String(verifyData.data?.cpm_site_id || '').trim();
  if (verifiedSiteId && verifiedSiteId !== String(CINETPAY_SITE_ID).trim()) {
    return res.status(400).json({ code: 'SITE_ID_INVALIDE', message: 'Site CinetPay invalide.' });
  }

  if (verifyData.code !== '00' || verifyData.data?.status !== 'ACCEPTED') {
    logWarn('payment-webhook', 'CinetPay verification rejected', {
      provider: 'cinetpay',
      transactionId: String(cpm_trans_id).slice(0, 120),
      providerCode: verifyData.code || 'unknown',
    });
    if (cpm_status && cpm_status !== 'ACCEPTED') {
      const verifiedCustom = verifyData.data?.cpm_custom;
      try {
        const parsed = typeof verifiedCustom === 'string' ? JSON.parse(verifiedCustom) : verifiedCustom;
        if (parsed?.checkoutIntentId) {
          const failedSupabase = admin();
          await failedSupabase.from('monetization_checkout_intents').update({
            status: 'failed',
            updated_at: new Date().toISOString(),
          }).eq('id', parsed.checkoutIntentId).in('status', ['pending', 'processing']);
        }
      } catch (error) {
        logWarn('payment-webhook', 'CinetPay failed status could not be recorded', {
          provider: 'cinetpay',
          transactionId: String(cpm_trans_id).slice(0, 120),
          reason: String(error?.message || 'unknown').slice(0, 120),
        });
      }
      return res.status(200).json({ code: '00', message: 'Webhook reçu, statut non accepté' });
    }
    return res.status(400).json({ code: '01', message: 'Verification echouee' });
  }

  const supabase = admin();
  const claim = await claimWebhookEvent(supabase, {
    provider: 'cinetpay',
    eventId: cpm_trans_id,
    rawBody: Buffer.from(JSON.stringify(verifyData.data || body)),
  });
  if (claim.duplicate) return res.status(claim.processing ? 409 : 200).json({ code: '00', message: 'Webhook déjà traité', duplicate: true, processing: Boolean(claim.processing) });

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

  await completeWebhookEvent(supabase, 'cinetpay', cpm_trans_id);

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

// Montant PayPal attendu pour une ressource BAARO (même calcul que api/payments.js).
function toPayPalAmount(amountMinor, currency = 'XOF') {
  const cur = String(currency || 'XOF').toUpperCase();
  const major = Number(amountMinor) / 100;
  if (['XOF', 'XAF'].includes(cur)) {
    return { currency_code: 'EUR', value: (major / XOF_PER_EUR).toFixed(2) };
  }
  if (PAYPAL_NATIVE_CURRENCIES.includes(cur)) {
    return { currency_code: cur, value: major.toFixed(2) };
  }
  return null;
}

function paypalAmountMatches(paypalPaid, expectedMinor, expectedCurrency) {
  const expected = toPayPalAmount(expectedMinor, expectedCurrency);
  if (!paypalPaid || !expected) return false;
  const paid = Number(paypalPaid.value);
  if (!Number.isFinite(paid)) return false;
  return (
    String(paypalPaid.currency_code).toUpperCase() === expected.currency_code &&
    Math.abs(paid - Number(expected.value)) < 0.005
  );
}

function inferKind(ref) {
  if (!ref) return 'topup';
  if (String(ref).startsWith('order_')) return 'order';
  if (String(ref).startsWith('company_')) return 'company_sub';
  if (String(ref).startsWith('shop_')) return 'shop_sub';
  return 'topup';
}

async function fulfillPayment(supabase, { paymentRef, kind, userId, provider, amount, currency, cpmTransId, paypalPaid }) {
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
    const expectedCurrency = String(intent.currency || 'XOF').toUpperCase();
    if (provider === 'paypal') {
      if (!paypalAmountMatches(paypalPaid, expected, expectedCurrency)) throw new Error('MONTANT_PAIEMENT_INATTENDU');
    } else {
      const paid = Number(amount);
      if (!Number.isFinite(expected) || !Number.isFinite(paid) || Math.abs(expected - paid) > 0.01) throw new Error('MONTANT_PAIEMENT_INATTENDU');
      if (String(currency || expectedCurrency).toUpperCase() !== expectedCurrency) throw new Error('DEVISE_PAIEMENT_INATTENDUE');
    }

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
    const amountOk = provider === 'paypal'
      ? paypalAmountMatches(paypalPaid, expected, order.currency || 'XOF')
      : Number(amount) === expected;
    if (!amountOk) throw new Error('MONTANT_PAIEMENT_INATTENDU');
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
      const expected = majorToMinor(sub.amount, sub.currency);
      const amountOk = provider === 'paypal'
        ? paypalAmountMatches(paypalPaid, expected, sub.currency || 'XOF')
        : Number(amount) === expected;
      if (!amountOk) throw new Error('MONTANT_PAIEMENT_INATTENDU');
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
      const expected = majorToMinor(sub.amount, sub.currency);
      const amountOk = provider === 'paypal'
        ? paypalAmountMatches(paypalPaid, expected, sub.currency || 'XOF')
        : Number(amount) === expected;
      if (!amountOk) throw new Error('MONTANT_PAIEMENT_INATTENDU');
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
