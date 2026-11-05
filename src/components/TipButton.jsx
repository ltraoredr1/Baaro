import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Gift } from 'lucide-react';
import { supabase } from '../supabaseClient.js';
import { createPayment } from '../lib/paymentProvider.js';

const OPTIONS = [
  { amount: 10000, label: '100 FCFA' },
  { amount: 50000, label: '500 FCFA' },
  { amount: 100000, label: '1 000 FCFA' },
];

const PROVIDERS = [
  { id: 'stripe', label: 'Carte bancaire' },
  { id: 'paypal', label: 'PayPal' },
];

export function TipButton({ recipientId, postId = null, liveId = null, compact = false }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [amount, setAmount] = useState(null);

  async function tip(amountMinor, provider) {
    setBusy(true); setError('');
    try {
      const { data, error: rpcError } = await supabase.rpc('send_tip', {
        p_recipient_id: recipientId,
        p_amount_minor: amountMinor,
        p_post_id: postId,
        p_live_id: liveId,
      });
      if (rpcError) throw rpcError;
      const payment = await createPayment({ provider, checkoutIntentId: data.id });
      if (!payment?.payment_url) throw new Error('URL de paiement manquante.');
      window.location.href = payment.payment_url;
    } catch (e) {
      setError(e.message || 'Pourboire impossible.');
      setBusy(false);
    }
  }

  function toggle() {
    setOpen(v => !v);
    setAmount(null);
    setError('');
  }

  return <div className="relative">
    <button type="button" onClick={toggle} disabled={busy || !recipientId} className={`flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/[.04] text-xs font-bold text-white/75 hover:bg-white/[.08] disabled:opacity-50 ${compact ? 'px-2 py-1.5' : 'px-3 py-2'}`}>
      <Gift size={15} /> {busy ? '…' : t('economy.tip')}
    </button>
    {open && <div className="absolute bottom-full left-0 z-50 mb-2 w-52 rounded-2xl border border-white/10 bg-black/95 p-2 shadow-2xl">
      <div className="px-2 py-1 text-[10px] font-black uppercase tracking-wider text-white/40">
        {amount ? 'Moyen de paiement' : t("economy.support_creator")}
      </div>
      {!amount && OPTIONS.map(o => <button key={o.amount} type="button" onClick={() => setAmount(o.amount)} className="mt-1 w-full rounded-xl px-3 py-2 text-left text-xs font-bold text-white hover:bg-white/10">{o.label}</button>)}
      {amount && <>
        {PROVIDERS.map(p => <button key={p.id} type="button" disabled={busy} onClick={() => tip(amount, p.id)} className="mt-1 w-full rounded-xl px-3 py-2 text-left text-xs font-bold text-white hover:bg-white/10 disabled:opacity-50">{p.label}</button>)}
        <button type="button" onClick={() => { setAmount(null); setError(''); }} className="mt-1 w-full rounded-xl px-3 py-2 text-left text-[11px] text-white/50 hover:bg-white/10">← Changer le montant</button>
      </>}
      {error && <div className="mt-2 px-2 text-[10px] leading-4 text-red-300">{error}</div>}
    </div>}
  </div>;
}
