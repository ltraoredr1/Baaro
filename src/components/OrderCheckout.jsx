import { useState, useEffect } from "react";
import { ArrowLeft } from "lucide-react";
import { COLORS } from "../theme.js";
import { createOrder } from "../services/shopApi.js";
import { createPayment, getAvailableProviders } from "../lib/paymentProvider.js";
import { useToast } from "./ToastContext.jsx";
import { supabase } from "../supabaseClient.js";

/**
 * Checkout commande :
 * 1. Crée la commande (status pending)
 * 2. Optionnel : paiement CinetPay/Stripe via /api/payments existant
 * 3. Code de retrait si pickup sans paiement en ligne
 * Aucun nouvel endpoint API.
 */
export default function OrderCheckout({ shop, cart, userId, onBack, onSuccess }) {
  const { showToast } = useToast();
  const [method, setMethod] = useState("pickup");
  const [notes, setNotes] = useState("");
  const [payNow, setPayNow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState(null);

  const total = cart.reduce((s, c) => s + c.product.price * c.quantity, 0);
  const currency = cart[0]?.product.currency || shop.currency || "XOF";
  const providers = getAvailableProviders(shop.country || "ML");

  useEffect(() => {
    setSelectedProvider(providers[0] || null);
  }, [shop.country]);

  async function handleConfirm() {
    if (!userId) {
      showToast("Connecte-toi pour commander", "error");
      return;
    }
    setLoading(true);
    try {
      const items = cart.map((c) => ({
        productId: c.product.id,
        name: c.product.name,
        unitPrice: c.product.price,
        quantity: c.quantity,
        currency: c.product.currency,
      }));

      const order = await createOrder({
        shopId: shop.id,
        buyerId: userId,
        items,
        method,
        notes,
      });

      if (payNow && selectedProvider) {
        const paymentRef = `order_${order.id}_${Date.now()}`;

        await supabase
          .from("orders")
          .update({
            payment_status: "pending",
            payment_ref: paymentRef,
            payment_provider: selectedProvider.id,
          })
          .eq("id", order.id);

        const paymentData = await createPayment({
          provider: selectedProvider.id,
          shopId: shop.id,
          paymentRef,
          amount: total,
          currency,
          channel: selectedProvider.channels?.[0],
        });

        showToast("Redirection vers le paiement…", "success");
        if (paymentData?.payment_url) {
          window.location.href = paymentData.payment_url;
          return;
        }
        showToast("Paiement initié — confirmation en attente", "success");
      } else {
        showToast(
          method === "pickup"
            ? `Commande créée ! Code retrait : ${order.pickup_code}`
            : "Commande créée ! Le vendeur va te contacter.",
          "success"
        );
      }

      onSuccess?.(order);
    } catch (err) {
      showToast(err.message || "Erreur lors de la commande", "error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <button
        type="button"
        onClick={onBack}
        className="flex items-center gap-1 text-sm self-start"
        style={{ color: COLORS.muted }}
      >
        <ArrowLeft size={16} /> Retour
      </button>

      <h2 className="font-bold" style={{ color: COLORS.ivory }}>
        Finaliser la commande
      </h2>
      <p className="text-sm" style={{ color: COLORS.muted }}>
        {shop.name}
      </p>

      <div
        className="rounded-xl border p-3 space-y-2"
        style={{ background: COLORS.surface2, borderColor: COLORS.border }}
      >
        {cart.map((c) => (
          <div key={c.product.id} className="flex justify-between text-sm">
            <span style={{ color: COLORS.ivory }}>
              {c.product.name} × {c.quantity}
            </span>
            <span style={{ color: COLORS.muted }}>
              {(c.product.price * c.quantity).toLocaleString()} {currency}
            </span>
          </div>
        ))}
        <div
          className="border-t pt-2 flex justify-between font-bold text-sm"
          style={{ borderColor: COLORS.border, color: COLORS.gold }}
        >
          <span>Total</span>
          <span>
            {total.toLocaleString()} {currency}
          </span>
        </div>
      </div>

      <div className="flex gap-2">
        {["pickup", "delivery"].map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMethod(m)}
            className="flex-1 py-2 rounded-xl text-xs font-bold border"
            style={{
              background: method === m ? COLORS.goldGlow : COLORS.surface2,
              borderColor: method === m ? COLORS.borderGold : COLORS.border,
              color: method === m ? COLORS.gold : COLORS.ivory,
            }}
          >
            {m === "pickup" ? "Retrait sur place" : "Livraison"}
          </button>
        ))}
      </div>

      <div
        className="rounded-xl border p-3 flex flex-col gap-2"
        style={{ background: COLORS.surface2, borderColor: COLORS.border }}
      >
        <p className="text-xs font-bold" style={{ color: COLORS.ivory }}>
          Paiement
        </p>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input type="radio" checked={!payNow} onChange={() => setPayNow(false)} />
          <span style={{ color: COLORS.ivory }}>
            {method === "pickup" ? "Payer au retrait" : "Payer à la livraison"}
          </span>
        </label>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input type="radio" checked={payNow} onChange={() => setPayNow(true)} />
          <span style={{ color: COLORS.ivory }}>Payer maintenant (Mobile Money / Carte)</span>
        </label>

        {payNow && (
          <div className="mt-1 space-y-1">
            {providers.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setSelectedProvider(p)}
                className="w-full text-left border rounded-lg px-3 py-2 text-xs"
                style={{
                  borderColor:
                    selectedProvider?.id === p.id ? COLORS.borderGold : COLORS.border,
                  background:
                    selectedProvider?.id === p.id ? COLORS.goldGlow : "transparent",
                  color: COLORS.ivory,
                }}
              >
                {p.icon || ""} {p.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <textarea
        placeholder="Notes (optionnel)"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        rows={2}
        className="rounded-xl border px-3 py-2 text-sm"
        style={{
          background: COLORS.surface2,
          borderColor: COLORS.border,
          color: COLORS.ivory,
        }}
      />

      <button
        type="button"
        disabled={loading || (payNow && !selectedProvider)}
        onClick={handleConfirm}
        className="w-full py-3 rounded-xl font-bold text-sm disabled:opacity-50"
        style={{ background: COLORS.goldGlow, color: COLORS.gold }}
      >
        {loading
          ? "Traitement…"
          : payNow
            ? `Payer ${total.toLocaleString()} ${currency}`
            : `Confirmer · ${total.toLocaleString()} ${currency}`}
      </button>

      <p className="text-[11px] text-center" style={{ color: COLORS.muted }}>
        {method === "pickup" && !payNow
          ? "Tu recevras un code de retrait à présenter au vendeur."
          : payNow
            ? "Paiement sécurisé. La commande sera confirmée après paiement."
            : "Le vendeur confirmera la livraison."}
      </p>
    </div>
  );
}
