import { useEffect, useState } from "react";
import { COLORS } from "../../../theme.js";
import { createOrder } from "../../../services/shopApi.js";
import { createPayment, getAvailableProviders } from "../../../lib/paymentProvider.js";

export default function OrderCheckout({ shop, userId, items, onBack, onDone }) {
  const [method, setMethod] = useState("pickup");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [providers, setProviders] = useState([]);
  const [providerId, setProviderId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const totalHint = items.reduce(
    (sum, x) => sum + Number(x.unitPrice || 0) * Number(x.quantity || 0),
    0
  );
  const currency = items[0]?.currency || shop?.currency || "XOF";

  useEffect(() => {
    const country = shop?.country || "ML";
    const available = getAvailableProviders(country).filter((p) => p.enabled !== false);
    setProviders(available);
    setProviderId(available[0]?.id || "");
  }, [shop?.country]);

  async function submit(e) {
    e.preventDefault();
    if (!userId || !items.length || !shop?.id) return;
    if (method === "delivery" && !address.trim()) {
      setError("L'adresse de livraison est obligatoire.");
      return;
    }
    if (!providerId) {
      setError("Choisis un moyen de paiement.");
      return;
    }

    setSaving(true);
    setError("");
    try {
      const order = await createOrder({
        shopId: shop.id,
        buyerId: userId,
        items,
        method,
        notes: notes.trim() || null,
        dropoffAddress: method === "delivery" ? address.trim() : null,
      });

      const paymentRef = `order_${order.id}_${Date.now()}`;
      const provider = providers.find((p) => p.id === providerId);
      const payment = await createPayment({
        provider: providerId,
        shopId: shop.id,
        orderId: order.id,
        paymentRef,
        amount: Number(order.total_amount),
        currency: order.currency || currency,
        paymentType: "order",
        channel: provider?.channels?.[0],
      });

      onDone?.(order, payment);
      if (payment?.payment_url) {
        window.location.href = payment.payment_url;
      } else {
        setError("Commande créée, mais le lien de paiement est indisponible. Réessaie depuis tes commandes.");
      }
    } catch (err) {
      setError(err.message || "Impossible de créer ou payer la commande.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="mx-auto flex max-w-lg flex-col gap-3">
      <button type="button" onClick={onBack} className="text-left text-sm">← Retour au panier</button>
      <h2 className="text-lg font-bold">Finaliser la commande</h2>

      <div className="rounded-xl border p-3" style={{ background: COLORS.surface2, borderColor: COLORS.border }}>
        {items.map((x) => (
          <div key={x.productId} className="flex justify-between py-1 text-sm">
            <span>{x.name} × {x.quantity}</span>
            <span>{(Number(x.unitPrice) * Number(x.quantity)).toFixed(2)} {x.currency}</span>
          </div>
        ))}
        <div className="mt-2 flex justify-between border-t pt-2 font-bold">
          <span>Total</span>
          <span>{totalHint.toFixed(2)} {currency}</span>
        </div>
        <p className="mt-2 text-[11px]" style={{ color: COLORS.muted }}>
          Le montant final est recalculé et contrôlé côté serveur.
        </p>
      </div>

      <select value={method} onChange={(e) => setMethod(e.target.value)} className="rounded-xl border px-3 py-2" style={{ background: COLORS.surface2, borderColor: COLORS.border, color: COLORS.ivory }}>
        <option value="pickup">Retrait en boutique</option>
        <option value="delivery">Livraison</option>
      </select>

      {method === "delivery" && (
        <textarea required value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Adresse de livraison" rows={3} className="rounded-xl border px-3 py-2" />
      )}

      <select value={providerId} onChange={(e) => setProviderId(e.target.value)} className="rounded-xl border px-3 py-2" style={{ background: COLORS.surface2, borderColor: COLORS.border, color: COLORS.ivory }}>
        {providers.map((p) => (
          <option key={p.id} value={p.id}>{p.icon || "💳"} {p.label}</option>
        ))}
      </select>

      <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Note pour le vendeur (optionnel)" rows={2} className="rounded-xl border px-3 py-2" />
      {error && <p className="text-sm text-red-400">{error}</p>}

      <button disabled={saving} className="rounded-xl py-2 font-bold disabled:opacity-50" style={{ background: COLORS.goldGlow, color: COLORS.gold }}>
        {saving ? "Préparation du paiement…" : "Payer la commande"}
      </button>
    </form>
  );
}
