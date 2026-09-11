import { useEffect, useState } from "react";
import { COLORS } from "../theme.js";
import { fetchSellerOrders, updateOrderStatus } from "../services/shopApi.js";
import { useToast } from "./ToastContext.jsx";

const STATUS_LABEL = {
  pending: "En attente",
  paid: "Payée",
  preparing: "En préparation",
  ready: "Prête au retrait",
  shipped: "Expédiée",
  delivered: "Livrée",
  cancelled: "Annulée",
};

/** Transitions autorisées côté vendeur */
const NEXT_STATUS = {
  pending: ["preparing", "cancelled"],
  paid: ["preparing", "cancelled"],
  preparing: ["ready", "shipped", "cancelled"],
  ready: ["delivered", "cancelled"],
  shipped: ["delivered", "cancelled"],
  delivered: [],
  cancelled: [],
};

const STATUS_COLOR = {
  pending: "#fbbf24",
  paid: "#34d399",
  preparing: "#60a5fa",
  ready: "#a78bfa",
  shipped: "#38bdf8",
  delivered: "#4ade80",
  cancelled: "#f87171",
};

/**
 * Espace vendeur — liste des commandes reçues + changement de statut.
 * Aucun nouvel endpoint API : tout passe par Supabase + RLS.
 */
export default function OrdersSeller({ shopId }) {
  const { showToast } = useToast();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState(null);
  const [filter, setFilter] = useState("all"); // all | active | done

  async function load() {
    if (!shopId) return;
    setLoading(true);
    try {
      const data = await fetchSellerOrders(shopId);
      setOrders(data || []);
    } catch (err) {
      showToast(err.message || "Erreur chargement commandes", "error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [shopId]);

  async function handleStatus(orderId, newStatus) {
    setUpdatingId(orderId);
    try {
      await updateOrderStatus(orderId, newStatus);
      showToast(`Statut → ${STATUS_LABEL[newStatus] || newStatus}`, "success");
      await load();
    } catch (err) {
      showToast(err.message || "Impossible de changer le statut", "error");
    } finally {
      setUpdatingId(null);
    }
  }

  const filtered = orders.filter((o) => {
    if (filter === "active") {
      return !["delivered", "cancelled"].includes(o.status);
    }
    if (filter === "done") {
      return ["delivered", "cancelled"].includes(o.status);
    }
    return true;
  });

  if (loading) {
    return (
      <p className="text-sm" style={{ color: COLORS.muted }}>
        Chargement des commandes…
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h3 className="font-bold text-sm" style={{ color: COLORS.ivory }}>
          Commandes reçues ({orders.length})
        </h3>
        <div className="flex gap-1">
          {[
            { id: "all", label: "Toutes" },
            { id: "active", label: "En cours" },
            { id: "done", label: "Terminées" },
          ].map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              className="px-2.5 py-1 rounded-lg text-[11px] font-bold border"
              style={{
                background: filter === f.id ? COLORS.goldGlow : COLORS.surface2,
                borderColor: filter === f.id ? COLORS.borderGold : COLORS.border,
                color: filter === f.id ? COLORS.gold : COLORS.muted,
              }}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm" style={{ color: COLORS.muted }}>
          Aucune commande dans ce filtre.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {filtered.map((o) => {
            const next = NEXT_STATUS[o.status] || [];
            const isUpdating = updatingId === o.id;

            return (
              <div
                key={o.id}
                className="rounded-xl border p-3"
                style={{ background: COLORS.surface2, borderColor: COLORS.border }}
              >
                {/* En-tête */}
                <div className="flex justify-between items-start gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className="text-[11px] font-bold px-2 py-0.5 rounded-full"
                        style={{
                          background: `${STATUS_COLOR[o.status] || "#888"}22`,
                          color: STATUS_COLOR[o.status] || COLORS.muted,
                        }}
                      >
                        {STATUS_LABEL[o.status] || o.status}
                      </span>
                      <span className="text-[11px]" style={{ color: COLORS.muted }}>
                        {o.method === "pickup" ? "Retrait" : "Livraison"}
                      </span>
                    </div>
                    <div className="text-xs mt-1" style={{ color: COLORS.muted }}>
                      {new Date(o.created_at).toLocaleString("fr-FR", {
                        day: "2-digit",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </div>
                  </div>
                  <div className="text-sm font-bold shrink-0" style={{ color: COLORS.gold }}>
                    {Number(o.total_amount).toLocaleString()} {o.currency}
                  </div>
                </div>

                {/* Articles */}
                <div className="text-xs mt-2" style={{ color: COLORS.ivory }}>
                  {o.order_items?.map((i) => (
                    <div key={i.id}>
                      {i.name} × {i.quantity}
                      <span style={{ color: COLORS.muted }}>
                        {" "}
                        · {(i.unit_price * i.quantity).toLocaleString()} {i.currency}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Code retrait */}
                {o.method === "pickup" && o.pickup_code && (
                  <div
                    className="mt-2 text-xs font-bold px-2 py-1 rounded-lg inline-block"
                    style={{ background: COLORS.goldGlow, color: COLORS.gold }}
                  >
                    Code retrait : {o.pickup_code}
                  </div>
                )}

                {/* Notes client */}
                {o.notes && (
                  <p className="text-xs mt-2 italic" style={{ color: COLORS.muted }}>
                    Note : {o.notes}
                  </p>
                )}

                {/* Actions statut */}
                {next.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-3">
                    {next.map((s) => (
                      <button
                        key={s}
                        type="button"
                        disabled={isUpdating}
                        onClick={() => handleStatus(o.id, s)}
                        className="px-2.5 py-1 rounded-lg text-[11px] font-bold border disabled:opacity-50"
                        style={{
                          borderColor: s === "cancelled" ? "#f87171" : COLORS.border,
                          color: s === "cancelled" ? "#f87171" : COLORS.ivory,
                          background: COLORS.surface3 || "rgba(255,255,255,0.04)",
                        }}
                      >
                        {isUpdating ? "…" : STATUS_LABEL[s]}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <button
        type="button"
        onClick={load}
        className="text-xs self-start px-3 py-1.5 rounded-lg border"
        style={{ borderColor: COLORS.border, color: COLORS.muted }}
      >
        Actualiser
      </button>
    </div>
  );
}
