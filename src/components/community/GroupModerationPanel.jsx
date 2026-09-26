import { useState, useEffect, useCallback } from "react";
import { Shield, Ban, Crown, User, AlertTriangle, X, Loader2, Trash2 } from "lucide-react";
import { supabase } from "../../supabaseClient.js";
import { useCommunity } from "../../hooks/useCommunity.js";

export default function GroupModerationPanel({ groupId, onClose, C }) {
  const { groups, banMember, setMemberRole, loadAll } = useCommunity();
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState("members"); // members | reports
  const [actionLoading, setActionLoading] = useState(null);

  const group = groups.find((g) => g.id === groupId);
  const members = group?.members || [];

  const loadReports = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await supabase
        .from("community_reports")
        .select("*, profiles!community_reports_reporter_id_fkey(display_name, handle)")
        .eq("group_id", groupId)
        .eq("status", "open")
        .order("created_at", { ascending: false })
        .limit(30);
      setReports(data || []);
    } catch (e) {
      console.error("[moderation] reports", e);
    } finally {
      setLoading(false);
    }
  }, [groupId]);

  useEffect(() => {
    if (tab === "reports") loadReports();
  }, [tab, loadReports]);

  const handleBan = async (userId) => {
    if (!window.confirm("Bannir ce membre ?")) return;
    setActionLoading(userId);
    try {
      await banMember(groupId, userId, "Banni par un modérateur");
      await loadAll?.(true);
    } catch (e) {
      alert("Erreur : " + e.message);
    } finally {
      setActionLoading(null);
    }
  };

  const handlePromote = async (userId, newRole) => {
    setActionLoading(userId);
    try {
      await setMemberRole(groupId, userId, newRole);
      await loadAll?.(true);
    } catch (e) {
      alert("Erreur : " + e.message);
    } finally {
      setActionLoading(null);
    }
  };

  const handleResolveReport = async (reportId) => {
    try {
      await supabase.from("community_reports").update({ status: "resolved" }).eq("id", reportId);
      setReports((prev) => prev.filter((r) => r.id !== reportId));
    } catch (e) {
      alert("Erreur : " + e.message);
    }
  };

  const roleBadge = (role) => {
    const colors = {
      owner: { bg: "rgba(217,174,82,0.2)", color: C.gold },
      admin: { bg: "rgba(239,68,68,0.15)", color: "#ef4444" },
      moderator: { bg: "rgba(45,191,166,0.15)", color: C.teal },
      member: { bg: C.surface2, color: C.muted },
    };
    const c = colors[role] || colors.member;
    return (
      <span className="text-[9px] px-1.5 py-0.5 rounded-full font-bold" style={{ background: c.bg, color: c.color }}>
        {role}
      </span>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-2xl max-h-[85vh] rounded-2xl border flex flex-col overflow-hidden"
        style={{ background: C.surface, borderColor: C.border }}>

        {/* En-tête */}
        <div className="flex items-center justify-between p-4 border-b shrink-0" style={{ borderColor: C.border }}>
          <h3 className="font-bold text-lg flex items-center gap-2" style={{ color: C.gold }}>
            <Shield size={20} /> Modération
          </h3>
          <button type="button" onClick={onClose}><X size={20} style={{ color: C.muted }} /></button>
        </div>

        {/* Onglets internes */}
        <div className="flex gap-2 p-3 border-b shrink-0" style={{ borderColor: C.border }}>
          {[
            { id: "members", label: `Membres (${members.length})` },
            { id: "reports", label: `Signalements (${reports.length})` },
          ].map((t) => (
            <button key={t.id} type="button" onClick={() => setTab(t.id)}
              className="px-3 py-1.5 rounded-xl text-xs font-bold"
              style={{
                background: tab === t.id ? "rgba(217,174,82,0.15)" : "transparent",
                color: tab === t.id ? C.gold : C.muted,
              }}>{t.label}</button>
          ))}
        </div>

        {/* Contenu */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2 min-h-0">
          {tab === "members" && members.map((m) => (
            <div key={m.user_id} className="flex items-center justify-between p-3 rounded-xl"
              style={{ background: C.surface2 }}>
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: C.border }}>
                  <User size={14} style={{ color: C.muted }} />
                </div>
                <div>
                  <p className="text-sm font-bold truncate max-w-[140px]">{m.user_id.slice(0, 8)}…</p>
                  {roleBadge(m.role)}
                </div>
              </div>
              {m.role !== "owner" && (
                <div className="flex gap-1">
                  {m.role === "member" && (
                    <button type="button" onClick={() => handlePromote(m.user_id, "moderator")}
                      disabled={actionLoading === m.user_id}
                      className="p-1.5 rounded-lg disabled:opacity-40" style={{ color: C.teal }} title="Promouvoir modérateur">
                      <Crown size={14} />
                    </button>
                  )}
                  {m.role === "moderator" && (
                    <button type="button" onClick={() => handlePromote(m.user_id, "admin")}
                      disabled={actionLoading === m.user_id}
                      className="p-1.5 rounded-lg disabled:opacity-40" style={{ color: C.gold }} title="Promouvoir admin">
                      <Crown size={14} />
                    </button>
                  )}
                  <button type="button" onClick={() => handleBan(m.user_id)}
                    disabled={actionLoading === m.user_id}
                    className="p-1.5 rounded-lg disabled:opacity-40" style={{ color: "#ef4444" }} title="Bannir">
                    {actionLoading === m.user_id ? <Loader2 size={14} className="animate-spin" /> : <Ban size={14} />}
                  </button>
                </div>
              )}
            </div>
          ))}

          {tab === "reports" && loading && (
            <div className="flex justify-center py-8"><Loader2 className="animate-spin" size={20} style={{ color: C.muted }} /></div>
          )}
          {tab === "reports" && !loading && reports.length === 0 && (
            <p className="text-center text-sm py-8" style={{ color: C.muted }}>Aucun signalement en attente ✅</p>
          )}
          {tab === "reports" && reports.map((r) => (
            <div key={r.id} className="p-3 rounded-xl space-y-2" style={{ background: C.surface2 }}>
              <div className="flex items-center justify-between">
                <p className="text-xs flex items-center gap-1" style={{ color: C.muted }}>
                  <AlertTriangle size={12} style={{ color: "#ef4444" }} />
                  Signalé par : {r.profiles?.display_name || r.profiles?.handle || "Anonyme"}
                </p>
                <span className="text-[10px]" style={{ color: C.muted }}>
                  {new Date(r.created_at).toLocaleDateString()}
                </span>
              </div>
              {r.reason && <p className="text-xs italic" style={{ color: C.gold }}>Raison : {r.reason}</p>}
              <div className="flex justify-end">
                <button type="button" onClick={() => handleResolveReport(r.id)}
                  className="px-3 py-1 rounded-lg text-xs font-bold" style={{ background: C.teal, color: "#000" }}>
                  Marquer résolu
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
                  }
