import { useState, useEffect } from "react";
import { Flag, UserX, X, UserPlus, Check, MessageSquare, BadgeCheck } from "lucide-react";
import { COLORS } from "../theme.js";
import { useToast } from "./ToastContext.jsx";
import { supabase } from "../supabaseClient.js";
import { useFollow } from "../hooks/useSocial.js";

export function ProfileModal({ authorId, currentUserId, onClose, onNavigateToMessages }) {
  const { showToast } = useToast();
  const [profile, setProfile] = useState(null);
  const [counts, setCounts] = useState({ followers: 0, following: 0 });
  const [loading, setLoading] = useState(true);
  const { isFollowing, toggleFollow, loading: followLoading } = useFollow(
    currentUserId,
    authorId
  );

  useEffect(() => {
    if (!authorId) return;
    (async () => {
      setLoading(true);
      const [{ data: p }, { count: followers }, { count: following }] = await Promise.all([
        supabase
          .from("profiles")
          .select("display_name, handle, flag, bio")
          .eq("user_id", authorId)
          .maybeSingle(),
        supabase
          .from("follows")
          .select("*", { count: "exact", head: true })
          .eq("followed_id", authorId),
        supabase
          .from("follows")
          .select("*", { count: "exact", head: true })
          .eq("follower_id", authorId),
      ]);
      setProfile(
        p || {
          display_name: "Membre BAARO",
          handle: "@membre",
          flag: "🌍",
          bio: "",
        }
      );
      setCounts({ followers: followers || 0, following: following || 0 });
      setLoading(false);
    })();
  }, [authorId]);

  const handleFollow = async () => {
    await toggleFollow();
    showToast(
      isFollowing ? "Abonnement retiré" : "Abonné(e) !",
      "success"
    );
    // refresh counts
    const { count } = await supabase
      .from("follows")
      .select("*", { count: "exact", head: true })
      .eq("followed_id", authorId);
    setCounts((c) => ({ ...c, followers: count || 0 }));
  };

  if (loading || !profile) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
        <div className="text-white">Chargement...</div>
      </div>
    );
  }

  const isMe = currentUserId === authorId;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg glass-card rounded-t-3xl sm:rounded-3xl p-6 border shadow-2xl flex flex-col gap-4"
        style={{ borderColor: COLORS.borderGold }}
      >
        <div className="flex justify-between items-start">
          <div className="flex items-center gap-3">
            <div
              className="w-14 h-14 rounded-full flex items-center justify-center font-bold text-xl gold-glow border"
              style={{ borderColor: COLORS.borderGold, background: COLORS.surface }}
            >
              <span style={{ color: COLORS.gold }}>
                {profile.display_name?.charAt(0) || "?"}
              </span>
            </div>
            <div>
              <div
                className="text-base font-bold flex items-center gap-1.5"
                style={{ color: COLORS.ivory }}
              >
                {profile.display_name} {profile.flag}
              </div>
              <div className="text-xs" style={{ color: COLORS.muted }}>
                {profile.handle || "@membre"}
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl border hover:bg-white/5"
            style={{ borderColor: COLORS.border, color: COLORS.ivory }}
          >
            <X size={15} />
          </button>
        </div>

        <p className="text-xs leading-relaxed" style={{ color: COLORS.ivory }}>
          {profile.bio || "Pas encore de bio."}
        </p>

        <div
          className="grid grid-cols-2 gap-2 p-3 rounded-2xl border text-center font-mono text-xs"
          style={{ background: COLORS.surface, borderColor: COLORS.border }}
        >
          <div>
            <div className="font-bold text-sm" style={{ color: COLORS.ivory }}>
              {counts.followers.toLocaleString()}
            </div>
            <div className="text-[10px]" style={{ color: COLORS.muted }}>
              Abonnés
            </div>
          </div>
          <div>
            <div className="font-bold text-sm" style={{ color: COLORS.ivory }}>
              {counts.following.toLocaleString()}
            </div>
            <div className="text-[10px]" style={{ color: COLORS.muted }}>
              Abonnements
            </div>
          </div>
        </div>

        {!isMe && (
          <div className="flex gap-3 pt-2">
            <button
              onClick={handleFollow}
              disabled={followLoading}
              className="flex-1 py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-lg transition"
              style={{
                background: isFollowing ? COLORS.surface2 : COLORS.gold,
                color: isFollowing ? COLORS.gold : COLORS.bg,
                border: isFollowing ? `1px solid ${COLORS.borderGold}` : "none",
              }}
            >
              {isFollowing ? <Check size={16} /> : <UserPlus size={16} />}
              <span>{isFollowing ? "Abonné(e)" : "S'abonner"}</span>
            </button>

            <button
              onClick={() => {
                onClose();
                onNavigateToMessages?.();
              }}
              className="flex-1 py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 border hover:border-teal-400 transition"
              style={{
                background: COLORS.surface,
                borderColor: COLORS.borderTeal,
                color: COLORS.teal,
              }}
            >
              <MessageSquare size={16} />
              <span>Message</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
