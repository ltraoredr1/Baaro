/**
 * /api/wallet.js - FUSION FINALE v2
 * Fusion de: payments.js + payout.js + wallet.js
 * Garde ton code exact, respecte auth.users.id
 * 1 endpoint au lieu de 3 → tu passes de 8 à 6 endpoints (sous tes 12)
 * 
 * Actions:
 *  - GET ?action=status | payments | balance
 *  - POST { action: "earn" | "redeem" | "convert" | "send_gift" } -> wallet RPC
 *  - POST { action: "pay" | "checkout" | amount, provider } -> payments (Stripe/CinetPay)
 *  - POST { action: "payout" } -> désactivé 503
 */

import { createClient } from '@supabase/supabase-js';
import { createCheckoutSession, mapStripeError } from './_shared.js';
import { getAdminClient, requireUser, rateLimitAsync, applyCors } from './_shared.js';

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const CINETPAY_API_KEY = process.env.CINETPAY_API_KEY;
const CINETPAY_SITE_ID = process.env.CINETPAY_SITE_ID;
const PUBLIC_APP_URL = (process.env.PUBLIC_APP_URL || process.env.VERCEL_URL || 'http://localhost:3000')
  .replace(/\/$/, '')
  .replace(/^(?!https?:\/\/)/, 'https://');

const DAILY_CAP = 100;
const REWARD_POINTS = {
  publish_post: 5,
  publish_post_media: 5,
  like_post: 2,
  comment: 1,
  like_video: 2,
  comment_video: 1,
  publish_video: 5,
  repost_video: 2,
  publish_story: 2,
};
const REDEEM_OPTIONS = {
  r3: { cost: 300, label: 'Badge Créateur Premium' },
  r4: { cost: 150, label: 'Boost de visibilité 48h' },
};

function adminPayments() {
  return createClient(supabaseUrl, supabaseServiceKey);
}
function jsonError(res, status, error) {
  return res.status(status).json({ ok: false, error });
}
function normalizeWalletError(error) {
  const message = error?.message || 'Opération wallet impossible';
  const known = {
    DAILY_BONUS_ALREADY_CLAIMED: 'Bonus quotidien déjà réclamé',
    DAILY_CAP_REACHED: 'Plafond quotidien atteint',
    REWARD_ALREADY_CLAIMED: 'Récompense déjà attribuée',
    REWARD_EVENT_NOT_FOUND: 'Événement de récompense introuvable',
    REWARD_REFERENCE_REQUIRED: 'Référence de l’événement requise',
    INSUFFICIENT_BALANCE: 'Solde insuffisant',
  };
  return known[message] || message;
}

// ============== WALLET HANDLERS (ton code exact) ==============
async function handleWalletStatus(res, admin, userId) {
  const { data, error } = await admin.rpc('wallet_ensure', { p_user_id: userId, p_welcome_bonus: 50 });
  if (error) return jsonError(res, 500, normalizeWalletError(error));
  const [{ data: holdings, error: holdingsError }, { data: dailyRows, error: dailyError }] = await Promise.all([
    admin.from('crypto_holdings').select('holdings').eq('id', userId).maybeSingle(),
    admin.from('transactions').select('action_key,day_key,pts,created_at').eq('user_id', userId).gte('created_at', new Date(new Date().setHours(0,0,0,0)).toISOString()).gt('pts', 0),
  ]);
  if (holdingsError) return jsonError(res, 500, normalizeWalletError(holdingsError));
  if (dailyError) return jsonError(res, 500, normalizeWalletError(dailyError));
  const earnedToday = (dailyRows || []).reduce((sum, row) => sum + Number(row.pts || 0), 0);
  const dailyClaimed = (dailyRows || []).some((row) => row.action_key === 'daily_bonus');
  return res.status(200).json({
    ok: true, balance: Number(data?.balance || 0), holdings: Number(holdings?.holdings || 0),
    earnedToday, remainingToday: Math.max(0, DAILY_CAP - earnedToday), dailyCap: DAILY_CAP, dailyClaimed,
  });
}

async function handleWalletEarn(res, admin, userId, body) {
  const actionKey = String(body.actionKey || '').trim();
  const isDaily = actionKey === 'daily_bonus';
  const pts = isDaily ? 10 : REWARD_POINTS[actionKey];
  if (!pts) return jsonError(res, 400, 'Action de récompense invalide');
  if (!isDaily && !body.referenceId) return jsonError(res, 400, 'Référence de l’action manquante');
  const { data, error } = await admin.rpc('wallet_earn', {
    p_user_id: userId, p_pts: pts, p_label: String(body.detail || actionKey).slice(0, 120),
    p_action_key: actionKey, p_daily_cap: DAILY_CAP, p_daily_bonus: isDaily, p_reference_id: body.referenceId || null,
  });
  if (error) return jsonError(res, 400, normalizeWalletError(error));
  return res.status(200).json({ ok: true, ...data, dailyCap: DAILY_CAP });
}

// ============== PAYMENTS HANDLER (ton code exact) ==============
async function handlePaymentsCheckout(req, res, supabase, user) {
  const {
    amount: bodyAmount, currency: bodyCurrency = 'XOF', package_name,
    provider = 'cinetpay', shop_id, payment_ref: clientRef, channel,
  } = req.body || {};

  let amount = Number(bodyAmount);
  let currency = bodyCurrency;
  let paymentRef = clientRef || `BAARO_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  let description = `Achat ${package_name || 'Diamants Baaro'}`;
  let kind = 'topup';

  if (typeof paymentRef === 'string' && paymentRef.startsWith('order_')) {
    const match = paymentRef.match(/^order_([0-9a-f-]{36})_/i);
    if (!match) return res.status(400).json({ error: 'payment_ref commande invalide', code: 'invalid_ref' });
    const orderId = match[1];
    const { data: order, error } = await supabase.from('orders').select('id, total_amount, currency, buyer_id, payment_status').eq('id', orderId).single();
    if (error || !order) return res.status(404).json({ error: 'Commande introuvable', code: 'order_not_found' });
    if (order.buyer_id !== user.id) return res.status(403).json({ error: 'Pas ta commande', code: 'forbidden' });
    if (order.payment_status === 'paid') return res.status(400).json({ error: 'Déjà payée', code: 'already_paid' });
    amount = Number(order.total_amount); currency = order.currency || 'XOF'; description = `Commande BAARO ${orderId.slice(0, 8)}`; kind = 'order';
  } else if (shop_id && clientRef) {
    amount = Number(bodyAmount); currency = bodyCurrency || 'XOF'; description = 'Abonnement BAARO'; kind = clientRef.startsWith('company_') ? 'company_sub' : 'shop_sub';
  } else {
    if (!amount || amount < 100) return res.status(400).json({ error: 'Montant minimum: 100 FCFA', code: 'amount_too_low' });
    kind = 'topup';
  }
  if (!amount || amount <= 0) return res.status(400).json({ error: 'Montant invalide', code: 'invalid_amount' });

  if (provider === 'stripe') {
    try {
      const result = await createCheckoutSession({
        amount, currency, paymentRef, description, customerEmail: user.email,
        successUrl: `${PUBLIC_APP_URL}/?paid=${kind}&ref=${encodeURIComponent(paymentRef)}`,
        cancelUrl: `${PUBLIC_APP_URL}/?cancelled=1`, metadata: { userId: user.id, kind },
      });
      if (kind === 'topup') {
        await supabase.from('transactions').insert({
          sender_id: null, receiver_id: user.id, transaction_type: 'topup', amount_xof: currency === 'XOF' ? amount : null,
          status: 'pending', metadata: { stripe_session_ref: paymentRef, provider: 'stripe' },
        });
      }
      return res.status(200).json({ success: true, payment_url: result.payment_url, transaction_id: result.transaction_id, session_id: result.session_id, kind, provider: 'stripe' });
    } catch (stripeErr) {
      const mapped = stripeErr.status ? stripeErr : mapStripeError(stripeErr);
      console.error('[payments] Stripe error', mapped);
      return res.status(mapped.status || 402).json({ error: mapped.message, code: mapped.code || mapped.type, decline_code: mapped.decline_code || null, provider: 'stripe', request_id: mapped.requestId || null });
    }
  }

  try {
    const cinetPayData = {
      apikey: CINETPAY_API_KEY, site_id: CINETPAY_SITE_ID, transaction_id: paymentRef, amount: Math.round(amount),
      currency: currency === 'XOF' ? 'XOF' : currency, channels: channel || 'ALL', description,
      client_name: user.email || 'Utilisateur', cpm_custom: JSON.stringify({ userId: user.id, kind, paymentRef }),
      notify_url: `${PUBLIC_APP_URL}/api/webhooks`, return_url: kind === 'order' ? `${PUBLIC_APP_URL}/?paid=order` : 'baaro://wallet',
    };
    const response = await fetch('https://api.cinetpay.com/v2/payment', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(cinetPayData) });
    const result = await response.json();
    if (result.code !== '00') return res.status(402).json({ error: result.description || 'Erreur CinetPay', code: result.code || 'cinetpay_error', provider: 'cinetpay' });
    if (kind === 'topup') {
      await supabase.from('transactions').insert({
        sender_id: null, receiver_id: user.id, transaction_type: 'topup', amount_xof: amount, status: 'pending', metadata: { cinetpay_transaction_id: paymentRef, provider: 'cinetpay' },
      });
    }
    return res.status(200).json({ success: true, payment_url: result.data?.payment_url || result.payment_url, transaction_id: paymentRef, kind, provider: 'cinetpay' });
  } catch (cinetErr) {
    console.error('[payments] CinetPay error', cinetErr);
    return res.status(502).json({ error: cinetErr.message || 'Service CinetPay indisponible', code: 'cinetpay_network', provider: 'cinetpay' });
  }
}

// ============== MAIN HANDLER ==============
export default async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method === 'OPTIONS') return res.status(200).end();
  res.setHeader('Cache-Control', 'no-store');

  const limit = await rateLimitAsync(req, { key: 'wallet', max: 30, windowMs: 60_000 });
  if (!limit.ok) {
    Object.entries(limit.headers || {}).forEach(([k, v]) => res.setHeader(k, v));
    return res.status(limit.status).json(limit.body);
  }

  // Auth - supporte les deux méthodes (ton payments.js utilisait getUser(token), wallet utilisait requireUser)
  let supabasePay = null; let admin = null; let user = null;
  try {
    admin = getAdminClient();
    user = await requireUser(req, admin);
    supabasePay = adminPayments();
    // Pour compat payments, on vérifie aussi que supabasePay peut récupérer user
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      const { data: { user: u } } = await supabasePay.auth.getUser(token);
      if (u) user = u;
    }
  } catch (e) {
    return res.status(e.status || 401).json({ ok: false, error: e.message, code: 'auth_invalid' });
  }

  const body = req.body || {};
  const action = String(body.action || req.query?.action || '').toLowerCase();

  try {
    // === WALLET STATUS ===
    if (req.method === 'GET') {
      if (action === 'payments' || action === 'transactions' || action === 'topup_history') {
        const { data: transactions, error } = await supabasePay.from('transactions').select('*').eq('receiver_id', user.id).eq('transaction_type', 'topup').order('created_at', { ascending: false }).limit(20);
        if (error) throw error;
        return res.status(200).json({ success: true, transactions: transactions || [] });
      }
      return await handleWalletStatus(res, admin, user.id);
    }

    // === WALLET EARN / REDEEM / CONVERT / SEND_GIFT ===
    if (['earn', 'status', 'get_balance', 'balance'].includes(action)) {
      if (action === 'status' || action === 'get_balance' || action === 'balance') return await handleWalletStatus(res, admin, user.id);
      return await handleWalletEarn(res, admin, user.id, body);
    }
    if (action === 'redeem') {
      const option = REDEEM_OPTIONS[String(body.optionId || '')];
      if (!option) return jsonError(res, 400, 'Récompense non disponible');
      const { data, error } = await admin.rpc('wallet_redeem', { p_user_id: user.id, p_cost: option.cost, p_label: option.label, p_action_key: `redeem_${body.optionId}` });
      if (error) return jsonError(res, 400, normalizeWalletError(error));
      return res.status(200).json({ ok: true, ...data });
    }
    if (action === 'convert') {
      const pts = Number(body.pts);
      if (!Number.isInteger(pts) || pts <= 0) return jsonError(res, 400, 'Nombre de points invalide');
      const { data, error } = await admin.rpc('wallet_convert', { p_user_id: user.id, p_pts: pts, p_points_per_baro: 100 });
      if (error) return jsonError(res, 400, normalizeWalletError(error));
      return res.status(200).json({ ok: true, ...data });
    }
    if (action === 'send_gift') {
      const roomId = body.roomId || body.pkBattleId;
      const giftId = body.giftId;
      if (!roomId || !giftId) return jsonError(res, 400, 'roomId et giftId sont obligatoires');
      const { data, error } = await admin.rpc('wallet_send_gift', { p_sender_id: user.id, p_room_id: roomId, p_gift_type_id: String(giftId) });
      if (error) return jsonError(res, 400, normalizeWalletError(error));
      return res.status(200).json({ ok: true, ...data });
    }

    // === PAYOUT (ton code exact - désactivé) ===
    if (['payout', 'cashout', 'withdraw', 'stripe-redeem'].includes(action) && !['topup'].includes(body.action)) {
      if (action === 'withdraw') return jsonError(res, 503, 'Cette opération financière n’est pas encore activée.');
      return res.status(503).json({ ok: false, error: "payout_unavailable", message: "Le rachat cash n’est pas encore activé." });
    }

    // === PAYMENTS (Stripe/CinetPay) ===
    if (['pay', 'payment', 'payments', 'checkout', 'topup', 'order_pay', 'shop_sub', 'company_sub'].includes(action) || body.amount || body.payment_ref) {
      return await handlePaymentsCheckout(req, res, supabasePay, user);
    }

    return jsonError(res, 400, 'Action non valide (earn | redeem | convert | send_gift | pay | status)');
  } catch (error) {
    console.error('[wallet fusion] Error:', error);
    return res.status(500).json({ ok: false, error: error.message || 'Erreur serveur', code: 'server_error' });
  }
}
