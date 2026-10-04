import { createClient } from '@supabase/supabase-js';
import { applyCors, getAdminClient, requireUser, rateLimitAsync } from './_shared.js';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const CINETPAY_TRANSFER_TOKEN = process.env.CINETPAY_TRANSFER_TOKEN || '';
const PUBLIC_APP_URL = (process.env.PUBLIC_APP_URL || process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL || '').replace(/\/$/, '').replace(/^(?!https?:\/\/)/, 'https://');

function json(res, status, body) { return res.status(status).json(body); }
function parseDestination(raw) {
  try {
    const d = typeof raw === 'string' ? JSON.parse(raw) : raw;
    const prefix = String(d?.prefix || '').replace(/\D/g, '');
    const phone = String(d?.phone || '').replace(/\D/g, '');
    if (!prefix || !phone) throw new Error('Destination Mobile Money invalide.');
    return { prefix, phone };
  } catch {
    const e = new Error('Destination Mobile Money invalide. Utilisez {"prefix":"223","phone":"..."}.');
    e.status = 400;
    throw e;
  }
}

async function startCinetPayTransfer({ payout, destination }) {
  if (!CINETPAY_TRANSFER_TOKEN) return { configured: false };
  const amountXof = Math.round(Number(payout.amount_minor) / 100);
  const clientTransactionId = `payout_${payout.id}`;
  const notifyUrl = `${PUBLIC_APP_URL}/api/payout-webhook`;
  const data = JSON.stringify([{
    prefix: destination.prefix,
    phone: destination.phone,
    amount: amountXof,
    client_transaction_id: clientTransactionId,
    notify_url: notifyUrl,
  }]);
  const url = `https://client.cinetpay.com/v1/transfer/money/send/contact?token=${encodeURIComponent(CINETPAY_TRANSFER_TOKEN)}&lang=fr`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams({ data }),
  });
  const result = await response.json().catch(() => ({}));
  const item = result?.data?.[0]?.[0] || result?.data?.[0] || null;
  if (!response.ok || Number(result?.code) !== 0 || !item || Number(item.code) !== 0) {
    throw new Error(result?.description || result?.message || item?.message || 'CinetPay payout impossible.');
  }
  return { configured: true, transaction_id: item.transaction_id, lot: item.lot, status: item.status || 'pending' };
}

export default async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'Méthode non autorisée.' });
  const limit = await rateLimitAsync(req, { key: 'payouts', max: 3, windowMs: 60_000 });
  if (!limit.ok) return res.status(limit.status).json(limit.body);

  let admin, user;
  try { admin = getAdminClient(); user = await requireUser(req, admin); }
  catch (e) { return json(res, e.status || 401, { ok: false, error: e.message }); }

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return json(res, 503, { ok: false, error: 'Configuration Supabase publique manquante.' });

  try {
    const body = req.body || {};
    const amount = Number(body.amount);
    const method = String(body.method || 'mobile_money');
    const destination = parseDestination(body.destination);
    if (!Number.isFinite(amount) || amount <= 0) return json(res, 400, { ok: false, error: 'Montant invalide.' });

    // The invoker RPC uses the user's JWT so auth.uid() is preserved.
    const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false, autoRefreshToken: false } });
    const amountMinor = Math.round(amount * 100);
    const destinationToken = JSON.stringify(destination);
    const { data: payoutId, error: requestError } = await userClient.rpc('request_economy_payout', { p_amount_minor: amountMinor, p_method: method, p_destination_token: destinationToken });
    if (requestError) return json(res, 400, { ok: false, error: requestError.message });

    const { data: payout, error: readError } = await admin.from('economy_payouts').select('id,user_id,amount_minor,currency,method,status,destination_token').eq('id', payoutId).eq('user_id', user.id).single();
    if (readError || !payout) return json(res, 500, { ok: false, error: 'Demande de retrait introuvable après réservation.' });

    if (method === 'bank_transfer') {
      await admin.from('economy_payouts').update({ status: 'processing', provider: 'manual_bank', provider_reference: `manual_${payout.id}` }).eq('id', payout.id).eq('status', 'pending');
      return json(res, 202, { ok: true, payout_id: payout.id, status: 'processing', message: 'Virement bancaire placé en traitement sécurisé.' });
    }

    const transfer = await startCinetPayTransfer({ payout, destination });
    if (!transfer.configured) {
      await admin.rpc('cancel_economy_payout', { p_payout_id: payout.id, p_reason: 'CINETPAY_TRANSFER_NOT_CONFIGURED' });
      return json(res, 503, { ok: false, error: 'Le payout CinetPay n’est pas configuré. Aucun solde n’a été perdu.' });
    }

    await admin.from('economy_payouts').update({ status: 'processing', provider: 'cinetpay', provider_reference: transfer.transaction_id }).eq('id', payout.id).eq('status', 'pending');
    return json(res, 202, { ok: true, payout_id: payout.id, status: 'processing', provider: 'cinetpay', transaction_id: transfer.transaction_id });
  } catch (e) {
    return json(res, e.status || 500, { ok: false, error: e.message || 'Payout impossible.' });
  }
}
