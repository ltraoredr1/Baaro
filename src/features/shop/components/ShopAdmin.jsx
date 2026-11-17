import { useState, useEffect } from "react";
import { 
  Store, Package, AlertTriangle, CheckCircle, XCircle, 
  Loader2, DollarSign, TrendingUp, Users, Shield 
} from "lucide-react";
import { COLORS } from "../../../theme.js";
import { 
  fetchAllShopsForAdmin, moderateShop, fetchProductReports, 
  handleProductReport, verifySeller, fetchDisputes, resolveDispute,
  detectFraudulentOrders, fetchCommissionStats
} from "../../../services/shopApi.js";
import { useToast } from "../../../components/ToastContext.jsx";

export default function ShopAdmin() {
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState("shops");
  const [shops, setShops] = useState([]);
  const [reports, setReports] = useState([]);
  const [disputes, setDisputes] = useState([]);
  const [fraudAlerts, setFraudAlerts] = useState(null);
  const [commissionStats, setCommissionStats] = useState({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadData();
  }, [activeTab]);

  const loadData = async () => {
    setLoading(true);
    try {
      if (activeTab === "shops") {
        const data = await fetchAllShopsForAdmin({ status: "all" });
        setShops(data || []);
      } else if (activeTab === "reports") {
        const data = await fetchProductReports({ status: "pending" });
        setReports(data || []);
      } else if (activeTab === "disputes") {
        const data = await fetchDisputes({ status: "open" });
        setDisputes(data || []);
      } else if (activeTab === "fraud") {
        const data = await detectFraudulentOrders();
        setFraudAlerts(data);
      } else if (activeTab === "commissions") {
        const data = await fetchCommissionStats({});
        setCommissionStats(data);
      }
    } catch (err) {
      console.error("Erreur chargement admin:", err);
      showToast("Erreur de chargement", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleModerateShop = async (shopId, action) => {
    try {
      await moderateShop(shopId, action);
      showToast(`Boutique ${action === "approve" ? "approuvée" : "rejetée"}`, "success");
      loadData();
    } catch (err) {
      showToast(err.message || "Erreur de modération", "error");
    }
  };

  const handleVerifySeller = async (shopId, verified) => {
    try {
      await verifySeller(shopId, verified);
      showToast(`Vendeur ${verified ? "vérifié" : "non vérifié"}`, "success");
      loadData();
    } catch (err) {
      showToast(err.message || "Erreur de vérification", "error");
    }
  };

  const handleReport = async (reportId, action) => {
    try {
      await handleProductReport(reportId, action);
      showToast(`Signalement ${action === "disable" ? "traité" : "rejeté"}`, "success");
      loadData();
    } catch (err) {
      showToast(err.message || "Erreur de traitement", "error");
    }
  };

  const handleDispute = async (disputeId, resolution) => {
    try {
      await resolveDispute(disputeId, resolution);
      showToast("Litige résolu", "success");
      loadData();
    } catch (err) {
      showToast(err.message || "Erreur de résolution", "error");
    }
  };

  const tabs = [
    { id: "shops", label: "Boutiques", icon: Store },
    { id: "reports", label: "Signalements", icon: AlertTriangle },
    { id: "disputes", label: "Litiges", icon: Users },
    { id: "fraud", label: "Fraudes", icon: Shield },
    { id: "commissions", label: "Commissions", icon: DollarSign },
  ];

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-xl font-bold" style={{ color: COLORS.ivory }}>Administration Shop</h2>
      
      <div className="flex flex-wrap gap-2 border-b pb-2" style={{ borderColor: COLORS.border }}>
        {tabs.map(tab => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all"
              style={{
                background: activeTab === tab.id ? COLORS.gold : COLORS.surface2,
                color: activeTab === tab.id ? COLORS.bg : COLORS.ivory,
                borderColor: activeTab === tab.id ? COLORS.gold : COLORS.border,
              }}
            >
              <Icon size={16} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="animate-spin" size={32} style={{ color: COLORS.gold }} />
        </div>
      ) : (
        <>
          {activeTab === "shops" && (
            <div className="flex flex-col gap-3">
              {shops.length === 0 ? (
                <p className="text-center py-8" style={{ color: COLORS.muted }}>Aucune boutique</p>
              ) : (
                shops.map(shop => (
                  <div key={shop.id} className="rounded-xl border p-4" style={{ background: COLORS.surface2, borderColor: COLORS.border }}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <h3 className="font-bold" style={{ color: COLORS.ivory }}>{shop.name}</h3>
                          {shop.is_verified && <CheckCircle size={14} style={{ color: COLORS.teal }} />}
                        </div>
                        <p className="text-xs mt-1" style={{ color: COLORS.muted }}>
                          {shop.city}, {shop.country} · {shop.currency}
                        </p>
                        <p className="text-xs mt-1" style={{ color: COLORS.muted }}>
                          Propriétaire: {shop.profiles?.display_name || shop.profiles?.email || "N/A"}
                        </p>
                        <div className="flex gap-2 mt-2">
                          <span className={`text-[10px] px-2 py-0.5 rounded font-bold ${shop.is_active ? "bg-teal-500/20 text-teal-400" : "bg-gray-500/20 text-gray-400"}`}>
                            {shop.is_active ? "Active" : "En attente"}
                          </span>
                        </div>
                      </div>
                      <div className="flex flex-col gap-2">
                        {!shop.is_active && (
                          <>
                            <button onClick={() => handleModerateShop(shop.id, "approve")} className="px-3 py-1.5 rounded-lg text-xs font-bold" style={{ background: "rgba(34,197,94,0.15)", color: "#22c55e" }}>
                              Approuver
                            </button>
                            <button onClick={() => handleModerateShop(shop.id, "reject")} className="px-3 py-1.5 rounded-lg text-xs font-bold" style={{ background: "rgba(239,68,68,0.15)", color: "#ef4444" }}>
                              Rejeter
                            </button>
                          </>
                        )}
                        <button onClick={() => handleVerifySeller(shop.id, !shop.is_verified)} className="px-3 py-1.5 rounded-lg text-xs font-bold" style={{ background: "rgba(59,130,246,0.15)", color: "#3b82f6" }}>
                          {shop.is_verified ? "Dé-vérifier" : "Vérifier"}
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {activeTab === "reports" && (
            <div className="flex flex-col gap-3">
              {reports.length === 0 ? (
                <p className="text-center py-8" style={{ color: COLORS.muted }}>Aucun signalement en attente</p>
              ) : (
                reports.map(report => (
                  <div key={report.id} className="rounded-xl border p-4" style={{ background: COLORS.surface2, borderColor: COLORS.border }}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <h3 className="font-bold text-sm" style={{ color: COLORS.ivory }}>
                          {report.shop_products?.name || "Produit inconnu"}
                        </h3>
                        <p className="text-xs mt-1" style={{ color: COLORS.muted }}>
                          Boutique: {report.shop_products?.shops?.name || "N/A"}
                        </p>
                        <p className="text-xs mt-1" style={{ color: COLORS.muted }}>
                          Raison: {report.reason}
                        </p>
                        {report.description && (
                          <p className="text-xs mt-1 italic" style={{ color: COLORS.muted }}>
                            "{report.description}"
                          </p>
                        )}
                        <p className="text-[10px] mt-2" style={{ color: COLORS.muted }}>
                          Signalé par: {report.profiles?.display_name || "Anonyme"} · {new Date(report.created_at).toLocaleDateString("fr-FR")}
                        </p>
                      </div>
                      <div className="flex flex-col gap-2">
                        <button onClick={() => handleReport(report.id, "disable")} className="px-3 py-1.5 rounded-lg text-xs font-bold" style={{ background: "rgba(239,68,68,0.15)", color: "#ef4444" }}>
                          Désactiver
                        </button>
                        <button onClick={() => handleReport(report.id, "dismiss")} className="px-3 py-1.5 rounded-lg text-xs font-bold" style={{ background: "rgba(107,114,128,0.15)", color: "#9ca3af" }}>
                          Rejeter
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {activeTab === "disputes" && (
            <div className="flex flex-col gap-3">
              {disputes.length === 0 ? (
                <p className="text-center py-8" style={{ color: COLORS.muted }}>Aucun litige ouvert</p>
              ) : (
                disputes.map(dispute => (
                  <div key={dispute.id} className="rounded-xl border p-4" style={{ background: COLORS.surface2, borderColor: COLORS.border }}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <h3 className="font-bold text-sm" style={{ color: COLORS.ivory }}>
                          Litige #{dispute.id.slice(0, 8)}
                        </h3>
                        <p className="text-xs mt-1" style={{ color: COLORS.muted }}>
                          Commande: {dispute.orders?.total_amount?.toLocaleString()} {dispute.orders?.currency}
                        </p>
                        <p className="text-xs mt-1" style={{ color: COLORS.muted }}>
                          Boutique: {dispute.orders?.shops?.name || "N/A"}
                        </p>
                        <p className="text-xs mt-1" style={{ color: COLORS.muted }}>
                          Raison: {dispute.reason}
                        </p>
                        {dispute.description && (
                          <p className="text-xs mt-1 italic" style={{ color: COLORS.muted }}>
                            "{dispute.description}"
                          </p>
                        )}
                        <p className="text-[10px] mt-2" style={{ color: COLORS.muted }}>
                          Créé par: {dispute.profiles?.display_name || "Anonyme"} · {new Date(dispute.created_at).toLocaleDateString("fr-FR")}
                        </p>
                      </div>
                      <div className="flex flex-col gap-2">
                        <button onClick={() => handleDispute(dispute.id, "refund_buyer")} className="px-3 py-1.5 rounded-lg text-xs font-bold" style={{ background: "rgba(34,197,94,0.15)", color: "#22c55e" }}>
                          Rembourser
                        </button>
                        <button onClick={() => handleDispute(dispute.id, "favor_seller")} className="px-3 py-1.5 rounded-lg text-xs font-bold" style={{ background: "rgba(59,130,246,0.15)", color: "#3b82f6" }}>
                          En faveur vendeur
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {activeTab === "fraud" && (
            <div className="flex flex-col gap-4">
              {fraudAlerts ? (
                <>
                  <div className="rounded-xl border p-4" style={{ background: "rgba(239,68,68,0.1)", borderColor: "#ef4444" }}>
                    <h3 className="font-bold text-sm flex items-center gap-2" style={{ color: "#ef4444" }}>
                      <Shield size={16} />
                      Utilisateurs suspects ({fraudAlerts.suspicious_users?.length || 0})
                    </h3>
                    {fraudAlerts.suspicious_users?.length > 0 ? (
                      <ul className="mt-2 space-y-1">
                        {fraudAlerts.suspicious_users.map(userId => (
                          <li key={userId} className="text-xs" style={{ color: COLORS.ivory }}>
                            {userId}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-xs mt-2" style={{ color: COLORS.muted }}>Aucun utilisateur suspect détecté</p>
                    )}
                  </div>

                  <div className="rounded-xl border p-4" style={{ background: "rgba(245,158,11,0.1)", borderColor: "#f59e0b" }}>
                    <h3 className="font-bold text-sm flex items-center gap-2" style={{ color: "#f59e0b" }}>
                      <TrendingUp size={16} />
                      Commandes à haut risque ({fraudAlerts.high_value_orders?.length || 0})
                    </h3>
                    {fraudAlerts.high_value_orders?.length > 0 ? (
                      <ul className="mt-2 space-y-1">
                        {fraudAlerts.high_value_orders.map(order => (
                          <li key={order.id} className="text-xs" style={{ color: COLORS.ivory }}>
                            Commande {order.id.slice(0, 8)}: {order.total_amount?.toLocaleString()} {order.currency}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-xs mt-2" style={{ color: COLORS.muted }}>Aucune commande à haut risque</p>
                    )}
                  </div>

                  <p className="text-[10px] text-center" style={{ color: COLORS.muted }}>
                    Dernière vérification: {new Date(fraudAlerts.detected_at).toLocaleString("fr-FR")}
                  </p>
                </>
              ) : (
                <p className="text-center py-8" style={{ color: COLORS.muted }}>Aucune donnée de fraude</p>
              )}
            </div>
          )}

          {activeTab === "commissions" && (
            <div className="flex flex-col gap-4">
              {Object.keys(commissionStats).length === 0 ? (
                <p className="text-center py-8" style={{ color: COLORS.muted }}>Aucune commission enregistrée</p>
              ) : (
                Object.entries(commissionStats).map(([currency, stats]) => (
                  <div key={currency} className="rounded-xl border p-4" style={{ background: COLORS.surface2, borderColor: COLORS.border }}>
                    <h3 className="font-bold text-sm mb-3" style={{ color: COLORS.ivory }}>
                      Statistiques {currency}
                    </h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-xs" style={{ color: COLORS.muted }}>Commission BAARO</p>
                        <p className="text-lg font-black" style={{ color: COLORS.gold }}>
                          {stats.total_commission?.toLocaleString()} {currency}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs" style={{ color: COLORS.muted }}>Reversement vendeurs</p>
                        <p className="text-lg font-black" style={{ color: COLORS.teal }}>
                          {stats.total_seller?.toLocaleString()} {currency}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs" style={{ color: COLORS.muted }}>Volume total</p>
                        <p className="text-sm font-bold" style={{ color: COLORS.ivory }}>
                          {stats.total_amount?.toLocaleString()} {currency}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs" style={{ color: COLORS.muted }}>Nombre de commandes</p>
                        <p className="text-sm font-bold" style={{ color: COLORS.ivory }}>
                          {stats.count}
                        </p>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
