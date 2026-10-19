import { useState, useEffect, useCallback, useRef } from "react";
import {
  X,
  Trash2,
  Image as ImageIcon,
  Send,
  Sparkles,
  Heart,
  MessageCircle,
  Eye,
  Repeat2,
  ChevronDown,
  ChevronUp,
  Mic,
  Square,
} from "lucide-react";

// Imports via l'alias absolu (@/ -> src/)
import { COLORS } from "@/theme.js";
import { useToast } from "@/components/ToastContext.jsx";
import { supabase } from "@/supabaseClient.js";
import { handleDbError } from "@/lib/dbErrors.js";
import { fetchFeedPage } from "@/lib/feedPagination.js";
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
const MAX_REC_SECONDS = 300; // 5 min max pour un vocal

const VIDEO_EXT = /\.(mp4|webm|mov|m4v|ogv)(\?.*)?$/i;
const AUDIO_EXT = /\.(mp3|m4a|aac|wav|ogg|oga|opus|weba)(\?.*)?$/i;

function isAudioPost(post) {
  return post.media_type === "audio" || AUDIO_EXT.test(post.media_url || "");
}

function isVideoPost(post) {
  return post.media_type === "video" || VIDEO_EXT.test(post.media_url || "");
}

function formatDuration(totalSeconds) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

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
  const [refreshing, setRefreshing] = useState(false);

  // Saisie enrichie, sondages & médias
  const [newText, setNewText] = useState("");
  const [pollData, setPollData] = useState(null);
  const [mood, setMood] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [mediaFile, setMediaFile] = useState(null);
  const [mediaPreview, setMediaPreview] = useState(null);
  const [textToolsOpen, setTextToolsOpen] = useState(false);

  // Enregistrement vocal
  const [recording, setRecording] = useState(false);
  const [recSeconds, setRecSeconds] = useState(0);

  // Session & modales
  const [currentUserId, setCurrentUserId] = useState(propUserId);
  const [menuOpenId, setMenuOpenId] = useState(null);
  const [engagement, setEngagement] = useState(null);

  // J'aime, Reposts, commentaires, traduction
  const [likedPosts, setLikedPosts] = useState({});
  const [repostedPosts, setRepostedPosts] = useState({});
  const [commentOpen, setCommentOpen] = useState({});
  const [commentsMap, setCommentsMap] = useState({});
  const [newCommentText, setNewCommentText] = useState({});
  const [translatedMap, setTranslatedMap] = useState({});

  const fileInputRef = useRef(null);
  const cursorRef = useRef(null);
  const sentinelRef = useRef(null);

  const recorderRef = useRef(null);
  const recStreamRef = useRef(null);
  const recChunksRef = useRef([]);
  const recTimerRef = useRef(null);
  const recCancelRef = useRef(false);

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

  // Chargement des likes et des reposts de l'utilisateur (par lots de 50)
  const postIdsKey = posts.map((p) => p.id).join(",");
  useEffect(() => {
    if (!activeUserId || !postIdsKey) return;
    let cancelled = false;

    (async () => {
      const postIds = postIdsKey.split(",");
      const likedAcc = {};
      const repostedAcc = {};

      for (let i = 0; i < postIds.length; i += 50) {
        const chunk = postIds.slice(i, i + 50);
        const [{ data: likes }, { data: reposts }] = await Promise.all([
          supabase.from("post_likes").select("post_id").eq("user_id", activeUserId).in("post_id", chunk),
          supabase.from("post_reposts").select("post_id").eq("user_id", activeUserId).in("post_id", chunk),
        ]);
        (likes || []).forEach((l) => { likedAcc[l.post_id] = true; });
        (reposts || []).forEach((r) => { repostedAcc[r.post_id] = true; });
      }

      if (!cancelled) {
        setLikedPosts(likedAcc);
        setRepostedPosts(repostedAcc);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activeUserId, postIdsKey]);

  // Chargement du flux (première page)
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

  useEffect(() => {
    loadPosts();
  }, [loadPosts]);

  // Page suivante
  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore || !cursorRef.current) return;
    setLoadingMore(true);
    try {
      const { rows, nextCursor } = await fetchFeedPage({
        cursor: cursorRef.current,
        pageSize: PAGE_SIZE,
      });
      setPosts((prev) => {
        const seen = new Set(prev.map((p) => p.id));
        return [...prev, ...rows.map(formatPost).filter((p) => !seen.has(p.id))];
      });
      cursorRef.current = nextCursor;
      setHasMore(Boolean(nextCursor));
    } catch (error) {
      handleDbError(error, showToast, "Impossible de charger la suite");
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, hasMore, showToast]);

  // Défilement infini : charge dès qu'on approche du bas du fil
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasMore) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) loadMore();
      },
      { rootMargin: "400px" }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [hasMore, loadMore, posts.length]);

  // Actualiser depuis le début
  const refresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    await loadPosts({ silent: true });
    setRefreshing(false);
  };

  // ===== Enregistrement vocal =====
  const stopStream = () => {
    recStreamRef.current?.getTracks().forEach((t) => t.stop());
    recStreamRef.current = null;
  };

  const stopRecording = useCallback(() => {
    if (recTimerRef.current) {
      clearInterval(recTimerRef.current);
      recTimerRef.current = null;
    }
    const rec = recorderRef.current;
    recorderRef.current = null;
    if (rec && rec.state === "recording") rec.stop();
    else stopStream();
    setRecording(false);
  }, []);

  const startRecording = async () => {
    if (recording || submitting) return;
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      showToast("Enregistrement vocal non supporté sur cet appareil", "error");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      recStreamRef.current = stream;

      // mp4/m4a se lit partout (iPhone compris), webm en repli
      const mime =
        ["audio/mp4", "audio/webm;codecs=opus", "audio/webm"].find((t) =>
          MediaRecorder.isTypeSupported?.(t)
        ) || "";
      const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      recChunksRef.current = [];
      recCancelRef.current = false;

      recorder.ondataavailable = (e) => {
        if (e.data?.size) recChunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        stopStream();
        if (recCancelRef.current) {
          recCancelRef.current = false;
          return;
        }
        const type = (recorder.mimeType || mime || "audio/webm").split(";")[0];
        const ext = type.includes("mp4") ? "m4a" : type.includes("ogg") ? "ogg" : "webm";
        const blob = new Blob(recChunksRef.current, { type });
        if (!blob.size) return;
        if (blob.size > MAX_MEDIA_BYTES) {
          showToast("Vocal trop lourd (50 Mo maximum)", "error");
          return;
        }
        setMediaFile(new File([blob], `vocal-${Date.now()}.${ext}`, { type }));
        setMediaPreview(URL.createObjectURL(blob));
      };

      recorder.start();
      recorderRef.current = recorder;
      setRecSeconds(0);
      setRecording(true);
      recTimerRef.current = setInterval(() => setRecSeconds((s) => s + 1), 1000);
    } catch {
      stopStream();
      showToast("Micro inaccessible : autorise l'accès au micro", "error");
    }
  };

  // Arrêt automatique à la durée maximale
  useEffect(() => {
    if (recording && recSeconds >= MAX_REC_SECONDS) stopRecording();
  }, [recording, recSeconds, stopRecording]);

  // Si la fenêtre de création se ferme pendant l'enregistrement : on annule
  useEffect(() => {
    if (!isCreateOpen && recording) {
      recCancelRef.current = true;
      stopRecording();
    }
  }, [isCreateOpen, recording, stopRecording]);

  // Nettoyage au démontage
  useEffect(() => {
    return () => {
      recCancelRef.current = true;
      if (recTimerRef.current) clearInterval(recTimerRef.current);
      const rec = recorderRef.current;
      if (rec && rec.state === "recording") rec.stop();
      recStreamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  // Action Reposter avec notification au créateur
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

  const clearMedia = () => {
    setMediaFile(null);
    setMediaPreview(null);
  };

  const handlePublish = async () => {
    const hasText = Boolean(newText.trim());
    const hasMedia = Boolean(mediaFile);
    const hasPoll = Boolean(pollData?.question?.trim());

    if (!hasText && !hasMedia && !hasPoll) return;
    if (submitting || recording) return;

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
        mediaType = mediaFile.type.startsWith("video")
          ? "video"
          : mediaFile.type.startsWith("audio")
            ? "audio"
            : "image";
      }

      const { error: postErr } = await supabase
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
      clearMedia();
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

  const isAudioPreview = mediaFile?.type?.startsWith("audio");
  const isVideoPreview = mediaFile?.type?.startsWith("video");

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

              {/* Indicateur d'enregistrement vocal */}
              {recording && (
                <div
                  className="flex items-center justify-between gap-3 p-3 rounded-xl border"
                  style={{ background: COLORS.surface2, borderColor: "#ef4444" }}
                >
                  <div className="flex items-center gap-2 text-xs font-bold" style={{ color: "#ef4444" }}>
                    <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
                    Enregistrement… {formatDuration(recSeconds)} / {formatDuration(MAX_REC_SECONDS)}
                  </div>
                  <button
                    type="button"
                    onClick={stopRecording}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5"
                    style={{ background: "#ef4444", color: "#fff" }}
                  >
                    <Square size={12} fill="currentColor" /> Arrêter
                  </button>
                </div>
              )}

              {/* Aperçu du média (image, vidéo ou audio) */}
              {mediaPreview && !recording && (
                isAudioPreview ? (
                  <div
                    className="relative rounded-xl border p-3 pr-10"
                    style={{ borderColor: COLORS.border, background: COLORS.surface2 }}
                  >
                    <button
                      type="button"
                      onClick={clearMedia}
                      className="absolute top-2 right-2 z-10 p-1.5 rounded-full bg-black/60 text-white"
                    >
                      <X size={14} />
                    </button>
                    <audio src={mediaPreview} controls preload="metadata" className="w-full" />
                  </div>
                ) : (
                  <div className="relative rounded-xl overflow-hidden max-h-60 border" style={{ borderColor: COLORS.border }}>
                    <button
                      type="button"
                      onClick={clearMedia}
                      className="absolute top-2 right-2 z-10 p-1.5 rounded-full bg-black/60 text-white"
                    >
                      <X size={14} />
                    </button>
                    {isVideoPreview ? (
                      <video src={mediaPreview} controls playsInline className="w-full h-full object-cover" />
                    ) : (
                      <img src={mediaPreview} alt="Aperçu" className="w-full h-full object-cover" />
                    )}
                  </div>
                )
              )}
            </div>

            <div className="flex items-center justify-between border-t p-3 flex-wrap gap-2 shrink-0 bg-inherit" style={{ borderColor: COLORS.border }}>
              <div className="flex items-center gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,video/*,audio/*"
                  className="hidden"
                  onChange={handlePickFile}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={recording}
                  className="p-1.5 rounded-lg hover:bg-white/10 flex items-center gap-1.5 text-xs font-medium disabled:opacity-40"
                  style={{ color: COLORS.gold }}
                >
                  <ImageIcon size={16} />
                  <span>Média</span>
                </button>
                <button
                  type="button"
                  onClick={recording ? stopRecording : startRecording}
                  disabled={submitting}
                  className="p-1.5 rounded-lg hover:bg-white/10 flex items-center gap-1.5 text-xs font-medium disabled:opacity-40"
                  style={{ color: recording ? "#ef4444" : COLORS.gold }}
                >
                  {recording ? <Square size={16} fill="currentColor" /> : <Mic size={16} />}
                  <span>{recording ? "Arrêter" : "Vocal"}</span>
                </button>
              </div>

              <button
                type="button"
                onClick={handlePublish}
                disabled={submitting || recording || (!newText.trim() && !mediaFile && !pollData?.question?.trim())}
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

      {/* Bouton d'actualisation */}
      <button
        type="button"
        onClick={refresh}
        disabled={refreshing}
        className="self-center px-4 py-1.5 rounded-full text-xs font-bold border disabled:opacity-50"
        style={{ borderColor: COLORS.border, color: COLORS.gold }}
      >
        {refreshing ? "Actualisation..." : "↻ Actualiser"}
      </button>

      {/* Liste des publications */}
      <div className="flex flex-col gap-4">
        {posts.map((post) => (
          <article
            key={post.id}
            data-post-id={post.id}
            className="glass-card rounded-2xl p-5 shadow-xl border flex flex-col gap-3"
            style={{ borderColor: COLORS.border }}
          >
            {/* En-tête de la publication : Photo, Nom, Pseudo & DATE / HEURE */}
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
            </div>

            <div className="text-base leading-relaxed whitespace-pre-wrap" style={{ color: COLORS.ivory }}>
              {translatedMap[post.id] ? translatedMap[post.id] : <RichTextRenderer content={post.text} />}
            </div>
            {translatedMap[post.id] && (
              <p className="text-[10px]" style={{ color: COLORS.muted }}>Traduit par BAARO</p>
            )}

            {/* Média : audio, vidéo ou image */}
            {post.media_url && (
              isAudioPost(post) ? (
                <div
                  className="rounded-xl border p-3"
                  style={{ borderColor: COLORS.border, background: COLORS.surface2 }}
                >
                  <audio src={post.media_url} controls preload="metadata" className="w-full" />
                </div>
              ) : (
                <div className="rounded-xl overflow-hidden border bg-black/40 flex items-center justify-center">
                  {isVideoPost(post) ? (
                    <video
                      src={`${post.media_url}#t=0.1`}
                      controls
                      playsInline
                      preload="metadata"
                      className="w-full max-h-[500px] object-contain"
                    />
                  ) : (
                    <img src={post.media_url} alt="" className="w-full max-h-[500px] object-contain" />
                  )}
                </div>
              )
            )}

            <PollCard postId={post.id} user_id={activeUserId} />
            <SocialPostEnhancements post={post} user_id={activeUserId} />

            {/* Barre d'actions (Likes, Reposts, Commentaires, Traduction, IA, Tip) */}
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

            {/* Commentaires */}
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

      {/* Chargement automatique de la suite du fil */}
      {hasMore && (
        <div ref={sentinelRef} className="py-4 text-center text-xs" style={{ color: COLORS.muted }}>
          {loadingMore ? "Chargement..." : ""}
        </div>
      )}
      {!hasMore && posts.length > 0 && (
        <p className="text-center text-xs py-4" style={{ color: COLORS.muted }}>
          Vous avez tout vu
        </p>
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
