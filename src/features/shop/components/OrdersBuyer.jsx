import { useState, useEffect } from "react";
import { Package, Loader2, Clock, CheckCircle, Truck } from "lucide-react";
import { COLORS } from "../../../theme.js";
import { fetchBuyerOrders } from "../../../services/shopApi.js";

const STATUS_CONFIG = {
  pending: { label: "En attente", icon: Clock, color: "#f59e0b", bg: "rgba(245,158,11,0.15)" },
  confirmed: { label: "Confirmée", icon: CheckCircle, color: "#3b82f6", bg: "rgba(59,130,246,0.15)" },
  shipped: { label: "En livraison", icon: Truck, color: "#8b5cf6", bg: "rgba(139,92,246,0.15)" },
  delivered: { label: "Livrée", icon: CheckCircle, color: "#22c55e", bg: "rgba(34,197,94,0.15)" },
  cancelled: { label: "Annulée", icon: Package, color: "#ef4444", bg: "rgba(239,68,68,0.15)" },
};

export default function OrdersBuyer({ id }) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { if (id) loadOrders(); }, [id]);

  const loadOrders = async () => {
    setLoading(true);
    try {
      const data = await fetchBuyerOrders(id);
      setOrders(data || []);
    } catch (err) { console.error("Erreur commandes:", err); } finally { setLoading(false); }
  };

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="animate-spin" style={{ color: COLORS.gold }} /></div>;

  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-sm font-bold mb-2" style={{ color: COLORS.ivory }}>Mes commandes</h3>
      {orders.length === 0 ? (
        <div className="text-center py-12" style={{ color: COLORS.muted }}><Package size={48} className="mx-auto mb-3 opacity-30" /><p>Vous n'avez pas encore de commande</p></div>
      ) : (
        orders.map((order) => {
          const status = STATUS_CONFIG[order.status] || STATUS_CONFIG.pending;
          const StatusIcon = status.icon;
          return (
            <div key={order.id} className="rounded-xl border p-4" style={{ background: COLORS.surface2, borderColor: COLORS.border }}>
              <div className="flex justify-between items-start mb-3">
                <div>
                  <p className="text-xs font-bold" style={{ color: COLORS.muted }}>Commande du {new Date(order.created_at).toLocaleDateString("fr-FR")}</p>
                  <p className="text-sm font-bold mt-1" style={{ color: COLORS.ivory }}>{order.shops?.name || "Boutique"}</p>
                </div>
                <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-full" style={{ background: status.bg, color: status.color }}><StatusIcon size={10} /> {status.label}</span>
              </div>
              <div className="space-y-1 mb-3">
                {order.order_items?.map((item, idx) => (
                  <div key={idx} className="flex justify-between text-xs" style={{ color: COLORS.muted }}>
                    <span>{item.quantity}x {item.name}</span>
                    <span>{(item.unit_price * item.quantity).toLocaleString()} {item.currency}</span>
                  </div>
                ))}
              </div>
              <div className="border-t pt-3 flex justify-between items-center" style={{ borderColor: COLORS.border }}>
                <span className="text-xs" style={{ color: COLORS.muted }}>
                  {order.method === "delivery" ? "🚚 Livraison" : "📍 Retrait"}
                  {order.pickup_code && <span className="ml-2 font-mono font-bold" style={{ color: COLORS.gold }}>Code: {order.pickup_code}</span>}
                </span>
                <span className="text-sm font-black" style={{ color: COLORS.ivory }}>{Number(order.total_amount).toLocaleString()} {order.currency}</span>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
