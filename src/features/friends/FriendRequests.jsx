import React, { useCallback, useEffect, useState } from "react";
import { Check, X, Loader2 } from "lucide-react";
import {
  supabase,
  acceptFriendRequest,
  rejectFriendRequest,
} from "../../supabaseClient.js";
import { useCurrentUser } from "../../hooks/useCommunity.js";
import { useToast } from "../../components/ToastContext.jsx";
import { COLORS } from "../../theme.js";

// Demandes d'ami REÇUES : liste + boutons Accepter / Refuser.
// L'envoi est géré par FriendRequestButton.jsx.
const FriendRequests = ({ onChanged }) => {
  const { id } = useCurrentUser();
  const { showToast } = useToast();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    if (!id) {
      setRequests([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { data: rows, error } = await supabase
        .from("follows")
        .select("follower_id, created_at")
        .eq("followed_id", id)
        .eq("is_friend", true)
        .eq("status", "pending")
        .order("created_at", { ascending: false });
      if (error) throw error;

      const ids = (rows || []).map((r) => r.follower_id);
      let profiles = {};
      if (ids.length) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("id, display_name, handle, avatar_url, flag")
          .in("id", ids);
        profiles = Object.fromEntries((profs || []).map((p) => [p.id, p]));
      }
      setRequests(
        (rows || []).map((r) => ({ ...r, profile: profiles[r.follower_id] })),
      );
    } catch (err) {
      console.error("[FriendRequests] load", err);
      showToast(
        `Impossible de charger les demandes : ${err?.message || "erreur"}`,
        "error",
      );
    } finally {
      setLoading(false);
    }
  }, [id, showToast]);

  useEffect(() => {
    load();
  }, [load]);

  const answer = async (requesterId, accept) => {
    if (busyId) return;
    setBusyId(requesterId);
    try {
      const { error } = accept
        ? await acceptFriendRequest(requesterId)
        : await rejectFriendRequest(requesterId);
      if (error) throw error;
      setRequests((prev) => prev.filter((r) => r.follower_id !== requesterId));
      showToast(accept ? "Ami ajouté !" : "Demande refusée.", "success");
      onChanged?.();
    } catch (err) {
      console.error("[FriendRequests] answer", err);
      showToast(
        `Action impossible : ${err?.message || "erreur"} (vérifie les policies RLS de la table follows)`,
        "error",
      );
    } finally {
      setBusyId(null);
    }
  };

  if (!id || loading || requests.length === 0) return null;

  return (
    <div className="mb-5">
      <h3 className="text-sm font-black mb-2" style={{ color: COLORS.gold }}>
        Demandes d'amis ({requests.length})
      </h3>
      <ul className="space-y-2">
        {requests.map((r) => {
          const p = r.profile || {};
          const busy = busyId === r.follower_id;
          return (
            <li
              key={r.follower_id}
              className="flex items-center gap-3 p-3 rounded-[14px] border-2"
              style={{ background: COLORS.surface2, borderColor: COLORS.border }}
            >
              <img
                src={
                  p.avatar_url ||
                  `https://api.dicebear.com/7.x/initials/svg?seed=${p.display_name || "A"}`
                }
                alt=""
                className="w-11 h-11 rounded-full object-cover border-2"
                style={{ borderColor: COLORS.gold }}
              />
              <div className="flex-1 min-w-0">
                <div
                  className="font-black text-[14px] truncate"
                  style={{ color: COLORS.ivory }}
                >
                  {p.display_name || "Membre BAARO"} {p.flag || ""}
                </div>
                <div className="text-xs truncate" style={{ color: COLORS.muted }}>
                  @{(p.handle || "membre").replace(/^@/, "")}
                </div>
              </div>
              {busy ? (
                <Loader2 size={18} className="animate-spin" />
              ) : (
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => answer(r.follower_id, true)}
                    className="h-9 w-9 rounded-full flex items-center justify-center active:scale-95"
                    style={{ background: "rgba(16,185,129,0.18)", color: "#10b981" }}
                    aria-label="Accepter"
                  >
                    <Check size={18} />
                  </button>
                  <button
                    type="button"
                    onClick={() => answer(r.follower_id, false)}
                    className="h-9 w-9 rounded-full flex items-center justify-center active:scale-95"
                    style={{ background: "rgba(239,68,68,0.18)", color: "#ef4444" }}
                    aria-label="Refuser"
                  >
                    <X size={18} />
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
};

export default FriendRequests;
