import { applyCors, getAdminClient } from './_shared.js';

const TOKEN = process.env.CINETPAY_TRANSFER_TOKEN || '';

async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  let raw = '';
  for await (const chunk of req) raw += chunk.toString();
  try { return JSON.parse(raw); } catch { return Object.fromEntries(new URLSearchParams(raw)); }
}

export default async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (!['POST', 'GET'].includes(req.method)) return res.status(405).json({ ok: false });
  if (!TOKEN) return res.status(503).json({ ok: false, error: 'Payout provider non configuré.' });
  const body = await readBody(req);
  const clientTransactionId = String(body.client_transaction_id || '').trim();
  const transactionId = String(body.transaction_id || '').trim();
  if (!clientTransactionId && !transactionId) return res.status(400).json({ ok: false, error: 'Référence de transfert manquante.' });

  const queryKey = transactionId ? `transaction_id=${encodeURIComponent(transactionId)}` : `client_transaction_id=${encodeURIComponent(clientTransactionId)}`;
  const verify = await fetch(`https://client.cinetpay.com/v1/transfer/check/money?token=${encodeURIComponent(TOKEN)}&lang=fr&${queryKey}`, { headers: { Accept: 'application/json' } });
  const data = await verify.json().catch(() => ({}));
  const transfer = data?.data?.[0] || null;
  if (Number(data?.code) !== 0 || !transfer) return res.status(400).json({ ok: false, error: 'Transfert introuvable.' });

  const admin = getAdminClient();
  const payoutRef = String(transfer.client_transaction_id || clientTransactionId);
  const payoutId = payoutRef.startsWith('payout_') ? payoutRef.slice('payout_'.length) : null;
  if (!payoutId) return res.status(400).json({ ok: false, error: 'Référence BAARO invalide.' });
  const { data: payout } = await admin.from('economy_payouts').select('id,amount_minor,currency,status').eq('id', payoutId).maybeSingle();
  if (!payout) return res.status(404).json({ ok: false, error: 'Payout BAARO introuvable.' });
  const expected = Math.round(Number(payout.amount_minor) / 100);
  const paid = Number(transfer.amount);
  if (!Number.isFinite(paid) || paid !== expected) return res.status(400).json({ ok: false, error: 'Montant payout inattendu.' });

  const status = String(transfer.treatment_status || '').toUpperCase();
  if (['VAL', 'SUCCESS', 'SUCCESSFUL'].includes(status) || String(transfer.transfer_valid).toUpperCase() === 'Y') {
    await admin.rpc('complete_economy_payout', { p_payout_id: payout.id, p_provider: 'cinetpay', p_provider_reference: String(transfer.transaction_id || payoutRef) });
    return res.status(200).json({ ok: true, status: 'paid' });
  }
  if (['REJ', 'REJECTED', 'CANCELLED', 'FAILED', 'FAIL'].includes(status)) {
    await admin.rpc('cancel_economy_payout', { p_payout_id: payout.id, p_reason: String(transfer.comment || status).slice(0,500) });
    return res.status(200).json({ ok: true, status: 'cancelled' });
  }
  await admin.from('economy_payouts').update({ status: 'processing', provider: 'cinetpay', provider_reference: String(transfer.transaction_id || payoutRef) }).eq('id', payout.id).in('status', ['pending','processing']);
  return res.status(200).json({ ok: true, status: 'processing' });
}
