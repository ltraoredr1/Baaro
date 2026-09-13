import { useState, useEffect } from "react";
import { X, UserPlus, Check, MessageSquare } from "lucide-react";
import { COLORS } from "../theme.js";
import { useToast } from "./ToastContext.jsx";
import { supabase } from "../supabaseClient.js";
import { handleDbError } from "../lib/dbErrors.js";
import { LazyImage } from "./LazyMedia.jsx";
import ProfileContactLinksView from "./ProfileContactLinksView.jsx";
import { displayHandle } from "../lib/username.js";

/**
 * Modal profil public / soi-même.
 * Affiche : avatar, bio, stats, follow/message, contacts + liens + réseaux.
 */
export function ProfileModal({
  authorId,
  currentUserId,
  onClose,
  onNavigateToMessages,
}) {
  const { showToast } = useToast();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ posts: 0, followers: 0, following: 0 });
  const [isFollowing, setIsFollowing] = useState(false);
  const [followLoading, setFollowLoading] = useState(false);
  const [contacts, setContacts] = useState({ phones: [], emails: [] });
  const [links, setLinks] = useState([]);
  const [socials, setSocials] = useState([]);

  const isMe = currentUserId && authorId && currentUserId === authorId;

  // Profil de base
  useEffect(() => {
    if (!authorId) return;

    (async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from("profiles")
          .select("user_id, display_name, handle, flag, bio, avatar_url, cover_url")
          .eq("user_id", authorId)
          .maybeSingle();

        if (error) throw error;

        setProfile(
          data || {
            display_name: "Membre BAARO",
            handle: null,
            flag: "🌍",
            bio: "",
            avatar_url: null,
            cover_url: null,
          }
        );
      } catch (err) {
        handleDbError(err, showToast, "Erreur chargement profil");
        setProfile(null);
      } finally {
        setLoading(false);
      }
    })();
  }, [authorId, showToast]);

  // Stats + follow + contacts / liens / socials
  useEffect(() => {
    if (!authorId) return;

    (async () => {
      try {
        const [
          postsRes,
          followersRes,
          followingRes,
          contactsRes,
          linksRes,
          socialsRes,
        ] = await Promise.all([
          supabase
            .from("posts")
            .select("*", { count: "exact", head: true })
            .eq("author_id", authorId),
          supabase
            .from("follows")
            .select("*", { count: "exact", head: true })
            .eq("followed_id", authorId)
            .eq("status", "accepted"),
          supabase
            .from("follows")
            .select("*", { count: "exact", head: true })
            .eq("follower_id", authorId)
            .eq("status", "accepted"),
          supabase
            .from("profile_contacts")
            .select("id, contact_type, value, label, position, is_primary")
            .eq("user_id", authorId)
            .order("position"),
          supabase
            .from("profile_links")
            .select("id, link_type, label, url, position")
            .eq("user_id", authorId)
            .order("position"),
          supabase
            .from("profile_social_links")
            .select("id, platform, username, url, position")
            .eq("user_id", authorId)
            .order("platform"),
        ]);

        setStats({
          posts: postsRes.count || 0,
          followers: followersRes.count || 0,
          following: followingRes.count || 0,
        });

        const allContacts = contactsRes.data || [];
        setContacts({
          phones: allContacts.filter((x) => x.contact_type === "phone"),
          emails: allContacts.filter((x) => x.contact_type === "email"),
        });
        setLinks(linksRes.data || []);
        setSocials(socialsRes.data || []);

        if (currentUserId && !isMe) {
          const { data } = await supabase
            .from("follows")
            .select("follower_id")
            .eq("follower_id", currentUserId)
            .eq("followed_id", authorId)
            .eq("status", "accepted")
            .maybeSingle();
          setIsFollowing(!!data);
        }
      } catch (err) {
        console.error("Erreur stats/contacts profil:", err);
      }
    })();
  }, [authorId, currentUserId, isMe]);

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
        setStats((s) => ({ ...s, followers: Math.max(0, s.followers - 1) }));
        showToast("Abonnement retiré", "success");
      } else {
        const { error } = await supabase.from("follows").insert({
          follower_id: currentUserId,
          followed_id: authorId,
          status: "accepted",
          is_friend: false,
        });
        if (error) throw error;
        setIsFollowing(true);
        setStats((s) => ({ ...s, followers: s.followers + 1 }));
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
        <div className="text-white text-sm">Chargement du profil...</div>
      </div>
    );
  }

  const initial = (profile.display_name || "?").charAt(0).toUpperCase();

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/70 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="profile-modal-title"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg glass-card rounded-t-3xl sm:rounded-3xl border shadow-2xl flex flex-col max-h-[90vh] overflow-y-auto baaro-safe-bottom"
        style={{ borderColor: COLORS.borderGold }}
      >
        {/* Couverture */}
        <div
          className="relative w-full h-28 sm:h-32 shrink-0 overflow-hidden rounded-t-3xl"
          style={{ background: COLORS.surface2 }}
        >
          {profile.cover_url ? (
            <LazyImage
              src={profile.cover_url}
              alt=""
              variant="full"
              className="w-full h-full object-cover"
            />
          ) : (
            <div
              className="w-full h-full"
              style={{
                background: "linear-gradient(135deg, rgba(217,174,82,0.25), rgba(45,191,166,0.2))",
              }}
            />
          )}
        </div>

        <div className="flex flex-col gap-4 p-6 pt-0 -mt-10 relative z-10">
        {/* En-tête */}
        <div className="flex justify-between items-start gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className="w-14 h-14 rounded-full overflow-hidden flex items-center justify-center font-bold text-xl border shrink-0"
              style={{
                borderColor: COLORS.borderGold,
                background: COLORS.surface,
              }}
            >
              {profile.avatar_url ? (
                <LazyImage
                  src={profile.avatar_url}
                  alt=""
                  variant="avatar"
                  className="w-14 h-14 rounded-full"
                />
              ) : (
                <span style={{ color: COLORS.gold }}>{initial}</span>
              )}
            </div>
            <div className="min-w-0">
              <h2
                id="profile-modal-title"
                className="text-base font-bold truncate"
                style={{ color: COLORS.ivory }}
              >
                {profile.display_name} {profile.flag}
              </h2>
              <div className="text-xs truncate" style={{ color: COLORS.muted }}>
                {displayHandle(profile.handle, profile.display_name)}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl border hover:bg-white/5 baaro-tap shrink-0"
            style={{ borderColor: COLORS.border, color: COLORS.ivory }}
            aria-label="Fermer"
          >
            <X size={15} />
          </button>
        </div>

        {/* Bio */}
        <p className="text-sm leading-relaxed baaro-readable" style={{ color: COLORS.ivory }}>
          {profile.bio?.trim()
            ? profile.bio
            : isMe
              ? "Ajoute une bio dans tes réglages pour te présenter."
              : "Pas encore de bio."}
        </p>

        {/* Stats */}
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

        {/* Contacts / liens / réseaux */}
        <ProfileContactLinksView
          contacts={contacts}
          links={links}
          socials={socials}
        />

        {/* Actions */}
        {!isMe && (
          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={toggleFollow}
              disabled={followLoading}
              className="flex-1 py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 baaro-tap"
              style={{
                background: isFollowing ? COLORS.surface : COLORS.gold,
                color: isFollowing ? COLORS.gold : COLORS.bg,
                border: isFollowing ? `1px solid ${COLORS.borderGold}` : "none",
                opacity: followLoading ? 0.7 : 1,
              }}
            >
              {isFollowing ? <Check size={16} /> : <UserPlus size={16} />}
              <span>{isFollowing ? "Abonné(e)" : "S'abonner"}</span>
            </button>

            <button
              type="button"
              onClick={() => {
                onClose();
                onNavigateToMessages?.();
              }}
              className="flex-1 py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 border baaro-tap"
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
    </div>
  );
}
