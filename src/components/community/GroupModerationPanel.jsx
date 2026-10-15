
import { useState, useEffect, useCallback } from "react";
import {
  Shield,
  Ban,
  Crown,
  User,
  AlertTriangle,
  X,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { supabase } from "../../supabaseClient.js";
import { useCommunity } from "../../hooks/useCommunity.js";

export default function GroupModerationPanel({
  groupId,
  userId,
  onClose,
  C,
}) {
  const {
    groups,
    banMember,
    setMemberRole,
    loadAll,
    loading: groupsLoading,
  } = useCommunity(userId);

  const [reports, setReports] = useState([]);
  const [loadingReports, setLoadingReports] = useState(false);
  const [reportsError, setReportsError] = useState("");
  const [actionLoading, setActionLoading] = useState(null);
  const [tab, setTab] = useState("members");
  const [notice, setNotice] = useState("");

  const group = groups.find((item) => item.id === groupId);
  const members = group?.members || [];

  const loadReports = useCallback(async () => {
    if (!groupId) return;

    setLoadingReports(true);
    setReportsError("");

    try {
      const { data, error } = await supabase
        .from("community_reports")
        .select(
          "*, profiles!community_reports_reporter_id_fkey(display_name, handle)"
        )
        .eq("group_id", groupId)
        .eq("status", "open")
        .order("created_at", { ascending: false })
        .limit(30);

      if (error) throw error;
      setReports(data || []);
    } catch (error) {
      console.error("[moderation] load reports:", error);
      setReportsError(
        error?.message || "Impossible de charger les signalements."
      );
    } finally {
      setLoadingReports(false);
    }
  }, [groupId]);

  useEffect(() => {
    if (tab === "reports") loadReports();
  }, [tab, loadReports]);

  const handleBan = async (targetUserId) => {
    if (!window.confirm("Bannir ce membre du groupe ?")) return;

    setActionLoading(targetUserId);
    setNotice("");

    try {
      await banMember(
        groupId,
        targetUserId,
        "Banni par un modérateur"
      );
      await loadAll(true);
      setNotice("Membre banni.");
    } catch (error) {
      console.error("[moderation] ban:", error);
      setNotice(error?.message || "Impossible de bannir ce membre.");
    } finally {
      setActionLoading(null);
    }
  };

  const handleRoleChange = async (targetUserId, newRole) => {
    setActionLoading(targetUserId);
    setNotice("");

    try {
      await setMemberRole(groupId, targetUserId, newRole);
      await loadAll(true);
      setNotice("Rôle du membre mis à jour.");
    } catch (error) {
      console.error("[moderation] role:", error);
      setNotice(error?.message || "Impossible de modifier ce rôle.");
    } finally {
      setActionLoading(null);
    }
  };

  const handleResolveReport = async (reportId) => {
    setActionLoading(reportId);
    setNotice("");

    try {
      const { data, error } = await supabase
        .from("community_reports")
        .update({ status: "resolved" })
        .eq("id", reportId)
        .eq("group_id", groupId)
        .eq("status", "open")
        .select("id");

      if (error) throw error;
      if (!data?.length) {
        throw new Error(
          "Signalement non modifié : accès refusé ou signalement déjà traité."
        );
      }

      setReports((current) =>
        current.filter((report) => report.id !== reportId)
      );
      setNotice("Signalement marqué comme résolu.");
    } catch (error) {
      console.error("[moderation] resolve report:", error);
      setNotice(error?.message || "Impossible de résoudre le signalement.");
    } finally {
      setActionLoading(null);
    }
  };

  const roleBadge = (role) => {
    const colors = {
      owner: { bg: "rgba(217,174,82,0.2)", color: C.gold },
      admin: { bg: "rgba(239,68,68,0.15)", color: "#ef4444" },
      moderator: { bg: "rgba(45,191,166,0.15)", color: C.teal },
      member: { bg: C.surface2, color: C.muted },
    };

    const style = colors[role] || colors.member;

    return (
      <span
        className="text-[9px] px-1.5 py-0.5 rounded-full font-bold"
        style={{ background: style.bg, color: style.color }}
      >
        {role || "member"}
      </span>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-4">
      <div
        className="w-full max-w-2xl max-h-[85vh] rounded-2xl border flex flex-col overflow-hidden"
        style={{ background: C.surface, borderColor: C.border }}
      >
        <div
          className="flex items-center justify-between p-4 border-b shrink-0"
          style={{ borderColor: C.border }}
        >
          <h3
            className="font-bold text-lg flex items-center gap-2"
            style={{ color: C.gold }}
          >
            <Shield size={20} />
            Modération
          </h3>

          <button type="button" onClick={onClose} aria-label="Fermer">
            <X size={20} style={{ color: C.muted }} />
          </button>
        </div>

        <div
          className="flex gap-2 p-3 border-b shrink-0"
          style={{ borderColor: C.border }}
        >
          {[
            { id: "members", label: `Membres (${members.length})` },
            { id: "reports", label: `Signalements (${reports.length})` },
          ].map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className="px-3 py-1.5 rounded-xl text-xs font-bold"
              style={{
                background:
                  tab === item.id
                    ? "rgba(217,174,82,0.15)"
                    : "transparent",
                color: tab === item.id ? C.gold : C.muted,
              }}
            >
              {item.label}
            </button>
          ))}
        </div>

        {notice && (
          <div
            className="mx-3 mt-3 p-2 rounded-lg text-xs"
            role="status"
            style={{
              color: C.ivory,
              background: C.surface2,
              border: `1px solid ${C.border}`,
            }}
          >
            {notice}
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-4 space-y-2 min-h-0">
          {tab === "members" && groupsLoading && (
            <div className="flex justify-center py-8">
              <Loader2
                size={20}
                className="animate-spin"
                style={{ color: C.muted }}
              />
            </div>
          )}

          {tab === "members" &&
            !groupsLoading &&
            members.map((member) => (
              <div
                key={member.user_id}
                className="flex items-center justify-between gap-3 p-3 rounded-xl"
                style={{ background: C.surface2 }}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className="w-8 h-8 shrink-0 rounded-full flex items-center justify-center"
                    style={{ background: C.border }}
                  >
                    <User size={14} style={{ color: C.muted }} />
                  </div>

                  <div className="min-w-0">
                    <p className="text-sm font-bold truncate">
                      {member.user_id}
                    </p>
                    {roleBadge(member.role)}
                  </div>
                </div>

                {member.role !== "owner" && (
                  <div className="flex gap-1 shrink-0">
                    {member.role === "member" && (
                      <button
                        type="button"
                        onClick={() =>
                          handleRoleChange(member.user_id, "moderator")
                        }
                        disabled={!!actionLoading}
                        className="p-1.5 rounded-lg disabled:opacity-40"
                        style={{ color: C.teal }}
                        title="Promouvoir modérateur"
                      >
                        {actionLoading === member.user_id ? (
                          <Loader2 size={14} className="animate-spin" />
                        ) : (
                          <Crown size={14} />
                        )}
                      </button>
                    )}

                    {member.role === "moderator" && (
                      <button
                        type="button"
                        onClick={() =>
                          handleRoleChange(member.user_id, "admin")
                        }
                        disabled={!!actionLoading}
                        className="p-1.5 rounded-lg disabled:opacity-40"
                        style={{ color: C.gold }}
                        title="Promouvoir administrateur"
                      >
                        {actionLoading === member.user_id ? (
                          <Loader2 size={14} className="animate-spin" />
                        ) : (
                          <Crown size={14} />
                        )}
                      </button>
                    )}

                    {["member", "moderator"].includes(member.role) && (
                      <button
                        type="button"
                        onClick={() => handleBan(member.user_id)}
                        disabled={!!actionLoading}
                        className="p-1.5 rounded-lg disabled:opacity-40"
                        style={{ color: "#ef4444" }}
                        title="Bannir"
                      >
                        {actionLoading === member.user_id ? (
                          <Loader2 size={14} className="animate-spin" />
                        ) : (
                          <Ban size={14} />
                        )}
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}

          {tab === "members" && !groupsLoading && members.length === 0 && (
            <p
              className="text-center text-sm py-8"
              style={{ color: C.muted }}
            >
              Aucun membre chargé. Vérifie les autorisations Supabase.
            </p>
          )}

          {tab === "reports" && (
            <div className="flex justify-end">
              <button
                type="button"
                onClick={loadReports}
                disabled={loadingReports}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs"
                style={{ color: C.gold, border: `1px solid ${C.border}` }}
              >
                <RefreshCw
                  size={13}
                  className={loadingReports ? "animate-spin" : ""}
                />
                Actualiser
              </button>
            </div>
          )}

          {tab === "reports" && reportsError && (
            <div
              className="p-3 rounded-xl text-sm"
              style={{
                background: "rgba(239,68,68,0.12)",
                color: "#f87171",
              }}
            >
              {reportsError}
            </div>
          )}

          {tab === "reports" && loadingReports && (
            <div className="flex justify-center py-8">
              <Loader2
                size={20}
                className="animate-spin"
                style={{ color: C.muted }}
              />
            </div>
          )}

          {tab === "reports" &&
            !loadingReports &&
            !reportsError &&
            reports.length === 0 && (
              <p
                className="text-center text-sm py-8"
                style={{ color: C.muted }}
              >
                Aucun signalement en attente.
              </p>
            )}

          {tab === "reports" &&
            reports.map((report) => (
              <div
                key={report.id}
                className="p-3 rounded-xl space-y-2"
                style={{ background: C.surface2 }}
              >
                <div className="flex items-center justify-between gap-2">
                  <p
                    className="text-xs flex items-center gap-1 min-w-0"
                    style={{ color: C.muted }}
                  >
                    <AlertTriangle
                      size={12}
                      style={{ color: "#ef4444" }}
                    />
                    <span className="truncate">
                      Signalé par :{" "}
                      {report.profiles?.display_name ||
                        report.profiles?.handle ||
                        "Anonyme"}
                    </span>
                  </p>

                  <span
                    className="text-[10px] shrink-0"
                    style={{ color: C.muted }}
                  >
                    {report.created_at
                      ? new Date(report.created_at).toLocaleDateString()
                      : ""}
                  </span>
                </div>

                {report.reason && (
                  <p className="text-xs" style={{ color: C.gold }}>
                    Raison : {report.reason}
                  </p>
                )}

                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => handleResolveReport(report.id)}
                    disabled={!!actionLoading}
                    className="px-3 py-1 rounded-lg text-xs font-bold disabled:opacity-40"
                    style={{ background: C.teal, color: "#000" }}
                  >
                    {actionLoading === report.id
                      ? "Traitement…"
                      : "Marquer résolu"}
                  </button>
                </div>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}
