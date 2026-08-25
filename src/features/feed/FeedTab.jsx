import { useState, useEffect, useCallback, useRef } from "react";
import {
  Heart,
  MessageCircle,
  Share2,
  Send,
  Image as ImageIcon,
  BarChart2,
  X,
  Pencil,
  Trash2,
  MoreHorizontal,
  Check,
} from "lucide-react";
import { FeedStories } from "./FeedStories.jsx";
import { COLORS } from "../theme.js";
import { randomId } from "../lib/id.js";
import { useToast } from "./ToastContext.jsx";
import { supabase } from "../supabaseClient.js";
import { handleDbError } from "../lib/dbErrors.js";
import { checkRateLimit, rateLimitMessage } from "../lib/rateLimit.js";
import { GuestBanner } from "./GuestBanner.jsx";
import { TranslateButton } from "./TranslateButton.jsx";

// Taille de page pour le fil. Pagination par CURSEUR (created_at + id),
// pas par offset : reste rapide et correct même si de nouveaux posts
// arrivent pendant que quelqu'un scrolle.
const PAGE_SIZE = 20;

// Limites d'upload média
const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10 Mo
const MAX_VIDEO_SIZE = 50 * 1024 * 1024; // 50 Mo

function applyCursor(query, cursor) {
  if (!cursor) return query;
  return query.or(
    `created_at.lt.${cursor.created_at},and(created_at.eq.${cursor.created_at},id.lt.${cursor.id})`
  );
}

export function FeedTab({ userId, onOpenProfile, onRewardPoints }) {
  const { showToast, showPointsReward } = useToast();
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [newText, setNewText] = useState("");
  const [mood, setMood] = useState("");
  const [showPoll, setShowPoll] = useState(false);
  const [likedPosts, setLikedPosts] = useState({});
  const [commentOpen, setCommentOpen] = useState({});
  const [commentsMap, setCommentsMap] = useState({});
  const [newCommentText, setNewCommentText] = useState({});
  const [translatedMap, setTranslatedMap] = useState({});
  const [user, setUser] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [menuOpenId, setMenuOpenId] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);


  // ===== Média (photo/vidéo) en cours de composition =====
  const [mediaFile, setMediaFile] = useState(null);
  const [mediaPreview, setMediaPreview] = useState(null);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const fileInputRef = useRef(null);

  // Curseur = (created_at, id) du dernier post affiché. En ref pour ne
  // pas déclencher de re-render et rester à jour dans loadMorePosts.
  const cursorRef = useRef(null);
  const sentinelRef = useRef(null);

  useEffect(() => {
    const getUser = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        setUser(user);
      } catch (error) {
        handleDbError(error, showToast, "Erreur session");
      }
    };
    getUser();
  }, [showToast]);

  // Nettoyage de l'URL de prévisualisation créée avec URL.createObjectURL,
  // pour éviter les fuites mémoire quand on change/retire le fichier.
  useEffect(() => {
    return () => {
      if (mediaPreview) URL.revokeObjectURL(mediaPreview);
    };
  }, [mediaPreview]);

  // ===== Une page de posts, jointure profiles incluse =====
  const fetchPostsPage = useCallback(async (cursor) => {
    let query = supabase
      .from("posts")
      .select(`
        id,
        author_id,
        text,
        media_url,
        media_type,
        created_at,
        likes_count,
        comments_count,
        profiles!posts_author_id_fkey (
          display_name,
          handle,
          flag,
          avatar_url
        )
      `)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(PAGE_SIZE);

    query = applyCursor(query, cursor);

    const { data, error } = await query;
    if (error) throw error;

    return (data || []).map((post) => {
      const profile = post.profiles || {};
      return {
        id: post.id,
        author_id: post.author_id,
        text: post.text,
        media_url: post.media_url,
        media_type: post.media_type,
        created_at: post.created_at,
        likes: post.likes_count || 0,
        comments_count: post.comments_count || 0,
        display_name: profile.display_name || "Membre BAARO",
        handle: profile.handle || "@membre",
        flag: profile.flag || "🌍",
        avatar: profile.avatar_url || "",
      };
    });
  }, []);

  // ===== Fallback si la jointure profiles échoue (FK absente) =====
  const fetchPostsPageFallback = useCallback(async (cursor) => {
    let query = supabase
      .from("posts")
      .select("id, author_id, text, media_url, media_type, created_at, likes_count, comments_count")
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(PAGE_SIZE);

    query = applyCursor(query, cursor);

    const { data, error: err2 } = await query;
    if (err2) throw err2;

    const authorIds = [...new Set((data || []).map((p) => p.author_id).filter(Boolean))];
    let profilesMap = {};

    if (authorIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, display_name, handle, flag, avatar_url")
        .in("user_id", authorIds);

      (profiles || []).forEach((p) => {
        profilesMap[p.user_id] = p;
      });
    }

    return (data || []).map((post) => {
      const profile = profilesMap[post.author_id] || {};
      return {
        ...post,
        likes: post.likes_count || 0,
        comments_count: post.comments_count || 0,
        display_name: profile.display_name || "Membre BAARO",
        handle: profile.handle || "@membre",
        flag: profile.flag || "🌍",
        avatar: profile.avatar_url || "",
      };
    });
  }, []);

  const updateCursorFromRows = (rows) => {
    if (rows.length > 0) {
      const last = rows[rows.length - 1];
      cursorRef.current = { created_at: last.created_at, id: last.id };
    }
    setHasMore(rows.length === PAGE_SIZE);
  };

  // Charge/recharge la 1ère page (reset complet du fil : nouveau post,
  // changement d'onglet, pull-to-refresh...).
  const loadPosts = useCallback(async () => {
    setLoading(true);
    cursorRef.current = null;
    try {
      const rows = await fetchPostsPage(null);
      setPosts(rows);
      updateCursorFromRows(rows);
      const authorId = user?.id || userId;
      if (authorId && rows.length) {
        const { data: likes } = await supabase
          .from("post_likes")
          .select("post_id")
          .eq("user_id", authorId)
          .in("post_id", rows.map((row) => row.id));
        setLikedPosts(Object.fromEntries((likes || []).map((like) => [like.post_id, true])));
      } else {
        setLikedPosts({});
      }
    } catch (error) {
      console.warn("Jointure profiles échouée, fallback:", error.message);
      try {
        const rows = await fetchPostsPageFallback(null);
        setPosts(rows);
        updateCursorFromRows(rows);
        const authorId = user?.id || userId;
        if (authorId && rows.length) {
          const { data: likes } = await supabase
            .from("post_likes")
            .select("post_id")
            .eq("user_id", authorId)
            .in("post_id", rows.map((row) => row.id));
          setLikedPosts(Object.fromEntries((likes || []).map((like) => [like.post_id, true])));
        } else {
          setLikedPosts({});
        }
      } catch (fallbackError) {
        handleDbError(fallbackError, showToast, "Erreur chargement des publications");
        setPosts([]);
        setHasMore(false);
      }
    } finally {
      setLoading(false);
    }
  }, [fetchPostsPage, fetchPostsPageFallback, showToast, user?.id, userId]);

  // Charge la page suivante et l'ajoute en bas du fil (scroll infini).
  const loadMorePosts = useCallback(async () => {
    if (loadingMore || !hasMore || loading || !cursorRef.current) return;
    setLoadingMore(true);
    const cursor = cursorRef.current;
    try {
      const rows = await fetchPostsPage(cursor);
      setPosts((prev) => [...prev, ...rows]);
      updateCursorFromRows(rows);
    } catch (error) {
      try {
        const rows = await fetchPostsPageFallback(cursor);
        setPosts((prev) => [...prev, ...rows]);
        updateCursorFromRows(rows);
      } catch (fallbackError) {
        handleDbError(fallbackError, showToast, "Erreur chargement de la suite du fil");
      }
    } finally {
      setLoadingMore(false);
    }
  }, [fetchPostsPage, fetchPostsPageFallback, loadingMore, hasMore, loading, showToast]);

  useEffect(() => {
    loadPosts();
  }, [loadPosts]);

  // Déclenche loadMorePosts() quand le sentinel devient visible en bas du fil.
  useEffect(() => {
    if (!sentinelRef.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) loadMorePosts();
      },
      { rootMargin: "400px" }
    );

    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [loadMorePosts]);

  // Realtime ciblé (évite de recharger tout le feed à chaque insert)
  useEffect(() => {
    const channel = supabase
      .channel("posts_feed")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "posts" },
        (payload) => {
          // On recharge uniquement si nécessaire (ou on injecte le nouveau post)
          loadPosts();
        }
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "posts" },
        () => loadPosts()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadPosts]);

  // ===== Sélection d'un fichier média (photo ou vidéo) =====
  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const isVideo = file.type.startsWith("video");
    const isImage = file.type.startsWith("image");

    if (!isVideo && !isImage) {
      showToast("Format non supporté (image ou vidéo uniquement)", "error");
      e.target.value = "";
      return;
    }

    const maxSize = isVideo ? MAX_VIDEO_SIZE : MAX_IMAGE_SIZE;
    if (file.size > maxSize) {
      showToast(
        `Fichier trop lourd (max ${isVideo ? "50" : "10"} Mo)`,
        "error"
      );
      e.target.value = "";
      return;
    }

    if (mediaPreview) URL.revokeObjectURL(mediaPreview);
    setMediaFile(file);
    setMediaPreview(URL.createObjectURL(file));
    e.target.value = ""; // permet de reselectionner le même fichier plus tard
  };

  const handleRemoveMedia = () => {
    if (mediaPreview) URL.revokeObjectURL(mediaPreview);
    setMediaFile(null);
    setMediaPreview(null);
  };

  // ===== Upload du fichier vers le bucket Supabase Storage "media" =====
  const uploadMedia = async (file, authorId) => {
    const ext = file.name.split(".").pop() || "bin";
    const safeExt = ext.toLowerCase().replace(/[^a-z0-9]/g, "") || "bin";
    const path = `${authorId}/${randomId("media")}.${safeExt}`;

    const { error: uploadError } = await supabase.storage
      .from("media")
      .upload(path, file, {
        cacheControl: "3600",
        upsert: false,
        contentType: file.type,
      });

    if (uploadError) throw uploadError;

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

      const { data: createdPost, error } = await supabase.from("posts").insert({
        author_id: authorId,
        text: newText + (mood ? ` (Humeur: ${mood})` : ""),
        ...mediaData,
      }).select("id").single();

      if (error) throw error;

      setNewText("");
      setMood("");
      setShowPoll(false);
      handleRemoveMedia();

      onRewardPoints?.(mediaData?.media_url ? "publish_post_media" : "publish_post", "Publication créée !", createdPost?.id);
      showPointsReward?.(mediaData?.media_url ? 8 : 5, "Publication créée !");
      await loadPosts();
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
        onRewardPoints?.("like_post", "J'aime distribué", postId);
        showPointsReward?.(2, "J'aime distribué");
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


  const loadComments = async (postId) => {
    if (!postId) return;
    try {
      const { data, error } = await supabase
        .from("comments")
        .select(`
          id, text, created_at, author_id,
          profiles:author_id (display_name, handle)
        `)
        .eq("post_id", postId)
        .order("created_at", { ascending: true })
        .limit(50);
      if (error) throw error;
      const rows = (data || []).map((c) => ({
        id: c.id,
        text: c.text,
        author: c.profiles?.display_name || c.profiles?.handle || "Membre",
        author_id: c.author_id,
        created_at: c.created_at,
      }));
      setCommentsMap((prev) => ({ ...prev, [postId]: rows }));
    } catch (e) {
      // Fallback sans jointure profiles
      try {
        const { data } = await supabase
          .from("comments")
          .select("id, text, created_at, author_id")
          .eq("post_id", postId)
          .order("created_at", { ascending: true })
          .limit(50);
        setCommentsMap((prev) => ({
          ...prev,
          [postId]: (data || []).map((c) => ({
            id: c.id,
            text: c.text,
            author: "Membre",
            author_id: c.author_id,
            created_at: c.created_at,
          })),
        }));
      } catch (err) {
        handleDbError(err, showToast, "Impossible de charger les commentaires");
      }
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
      const { data: createdComment, error } = await supabase.from("comments").insert({
        post_id: postId,
        author_id: authorId,
        text,
      }).select("id").single();

      if (error) throw error;

      const newCmt = {
        id: `c_${Date.now()}`,
        author: "Vous",
        text,
      };

      setCommentsMap((prev) => ({
        ...prev,
        [postId]: [...(prev[postId] || []), newCmt],
      }));
      setPosts((prev) =>
        prev.map((p) =>
          p.id === postId
            ? { ...p, comments_count: (p.comments_count || 0) + 1 }
            : p
        )
      );

      setNewCommentText((prev) => ({ ...prev, [postId]: "" }));
      onRewardPoints?.("comment", "Commentaire ajouté", createdComment?.id);
      showPointsReward?.(1, "Commentaire ajouté");
    } catch (error) {
      handleDbError(error, showToast, "Impossible de commenter");
    }
  };



  const meId = user?.id || userId;

  const handleSharePost = async (post) => {
    const url = `${window.location.origin}/?post=${post.id}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: "BAARO", text: post.text?.slice(0, 120) || "Publication BAARO", url });
      } else {
        await navigator.clipboard.writeText(url);
        showToast("Lien copié", "success");
      }
    } catch {
      /* user cancel */
    }
  };

  const handleDeletePost = async (postId) => {
    if (!meId) return showToast("Connecte-toi", "error");
    if (!window.confirm("Supprimer cette publication ?")) return;
    setMenuOpenId(null);
    try {
      const { error } = await supabase.from("posts").delete().eq("id", postId).eq("author_id", meId);
      if (error) throw error;
      setPosts((prev) => prev.filter((p) => p.id !== postId));
      showToast("Publication supprimée", "success");
    } catch (e) {
      handleDbError(e, showToast, "Impossible de supprimer");
    }
  };

  const startEditPost = (post) => {
    setMenuOpenId(null);
    setEditingId(post.id);
    setEditText(post.text || "");
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditText("");
  };

  const saveEditPost = async (postId) => {
    if (!meId) return;
    const text = editText.trim();
    if (!text) return showToast("Texte vide", "error");
    setSavingEdit(true);
    try {
      const { error } = await supabase
        .from("posts")
        .update({ text })
        .eq("id", postId)
        .eq("author_id", meId);
      if (error) throw error;
      setPosts((prev) => prev.map((p) => (p.id === postId ? { ...p, text } : p)));
      setEditingId(null);
      setEditText("");
      showToast("Publication modifiée", "success");
    } catch (e) {
      handleDbError(e, showToast, "Impossible de modifier");
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDeleteComment = async (postId, commentId) => {
    if (!meId) return;
    if (!window.confirm("Supprimer ce commentaire ?")) return;
    try {
      const { error } = await supabase
        .from("comments")
        .delete()
        .eq("id", commentId)
        .eq("author_id", meId);
      if (error) throw error;
      setCommentsMap((prev) => ({
        ...prev,
        [postId]: (prev[postId] || []).filter((c) => c.id !== commentId),
      }));
      setPosts((prev) =>
        prev.map((p) =>
          p.id === postId
            ? { ...p, comments_count: Math.max(0, (p.comments_count || 1) - 1) }
            : p
        )
      );
      showToast("Commentaire supprimé", "success");
    } catch (e) {
      handleDbError(e, showToast, "Impossible de supprimer le commentaire");
    }
  };


  if (loading) {
    return (
      <div className="text-center py-8 text-gray-400">
        <div className="animate-spin text-2xl mb-2">⏳</div>
        Chargement...
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 max-w-2xl mx-auto w-full pb-20">
      <FeedStories userId={userId} onRewardPoints={onRewardPoints} />

      <form
        onSubmit={handleCreatePost}
        className="glass-card rounded-2xl p-4 shadow-xl border"
        style={{ borderColor: COLORS.borderGold }}
      >
        <div className="flex gap-3 mb-3">
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm shadow-md gold-glow"
            style={{ background: COLORS.gold, color: COLORS.bg }}
          >
            {user?.email?.charAt(0)?.toUpperCase() || "V"}
          </div>
          <textarea
            value={newText}
            onChange={(e) => setNewText(e.target.value)}
            placeholder="Quoi de neuf ?"
            className="flex-1 bg-transparent resize-none outline-none text-sm leading-relaxed"
            style={{ color: COLORS.ivory }}
            rows={3}
          />
        </div>

        {/* Prévisualisation du média sélectionné */}
        {mediaPreview && (
          <div className="relative mb-3 rounded-xl overflow-hidden border" style={{ borderColor: COLORS.border }}>
            {mediaFile?.type.startsWith("video") ? (
              <video
                src={mediaPreview}
                controls
                className="w-full max-h-64 object-cover bg-black"
              />
            ) : (
              <img
                src={mediaPreview}
                alt="Prévisualisation"
                className="w-full max-h-64 object-cover"
              />
            )}
            <button
              type="button"
              onClick={handleRemoveMedia}
              className="absolute top-2 right-2 bg-black/70 hover:bg-black/90 rounded-full p-1.5 text-white transition"
              aria-label="Retirer le média"
            >
              <X size={14} />
            </button>
          </div>
        )}

        {showPoll && (
          <div
            className="mb-3 p-3 rounded-xl border text-xs"
            style={{
              background: COLORS.surface,
              borderColor: COLORS.borderTeal,
              color: COLORS.muted,
            }}
          >
            Sondages bientôt disponibles
          </div>
        )}

        <div
          className="flex items-center justify-between pt-2 border-t"
          style={{ borderColor: COLORS.border }}
        >
          <div className="flex items-center gap-2">
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
              className="p-2 rounded-lg hover:bg-white/5 text-amber-400 flex items-center gap-1 text-xs disabled:opacity-40"
            >
              <ImageIcon size={16} />
              <span className="hidden sm:inline">Média</span>
            </button>
            <button
              type="button"
              onClick={() => setShowPoll(!showPoll)}
              className="p-2 rounded-lg hover:bg-white/5 text-teal-400 flex items-center gap-1 text-xs"
            >
              <BarChart2 size={16} />
              <span className="hidden sm:inline">Sondage</span>
            </button>
            <select
              value={mood}
              onChange={(e) => setMood(e.target.value)}
              className="bg-transparent text-xs p-1 rounded border outline-none"
              style={{ borderColor: COLORS.border, color: COLORS.muted }}
            >
              <option value="">Humeur ?</option>
              <option value="🔥 Inspiré">🔥 Inspiré</option>
              <option value="💡 Innovant">💡 Innovant</option>
              <option value="🎉 Joyeux">🎉 Joyeux</option>
            </select>
          </div>

          <button
            type="submit"
            disabled={(!newText.trim() && !mediaFile) || submitting}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold shadow-lg transition disabled:opacity-40"
            style={{
              background: "linear-gradient(135deg, #D9AE52 0%, #2DBFA6 100%)",
              color: COLORS.bg,
            }}
          >
            <span>
              {uploadingMedia
                ? "Envoi du média..."
                : submitting
                ? "..."
                : "Publier"}
            </span>
            <span className="text-[10px] px-1.5 py-0.5 rounded-full font-extrabold bg-black/20 text-white">
              +15 pts
            </span>
          </button>
        </div>
      </form>

      <GuestBanner
        onUpgrade={() =>
          showToast("Crée un compte depuis Réglages pour gagner des points", "info")
        }
      />

      {posts.length === 0 ? (
        <div className="text-center py-8 text-gray-400">
          <p className="text-4xl mb-2">📭</p>
          <p>Aucune publication</p>
          <p className="text-sm mt-2">Soyez le premier à publier !</p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {posts.map((post) => {
            const isLiked = !!likedPosts[post.id];
            const isTranslated = !!translatedMap[post.id];
            const comments = commentsMap[post.id] || [];

            return (
              <article
                key={post.id}
                className="glass-card rounded-2xl p-5 shadow-xl border flex flex-col gap-3"
                style={{ borderColor: COLORS.border }}
              >
                <div className="flex items-center justify-between">
                  <div
                    className="flex items-center gap-3 cursor-pointer group"
                    onClick={() => onOpenProfile?.(post.author_id)}
                  >
                    <div
                      className="w-10 h-10 rounded-full overflow-hidden border flex items-center justify-center font-bold text-sm"
                      style={{
                        borderColor: COLORS.borderGold,
                        background: COLORS.surface,
                      }}
                    >
                      {post.avatar ? (
                        <img src={post.avatar} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <span style={{ color: COLORS.gold }}>
                          {post.display_name?.charAt(0) || "?"}
                        </span>
                      )}
                    </div>
                    <div>
                      <p className="font-bold text-sm group-hover:underline" style={{ color: COLORS.ivory }}>
                        {post.display_name} {post.flag}
                      </p>
                      <p className="text-xs" style={{ color: COLORS.muted }}>
                        {post.handle} · {new Date(post.created_at).toLocaleDateString("fr-FR", {
                          day: "numeric",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                    </div>
                  </div>

                  {post.author_id === meId && (
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() =>
                          setMenuOpenId((id) => (id === post.id ? null : post.id))
                        }
                        className="p-2 rounded-lg hover:bg-white/5"
                        style={{ color: COLORS.muted }}
                        aria-label="Actions"
                      >
                        <MoreHorizontal size={18} />
                      </button>
                      {menuOpenId === post.id && (
                        <div
                          className="absolute right-0 top-9 z-20 min-w-[160px] rounded-xl border shadow-xl py-1"
                          style={{
                            background: COLORS.surface,
                            borderColor: COLORS.borderGold,
                          }}
                        >
                          <button
                            type="button"
                            onClick={() => startEditPost(post)}
                            className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-white/5"
                            style={{ color: COLORS.ivory }}
                          >
                            <Pencil size={14} /> Modifier
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeletePost(post.id)}
                            className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-white/5 text-red-400"
                          >
                            <Trash2 size={14} /> Supprimer
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {editingId === post.id ? (
                  <div className="flex flex-col gap-2">
                    <textarea
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      rows={3}
                      className="w-full rounded-xl px-3 py-2 text-sm outline-none border resize-none"
                      style={{
                        background: COLORS.surface2,
                        borderColor: COLORS.borderGold,
                        color: COLORS.ivory,
                      }}
                    />
                    <div className="flex gap-2 justify-end">
                      <button
                        type="button"
                        onClick={cancelEdit}
                        className="px-3 py-1.5 rounded-lg text-xs"
                        style={{ color: COLORS.muted }}
                      >
                        Annuler
                      </button>
                      <button
                        type="button"
                        disabled={savingEdit}
                        onClick={() => saveEditPost(post.id)}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold disabled:opacity-40"
                        style={{ background: COLORS.gold, color: "#000" }}
                      >
                        <Check size={14} /> {savingEdit ? "…" : "Enregistrer"}
                      </button>
                    </div>
                  </div>
                ) : (
                <p className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: COLORS.ivory }}>
                  {isTranslated ? translatedMap[post.id] : post.text}
                </p>
                )}
                {isTranslated && (
                  <p className="text-[10px]" style={{ color: COLORS.muted }}>
                    Traduit par BAARO
                  </p>
                )}

                {post.media_url && (
                  <div className="rounded-xl overflow-hidden">
                    {post.media_type?.startsWith("video") ? (
                      <video src={post.media_url} controls className="w-full max-h-80 object-cover bg-black" />
                    ) : (
                      <img src={post.media_url} alt="" className="w-full max-h-80 object-cover" />
                    )}
                  </div>
                )}

                <div className="flex items-center gap-4 pt-2 border-t" style={{ borderColor: COLORS.border }}>
                  <button
                    onClick={() => handleLike(post.id)}
                    className="flex items-center gap-1.5 text-xs transition"
                    style={{ color: isLiked ? "#ef4444" : COLORS.muted }}
                  >
                    <Heart size={16} fill={isLiked ? "#ef4444" : "none"} />
                    {post.likes || 0}
                  </button>

                  <button
                    onClick={() => {
                      const next = !commentOpen[post.id];
                      setCommentOpen((prev) => ({ ...prev, [post.id]: next }));
                      if (next) loadComments(post.id);
                    }}
                    className="flex items-center gap-1.5 text-xs"
                    style={{ color: COLORS.muted }}
                  >
                    <MessageCircle size={16} />
                    {post.comments_count || comments.length}
                  </button>

                  <TranslateButton
                    text={post.text}
                    isTranslated={!!translatedMap[post.id]}
                    preferredLang="fr"
                    onTranslated={(translated) =>
                      setTranslatedMap((prev) => ({ ...prev, [post.id]: translated }))
                    }
                    onClear={() =>
                      setTranslatedMap((prev) => ({ ...prev, [post.id]: null }))
                    }
                  />

                  <button
                    type="button"
                    onClick={() => handleSharePost(post)}
                    className="flex items-center gap-1.5 text-xs ml-auto"
                    style={{ color: COLORS.muted }}
                  >
                    <Share2 size={16} />
                  </button>
                </div>

                {commentOpen[post.id] && (
                  <div className="pt-3 border-t space-y-2" style={{ borderColor: COLORS.border }}>
                    {comments.map((c) => (
                      <div key={c.id} className="text-xs flex items-start justify-between gap-2" style={{ color: COLORS.muted }}>
                        <div>
                          <span className="font-bold" style={{ color: COLORS.ivory }}>{c.author}</span> : {c.text}
                        </div>
                        {c.author_id === meId && (
                          <button
                            type="button"
                            onClick={() => handleDeleteComment(post.id, c.id)}
                            className="shrink-0 p-1 text-red-400/80 hover:text-red-400"
                            aria-label="Supprimer commentaire"
                          >
                            <Trash2 size={12} />
                          </button>
                        )}
                      </div>
                    ))}
                    <div className="flex gap-2">
                      <input
                        value={newCommentText[post.id] || ""}
                        onChange={(e) =>
                          setNewCommentText((prev) => ({ ...prev, [post.id]: e.target.value }))
                        }
                        placeholder="Ajouter un commentaire..."
                        className="flex-1 px-3 py-2 rounded-lg border text-xs outline-none"
                        style={{
                          background: COLORS.surface2,
                          borderColor: COLORS.border,
                          color: COLORS.ivory,
                        }}
                      />
                      <button
                        onClick={() => handleAddComment(post.id)}
                        className="p-2 rounded-lg"
                        style={{ background: COLORS.gold, color: "#000" }}
                      >
                        <Send size={14} />
                      </button>
                    </div>
                  </div>
                )}
              </article>
            );
          })}

          {/* Sentinel invisible : déclenche loadMorePosts() quand on scrolle jusqu'ici */}
          {hasMore && <div ref={sentinelRef} style={{ height: 1 }} />}

          {loadingMore && (
            <div className="text-center py-4 text-xs" style={{ color: COLORS.muted }}>
              Chargement de plus de publications...
            </div>
          )}

          {!hasMore && posts.length > 0 && (
            <div className="text-center py-4 text-xs" style={{ color: COLORS.muted }}>
              Vous avez tout vu ✨
            </div>
          )}
        </div>
      )}
    </div>
  );
}
