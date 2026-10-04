import { useState, useEffect } from "react";
import { Loader2, Package, CheckCircle, Truck, XCircle } from "lucide-react";
import { COLORS } from "../../../theme.js";
import { fetchSellerOrders, updateOrderStatus } from "../../../services/shopApi.js";
import { useToast } from "../../../components/ToastContext.jsx";

export default function OrdersSeller({ shopId }) {
  const { showToast } = useToast();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState(null);

  useEffect(() => { if (shopId) loadOrders(); }, [shopId]);

  const loadOrders = async () => {
    setLoading(true);
    try {
      const data = await fetchSellerOrders(shopId);
      setOrders(data || []);
    } catch (err) { console.error("Erreur commandes vendeur:", err); } finally { setLoading(false); }
  };

  const handleStatusChange = async (orderId, newStatus) => {
    setUpdatingId(orderId);
    try {
      await updateOrderStatus(orderId, newStatus);
      showToast(`Commande ${newStatus === 'delivered' ? 'livrée' : 'mise à jour'}`, "success");
      await loadOrders();
    } catch (err) { showToast("Erreur de mise à jour", "error"); } finally { setUpdatingId(null); }
  };

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="animate-spin" style={{ color: COLORS.gold }} /></div>;

  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-sm font-bold mb-2" style={{ color: COLORS.ivory }}>Commandes reçues</h3>
      {orders.length === 0 ? (
        <div className="text-center py-12" style={{ color: COLORS.muted }}><Package size={48} className="mx-auto mb-3 opacity-30" /><p>Aucune commande pour le moment</p></div>
      ) : (
        orders.map((order) => (
          <div key={order.id} className="rounded-xl border p-4" style={{ background: COLORS.surface2, borderColor: COLORS.border }}>
            <div className="flex justify-between items-start mb-3">
              <div>
                <p className="text-xs font-bold" style={{ color: COLORS.muted }}>{new Date(order.created_at).toLocaleDateString("fr-FR", { day: 'numeric', month: 'short', hour: '2-digit', minute:'2-digit' })}</p>
                <p className="text-sm font-bold mt-1" style={{ color: COLORS.ivory }}>{order.method === "delivery" ? "🚚 Livraison" : "📍 Retrait en boutique"}</p>
                {order.notes && <p className="text-xs mt-1 italic" style={{ color: COLORS.muted }}>"{order.notes}"</p>}
              </div>
              <span className="text-sm font-black" style={{ color: COLORS.gold }}>{Number(order.total_amount).toLocaleString()} {order.currency}</span>
            </div>
            <div className="space-y-1 mb-4">
              {order.order_items?.map((item, idx) => (
                <div key={idx} className="flex justify-between text-xs" style={{ color: COLORS.ivory }}>
                  <span>{item.quantity}x {item.name}</span>
                  <span>{(item.unit_price * item.quantity).toLocaleString()} {item.currency}</span>
                </div>
              ))}
            </div>
            <div className="border-t pt-3 flex flex-wrap gap-2" style={{ borderColor: COLORS.border }}>
              {order.status === "pending" && (<>
                <button onClick={() => handleStatusChange(order.id, "confirmed")} disabled={updatingId === order.id} className="flex-1 py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1 disabled:opacity-50" style={{ background: "rgba(59,130,246,0.15)", color: "#3b82f6" }}><CheckCircle size={12} /> Confirmer</button>
                <button onClick={() => handleStatusChange(order.id, "cancelled")} disabled={updatingId === order.id} className="flex-1 py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1 disabled:opacity-50" style={{ background: "rgba(239,68,68,0.15)", color: "#ef4444" }}><XCircle size={12} /> Annuler</button>
              </>)}
              {order.status === "confirmed" && order.method === "delivery" && (
                <button onClick={() => handleStatusChange(order.id, "shipped")} disabled={updatingId === order.id} className="w-full py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1 disabled:opacity-50" style={{ background: "rgba(139,92,246,0.15)", color: "#8b5cf6" }}><Truck size={12} /> Marquer comme expédié</button>
              )}
              {(order.status === "confirmed" || order.status === "shipped") && (
                <button onClick={() => handleStatusChange(order.id, "delivered")} disabled={updatingId === order.id} className="w-full py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1 disabled:opacity-50" style={{ background: "rgba(34,197,94,0.15)", color: "#22c55e" }}><CheckCircle size={12} /> Marquer comme livré/reçu</button>
              )}
              {order.status === "delivered" && <span className="w-full text-center text-xs font-bold py-2 rounded-lg" style={{ background: "rgba(34,197,94,0.15)", color: "#22c55e" }}>✅ Commande terminée</span>}
              {order.status === "cancelled" && <span className="w-full text-center text-xs font-bold py-2 rounded-lg" style={{ background: "rgba(239,68,68,0.15)", color: "#ef4444" }}>❌ Commande annulée</span>}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
