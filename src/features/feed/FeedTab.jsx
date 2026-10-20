import { useState, useEffect, useCallback, useRef } from "react";
import {
  X,
  Trash2,
  MoreHorizontal,
  Image as ImageIcon,
  Send,
  Sparkles,
  Pencil,
  Flag,
  Heart,
  MessageCircle,
  Eye,
  Repeat2,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

// Imports via l'alias absolu (@/ -> src/)
import { COLORS } from "@/theme.js";
import { useToast } from "@/components/ToastContext.jsx";
import { supabase } from "@/supabaseClient.js";
import { handleDbError } from "@/lib/dbErrors.js";
import { fetchFeedPage } from "@/lib/feedPagination.js";
import { recordFeedEvent } from "@/lib/feedEvents.js";
import { runOrEnqueue } from "@/lib/offlineActions.js";
import { checkRateLimit, rateLimitMessage } from "@/lib/rateLimit.js";
import { uploadExternalMedia } from "@/lib/externalMedia.js";

import { PollCard, SocialPostEnhancements, SocialSuggestions } from "./SocialEnhancements.jsx";
import RichTextComposer from "@/components/RichTextComposer.jsx";
import { RichTextRenderer } from "@/components/RichTextRenderer.jsx";
import { EngagementList } from "@/components/EngagementList.jsx";
import { TipButton } from "@/components/TipButton.jsx";
import { AskAiButton } from "@/components/AskAiButton.jsx";
import { TranslateButton } from "@/components/TranslateButton.jsx";
import { GuestBanner } from "@/components/GuestBanner.jsx";

const PAGE_SIZE = 20;
const MAX_MEDIA_BYTES = 50 * 1024 * 1024; // 50 Mo

const REPORT_REASONS = [
  "Spam ou arnaque",
  "Harcèlement ou haine",
  "Contenu inapproprié",
  "Fausse information",
  "Autre",
];

/** Formate la date de publication relative ou lisible */
function formatDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const now = new Date();
  const diffInSeconds = Math.floor((now - date) / 1000);

  if (diffInSeconds < 60) return "À l'instant";
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)} min`;
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)} h`;

  return date.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Transforme une ligne Supabase en objet post prêt à afficher */
function formatPost(post) {
  const profile = post.profiles || {};
  const rawHandle = profile.handle || "membre";
  const cleanHandle = rawHandle.startsWith("@") ? rawHandle : `@${rawHandle}`;

  return {
    id: post.id,
    author_id: post.author_id,
    text: post.text,
    media_url: post.media_url,
    media_type: post.media_type,
    created_at: post.created_at,
    likes: post.likes_count || 0,
    reposts_count: post.reposts_count || 0,
    comments_count: post.comments_count || 0,
    views_count: post.views_count || 0,
    display_name: profile.display_name || "Membre BAARO",
    handle: cleanHandle,
    flag: profile.flag || "🌍",
    avatar: profile.avatar_url || "",
  };
}

export function FeedTab({
  id,
  user_id,
  onOpenProfile,
  onRewardPoints,
  isCreateOpen,
  setIsCreateOpen,
}) {
  const propUserId = id || user_id || null;

  const { showToast, showPointsReward } = useToast();
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  // Saisie enrichie, sondages & médias
  const [newText, setNewText] = useState("");
  const [pollData, setPollData] = useState(null);
  const [mood, setMood] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [mediaFile, setMediaFile] = useState(null);
  const [mediaPreview, setMediaPreview] = useState(null);
  const [textToolsOpen, setTextToolsOpen] = useState(false);

  // Session & modales
  const [currentUserId, setCurrentUserId] = useState(propUserId);
  const [menuOpenId, setMenuOpenId] = useState(null);
  const [engagement, setEngagement] = useState(null);

  // Modification & signalement
  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [reportPost, setReportPost] = useState(null);
  const [reportReason, setReportReason] = useState(REPORT_REASONS[0]);

  // J'aime, Reposts, commentaires, traduction
  const [likedPosts, setLikedPosts] = useState({});
  const [repostedPosts, setRepostedPosts] = useState({});
  const [commentOpen, setCommentOpen] = useState({});
  const [commentsMap, setCommentsMap] = useState({});
  const [newCommentText, setNewCommentText] = useState({});
  const [translatedMap, setTranslatedMap] = useState({});

  const fileInputRef = useRef(null);
  const cursorRef = useRef(null);

  const activeUserId = currentUserId || propUserId || null;

  // Session Supabase
  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (mounted && session?.user?.id) setCurrentUserId(session.user.id);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (mounted) setCurrentUserId(session?.user?.id || null);
    });

    return () => {
      mounted = false;
      subscription?.unsubscribe();
    };
  }, []);

  // Libération de l'URL d'aperçu média
  useEffect(() => {
    return () => {
      if (mediaPreview) URL.revokeObjectURL(mediaPreview);
    };
  }, [mediaPreview]);

  // Fermer le menu "..." en touchant ailleurs
  useEffect(() => {
    if (!menuOpenId) return;
    const close = (e) => {
      if (!e.target.closest?.("[data-post-menu]")) setMenuOpenId(null);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [menuOpenId]);

  // Chargement des likes et des reposts de l'utilisateur
  const postIdsKey = posts.map((p) => p.id).join(",");
  useEffect(() => {
    if (!activeUserId || !postIdsKey) return;
    let cancelled = false;

    (async () => {
      const postIds = postIdsKey.split(",");
      const [{ data: likes }, { data: reposts }] = await Promise.all([
        supabase.from("post_likes").select("post_id").eq("user_id", activeUserId).in("post_id", postIds),
        supabase.from("post_reposts").select("post_id").eq("user_id", activeUserId).in("post_id", postIds),
      ]);

      if (!cancelled) {
        if (likes) setLikedPosts(Object.fromEntries(likes.map((l) => [l.post_id, true])));
        if (reposts) setRepostedPosts(Object.fromEntries(reposts.map((r) => [r.post_id, true])));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activeUserId, postIdsKey]);

  // Chargement du flux
  const loadPosts = useCallback(
    async ({ silent = false } = {}) => {
      if (!silent) setLoading(true);
      cursorRef.current = null;
      try {
        const { rows, nextCursor } = await fetchFeedPage({
          cursor: null,
          pageSize: PAGE_SIZE,
        });
        const formatted = rows.map(formatPost);
        setPosts(formatted);
        cursorRef.current = nextCursor;
        setHasMore(Boolean(nextCursor));
        formatted.slice(0, 10).forEach((p) => {
          if (p?.id) void recordFeedEvent(p.id, "impression");
        });
      } catch (error) {
        handleDbError(error, showToast, "Erreur lors du chargement du fil");
        if (!silent) setPosts([]);
        setHasMore(false);
      } finally {
        setLoading(false);
      }
    },
    [showToast]
  );

  const loadMorePosts = async () => {
    if (!hasMore || loadingMore || !cursorRef.current) return;
    setLoadingMore(true);
    try {
      const { rows, nextCursor } = await fetchFeedPage({
        cursor: cursorRef.current,
        pageSize: PAGE_SIZE,
      });
      const formatted = rows.map(formatPost);
      setPosts((prev) => [...prev, ...formatted]);
      cursorRef.current = nextCursor;
      setHasMore(Boolean(nextCursor));
    } catch (error) {
      handleDbError(error, showToast, "Erreur lors du chargement de la suite");
    } finally {
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    loadPosts();
  }, [loadPosts]);

  // Supprimer une publication
  const handleDeletePost = async (postId) => {
    if (!window.confirm("Voulez-vous vraiment supprimer cette publication ?")) return;
    try {
      const { error } = await supabase.from("posts").delete().eq("id", postId).eq("author_id", activeUserId);
      if (error) throw error;
      setPosts((prev) => prev.filter((p) => p.id !== postId));
      showToast("Publication supprimée", "success");
    } catch (err) {
      handleDbError(err, showToast, "Impossible de supprimer la publication");
    }
  };

  // Modifier une publication
  const handleSaveEdit = async (postId) => {
    if (!editText.trim()) return;
    setSavingEdit(true);
    try {
      const { error } = await supabase
        .from("posts")
        .update({ text: editText.trim() })
        .eq("id", postId)
        .eq("author_id", activeUserId);
      if (error) throw error;

      setPosts((prev) =>
        prev.map((p) => (p.id === postId ? { ...p, text: editText.trim() } : p))
      );
      setEditingId(null);
      showToast("Publication mise à jour", "success");
    } catch (err) {
      handleDbError(err, showToast, "Échec de la modification");
    } finally {
      setSavingEdit(false);
    }
  };

  // Signaler une publication
  const handleSendReport = async () => {
    if (!reportPost || !activeUserId) return;
    try {
      const { error } = await supabase.from("post_reports").insert({
        post_id: reportPost.id,
        reporter_id: activeUserId,
        reason: reportReason,
      });
      if (error) throw error;
      showToast("Signalement envoyé avec succès", "success");
      setReportPost(null);
    } catch (err) {
      handleDbError(err, showToast, "Erreur lors du signalement");
    }
  };

  // Action Reposter
  const handleRepost = async (post) => {
    if (!activeUserId) {
      showToast("Vous devez être connecté pour republier", "error");
      return;
    }

    const postId = post.id;
    const wasReposted = !!repostedPosts[postId];
    const delta = wasReposted ? -1 : 1;

    setRepostedPosts((prev) => ({ ...prev, [postId]: !wasReposted }));
    setPosts((prev) =>
      prev.map((p) =>
        p.id === postId ? { ...p, reposts_count: Math.max(0, (p.reposts_count || 0) + delta) } : p
      )
    );

    try {
      if (wasReposted) {
        const { error } = await supabase
          .from("post_reposts")
          .delete()
          .eq("post_id", postId)
          .eq("user_id", activeUserId);
        if (error) throw error;
        showToast("Républication retirée", "info");
      } else {
        const { error } = await supabase
          .from("post_reposts")
          .insert({ post_id: postId, user_id: activeUserId });
        if (error) throw error;

        if (post.author_id && post.author_id !== activeUserId) {
          await supabase.from("notifications").insert({
            user_id: post.author_id,
            actor_id: activeUserId,
            type: "repost",
            source_id: postId,
            message: "a républié votre publication.",
          });
        }

        onRewardPoints?.("repost_post", "Publication républiée", postId);
        showPointsReward?.(3, "Publication républiée !");
        showToast("Publication républiée avec succès", "success");
      }
    } catch (error) {
      setRepostedPosts((prev) => ({ ...prev, [postId]: wasReposted }));
      setPosts((prev) =>
        prev.map((p) =>
          p.id === postId ? { ...p, reposts_count: Math.max(0, (p.reposts_count || 0) - delta) } : p
        )
      );
      handleDbError(error, showToast, "Impossible de traiter la républication");
    }
  };

  // Action Like
  const handleLike = async (postId) => {
    if (!activeUserId) {
      showToast("Vous devez être connecté", "error");
      return;
    }
    const limit = checkRateLimit("like", { max: 30, windowMs: 60_000 });
    if (!limit.allowed) {
      showToast(rateLimitMessage(limit.retryAfterSec), "error");
      return;
    }

    const wasLiked = !!likedPosts[postId];
    const delta = wasLiked ? -1 : 1;
    setLikedPosts((prev) => ({ ...prev, [postId]: !wasLiked }));
    setPosts((prev) =>
      prev.map((p) =>
        p.id === postId ? { ...p, likes: Math.max(0, (p.likes || 0) + delta) } : p
      )
    );

    try {
      const result = await runOrEnqueue(
        wasLiked ? "unlike_post" : "like_post",
        { post_id: postId }
      );
      if (result?.offline) {
        showToast("J'aime enregistré — sync au retour du réseau", "info");
        return;
      }
      if (!wasLiked) {
        onRewardPoints?.("like_post", "J'aime distribué", postId);
        showPointsReward?.(2, "J'aime distribué");
      }
      void recordFeedEvent(postId, "like");
    } catch (error) {
      setLikedPosts((prev) => ({ ...prev, [postId]: wasLiked }));
      setPosts((prev) =>
        prev.map((p) =>
          p.id === postId ? { ...p, likes: Math.max(0, (p.likes || 0) - delta) } : p
        )
      );
      handleDbError(error, showToast, "Impossible d'aimer");
    }
  };

  // Gestion des commentaires
  const loadComments = async (postId) => {
    if (!postId) return;
    try {
      const { data, error } = await supabase
        .from("comments")
        .select("id, text, created_at, author_id, profiles:author_id (display_name, handle)")
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
    } catch (err) {
      handleDbError(err, showToast, "Impossible de charger les commentaires");
    }
  };

  const toggleComments = (postId) => {
    const next = !commentOpen[postId];
    setCommentOpen((prev) => ({ ...prev, [postId]: next }));
    if (next) loadComments(postId);
  };

  const handleAddComment = async (postId) => {
    const text = (newCommentText[postId] || "").trim();
    if (!text) return;
    if (!activeUserId) {
      showToast("Vous devez être connecté", "error");
      return;
    }
    try {
      const { data: created, error } = await supabase
        .from("comments")
        .insert({ post_id: postId, author_id: activeUserId, text })
        .select("id")
        .single();
      if (error) throw error;

      const newComment = {
        id: created?.id || `c_${Date.now()}`,
        author: "Vous",
        text,
        author_id: activeUserId,
      };
      setCommentsMap((prev) => ({ ...prev, [postId]: [...(prev[postId] || []), newComment] }));
      setPosts((prev) =>
        prev.map((p) =>
          p.id === postId ? { ...p, comments_count: (p.comments_count || 0) + 1 } : p
        )
      );
      setNewCommentText((prev) => ({ ...prev, [postId]: "" }));
      showPointsReward?.(1, "Commentaire ajouté");
    } catch (error) {
      handleDbError(error, showToast, "Impossible de commenter");
    }
  };

  const handleDeleteComment = async (postId, commentId) => {
    if (!activeUserId) return;
    if (!window.confirm("Supprimer ce commentaire ?")) return;
    try {
      const { error } = await supabase
        .from("comments")
        .delete()
        .eq("id", commentId)
        .eq("author_id", activeUserId);
      if (error) throw error;
      setCommentsMap((prev) => ({
        ...prev,
        [postId]: (prev[postId] || []).filter((c) => c.id !== commentId),
      }));
      setPosts((prev) =>
        prev.map((p) =>
          p.id === postId ? { ...p, comments_count: Math.max(0, (p.comments_count || 1) - 1) } : p
        )
      );
      showToast("Commentaire supprimé", "success");
    } catch (error) {
      handleDbError(error, showToast, "Suppression impossible");
    }
  };

  const handlePickFile = (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    if (file.size > MAX_MEDIA_BYTES) {
      showToast("Fichier trop lourd (50 Mo maximum)", "error");
      return;
    }
    setMediaFile(file);
    setMediaPreview(URL.createObjectURL(file));
  };

  const handlePublish = async () => {
    const hasText = Boolean(newText.trim());
    const hasMedia = Boolean(mediaFile);
    const hasPoll = Boolean(pollData?.question?.trim());

    if (!hasText && !hasMedia && !hasPoll) return;
    if (submitting) return;

    if (!activeUserId) {
      showToast("Veuillez vous connecter pour publier", "error");
      return;
    }

    setSubmitting(true);
    try {
      let mediaUrl = null;
      let mediaType = null;

      if (mediaFile) {
        const uploadResult = await uploadExternalMedia(mediaFile, {
          folder: "posts",
          user_id: activeUserId,
          maxBytes: MAX_MEDIA_BYTES,
        });
        mediaUrl = uploadResult.url;
        mediaType = mediaFile.type.startsWith("video") ? "video" : "image";
      }

      const { data: newPost, error: postErr } = await supabase
        .from("posts")
        .insert([
          {
            author_id: activeUserId,
            text: newText + (mood ? ` (Humeur: ${mood})` : ""),
            media_url: mediaUrl,
            media_type: mediaType,
          },
        ])
        .select()
        .single();

      if (postErr) throw postErr;

      setNewText("");
      setMood("");
      setPollData(null);
      setMediaFile(null);
      setMediaPreview(null);
      setTextToolsOpen(false);
      setIsCreateOpen?.(false);
      
      showToast("Publication créée !", "success");
      loadPosts({ silent: true });
    } catch (err) {
      handleDbError(err, showToast, "Échec de la publication");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="text-center py-12 text-xs font-medium tracking-widest uppercase opacity-70">
        Chargement du fil d'actualité...
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 max-w-2xl mx-auto w-full pb-20">
      
      {/* Modale de création */}
      {activeUserId && isCreateOpen && (
        <div 
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-200"
          onClick={() => setIsCreateOpen?.(false)}
        >
          <div
            className="w-full max-w-lg rounded-t-3xl sm:rounded-2xl border shadow-2xl flex flex-col max-h-[70vh] sm:max-h-[85vh] mb-20 sm:mb-0 overflow-hidden"
            style={{ borderColor: COLORS.borderGold, background: COLORS.surface }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="flex items-center justify-between border-b p-4 text-xs font-semibold shrink-0"
              style={{ borderColor: COLORS.border, color: COLORS.gold }}
            >
              <div className="flex items-center gap-2">
                <Sparkles size={14} />
                <span>Créer une publication à fort impact</span>
              </div>
              <button
                type="button"
                onClick={() => setIsCreateOpen?.(false)}
                className="p-1 rounded-full text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-4 flex-1 overflow-y-auto flex flex-col gap-3">
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => setTextToolsOpen(!textToolsOpen)}
                  className="px-3 py-1.5 rounded-xl border text-xs font-medium flex items-center gap-1.5 transition-colors"
                  style={{ borderColor: COLORS.border, color: COLORS.ivory, background: COLORS.surface2 }}
                >
                  <span>Mise en forme du texte</span>
                  {textToolsOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </button>

                <button
                  type="button"
                  onClick={() =>
                    window.dispatchEvent(
                      new CustomEvent("baaro:ai-draft", {
                        detail: {
                          prompt: newText.trim()
                            ? `Améliore ce brouillon de publication :\n"${newText.trim()}"\n\n`
                            : "Rédige une publication engageante pour BAARO : ",
                        },
                      })
                    )
                  }
                  title="Rédiger avec l'IA"
                  className="px-3 py-1.5 rounded-xl transition-colors flex items-center gap-1.5 text-xs font-medium shadow-sm shrink-0"
                  style={{ background: "rgba(20, 184, 166, 0.15)", color: COLORS.teal, border: `1px solid ${COLORS.teal}40` }}
                >
                  <Sparkles size={14} />
                  <span>IA</span>
                </button>
              </div>

              {textToolsOpen && (
                <div
                  className="p-3 rounded-xl border flex flex-col gap-2 animate-in fade-in duration-150"
                  style={{ background: COLORS.surface2, borderColor: COLORS.border }}
                >
                  <RichTextComposer
                    value={newText}
                    onChange={setNewText}
                    pollData={pollData}
                    onPollChange={setPollData}
                    rows={1}
                  />
                </div>
              )}

              <textarea
                value={newText}
                onChange={(e) => setNewText(e.target.value)}
                disabled={submitting}
                placeholder="Partagez une perspective, une analyse ou une innovation avec le monde..."
                rows={5}
                className="w-full p-3 rounded-xl border text-sm outline-none resize-none"
                style={{
                  background: COLORS.surface2,
                  borderColor: COLORS.border,
                  color: COLORS.ivory,
                }}
              />

              {mediaPreview && (
                <div className="relative rounded-xl overflow-hidden max-h-60 border" style={{ borderColor: COLORS.border }}>
                  <button
                    type="button"
                    onClick={() => {
                      setMediaFile(null);
                      setMediaPreview(null);
                    }}
                    className="absolute top-2 right-2 z-10 p-1.5 rounded-full bg-black/60 text-white"
                  >
                    <X size={14} />
                  </button>
                  {mediaFile?.type?.startsWith("video") ? (
                    <video src={mediaPreview} controls className="w-full h-full object-cover" />
                  ) : (
                    <img src={mediaPreview} alt="Aperçu" className="w-full h-full object-cover" />
                  )}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between border-t p-3 flex-wrap gap-2 shrink-0 bg-inherit" style={{ borderColor: COLORS.border }}>
              <div className="flex items-center gap-2">
                <input ref={fileInputRef} type="file" accept="image/*,video/*" className="hidden" onChange={handlePickFile} />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="p-1.5 rounded-lg hover:bg-white/10 flex items-center gap-1.5 text-xs font-medium"
                  style={{ color: COLORS.gold }}
                >
                  <ImageIcon size={16} />
                  <span>Média</span>
                </button>
              </div>

              <button
                type="button"
                onClick={handlePublish}
                disabled={submitting || (!newText.trim() && !mediaFile && !pollData?.question?.trim())}
                className="px-4 py-1.5 rounded-xl text-xs font-bold shadow-md flex items-center gap-1.5 disabled:opacity-50"
                style={{ background: COLORS.gold, color: "#000" }}
              >
                {submitting ? "Publication..." : "Publier"} <Send size={13} />
              </button>
            </div>
          </div>
        </div>
      )}

      <GuestBanner
        onUpgrade={() => showToast("Crée un compte pour débloquer toutes les fonctionnalités", "info")}
      />

      {activeUserId && <SocialSuggestions user_id={activeUserId} onOpenProfile={onOpenProfile} />}

      {/* Liste des publications */}
      <div className="flex flex-col gap-4">
        {posts.map((post) => (
          <article
            key={post.id}
            data-post-id={post.id}
            className="glass-card rounded-2xl p-5 shadow-xl border flex flex-col gap-3 relative"
            style={{ borderColor: COLORS.border }}
          >
            {/* En-tête : Photo, Nom, Pseudo & Date */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => onOpenProfile?.(post.author_id)}
                  className="w-10 h-10 rounded-full overflow-hidden border flex items-center justify-center font-bold text-sm shrink-0"
                  style={{ borderColor: COLORS.borderGold, background: COLORS.surface }}
                >
                  {post.avatar ? (
                    <img src={post.avatar} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <span style={{ color: COLORS.gold }}>
                      {post.display_name?.charAt(0) || "?"}
                    </span>
                  )}
                </button>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-bold text-sm flex items-center gap-1" style={{ color: COLORS.ivory }}>
                      {post.display_name} {post.flag}
                    </p>
                    <span className="text-xs" style={{ color: COLORS.muted }}>·</span>
                    <span className="text-xs font-normal" style={{ color: COLORS.muted }}>
                      {formatDate(post.created_at)}
                    </span>
                  </div>
                  <p className="text-xs" style={{ color: COLORS.muted }}>
                    {post.handle}
                  </p>
                </div>
              </div>

              {/* Menu Options (...) */}
              <div className="relative" data-post-menu>
                <button
                  type="button"
                  onClick={() => setMenuOpenId(menuOpenId === post.id ? null : post.id)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
                >
                  <MoreHorizontal size={18} />
                </button>

                {menuOpenId === post.id && (
                  <div
                    className="absolute right-0 top-full mt-1 w-44 rounded-xl border shadow-xl z-20 overflow-hidden py-1"
                    style={{ background: COLORS.surface2, borderColor: COLORS.border }}
                  >
                    {post.author_id === activeUserId ? (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingId(post.id);
                            setEditText(post.text || "");
                            setMenuOpenId(null);
                          }}
                          className="w-full px-3 py-2 text-left text-xs font-medium flex items-center gap-2 hover:bg-white/10"
                          style={{ color: COLORS.ivory }}
                        >
                          <Pencil size={14} /> Modifier
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setMenuOpenId(null);
                            handleDeletePost(post.id);
                          }}
                          className="w-full px-3 py-2 text-left text-xs font-medium flex items-center gap-2 hover:bg-red-500/10 text-red-400"
                        >
                          <Trash2 size={14} /> Supprimer
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setReportPost(post);
                          setMenuOpenId(null);
                        }}
                        className="w-full px-3 py-2 text-left text-xs font-medium flex items-center gap-2 hover:bg-white/10 text-amber-400"
                      >
                        <Flag size={14} /> Signaler
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Mode Édition / Contenu du post */}
            {editingId === post.id ? (
              <div className="flex flex-col gap-2 my-2">
                <textarea
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  className="w-full p-3 rounded-xl border text-sm outline-none resize-none"
                  style={{ background: COLORS.surface, borderColor: COLORS.border, color: COLORS.ivory }}
                  rows={3}
                />
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setEditingId(null)}
                    className="px-3 py-1 rounded-lg text-xs"
                    style={{ color: COLORS.muted }}
                  >
                    Annuler
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSaveEdit(post.id)}
                    disabled={savingEdit}
                    className="px-3 py-1 rounded-lg text-xs font-bold"
                    style={{ background: COLORS.gold, color: "#000" }}
                  >
                    {savingEdit ? "Enregistrement..." : "Enregistrer"}
                  </button>
                </div>
              </div>
            ) : (
              <div className="text-base leading-relaxed whitespace-pre-wrap" style={{ color: COLORS.ivory }}>
                {translatedMap[post.id] ? translatedMap[post.id] : <RichTextRenderer content={post.text} />}
              </div>
            )}

            {translatedMap[post.id] && (
              <p className="text-[10px]" style={{ color: COLORS.muted }}>Traduit par BAARO</p>
            )}

            {/* Rendu Média (Images & Vidéos) */}
            {post.media_url && (
              <div className="rounded-xl overflow-hidden border bg-black/40 flex items-center justify-center">
                {post.media_type === "video" || /\.(mp4|webm|ogg|mov)$/i.test(post.media_url) ? (
                  <video
                    src={post.media_url}
                    controls
                    playsInline
                    preload="metadata"
                    className="w-full max-h-[500px] object-contain bg-black"
                  />
                ) : (
                  <img src={post.media_url} alt="" className="w-full max-h-[500px] object-contain" />
                )}
              </div>
            )}

            <PollCard postId={post.id} user_id={activeUserId} />
            <SocialPostEnhancements post={post} user_id={activeUserId} />

            {/* Actions (Likes, Reposts, Commentaires, Traduction, IA, Tip) */}
            <div className="flex items-center justify-between gap-2 pt-2 border-t flex-wrap" style={{ borderColor: COLORS.border }}>
              <div className="flex items-center gap-3 text-[11px] font-medium flex-wrap" style={{ color: COLORS.muted }}>
                <button
                  type="button"
                  onClick={() => handleLike(post.id)}
                  className="flex items-center gap-1 transition active:scale-95"
                  style={{ color: likedPosts[post.id] ? "#F43F5E" : COLORS.muted }}
                >
                  <Heart size={15} fill={likedPosts[post.id] ? "currentColor" : "none"} />
                  {Number(post.likes || 0)}
                </button>

                <button
                  type="button"
                  onClick={() => handleRepost(post)}
                  className="flex items-center gap-1 transition active:scale-95"
                  style={{ color: repostedPosts[post.id] ? "#10B981" : COLORS.muted }}
                >
                  <Repeat2 size={15} />
                  {Number(post.reposts_count || 0)}
                </button>

                {post.author_id === activeUserId && (
                  <div className="flex items-center gap-1.5 ml-1">
                    <button type="button" onClick={() => setEngagement({ type: "postLikes", id: post.id })} className="text-[10px] underline hover:text-white">J'aime</button>
                    <span>·</span>
                    <button type="button" onClick={() => setEngagement({ type: "postReposts", id: post.id })} className="text-[10px] underline hover:text-white">Reposts</button>
                    <span>·</span>
                    <button type="button" onClick={() => setEngagement({ type: "postViews", id: post.id })} className="text-[10px] underline hover:text-white flex items-center gap-0.5"><Eye size={11} /> Vues</button>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => toggleComments(post.id)}
                  className="flex items-center gap-1 text-xs transition hover:opacity-80"
                  style={{ color: COLORS.muted }}
                >
                  <MessageCircle size={15} />
                  {post.comments_count || 0}
                </button>

                <TranslateButton
                  text={typeof post.text === "string" ? post.text : ""}
                  isTranslated={!!translatedMap[post.id]}
                  preferredLang="fr"
                  onTranslated={(translated) => setTranslatedMap((prev) => ({ ...prev, [post.id]: translated }))}
                  onClear={() => setTranslatedMap((prev) => ({ ...prev, [post.id]: null }))}
                />

                <AskAiButton text={typeof post.text === "string" ? post.text : ""} />

                {post.author_id !== activeUserId && (
                  <TipButton recipientId={post.author_id} postId={post.id} compact />
                )}
              </div>
            </div>

            {/* Section Commentaires */}
            {commentOpen[post.id] && (
              <div className="pt-3 border-t space-y-2" style={{ borderColor: COLORS.border }}>
                {(commentsMap[post.id] || []).map((c) => (
                  <div key={c.id} className="text-xs flex items-start justify-between gap-2" style={{ color: COLORS.muted }}>
                    <div>
                      <span className="font-bold" style={{ color: COLORS.ivory }}>{c.author}</span> : {c.text}
                    </div>
                    {c.author_id === activeUserId && (
                      <button type="button" onClick={() => handleDeleteComment(post.id, c.id)} className="shrink-0 p-1 text-red-400 hover:text-red-300">
                        <Trash2 size={12} />
                      </button>
                    )}
                  </div>
                ))}
                {activeUserId && (
                  <div className="flex gap-2 pt-1">
                    <input
                      value={newCommentText[post.id] || ""}
                      onChange={(e) => setNewCommentText((prev) => ({ ...prev, [post.id]: e.target.value }))}
                      onKeyDown={(e) => e.key === "Enter" && handleAddComment(post.id)}
                      placeholder="Ajouter un commentaire..."
                      className="flex-1 min-w-0 px-3 py-1.5 rounded-lg border text-xs outline-none"
                      style={{ background: COLORS.surface2, borderColor: COLORS.border, color: COLORS.ivory }}
                    />
                    <button type="button" onClick={() => handleAddComment(post.id)} className="p-1.5 rounded-lg" style={{ background: COLORS.gold, color: "#000" }}>
                      <Send size={13} />
                    </button>
                  </div>
                )}
              </div>
            )}
          </article>
        ))}
      </div>

      {/* Bouton charger plus */}
      {hasMore && (
        <div className="text-center pt-2">
          <button
            type="button"
            onClick={loadMorePosts}
            disabled={loadingMore}
            className="px-4 py-2 rounded-xl text-xs font-semibold border transition hover:bg-white/5"
            style={{ borderColor: COLORS.border, color: COLORS.ivory }}
          >
            {loadingMore ? "Chargement..." : "Afficher plus de publications"}
          </button>
        </div>
      )}

      {/* Modale de signalement */}
      {reportPost && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl p-5 border flex flex-col gap-4" style={{ background: COLORS.surface, borderColor: COLORS.border }}>
            <h3 className="font-bold text-sm" style={{ color: COLORS.ivory }}>Signaler cette publication</h3>
            <p className="text-xs" style={{ color: COLORS.muted }}>Choisissez le motif du signalement :</p>
            <div className="flex flex-col gap-2">
              {REPORT_REASONS.map((reason) => (
                <label key={reason} className="flex items-center gap-2 text-xs cursor-pointer" style={{ color: COLORS.ivory }}>
                  <input
                    type="radio"
                    name="reportReason"
                    value={reason}
                    checked={reportReason === reason}
                    onChange={(e) => setReportReason(e.target.value)}
                  />
                  <span>{reason}</span>
                </label>
              ))}
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t" style={{ borderColor: COLORS.border }}>
              <button type="button" onClick={() => setReportPost(null)} className="px-3 py-1.5 rounded-lg text-xs" style={{ color: COLORS.muted }}>
                Annuler
              </button>
              <button type="button" onClick={handleSendReport} className="px-3 py-1.5 rounded-lg text-xs font-bold bg-amber-500 text-black">
                Envoyer le signalement
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Liste des engagements (Likes, Reposts, Vues) */}
      {engagement && (
        <EngagementList
          type={engagement.type}
          targetId={engagement.id}
          ownerId={activeUserId}
          viewerId={activeUserId}
          onClose={() => setEngagement(null)}
        />
      )}
    </div>
  );
}

export default FeedTab;
