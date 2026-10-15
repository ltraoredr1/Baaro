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
  // MainShell envoie `id` et `user_id`
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

  // J'aime, commentaires, traduction
  const [likedPosts, setLikedPosts] = useState({});
  const [commentOpen, setCommentOpen] = useState({});
  const [commentsMap, setCommentsMap] = useState({});
  const [newCommentText, setNewCommentText] = useState({});
  const [translatedMap, setTranslatedMap] = useState({});

  const fileInputRef = useRef(null);
  const cursorRef = useRef(null);
  const sentinelRef = useRef(null);
  const postViewRefs = useRef({});
  const postViewedRef = useRef(new Set());
  const postsRef = useRef([]);

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

  // Texte rédigé par l'IA
  useEffect(() => {
    const apply = (text) => {
      if (!text) return;
      setNewText(text);
      setIsCreateOpen?.(true);
    };
    try {
      const draft = sessionStorage.getItem("baaro:ai_draft");
      if (draft) {
        sessionStorage.removeItem("baaro:ai_draft");
        apply(draft);
      }
    } catch {}
    const onDraft = (e) => {
      try { sessionStorage.removeItem("baaro:ai_draft"); } catch {}
      apply(e.detail?.text);
    };
    window.addEventListener("baaro:ai-draft", onDraft);
    return () => window.removeEventListener("baaro:ai-draft", onDraft);
  }, [setIsCreateOpen]);

  // 1. Chargement du flux
  const loadPosts = useCallback(
    async ({ silent = false } = {}) => {
      if (!silent) setLoading(true);
      cursorRef.current = null;
      try {
        const { rows, nextCursor } = await fetchFeedPage({
          cursor: null,
          pageSize: PAGE_SIZE,
        });
        setPosts(rows.map(formatPost));
        cursorRef.current = nextCursor;
        setHasMore(Boolean(nextCursor));
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

  // 2. Défilement infini
  const loadMorePosts = useCallback(async () => {
    if (loadingMore || !hasMore || loading || !cursorRef.current) return;
    setLoadingMore(true);
    try {
      const { rows, nextCursor } = await fetchFeedPage({
        cursor: cursorRef.current,
        pageSize: PAGE_SIZE,
      });
      const incoming = rows.map(formatPost);
      setPosts((prev) => {
        const seen = new Set(prev.map((p) => p.id));
        return [...prev, ...incoming.filter((p) => !seen.has(p.id))];
      });
      cursorRef.current = nextCursor;
      setHasMore(Boolean(nextCursor));
    } catch (error) {
      handleDbError(error, showToast, "Erreur lors de la récupération de la suite du fil");
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, hasMore, loading, showToast]);

  useEffect(() => {
    loadPosts();
  }, [loadPosts]);

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
  }, [loadMorePosts, posts.length]);

  const refreshTop = useCallback(async () => {
    try {
      const { rows } = await fetchFeedPage({ cursor: null, pageSize: PAGE_SIZE });
      const incoming = rows.map(formatPost);
      setPosts((prev) => {
        const seen = new Set(prev.map((p) => p.id));
        const fresh = incoming.filter((p) => !seen.has(p.id));
        return fresh.length ? [...fresh, ...prev] : prev;
      });
    } catch {
      // Ignorer
    }
  }, []);

  useEffect(() => {
    let timer = null;
    const channel = supabase
      .channel("posts_feed")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "posts" }, () => {
        clearTimeout(timer);
        timer = setTimeout(refreshTop, 600);
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "posts" }, (payload) => {
        const deletedId = payload.old?.id;
        if (deletedId) setPosts((prev) => prev.filter((p) => p.id !== deletedId));
      })
      .subscribe();
    return () => {
      clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [refreshTop]);

  const postIdsKey = posts.map((p) => p.id).join(",");
  useEffect(() => {
    if (!activeUserId || !postIdsKey) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("post_likes")
        .select("post_id")
        .eq("user_id", activeUserId)
        .in("post_id", postIdsKey.split(","));
      if (!cancelled && data) {
        setLikedPosts(Object.fromEntries(data.map((l) => [l.post_id, true])));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeUserId, postIdsKey]);

  useEffect(() => {
    postsRef.current = posts;
  }, [posts]);

  useEffect(() => {
    if (!posts.length || !activeUserId) return;
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting || entry.intersectionRatio < 0.5) return;
          const postId = entry.target.dataset.postId;
          if (!postId || postViewedRef.current.has(postId)) return;
          const post = postsRef.current.find((item) => item.id === postId);
          if (!post || post.author_id === activeUserId) return;

          postViewedRef.current.add(postId);
          supabase.rpc("register_post_view", { p_post_id: postId }).then(({ data, error }) => {
            if (error) {
              postViewedRef.current.delete(postId);
              return;
            }
            const next = Number(data?.views || 0);
            setPosts((prev) =>
              prev.map((item) => (item.id === postId ? { ...item, views_count: next } : item))
            );
          });
        });
      },
      { threshold: [0.5] }
    );
    Object.values(postViewRefs.current).forEach((el) => el && observer.observe(el));
    return () => observer.disconnect();
  }, [posts.length, activeUserId]);

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

  // 3. Publication
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

    const limit = checkRateLimit("create_post", { max: 5, windowMs: 60_000 });
    if (!limit.allowed) {
      showToast(rateLimitMessage(limit.retryAfterSec), "error");
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

      if (hasPoll && newPost) {
        const validOptions = (pollData.options || []).filter((opt) => opt.trim() !== "");
        const { error: pollErr } = await supabase.from("polls").insert([
          {
            post_id: newPost.id,
            question: pollData.question,
            options: validOptions,
          },
        ]);
        if (pollErr) {
          console.warn("Erreur d'enregistrement du sondage:", pollErr.message);
          showToast("Publication envoyée, mais le sondage n'a pas pu être créé", "error");
        }
      }

      setNewText("");
      setMood("");
      setPollData(null);
      setMediaFile(null);
      setMediaPreview(null);
      setTextToolsOpen(false);
      setIsCreateOpen?.(false); // Ferme la modale
      
      onRewardPoints?.(
        mediaUrl ? "publish_post_media" : "publish_post",
        "Publication créée !",
        newPost?.id
      );
      if (showPointsReward) {
        showPointsReward(mediaUrl ? 8 : 5, "Publication créée !");
      } else {
        showToast("Perspective diffusée avec succès sur le réseau mondial !", "success");
      }
      refreshTop();
    } catch (err) {
      handleDbError(err, showToast, "Échec de la publication");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (postId) => {
    setMenuOpenId(null);
    if (!confirm("Supprimer la publication ?")) return;

    const { error } = await supabase.from("posts").delete().eq("id", postId);
    if (error) {
      handleDbError(error, showToast, "Suppression impossible");
      return;
    }
    setPosts((prev) => prev.filter((p) => p.id !== postId));
    showToast("Publication supprimée", "info");
  };

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
      if (wasLiked) {
        const { error } = await supabase
          .from("post_likes")
          .delete()
          .eq("post_id", postId)
          .eq("user_id", activeUserId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("post_likes")
          .insert({ post_id: postId, user_id: activeUserId });
        if (error) throw error;
        onRewardPoints?.("like_post", "J'aime distribué", postId);
        showPointsReward?.(2, "J'aime distribué");
      }
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
    } catch {
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
    const limit = checkRateLimit("comment", { max: 20, windowMs: 60_000 });
    if (!limit.allowed) {
      showToast(rateLimitMessage(limit.retryAfterSec), "error");
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

      onRewardPoints?.("comment", "Commentaire ajouté", created?.id);
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
          p.id === postId
            ? { ...p, comments_count: Math.max(0, (p.comments_count || 1) - 1) }
            : p
        )
      );
      showToast("Commentaire supprimé", "success");
    } catch (error) {
      handleDbError(error, showToast, "Impossible de supprimer le commentaire");
    }
  };

  const startEdit = (post) => {
    setMenuOpenId(null);
    setEditingId(post.id);
    setEditText(typeof post.text === "string" ? post.text : "");
  };

  const handleSaveEdit = async (post) => {
    const text = editText.trim();
    if (!text && !post.media_url) {
      showToast("Le texte ne peut pas être vide", "error");
      return;
    }
    setSavingEdit(true);
    const { error } = await supabase
      .from("posts")
      .update({ text })
      .eq("id", post.id)
      .eq("author_id", activeUserId);
    setSavingEdit(false);
    if (error) {
      handleDbError(error, showToast, "Modification impossible");
      return;
    }
    setPosts((prev) => prev.map((p) => (p.id === post.id ? { ...p, text } : p)));
    setEditingId(null);
    showToast("Publication modifiée", "success");
  };

  const handleReport = async (reason) => {
    const target = reportPost;
    setReportPost(null);
    if (!target || !activeUserId) return;
    const { error } = await supabase.from("reports").insert([
      { reporter_id: activeUserId, post_id: target.id, reason },
    ]);
    if (error) {
      handleDbError(error, showToast, "Signalement impossible");
      return;
    }
    showToast("Merci, le signalement a été envoyé", "success");
  };

  if (loading) {
    return (
      <div className="text-center py-12 text-xs font-medium tracking-widest uppercase opacity-70">
        Synchronisation du flux mondial et des analyses d'impact...
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 max-w-2xl mx-auto w-full pb-20">
      
      {/* 🌟 MODALE DE CRÉATION CORRIGÉE (SANS DOUBLON DE BARRE D'OUTILS) */}
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
            {/* En-tête (Fixe) */}
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

            {/* Corps défilable */}
            <div className="p-4 flex-1 overflow-y-auto flex flex-col gap-3">
              
              {/* Ligne d'outils haut : Bouton Pliable de formatage + Bouton IA */}
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
                            ? `Améliore ce brouillon de publication pour BAARO et rends-le plus engageant :\n"${newText.trim()}"\n\n`
                            : "Rédige une publication engageante pour BAARO sur le thème : ",
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

              {/* Si ouvert, on affiche un seul RichTextComposer dédié aux outils */}
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

              {/* Zone de saisie principale propre (sans la barre d'outils dupliquée en bas) */}
              <div className="relative">
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
              </div>

              {mediaPreview && (
                <div
                  className="relative rounded-xl overflow-hidden max-h-60 border"
                  style={{ borderColor: COLORS.border }}
                >
                  <button
                    type="button"
                    onClick={() => {
                      setMediaFile(null);
                      setMediaPreview(null);
                    }}
                    className="absolute top-2 right-2 z-10 p-1.5 rounded-full bg-black/60 text-white hover:bg-black transition-colors"
                    aria-label="Retirer le média"
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

            {/* Pied de page (Fixe avec le bouton Publier) */}
            <div
              className="flex items-center justify-between border-t p-3 flex-wrap gap-2 shrink-0 bg-inherit"
              style={{ borderColor: COLORS.border }}
            >
              <div className="flex items-center gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,video/*"
                  className="hidden"
                  onChange={handlePickFile}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  title="Joindre un média"
                  className="p-1.5 rounded-lg hover:bg-white/10 transition-colors flex items-center gap-1.5 text-xs font-medium"
                  style={{ color: COLORS.gold }}
                >
                  <ImageIcon size={16} />
                  <span>Média</span>
                </button>
                <select
                  value={mood}
                  onChange={(e) => setMood(e.target.value)}
                  disabled={submitting}
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
                type="button"
                onClick={handlePublish}
                disabled={submitting || (!newText.trim() && !mediaFile && !pollData?.question?.trim())}
                className="px-4 py-1.5 rounded-xl text-xs font-bold transition-all shadow-md flex items-center gap-1.5 disabled:opacity-50"
                style={{ background: COLORS.gold, color: "#000" }}
              >
                {submitting ? "Publication..." : "Publier"} <Send size={13} />
              </button>
            </div>
          </div>
        </div>
      )}

      <GuestBanner
        onUpgrade={() =>
          showToast("Crée un compte depuis Réglages pour gagner des points", "info")
        }
      />

      {activeUserId && <SocialSuggestions user_id={activeUserId} onOpenProfile={onOpenProfile} />}

      {posts.length === 0 && (
        <div className="text-center py-10 text-sm" style={{ color: COLORS.muted }}>
          Aucune publication pour le moment. Sois le premier à partager quelque chose !
        </div>
      )}

      <div className="flex flex-col gap-4">
        {posts.map((post) => (
          <article
            key={post.id}
            data-post-id={post.id}
            ref={(el) => {
              if (el) postViewRefs.current[post.id] = el;
              else delete postViewRefs.current[post.id];
            }}
            className="glass-card rounded-2xl p-5 shadow-xl border flex flex-col gap-3"
            style={{ borderColor: COLORS.border }}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => onOpenProfile?.(post.author_id)}
                  className="w-10 h-10 rounded-full overflow-hidden border flex items-center justify-center font-bold text-sm shrink-0"
                  style={{ borderColor: COLORS.borderGold, background: COLORS.surface }}
                  aria-label={`Profil de ${post.display_name}`}
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
                  <p
                    className="font-bold text-sm flex items-center gap-1"
                    style={{ color: COLORS.ivory }}
                  >
                    {post.display_name} {post.flag}
                  </p>
                  <p className="text-xs" style={{ color: COLORS.muted }}>
                    {post.handle} ·{" "}
                    {new Date(post.created_at).toLocaleDateString("fr-FR", {
                      day: "numeric",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
              </div>

              {activeUserId && (
                <div className="relative" data-post-menu>
                  <button
                    type="button"
                    onClick={() => setMenuOpenId((cur) => (cur === post.id ? null : post.id))}
                    className="p-2 rounded-lg hover:bg-white/5"
                    aria-label="Options de la publication"
                  >
                    <MoreHorizontal size={18} />
                  </button>
                  {menuOpenId === post.id && (
                    <div
                      className="absolute right-0 top-9 z-20 min-w-[170px] rounded-xl border shadow-xl py-1"
                      style={{ background: COLORS.surface, borderColor: COLORS.borderGold }}
                    >
                      {post.author_id === activeUserId ? (
                        <>
                          <button
                            type="button"
                            onClick={() => startEdit(post)}
                            className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-white/5"
                            style={{ color: COLORS.ivory }}
                          >
                            <Pencil size={14} /> Modifier
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(post.id)}
                            className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-white/5 text-red-400"
                          >
                            <Trash2 size={14} /> Supprimer
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setMenuOpenId(null);
                            setReportPost(post);
                          }}
                          className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-white/5 text-red-400"
                        >
                          <Flag size={14} /> Signaler
                        </button>
                      )}
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
                  rows={4}
                  autoFocus
                  className="w-full px-3 py-2 rounded-xl border text-sm outline-none"
                  style={{
                    background: COLORS.surface2,
                    borderColor: COLORS.borderGold,
                    color: COLORS.ivory,
                  }}
                />
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setEditingId(null)}
                    className="px-3 py-1.5 rounded-xl text-xs border"
                    style={{ borderColor: COLORS.border, color: COLORS.muted }}
                  >
                    Annuler
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSaveEdit(post)}
                    disabled={savingEdit}
                    className="px-3 py-1.5 rounded-xl text-xs font-bold disabled:opacity-50"
                    style={{ background: COLORS.gold, color: "#000" }}
                  >
                    {savingEdit ? "Enregistrement..." : "Enregistrer"}
                  </button>
                </div>
              </div>
            ) : (
              <div
                className="text-base sm:text-lg leading-relaxed whitespace-pre-wrap"
                style={{ color: COLORS.ivory }}
              >
                {translatedMap[post.id] ? (
                  translatedMap[post.id]
                ) : (
                  <RichTextRenderer content={post.text} />
                )}
              </div>
            )}
            {translatedMap[post.id] && (
              <p className="text-[10px]" style={{ color: COLORS.muted }}>
                Traduit par BAARO
              </p>
            )}

            {post.media_url && (
              <div
                className="rounded-xl overflow-hidden border bg-black/40 flex items-center justify-center"
                style={{ borderColor: COLORS.border }}
              >
                {post.media_type?.startsWith("video") ? (
                  <video
                    src={post.media_url}
                    controls
                    preload="metadata"
                    className="w-full max-h-[500px] object-contain"
                    onEnded={() => recordFeedEvent(post.id, "complete")}
                  />
                ) : (
                  <img
                    src={post.media_url}
                    alt=""
                    loading="lazy"
                    className="w-full max-h-[500px] object-contain"
                  />
                )}
              </div>
            )}

            <PollCard postId={post.id} user_id={activeUserId} />
            <SocialPostEnhancements post={post} user_id={activeUserId} />

            <div
              className="flex items-center justify-between gap-2 pt-2 border-t flex-wrap"
              style={{ borderColor: COLORS.border }}
            >
              <div
                className="flex items-center gap-3 text-[11px] font-medium flex-wrap"
                style={{ color: COLORS.muted }}
              >
                <span className="flex items-center gap-1">
                  👁️ {Number(post.views_count || 0)} vues certifiées
                </span>
                <span>·</span>
                <button
                  type="button"
                  onClick={() => handleLike(post.id)}
                  className="flex items-center gap-1 transition active:scale-95"
                  style={{ color: likedPosts[post.id] ? "#F43F5E" : COLORS.muted }}
                  aria-label="J'aime"
                  aria-pressed={!!likedPosts[post.id]}
                >
                  <Heart size={15} fill={likedPosts[post.id] ? "currentColor" : "none"} />
                  {Number(post.likes || 0)}
                </button>
                {post.author_id === activeUserId && (
                  <div className="flex items-center gap-2 ml-2">
                    <button
                      type="button"
                      onClick={() => setEngagement({ type: "postLikes", id: post.id })}
                      className="text-[10px] underline hover:text-white transition-colors"
                    >
                      J'aime
                    </button>
                    <span>·</span>
                    <button
                      type="button"
                      onClick={() => setEngagement({ type: "postViews", id: post.id })}
                      className="text-[10px] underline hover:text-white transition-colors inline-flex items-center gap-1"
                      aria-label="Voir les personnes qui ont vu la publication"
                    >
                      <Eye size={12} /> Vues
                    </button>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => toggleComments(post.id)}
                  className="flex items-center gap-1.5 text-xs transition hover:opacity-80"
                  style={{ color: COLORS.muted }}
                  aria-label="Commentaires"
                >
                  <MessageCircle size={16} />
                  {post.comments_count || 0}
                </button>

                <TranslateButton
                  text={typeof post.text === "string" ? post.text : ""}
                  isTranslated={!!translatedMap[post.id]}
                  preferredLang="fr"
                  onTranslated={(translated) =>
                    setTranslatedMap((prev) => ({ ...prev, [post.id]: translated }))
                  }
                  onClear={() => setTranslatedMap((prev) => ({ ...prev, [post.id]: null }))}
                />

                <AskAiButton text={typeof post.text === "string" ? post.text : ""} />

                {post.author_id !== activeUserId && (
                  <TipButton recipientId={post.author_id} postId={post.id} compact />
                )}
              </div>
            </div>

            {commentOpen[post.id] && (
              <div
                className="pt-3 border-t space-y-2"
                style={{ borderColor: COLORS.border }}
              >
                {(commentsMap[post.id] || []).map((c) => (
                  <div
                    key={c.id}
                    className="text-xs flex items-start justify-between gap-2"
                    style={{ color: COLORS.muted }}
                  >
                    <div>
                      <span className="font-bold" style={{ color: COLORS.ivory }}>
                        {c.author}
                      </span>{" "}
                      : {c.text}
                    </div>
                    {c.author_id === activeUserId && (
                      <button
                        type="button"
                        onClick={() => handleDeleteComment(post.id, c.id)}
                        className="shrink-0 p-1 text-red-400/80 hover:text-red-400"
                        aria-label="Supprimer le commentaire"
                      >
                        <Trash2 size={12} />
                      </button>
                    )}
                  </div>
                ))}
                {activeUserId && (
                  <div className="flex gap-2">
                    <input
                      value={newCommentText[post.id] || ""}
                      onChange={(e) =>
                        setNewCommentText((prev) => ({ ...prev, [post.id]: e.target.value }))
                      }
                      onKeyDown={(e) => e.key === "Enter" && handleAddComment(post.id)}
                      placeholder="Ajouter un commentaire..."
                      className="flex-1 min-w-0 px-3 py-2 rounded-lg border text-xs outline-none"
                      style={{
                        background: COLORS.surface2,
                        borderColor: COLORS.border,
                        color: COLORS.ivory,
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => handleAddComment(post.id)}
                      className="p-2 rounded-lg"
                      style={{ background: COLORS.gold, color: "#000" }}
                      aria-label="Envoyer le commentaire"
                    >
                      <Send size={14} />
                    </button>
                  </div>
                )}
              </div>
            )}
          </article>
        ))}

        {hasMore && <div ref={sentinelRef} style={{ height: 1 }} />}
        {loadingMore && (
          <div className="text-center py-3 text-xs opacity-60">Chargement…</div>
        )}
      </div>

      {reportPost && (
        <div
          className="fixed inset-0 z-[1100] flex items-end sm:items-center justify-center bg-black/70 p-3"
          onClick={() => setReportPost(null)}
        >
          <div
            className="w-full max-w-sm rounded-2xl border p-4 flex flex-col gap-2"
            style={{ background: COLORS.surface, borderColor: COLORS.borderGold }}
            onClick={(e) => e.stopPropagation()}
          >
            <p className="font-bold text-sm" style={{ color: COLORS.ivory }}>
              Pourquoi signaler cette publication ?
            </p>
            {REPORT_REASONS.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => handleReport(r)}
                className="w-full text-left px-3 py-2.5 rounded-xl border text-xs hover:bg-white/5"
                style={{ borderColor: COLORS.border, color: COLORS.ivory }}
              >
                {r}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setReportPost(null)}
              className="mt-1 text-xs"
              style={{ color: COLORS.muted }}
            >
              Annuler
            </button>
          </div>
        </div>
      )}

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
