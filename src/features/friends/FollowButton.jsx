import React, { useState, useEffect, useCallback } from "react";
import { supabase } from "../../supabaseClient.js";
import { COLORS } from "../../theme.js";

/** auth.users.id (UUID) uniquement — rejette email/handle */
function isValidAuthUserId(value) {
  if (!value || typeof value !== "string") return false;
  if (value.startsWith("@") || (value.includes("@") && value.includes("."))) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function useCurrentUser() {
  const [id, setId] = useState(null);
  useEffect(() => {
    const get = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user?.id && isValidAuthUserId(user.id)) setId(user.id);
        else {
          const { data: { session } } = await supabase.auth.getSession();
          if (session?.user?.id && isValidAuthUserId(session.user.id)) {
            setId(session.user.id);
          }
        }
      } catch {}
    };
    get();
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      const uid = session?.user?.id || null;
      setId(uid && isValidAuthUserId(uid) ? uid : null);
    });
    return () => sub?.subscription?.unsubscribe();
  }, []);
  return id;
}

/**
 * FollowButton — follower_id / followed_id = auth.users.id uniquement
 */
const FollowButton = ({ targetId }) => {
  const id = useCurrentUser();
  const [isFollowing, setIsFollowing] = useState(false);
  const [loading, setLoading] = useState(true);

  const validTarget = isValidAuthUserId(targetId);
  const isSelf = id && validTarget && id === targetId;

  const check = useCallback(async () => {
    if (!id || !validTarget || isSelf) {
      setIsFollowing(false);
      setLoading(false);
      return;
    }
    const { data, error } = await supabase
      .from("follows")
      .select("follower_id")
      .eq("follower_id", id)
      .eq("followed_id", targetId)
      .eq("status", "accepted")
      .maybeSingle();
    if (error && error.code !== "PGRST116") console.error("[FollowButton] check", error);
    setIsFollowing(!!data);
    setLoading(false);
  }, [id, targetId, validTarget, isSelf]);

  useEffect(() => {
    check();
  }, [check]);

  const toggle = async (e) => {
    e.stopPropagation();
    if (!id || !validTarget || isSelf) return;
    const prev = isFollowing;
    setIsFollowing(!prev);
    setLoading(true);
    try {
      if (prev) {
        const { error } = await supabase
          .from("follows")
          .delete()
          .eq("follower_id", id)
          .eq("followed_id", targetId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("follows").insert({
          follower_id: id,
          followed_id: targetId,
          status: "accepted",
          is_friend: false,
        });
        if (error) throw error;
      }
    } catch (err) {
      console.error("[FollowButton] toggle", err);
      setIsFollowing(prev);
    } finally {
      setLoading(false);
    }
  };

  if (!validTarget || isSelf) return null;

  return (
    <button
      onClick={toggle}
      disabled={loading || !id}
      className="px-4 py-1.5 rounded-full text-xs font-black transition-all active:scale-95 hover:scale-105 shadow-lg"
      style={{
        background: isFollowing
          ? COLORS.surface2
          : `linear-gradient(135deg, ${COLORS.gold}, #ff8c42)`,
        color: isFollowing ? COLORS.muted : COLORS.bg,
        border: isFollowing ? `1px solid ${COLORS.border}` : "none",
      }}
    >
      {loading ? "…" : isFollowing ? "Abonné" : "S'abonner"}
    </button>
  );
};

export default FollowButton;
