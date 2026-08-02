import { useState, useEffect } from "react";
import { X, UserPlus, Check, MessageSquare } from "lucide-react";
import { COLORS } from "../theme.js";
import { useToast } from "./ToastContext.jsx";
import { supabase } from "../supabaseClient.js";
import { handleDbError } from "../lib/dbErrors.js";
import { useProfile, useProfileStats } from "../hooks/useProfile.js";

export function ProfileModal({
  authorId,
  currentUserId,
  onClose,
  onNavigateToMessages,
}) {
  const { showToast } = useToast();
  const { profile, loading } = useProfile(authorId, showToast);
  const stats = useProfileStats(authorId);
  const [isFollowing, setIsFollowing] = useState(false);
  const [followLoading, setFollowLoading] = useState(false);

  const isMe = currentUserId && authorId && currentUserId === authorId;

  useEffect(() => {
    if (!currentUserId || !authorId || isMe) return;
    (async () => {
      const { data } = await supabase
        .from("follows")
        .select("follower_id")
        .eq("follower_id", currentUserId)
        .eq("followed_id", authorId)
        .maybeSingle();
      setIsFollowing(!!data);
    })();
  }, [currentUserId, authorId, isMe]);

  const toggleFollow = async () => {
    if (!currentUserId || isMe || followLoading) return;
    setFollowLoading(true);
    try {
      if (isFollowing) {
        const { error } = await supabase
          .from("follows")
          .delete()
          .eq("follower_id", currentUserId)
          .eq("followed_id", authorId);
        if (error) throw error;
        setIsFollowing(false);
        showToast("Abonnement retiré", "success");
      } else {
        const { error } = await supabase.from("follows").insert({
          follower_id: currentUserId,
          followed_id: authorId,
        });
        if (error) throw error;
        setIsFollowing(true);
        showToast("Abonné(e) !", "success");
      }
    } catch (error) {
      handleDbError(error, showToast, "Erreur abonnement");
    } finally {
      setFollowLoading(false);
    }
  };

  if (loading || !profile) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
        <div className="text-white">Chargement du profil...</div>
      </div>
    );
  }

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
              className="w-14 h-14 rounded-full flex items-center justify-center font-bold text-xl border overflow-hidden"
              style={{
                borderColor: COLORS.borderGold,
                background: COLORS.surface,
              }}
            >
              {profile.avatar_url ? (
                <img
                  src={profile.avatar_url}
                  alt=""
                  className="w-full h-full object-cover"
                />
              ) : (
                <span style={{ color: COLORS.gold }}>
                  {profile.display_name?.charAt(0) || "?"}
                </span>
              )}
            </div>
            <div>
              <div
                className="text-base font-bold"
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
          className="grid grid-cols-3 gap-2 p-3 rounded-2xl border text-center text-xs"
          style={{ background: COLORS.surface, borderColor: COLORS.border }}
        >
          <div>
            <div className="font-bold text-sm" style={{ color: COLORS.ivory }}>
              {stats.posts}
            </div>
            <div style={{ color: COLORS.muted }}>Posts</div>
          </div>
          <div>
            <div className="font-bold text-sm" style={{ color: COLORS.ivory }}>
              {stats.followers}
            </div>
            <div style={{ color: COLORS.muted }}>Abonnés</div>
          </div>
          <div>
            <div className="font-bold text-sm" style={{ color: COLORS.ivory }}>
              {stats.following}
            </div>
            <div style={{ color: COLORS.muted }}>Abonnements</div>
          </div>
        </div>

        {!isMe && (
          <div className="flex gap-3 pt-2">
            <button
              onClick={toggleFollow}
              disabled={followLoading}
              className="flex-1 py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5"
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
              className="flex-1 py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 border"
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
