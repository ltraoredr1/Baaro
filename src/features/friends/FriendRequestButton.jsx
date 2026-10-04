import React, { useState, useEffect, useCallback } from "react";
import { supabase } from "../../supabaseClient.js";
import { useCurrentUser } from "../../hooks/useCommunity.js";
import { COLORS } from "../../theme.js";
import { UserPlus, Clock, Users, Loader2 } from "lucide-react";

function isValidAuthUserId(value) {
  if (!value || typeof value !== "string") return false;
  if (value.startsWith("@") || (value.includes("@") && value.includes("."))) {
    return false;
  }
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value
  );
}

const FriendRequestButton = ({ targetId }) => {
  const { id } = useCurrentUser();
  const [state, setState] = useState("loading");
  const [busy, setBusy] = useState(false);

  const validTarget = isValidAuthUserId(targetId);
  const isSelf = !!(id && validTarget && id === targetId);

  const check = useCallback(async () => {
    if (!id || !validTarget || isSelf) {
      setState("none");
      return;
    }

    try {
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

      if (
        (sent?.status === "accepted" && sent?.is_friend === true) ||
        (received?.status === "accepted" && received?.is_friend === true)
      ) {
        setState("friends");
        return;
      }

      if (sent?.status === "pending" && sent?.is_friend === true) {
        setState("pending_sent");
        return;
      }

      if (received?.status === "pending" && received?.is_friend === true) {
        setState("pending_received");
        return;
      }

      setState("none");
    } catch (e) {
      console.error("[FriendRequestButton] check", e);
      setState("none");
    }
  }, [id, targetId, validTarget, isSelf]);

  useEffect(() => {
    check();
  }, [check]);

  const sendRequest = async (e) => {
    e?.stopPropagation?.();
    if (!id || !validTarget || isSelf || busy) return;

    setBusy(true);
    setState("pending_sent");

    try {
      const { data: existing, error: readErr } = await supabase
        .from("follows")
        .select("follower_id, status, is_friend")
        .eq("follower_id", id)
        .eq("followed_id", targetId)
        .maybeSingle();

      if (readErr && readErr.code !== "PGRST116") throw readErr;

      if (existing) {
        const { error } = await supabase
          .from("follows")
          .update({ status: "pending", is_friend: true })
          .eq("follower_id", id)
          .eq("followed_id", targetId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("follows").insert({
          follower_id: id,
          followed_id: targetId,
          status: "pending",
          is_friend: true,
        });
        if (error && error.code !== "23505") throw error;
      }

      setState("pending_sent");
    } catch (err) {
      console.error("[FriendRequestButton] send", err);
      await check();
    } finally {
      setBusy(false);
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
        {busy ? (
          <Loader2 size={13} className="animate-spin" />
        ) : (
          <Clock size={13} />
        )}
        Demande envoyée
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
      type="button"
      onClick={sendRequest}
      disabled={busy || !id}
      className="px-4 py-1.5 rounded-full text-xs font-black transition-all active:scale-95 hover:scale-105 shadow-lg flex items-center gap-1.5 disabled:opacity-50"
      style={{
        background: `linear-gradient(135deg, ${COLORS.gold}, #ff8c42)`,
        color: COLORS.bg,
      }}
    >
      {busy ? (
        <Loader2 size={13} className="animate-spin" />
      ) : (
        <UserPlus size={13} />
      )}
      Ajouter
    </button>
  );
};

export default FriendRequestButton;
