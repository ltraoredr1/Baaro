import { useState } from "react";
import { ArrowLeft, Loader2, MapPin, Truck } from "lucide-react";
import { COLORS } from "../../../theme.js";
import { createOrder } from "../../../services/shopApi.js";
import { createPayment, getAvailableProviders } from "../../../lib/paymentProvider.js";
import { useToast } from "../../../components/ToastContext.jsx";

export default function OrderCheckout({ shop, items, id, onBack, onDone }) {
  const { showToast } = useToast();
  const [method, setMethod] = useState("pickup");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState("cash");

  const total = items.reduce((sum, x) => sum + x.unitPrice * x.quantity, 0);
  const currency = items[0]?.currency || shop?.currency || "XOF";

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (method === "delivery" && !address.trim()) {
      showToast("Veuillez entrer une adresse de livraison", "error");
      return;
    }

    setLoading(true);
    try {
      // CORRECTION CRITIQUE : Vérification stricte du fournisseur AVANT de créer la commande
      let paymentUrl = null;

      if (paymentMethod !== "cash") {
        const providers = getAvailableProviders(shop.country || "ML");
        const provider = providers.find(p => p.id === paymentMethod);

        if (!provider) {
          throw new Error("Moyen de paiement indisponible pour ce pays. Veuillez choisir le paiement à la livraison.");
        }

        // Créer la commande (elle restera en payment_status = 'pending')
        const order = await createOrder({
          shopId: shop.id,
          buyerId: id,
          items,
          method,
          notes: notes.trim(),
          dropoffAddress: method === "delivery" ? address.trim() : null
        });

        // Initialiser le paiement
        const paymentRef = `order_${order.id}_${Date.now()}`;
        const paymentData = await createPayment({
          provider: provider.id,
          shopId: shop.id,
          paymentRef,
          amount: total,
          currency,
          channel: provider.channels?.[0],
        });

        if (!paymentData?.payment_url) {
          throw new Error("Le prestataire de paiement n'a pas généré d'URL. Contactez le support.");
        }

        paymentUrl = paymentData.payment_url;
      } else {
        // Paiement cash : on crée la commande normalement
        await createOrder({
          shopId: shop.id,
          buyerId: id,
          items,
          method,
          notes: notes.trim(),
          dropoffAddress: method === "delivery" ? address.trim() : null
        });
      }

      // Gestion de la redirection ou du succès
      if (paymentUrl) {
        showToast("Redirection vers le paiement sécurisé...", "info");
        window.location.href = paymentUrl; // Le webhook confirmera le paiement plus tard
      } else {
        showToast("Commande passée avec succès !", "success");
        onDone();
      }
    } catch (err) {
      console.error(err);
      showToast(err.message || "Erreur lors de la commande", "error");
    } finally {
      setLoading(false);
    }
  };

  const providers = getAvailableProviders(shop?.country || "ML");

  return (
    <div className="flex flex-col gap-4 pb-24">
      <button onClick={onBack} className="flex items-center gap-2 text-sm font-semibold w-fit" style={{ color: COLORS.ivory }}><ArrowLeft size={16} /> Retour au panier</button>
      <h2 className="text-xl font-bold" style={{ color: COLORS.ivory }}>Finaliser la commande</h2>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="rounded-xl border p-4 space-y-3" style={{ background: COLORS.surface2, borderColor: COLORS.border }}>
          <h3 className="text-sm font-bold" style={{ color: COLORS.ivory }}>Récapitulatif</h3>
          {items.map((item, idx) => (
            <div key={idx} className="flex justify-between text-sm">
              <span style={{ color: COLORS.muted }}>{item.quantity}x {item.name}</span>
              <span style={{ color: COLORS.ivory }}>{(item.unitPrice * item.quantity).toLocaleString()} {currency}</span>
            </div>
          ))}
          <div className="border-t pt-3 mt-3 flex justify-between font-bold" style={{ borderColor: COLORS.border }}>
            <span style={{ color: COLORS.ivory }}>Total</span>
            <span style={{ color: COLORS.gold }}>{total.toLocaleString()} {currency}</span>
          </div>
        </div>

        <div className="rounded-xl border p-4 space-y-3" style={{ background: COLORS.surface2, borderColor: COLORS.border }}>
          <h3 className="text-sm font-bold" style={{ color: COLORS.ivory }}>Mode de réception</h3>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setMethod("pickup")} className="p-3 rounded-xl border text-sm font-bold flex flex-col items-center gap-2" style={{ background: method === "pickup" ? `${COLORS.gold}22` : COLORS.surface, borderColor: method === "pickup" ? COLORS.gold : COLORS.border, color: method === "pickup" ? COLORS.gold : COLORS.muted }}><MapPin size={20} /> Retrait en boutique</button>
            <button type="button" onClick={() => setMethod("delivery")} className="p-3 rounded-xl border text-sm font-bold flex flex-col items-center gap-2" style={{ background: method === "delivery" ? `${COLORS.gold}22` : COLORS.surface, borderColor: method === "delivery" ? COLORS.gold : COLORS.border, color: method === "delivery" ? COLORS.gold : COLORS.muted }}><Truck size={20} /> Livraison</button>
          </div>
          {method === "delivery" && (
            <textarea placeholder="Adresse complète de livraison..." value={address} onChange={(e) => setAddress(e.target.value)} rows={3} className="w-full rounded-xl border px-3 py-2 text-sm outline-none resize-none" style={{ background: COLORS.surface, borderColor: COLORS.border, color: COLORS.ivory }} required />
          )}
        </div>

        <div className="rounded-xl border p-4 space-y-3" style={{ background: COLORS.surface2, borderColor: COLORS.border }}>
          <h3 className="text-sm font-bold" style={{ color: COLORS.ivory }}>Mode de paiement</h3>
          <div className="space-y-2">
            <button type="button" onClick={() => setPaymentMethod("cash")} className="w-full text-left p-3 rounded-xl border text-sm font-bold" style={{ background: paymentMethod === "cash" ? `${COLORS.gold}22` : COLORS.surface, borderColor: paymentMethod === "cash" ? COLORS.gold : COLORS.border, color: paymentMethod === "cash" ? COLORS.gold : COLORS.muted }}>💵 Paiement à la livraison</button>
            {providers.map(p => (
              <button key={p.id} type="button" onClick={() => setPaymentMethod(p.id)} className="w-full text-left p-3 rounded-xl border text-sm font-bold" style={{ background: paymentMethod === p.id ? `${COLORS.gold}22` : COLORS.surface, borderColor: paymentMethod === p.id ? COLORS.gold : COLORS.border, color: paymentMethod === p.id ? COLORS.gold : COLORS.muted }}>{p.label}</button>
            ))}
          </div>
        </div>

        <div>
          <label className="text-xs font-bold mb-1 block" style={{ color: COLORS.muted }}>Notes pour le vendeur (optionnel)</label>
          <textarea placeholder="Ex: Appeler avant d'arriver..." value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="w-full rounded-xl border px-3 py-2 text-sm outline-none resize-none" style={{ background: COLORS.surface2, borderColor: COLORS.border, color: COLORS.ivory }} />
        </div>
        <button type="submit" disabled={loading} className="w-full py-3.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-50" style={{ background: COLORS.gold, color: COLORS.bg }}>
          {loading ? <Loader2 size={16} className="animate-spin" /> : "Confirmer la commande"}
        </button>
      </form>
    </div>
  );
}
