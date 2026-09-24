import React, { useState, useEffect, useCallback } from "react";
import { supabase } from "../../supabaseClient.js";
import { useCurrentUser } from "../../hooks/useCommunity.js";
import { COLORS } from "../../theme.js";
import { UserPlus, Clock, Users } from "lucide-react";

/** auth.users.id (UUID) uniquement */
function isValidAuthUserId(value) {
  if (!value || typeof value !== "string") return false;
  if (value.startsWith("@") || (value.includes("@") && value.includes("."))) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

/**
 * Envoi de demande d'ami.
 * follower_id / followed_id = auth.users.id uniquement.
 */
const FriendRequestButton = ({ targetId }) => {
  const { id } = useCurrentUser();
  const [state, setState] = useState("loading"); // none | pending_sent | pending_received | friends | loading

  const validTarget = isValidAuthUserId(targetId);
  const isSelf = id && validTarget && id === targetId;

  const check = useCallback(async () => {
    if (!id || !validTarget || isSelf) {
      setState("none");
      return;
    }
    const [{ data: sent }, { data: received }] = await Promise.all([
      supabase
        .from("follows")
        .select("status, is_friend")
        .eq("follower_id", id)
        .eq("followed_id", targetId)
        .maybeSingle(),
      supabase
        .from("follows")
        .select("status, is_friend")
        .eq("follower_id", targetId)
        .eq("followed_id", id)
        .maybeSingle(),
    ]);
    if (sent?.is_friend && sent.status === "accepted") setState("friends");
    else if (sent?.is_friend && sent.status === "pending") setState("pending_sent");
    else if (received?.is_friend && received.status === "pending") setState("pending_received");
    else setState("none");
  }, [id, targetId, validTarget, isSelf]);

  useEffect(() => {
    check();
  }, [check]);

  const sendRequest = async (e) => {
    e.stopPropagation();
    if (!id || !validTarget || isSelf) return;
    setState("pending_sent");
    try {
      const { error } = await supabase.from("follows").insert({
        follower_id: id,
        followed_id: targetId,
        status: "pending",
        is_friend: true,
      });
      if (error && error.code !== "23505") throw error;
    } catch (err) {
      console.error("[FriendRequestButton]", err);
      setState("none");
    }
  };

  if (!validTarget || isSelf || state === "loading") return null;

  if (state === "friends") {
    return (
      <span
        className="px-4 py-1.5 rounded-full text-xs font-black flex items-center gap-1.5"
        style={{ background: "rgba(16,185,129,0.15)", color: "#10b981" }}
      >
        <Users size={13} /> Amis
      </span>
    );
  }
  if (state === "pending_sent") {
    return (
      <span
        className="px-4 py-1.5 rounded-full text-xs font-black flex items-center gap-1.5"
        style={{ background: COLORS.surface2, color: COLORS.muted }}
      >
        <Clock size={13} /> Demande envoyée
      </span>
    );
  }
  if (state === "pending_received") {
    return (
      <span
        className="px-4 py-1.5 rounded-full text-xs font-black"
        style={{ background: COLORS.surface2, color: COLORS.gold }}
      >
        Vous a demandé en ami
      </span>
    );
  }
  return (
    <button
      onClick={sendRequest}
      className="px-4 py-1.5 rounded-full text-xs font-black transition-all active:scale-95 hover:scale-105 shadow-lg flex items-center gap-1.5"
      style={{
        background: `linear-gradient(135deg, ${COLORS.gold}, #ff8c42)`,
        color: COLORS.bg,
      }}
    >
      <UserPlus size={13} /> Ajouter
    </button>
  );
};

export default FriendRequestButton;
