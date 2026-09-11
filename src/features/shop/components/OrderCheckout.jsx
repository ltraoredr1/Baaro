import { useState } from "react";
import { COLORS } from "../../../theme.js";
import { createOrder } from "../../../services/shopApi.js";

export default function OrderCheckout({ shop, userId, items, onBack, onDone }) {
  const [method, setMethod] = useState("pickup");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const total = items.reduce((sum, x) => sum + x.unitPrice * x.quantity, 0);
  const currency = items[0]?.currency || shop.currency || "XOF";

  async function submit(e) {
    e.preventDefault();
    if (!userId || !items.length) return;
    if (method === "delivery" && !address.trim()) {
      setError("L'adresse de livraison est obligatoire.");
      return;
    }
    setSaving(true); setError("");
    try {
      await createOrder({
        shopId: shop.id,
        buyerId: userId,
        items,
        method,
        notes: notes.trim() || null,
        dropoffAddress: method === "delivery" ? address.trim() : null
      });
      onDone?.();
    } catch (e) {
      setError(e.message || "Impossible de créer la commande.");
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
            <span>{(x.unitPrice * x.quantity).toFixed(2)} {x.currency}</span>
          </div>
        ))}
        <div className="mt-2 flex justify-between border-t pt-2 font-bold">
          <span>Total</span><span>{total.toFixed(2)} {currency}</span>
        </div>
      </div>

      <select value={method} onChange={(e) => setMethod(e.target.value)} className="rounded-xl border px-3 py-2" style={{ background: COLORS.surface2, borderColor: COLORS.border, color: COLORS.ivory }}>
        <option value="pickup">Retrait en boutique</option>
        <option value="delivery">Livraison</option>
      </select>

      {method === "delivery" && <textarea required value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Adresse de livraison" rows={3} className="rounded-xl border px-3 py-2" />}
      <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Note pour le vendeur (optionnel)" rows={2} className="rounded-xl border px-3 py-2" />
      {error && <p className="text-sm text-red-400">{error}</p>}

      <button disabled={saving} className="rounded-xl py-2 font-bold disabled:opacity-50" style={{ background: COLORS.goldGlow, color: COLORS.gold }}>
        {saving ? "Création…" : "Confirmer la commande"}
      </button>
    </form>
  );
}
