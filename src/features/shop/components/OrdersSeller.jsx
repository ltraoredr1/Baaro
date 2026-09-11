import { useEffect, useState } from "react";
import { COLORS } from "../../../theme.js";
import { fetchSellerOrders, updateOrderStatus } from "../../../services/shopApi.js";

const STATUSES = ["pending", "confirmed", "ready", "completed", "cancelled"];

export default function OrdersSeller({ shopId }) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true); setError("");
    try { setOrders(await fetchSellerOrders(shopId)); }
    catch (e) { setError(e.message || "Impossible de charger les commandes."); }
    finally { setLoading(false); }
  }

  useEffect(() => { if (shopId) load(); }, [shopId]);

  async function change(id, status) {
    try { await updateOrderStatus(id, status); await load(); }
    catch (e) { setError(e.message || "Mise à jour impossible."); }
  }

  if (loading) return <p className="text-sm" style={{ color: COLORS.muted }}>Chargement…</p>;
  if (error) return <p className="text-sm text-red-400">{error}</p>;
  if (!orders.length) return <p className="text-sm" style={{ color: COLORS.muted }}>Aucune commande reçue.</p>;

  return (
    <div className="grid gap-3">
      {orders.map((o) => (
        <div key={o.id} className="rounded-xl border p-3" style={{ background: COLORS.surface2, borderColor: COLORS.border }}>
          <div className="flex justify-between gap-2">
            <b>Commande #{o.id.slice(0, 8)}</b>
            <b>{Number(o.total_amount).toFixed(2)} {o.currency}</b>
          </div>
          <div className="mt-2 text-xs" style={{ color: COLORS.muted }}>{o.order_items?.map((i) => `${i.name} × ${i.quantity}`).join(" · ")}</div>
          {o.pickup_code && <div className="mt-2 text-xs">Code retrait : <b>{o.pickup_code}</b></div>}
          <select value={o.status} onChange={(e) => change(o.id, e.target.value)} className="mt-3 rounded-lg border px-2 py-1 text-sm" style={{ background: COLORS.surface2, borderColor: COLORS.border, color: COLORS.ivory }}>
            {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      ))}
    </div>
  );
}
