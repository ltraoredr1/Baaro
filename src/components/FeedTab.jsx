import { useState, useEffect, useCallback, useRef, memo, useMemo } from "react";
import {
  Heart,
  MessageCircle,
  Share2,
  Languages,
  Image as ImageIcon,
  X,
  RefreshCw,
} from "lucide-react";
import { COLORS } from "../theme.js";
import { useToast } from "./ToastContext.jsx";
import { supabase } from "../supabaseClient.js";
import { handleDbError } from "../lib/dbErrors.js";
import { checkRateLimit, rateLimitMessage } from "../lib/rateLimit.js";

const PAGE_SIZE = 15;
const MAX_IMAGE_SIZE = 10 * 1024 * 1024;
const MAX_VIDEO_SIZE = 50 * 1024 * 1024;

function applyCursor(query, cursor) {
  if (!cursor) return query;
  return query.or(
    `created_at.lt.${cursor.created_at},and(created_at.eq.${cursor.created_at},id.lt.${cursor.id})`
  );
}

function formatRelative(iso) {
  try {
    const d = new Date(iso);
    const diff = Math.floor((Date.now() - d.getTime()) / 1000);
    if (diff < 60) return "à l'instant";
    if (diff < 3600) return `il y a ${Math.floor(diff / 60)} min`;
    if (diff < 86400) return `il y a ${Math.floor(diff / 3600)} h`;
    if (diff < 604800) return `il y a ${Math.floor(diff / 86400)} j`;
    return d.toLocaleDateString("fr-FR", {
      day: "numeric",
      month: "short",
    });
  } catch {
    return "";
  }
}

function SkeletonPost() {
  return (
    <div
      className="rounded-2xl p-5 border animate-pulse"
      style={{ background: COLORS.surface, borderColor: COLORS.border }}
    >
      <div className="flex gap-3 mb-4">
        <div className="w-11 h-11 rounded-full" style={{ background: COLORS.surface2 }} />
        <div className="flex-1 space-y-2">
          <div className="h-3.5 w-32 rounded" style={{ background: COLORS.surface2 }} />
          <div className="h-3 w-20 rounded" style={{ background: COLORS.surface2 }} />
        </div>
      </div>
      <div className="space-y-2 mb-4">
        <div className="h-3 w-full rounded" style={{ background: COLORS.surface2 }} />
        <div className="h-3 w-4/5 rounded" style={{ background: COLORS.surface2 }} />
        <div className="h-3 w-2/3 rounded" style={{ background: COLORS.surface2 }} />
      </div>
      <div className="h-40 w-full rounded-xl mb-3" style={{ background: COLORS.surface2 }} />
      <div className="flex gap-6">
        <div className="h-3 w-10 rounded" style={{ background: COLORS.surface2 }} />
        <div className="h-3 w-10 rounded" style={{ background: COLORS.surface2 }} />
      </div>
    </div>
  );
}

const PostCard = memo(function PostCard({
  post,
  isLiked,
  isTranslated,
  translatedText,
  comments,
  commentOpen,
  commentDraft,
  onOpenProfile,
  onLike,
  onToggleComments,
  onTranslate,
  onShare,
  onCommentChange,
  onAddComment,
}) {
  return (
    <article
      className="rounded-2xl p-4 sm:p-5 border flex flex-col gap-3 transition-colors"
      style={{
        background:
          "linear-gradient(160deg, rgba(26,39,64,0.85) 0%, rgba(17,26,44,0.95) 100%)",
        borderColor: COLORS.border,
      }}
    >
      {/* Header auteur */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => onOpenProfile?.(post.author_id)}
          className="flex items-center gap-3 min-w-0 text-left group flex-1"
        >
          <div
            className="w-11 h-11 rounded-full overflow-hidden border flex items-center justify-center font-bold text-sm shrink-0"
            style={{
              borderColor: COLORS.borderGold,
              background: COLORS.surface2,
            }}
          >
            {post.avatar ? (
              <img
                src={post.avatar}
                alt=""
                loading="lazy"
                className="w-full h-full object-cover"
              />
            ) : (
              <span style={{ color: COLORS.gold }}>
                {(post.display_name || "?")[0].toUpperCase()}
              </span>
            )}
          </div>
          <div className="min-w-0">
            <p
              className="font-bold text-sm truncate group-hover:underline"
              style={{ color: COLORS.ivory }}
            >
              {post.display_name}{" "}
              <span className="font-normal">{post.flag}</span>
            </p>
            <p className="text-[11px] truncate" style={{ color: COLORS.muted }}>
              {post.handle} · {formatRelative(post.created_at)}
            </p>
          </div>
        </button>
      </div>

      {/* Texte */}
      {post.text ? (
        <p
          className="text-sm leading-relaxed whitespace-pre-wrap"
          style={{ color: COLORS.ivory }}
        >
          {isTranslated ? translatedText : post.text}
        </p>
      ) : null}

      {/* Média */}
      {post.media_url && (
        <div
          className="rounded-xl overflow-hidden border -mx-0.5"
          style={{ borderColor: COLORS.border }}
        >
          {post.media_type === "video" || post.media_type?.startsWith?.("video") ? (
            <video
              src={post.media_url}
              controls
              preload="metadata"
              className="w-full max-h-96 object-contain bg-black"
            />
          ) : (
            <img
              src={post.media_url}
              alt=""
              loading="lazy"
              decoding="async"
              className="w-full max-h-96 object-cover"
            />
          )}
        </div>
      )}

      {/* Actions */}
      <div
        className="flex items-center gap-1 sm:gap-2 pt-2 border-t"
        style={{ borderColor: COLORS.border }}
      >
        <button
          type="button"
          onClick={() => onLike(post.id)}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition hover:bg-white/5"
          style={{ color: isLiked ? "#ef4444" : COLORS.muted }}
        >
          <Heart size={17} fill={isLiked ? "#ef4444" : "none"} />
          <span>{post.likes || 0}</span>
        </button>

        <button
          type="button"
          onClick={() => onToggleComments(post.id)}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition hover:bg-white/5"
          style={{ color: COLORS.muted }}
        >
          <MessageCircle size={17} />
          <span>{post.comments_count || comments.length || 0}</span>
        </button>

        <button
          type="button"
          onClick={() => onTranslate(post.id, post.text)}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs transition hover:bg-white/5"
          style={{ color: isTranslated ? COLORS.teal : COLORS.muted }}
          title="Traduction"
        >
          <Languages size={17} />
        </button>

        <button
          type="button"
          onClick={() => onShare(post)}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs transition hover:bg-white/5 ml-auto"
          style={{ color: COLORS.muted }}
          title="Partager"
        >
          <Share2 size={17} />
        </button>
      </div>

      {/* Commentaires */}
      {commentOpen && (
        <div
          className="pt-3 border-t flex flex-col gap-2"
          style={{ borderColor: COLORS.border }}
        >
          {comments.map((c) => (
            <div key={c.id} className="text-xs leading-snug" style={{ color: COLORS.muted }}>
              <span className="font-bold" style={{ color: COLORS.ivory }}>
                {c.author}
              </span>
              {" · "}
              {c.text}
            </div>
          ))}
          <div className="flex gap-2 mt-1">
            <input
              value={commentDraft || ""}
              onChange={(e) => onCommentChange(post.id, e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") onAddComment(post.id);
              }}
              placeholder="Écrire un commentaire…"
              className="flex-1 px-3 py-2 rounded-xl border bg-transparent outline-none text-xs"
              style={{
                borderColor: COLORS.border,
                color: COLORS.ivory,
              }}
            />
            <button
              type="button"
              onClick={() => onAddComment(post.id)}
              className="px-3 py-2 rounded-xl text-xs font-bold"
              style={{ background: COLORS.gold, color: COLORS.bg }}
            >
              OK
            </button>
          </div>
        </div>
      )}
    </article>
  );
});

export function FeedTab({ userId, onOpenProfile, onRewardPoints }) {
  const { showToast, showPointsReward } = useToast();
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [newText, setNewText] = useState("");
  const [likedPosts, setLikedPosts] = useState({});
  const [commentOpen, setCommentOpen] = useState({});
  const [commentsMap, setCommentsMap] = useState({});
  const [newCommentText, setNewCommentText] = useState({});
  const [translatedMap, setTranslatedMap] = useState({});
  const [user, setUser] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [mediaFile, setMediaFile] = useState(null);
  const [mediaPreview, setMediaPreview] = useState(null);
  const [uploadingMedia, setUploadingMedia] = useState(false);

  const fileInputRef = useRef(null);
  const cursorRef = useRef(null);
  const sentinelRef = useRef(null);
  const loadingMoreRef = useRef(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data?.user || null));
  }, []);

  useEffect(() => {
    return () => {
      if (mediaPreview) URL.revokeObjectURL(mediaPreview);
    };
  }, [mediaPreview]);

  const mapRows = (data, profilesMap = null) =>
    (data || []).map((post) => {
      const profile = profilesMap
        ? profilesMap[post.author_id] || {}
        : post.profiles || {};
      return {
        id: post.id,
        author_id: post.author_id,
        text: post.text,
        media_url: post.media_url,
        media_type: post.media_type,
        created_at: post.created_at,
        likes: post.likes_count || 0,
        comments_count: 0,
        display_name: profile.display_name || "Membre BAARO",
        handle: profile.handle || "@membre",
        flag: profile.flag || "🌍",
        avatar: profile.avatar_url || "",
      };
    });

  const fetchPostsPage = useCallback(async (cursor) => {
    let query = supabase
      .from("posts")
      .select(
        `
        id, author_id, text, media_url, media_type, created_at, likes_count,
        profiles!posts_author_id_fkey ( display_name, handle, flag, avatar_url )
      `
      )
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(PAGE_SIZE);

    query = applyCursor(query, cursor);
    const { data, error } = await query;
    if (error) throw error;
    return mapRows(data);
  }, []);

  const fetchPostsPageFallback = useCallback(async (cursor) => {
    let query = supabase
      .from("posts")
      .select("id, author_id, text, media_url, media_type, created_at, likes_count")
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(PAGE_SIZE);

    query = applyCursor(query, cursor);
    const { data, error } = await query;
    if (error) throw error;

    const authorIds = [
      ...new Set((data || []).map((p) => p.author_id).filter(Boolean)),
    ];
    let profilesMap = {};
    if (authorIds.length) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, display_name, handle, flag, avatar_url")
        .in("user_id", authorIds);
      (profiles || []).forEach((p) => {
        profilesMap[p.user_id] = p;
      });
    }
    return mapRows(data, profilesMap);
  }, []);

  const updateCursorFromRows = (rows) => {
    if (rows.length > 0) {
      const last = rows[rows.length - 1];
      cursorRef.current = { created_at: last.created_at, id: last.id };
    }
    setHasMore(rows.length === PAGE_SIZE);
  };

  const loadPosts = useCallback(async () => {
    setLoading(true);
    cursorRef.current = null;
    try {
      const rows = await fetchPostsPage(null);
      setPosts(rows);
      updateCursorFromRows(rows);
    } catch {
      try {
        const rows = await fetchPostsPageFallback(null);
        setPosts(rows);
        updateCursorFromRows(rows);
      } catch (e) {
        handleDbError(e, showToast, "Erreur chargement du fil");
        setPosts([]);
        setHasMore(false);
      }
    } finally {
      setLoading(false);
    }
  }, [fetchPostsPage, fetchPostsPageFallback, showToast]);

  const loadMorePosts = useCallback(async () => {
    if (loadingMoreRef.current || !hasMore || loading || !cursorRef.current)
      return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    const cursor = cursorRef.current;
    try {
      let rows;
      try {
        rows = await fetchPostsPage(cursor);
      } catch {
        rows = await fetchPostsPageFallback(cursor);
      }
      setPosts((prev) => {
        const ids = new Set(prev.map((p) => p.id));
        const fresh = rows.filter((r) => !ids.has(r.id));
        return [...prev, ...fresh];
      });
      updateCursorFromRows(rows);
    } catch (e) {
      handleDbError(e, showToast, "Erreur chargement suite");
    } finally {
      setLoadingMore(false);
      loadingMoreRef.current = false;
    }
  }, [fetchPostsPage, fetchPostsPageFallback, hasMore, loading, showToast]);

  useEffect(() => {
    loadPosts();
  }, [loadPosts]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) loadMorePosts();
      },
      { rootMargin: "500px" }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [loadMorePosts, posts.length]);

  // Realtime : injecte le nouveau post en tête sans tout recharger
  useEffect(() => {
    const channel = supabase
      .channel("posts_feed_v2")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "posts" },
        async (payload) => {
          const row = payload.new;
          if (!row?.id) return;
          setPosts((prev) => {
            if (prev.some((p) => p.id === row.id)) return prev;
            return [
              {
                id: row.id,
                author_id: row.author_id,
                text: row.text,
                media_url: row.media_url,
                media_type: row.media_type,
                created_at: row.created_at,
                likes: row.likes_count || 0,
                comments_count: 0,
                display_name: "Membre BAARO",
                handle: "@membre",
                flag: "🌍",
                avatar: "",
              },
              ...prev,
            ];
          });
          // Enrichir le profil en arrière-plan
          if (row.author_id) {
            const { data: profile } = await supabase
              .from("profiles")
              .select("display_name, handle, flag, avatar_url")
              .eq("user_id", row.author_id)
              .maybeSingle();
            if (profile) {
              setPosts((prev) =>
                prev.map((p) =>
                  p.id === row.id
                    ? {
                        ...p,
                        display_name: profile.display_name || p.display_name,
                        handle: profile.handle || p.handle,
                        flag: profile.flag || p.flag,
                        avatar: profile.avatar_url || p.avatar,
                      }
                    : p
                )
              );
            }
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "posts" },
        (payload) => {
          const id = payload.old?.id;
          if (id) setPosts((prev) => prev.filter((p) => p.id !== id));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const isVideo = file.type.startsWith("video");
    const isImage = file.type.startsWith("image");
    if (!isVideo && !isImage) {
      showToast("Image ou vidéo uniquement", "error");
      e.target.value = "";
      return;
    }
    const max = isVideo ? MAX_VIDEO_SIZE : MAX_IMAGE_SIZE;
    if (file.size > max) {
      showToast(`Fichier trop lourd (max ${isVideo ? "50" : "10"} Mo)`, "error");
      e.target.value = "";
      return;
    }
    if (mediaPreview) URL.revokeObjectURL(mediaPreview);
    setMediaFile(file);
    setMediaPreview(URL.createObjectURL(file));
    e.target.value = "";
  };

  const handleRemoveMedia = () => {
    if (mediaPreview) URL.revokeObjectURL(mediaPreview);
    setMediaFile(null);
    setMediaPreview(null);
  };

  const uploadMedia = async (file, authorId) => {
    const ext = (file.name.split(".").pop() || "bin")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "") || "bin";
    const path = `${authorId}/${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}.${ext}`;
    const { error } = await supabase.storage.from("media").upload(path, file, {
      cacheControl: "3600",
      upsert: false,
      contentType: file.type,
    });
    if (error) throw error;
    const { data } = supabase.storage.from("media").getPublicUrl(path);
    return {
      media_url: data.publicUrl,
      media_type: file.type.startsWith("video") ? "video" : "image",
    };
  };

  const handleCreatePost = async (e) => {
    e.preventDefault();
    if ((!newText.trim() && !mediaFile) || submitting) return;

    const limit = checkRateLimit("create_post", { max: 5, windowMs: 60_000 });
    if (!limit.allowed) {
      showToast(rateLimitMessage(limit.retryAfterSec), "error");
      return;
    }

    const authorId = user?.id || userId;
    if (!authorId) {
      showToast("Vous devez être connecté", "error");
      return;
    }

    setSubmitting(true);
    try {
      let mediaData = {};
      if (mediaFile) {
        setUploadingMedia(true);
        try {
          mediaData = await uploadMedia(mediaFile, authorId);
        } finally {
          setUploadingMedia(false);
        }
      }

      const { error } = await supabase.from("posts").insert({
        author_id: authorId,
        text: newText.trim(),
        ...mediaData,
      });
      if (error) throw error;

      setNewText("");
      handleRemoveMedia();
      onRewardPoints?.("publish_post");
      showPointsReward?.(5, "Publication créée");
    } catch (error) {
      handleDbError(error, showToast, "Impossible de publier");
    } finally {
      setSubmitting(false);
    }
  };

  const handleLike = async (postId) => {
    const authorId = user?.id || userId;
    if (!authorId) {
      showToast("Vous devez être connecté", "error");
      return;
    }
    const limit = checkRateLimit("like", { max: 30, windowMs: 60_000 });
    if (!limit.allowed) {
      showToast(rateLimitMessage(limit.retryAfterSec), "error");
      return;
    }

    const isLiked = !!likedPosts[postId];
    setLikedPosts((prev) => ({ ...prev, [postId]: !isLiked }));
    setPosts((prev) =>
      prev.map((p) =>
        p.id === postId
          ? { ...p, likes: Math.max(0, (p.likes || 0) + (isLiked ? -1 : 1)) }
          : p
      )
    );

    try {
      if (isLiked) {
        const { error } = await supabase
          .from("post_likes")
          .delete()
          .eq("post_id", postId)
          .eq("user_id", authorId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("post_likes").insert({
          post_id: postId,
          user_id: authorId,
        });
        if (error) throw error;
        onRewardPoints?.("like_post");
        showPointsReward?.(2, "J'aime");
      }
    } catch (error) {
      setLikedPosts((prev) => ({ ...prev, [postId]: isLiked }));
      setPosts((prev) =>
        prev.map((p) =>
          p.id === postId
            ? {
                ...p,
                likes: Math.max(0, (p.likes || 0) + (isLiked ? 1 : -1)),
              }
            : p
        )
      );
      handleDbError(error, showToast, "Impossible d'aimer");
    }
  };

  const handleAddComment = async (postId) => {
    const text = (newCommentText[postId] || "").trim();
    if (!text) return;
    const limit = checkRateLimit("comment", { max: 20, windowMs: 60_000 });
    if (!limit.allowed) {
      showToast(rateLimitMessage(limit.retryAfterSec), "error");
      return;
    }
    const authorId = user?.id || userId;
    if (!authorId) {
      showToast("Vous devez être connecté", "error");
      return;
    }

    try {
      const { error } = await supabase.from("comments").insert({
        post_id: postId,
        author_id: authorId,
        text,
      });
      if (error) throw error;

      setCommentsMap((prev) => ({
        ...prev,
        [postId]: [
          ...(prev[postId] || []),
          { id: `c_${Date.now()}`, author: "Vous", text },
        ],
      }));
      setPosts((prev) =>
        prev.map((p) =>
          p.id === postId
            ? { ...p, comments_count: (p.comments_count || 0) + 1 }
            : p
        )
      );
      setNewCommentText((prev) => ({ ...prev, [postId]: "" }));
      onRewardPoints?.("comment");
      showPointsReward?.(1, "Commentaire");
    } catch (error) {
      handleDbError(error, showToast, "Impossible de commenter");
    }
  };

  const handleTranslate = useCallback((postId, text) => {
    setTranslatedMap((prev) =>
      prev[postId]
        ? { ...prev, [postId]: null }
        : { ...prev, [postId]: `[Traduit] ${text}` }
    );
  }, []);

  const handleShare = useCallback(
    async (post) => {
      const url = `${window.location.origin}/?post=${post.id}`;
      try {
        if (navigator.share) {
          await navigator.share({
            title: "BAARO",
            text: (post.text || "").slice(0, 120),
            url,
          });
        } else {
          await navigator.clipboard.writeText(url);
          showToast("Lien copié", "success");
        }
      } catch {
        /* ignore cancel */
      }
    },
    [showToast]
  );

  const composerLetter = useMemo(
    () => (user?.email?.charAt(0) || "B").toUpperCase(),
    [user]
  );

  return (
    <div className="flex flex-col gap-4 max-w-xl mx-auto w-full">
      {/* Composer */}
      <form
        onSubmit={handleCreatePost}
        className="rounded-2xl p-4 border shadow-lg"
        style={{
          background:
            "linear-gradient(135deg, rgba(26,39,64,0.9) 0%, rgba(217,174,82,0.06) 100%)",
          borderColor: COLORS.borderGold,
        }}
      >
        <div className="flex gap-3 mb-3">
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm shrink-0"
            style={{ background: COLORS.gold, color: COLORS.bg }}
          >
            {composerLetter}
          </div>
          <textarea
            value={newText}
            onChange={(e) => setNewText(e.target.value)}
            placeholder="Quoi de neuf sur BAARO ?"
            className="flex-1 bg-transparent resize-none outline-none text-sm leading-relaxed min-h-[72px]"
            style={{ color: COLORS.ivory }}
            rows={3}
          />
        </div>

        {mediaPreview && (
          <div
            className="relative mb-3 rounded-xl overflow-hidden border"
            style={{ borderColor: COLORS.border }}
          >
            {mediaFile?.type.startsWith("video") ? (
              <video
                src={mediaPreview}
                controls
                className="w-full max-h-56 object-cover bg-black"
              />
            ) : (
              <img
                src={mediaPreview}
                alt=""
                className="w-full max-h-56 object-cover"
              />
            )}
            <button
              type="button"
              onClick={handleRemoveMedia}
              className="absolute top-2 right-2 bg-black/70 rounded-full p-1.5 text-white"
            >
              <X size={14} />
            </button>
          </div>
        )}

        <div
          className="flex items-center justify-between pt-2 border-t"
          style={{ borderColor: COLORS.border }}
        >
          <div className="flex items-center gap-1">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,video/*"
              onChange={handleFileSelect}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadingMedia}
              className="p-2 rounded-lg hover:bg-white/5 transition disabled:opacity-40"
              style={{ color: COLORS.gold }}
              title="Photo ou vidéo"
            >
              <ImageIcon size={18} />
            </button>
            <button
              type="button"
              onClick={loadPosts}
              className="p-2 rounded-lg hover:bg-white/5 transition"
              style={{ color: COLORS.muted }}
              title="Actualiser"
            >
              <RefreshCw size={16} />
            </button>
          </div>

          <button
            type="submit"
            disabled={(!newText.trim() && !mediaFile) || submitting}
            className="px-4 py-2 rounded-xl text-xs font-bold transition disabled:opacity-40 active:scale-95"
            style={{
              background: "linear-gradient(135deg, #D9AE52 0%, #2DBFA6 100%)",
              color: COLORS.bg,
            }}
          >
            {uploadingMedia
              ? "Envoi…"
              : submitting
                ? "…"
                : "Publier"}
          </button>
        </div>
      </form>

      {/* Liste */}
      {loading ? (
        <div className="flex flex-col gap-4">
          <SkeletonPost />
          <SkeletonPost />
          <SkeletonPost />
        </div>
      ) : posts.length === 0 ? (
        <div className="text-center py-16 px-4">
          <p className="text-3xl mb-3">✨</p>
          <p className="font-bold mb-1" style={{ color: COLORS.ivory }}>
            Aucune publication
          </p>
          <p className="text-xs" style={{ color: COLORS.muted }}>
            Soyez le premier à partager quelque chose
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3.5">
          {posts.map((post) => (
            <PostCard
              key={post.id}
              post={post}
              isLiked={!!likedPosts[post.id]}
              isTranslated={!!translatedMap[post.id]}
              translatedText={translatedMap[post.id]}
              comments={commentsMap[post.id] || []}
              commentOpen={!!commentOpen[post.id]}
              commentDraft={newCommentText[post.id]}
              onOpenProfile={onOpenProfile}
              onLike={handleLike}
              onToggleComments={(id) =>
                setCommentOpen((prev) => ({ ...prev, [id]: !prev[id] }))
              }
              onTranslate={handleTranslate}
              onShare={handleShare}
              onCommentChange={(id, v) =>
                setNewCommentText((prev) => ({ ...prev, [id]: v }))
              }
              onAddComment={handleAddComment}
            />
          ))}

          <div ref={sentinelRef} className="h-8" />
          {loadingMore && (
            <p className="text-center text-xs py-2" style={{ color: COLORS.muted }}>
              Chargement…
            </p>
          )}
          {!hasMore && posts.length > 0 && (
            <p className="text-center text-[11px] py-3" style={{ color: COLORS.muted }}>
              Fin du fil
            </p>
          )}
        </div>
      )}
    </div>
  );
}
