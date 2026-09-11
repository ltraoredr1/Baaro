import { useEffect, useState } from "react";
import { COLORS } from "../../../theme.js";
import { fetchBuyerOrders } from "../../../services/shopApi.js";

export default function OrdersBuyer({ userId }) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true); setError("");
    try { setOrders(await fetchBuyerOrders(userId)); }
    catch (e) { setError(e.message || "Impossible de charger les commandes."); }
    finally { setLoading(false); }
  }

  useEffect(() => { if (userId) load(); }, [userId]);

  if (loading) return <p className="text-sm" style={{ color: COLORS.muted }}>Chargement des commandes…</p>;
  if (error) return <p className="text-sm text-red-400">{error}</p>;
  if (!orders.length) return <p className="text-sm" style={{ color: COLORS.muted }}>Aucune commande.</p>;

  return (
    <div className="grid gap-3">
      {orders.map((o) => (
        <div key={o.id} className="rounded-xl border p-3" style={{ background: COLORS.surface2, borderColor: COLORS.border }}>
          <div className="flex justify-between gap-2">
            <b>{o.shops?.name || "Boutique"}</b>
            <span className="text-xs">{o.status}</span>
          </div>
          <div className="mt-1 text-xs" style={{ color: COLORS.muted }}>
            {new Date(o.created_at).toLocaleString()} · {o.method === "pickup" ? "Retrait" : "Livraison"}
          </div>
          <div className="mt-2 text-sm font-bold">{Number(o.total_amount).toFixed(2)} {o.currency}</div>
          {o.pickup_code && <div className="mt-2 text-xs" style={{ color: COLORS.gold }}>Code de retrait : <b>{o.pickup_code}</b></div>}
          {o.order_items?.length > 0 && <div className="mt-2 text-xs" style={{ color: COLORS.muted }}>{o.order_items.map((i) => `${i.name} × ${i.quantity}`).join(" · ")}</div>}
        </div>
      ))}
    </div>
  );
}
