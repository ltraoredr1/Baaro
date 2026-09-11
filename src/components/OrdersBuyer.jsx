import { useEffect, useState } from "react";
import { COLORS } from "../theme.js";
import { fetchBuyerOrders } from "../services/shopApi.js";

const STATUS_LABEL = {
  pending: "En attente",
  paid: "Payée",
  preparing: "En préparation",
  ready: "Prête",
  shipped: "Expédiée",
  delivered: "Livrée",
  cancelled: "Annulée",
};

export default function OrdersBuyer({ userId }) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) return;
    (async () => {
      setLoading(true);
      try {
        const data = await fetchBuyerOrders(userId);
        setOrders(data);
      } finally {
        setLoading(false);
      }
    })();
  }, [userId]);

  if (loading) {
    return (
      <p className="text-sm" style={{ color: COLORS.muted }}>
        Chargement…
      </p>
    );
  }
  if (orders.length === 0) {
    return (
      <p className="text-sm" style={{ color: COLORS.muted }}>
        Aucune commande pour le moment.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {orders.map((o) => (
        <div
          key={o.id}
          className="rounded-xl border p-3"
          style={{ background: COLORS.surface2, borderColor: COLORS.border }}
        >
          <div className="flex justify-between items-start">
            <div>
              <div className="font-bold text-sm" style={{ color: COLORS.ivory }}>
                {o.shops?.name || "Boutique"}
              </div>
              <div className="text-xs mt-0.5" style={{ color: COLORS.muted }}>
                {STATUS_LABEL[o.status] || o.status}
                {o.pickup_code && o.method === "pickup" && (
                  <>
                    {" "}
                    · Code :{" "}
                    <strong style={{ color: COLORS.gold }}>{o.pickup_code}</strong>
                  </>
                )}
              </div>
            </div>
            <div className="text-sm font-bold" style={{ color: COLORS.gold }}>
              {Number(o.total_amount).toLocaleString()} {o.currency}
            </div>
          </div>
          <div className="text-xs mt-2" style={{ color: COLORS.muted }}>
            {o.order_items?.map((i) => `${i.name} ×${i.quantity}`).join(", ")}
          </div>
        </div>
      ))}
    </div>
  );
}
