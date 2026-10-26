import { useState, useEffect, useLayoutEffect, useCallback, useMemo, useRef } from "react";
import {
  X,
  Trash2,
  MoreHorizontal,
  Image as ImageIcon,
  Send,
  Sparkles,
  Pencil,
  Flag,
  MessageCircle,
  Eye,
  Repeat2,
  ChevronDown,
  ChevronUp,
  Mic,
  Square,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

import { COLORS } from "@/theme.js";
import { useToast } from "@/components/ToastContext.jsx";
import { supabase } from "@/supabaseClient.js";
import { handleDbError } from "@/lib/dbErrors.js";
import { uploadExternalMedia } from "@/lib/externalMedia.js";
import { insertStory } from "@/features/stories/api/storiesApi.js";
import { callSocial } from "@/lib/notifyInteraction.js";
import { FEED_REFRESH_EVENT } from "@/lib/feedTabRefresh.jsx";
import { useCursorFeed } from "@/hooks/useCursorFeed.js";

import { PollCard, SocialPostEnhancements, SocialSuggestions } from "./SocialEnhancements.jsx";
import RichTextComposer from "@/components/RichTextComposer.jsx";
import { RichTextRenderer } from "@/components/RichTextRenderer.jsx";
import { EngagementList } from "@/components/EngagementList.jsx";
import { TipButton } from "@/components/TipButton.jsx";
import { AskAiButton } from "@/components/AskAiButton.jsx";
import { TranslateButton } from "@/components/TranslateButton.jsx";
import { GuestBanner } from "@/components/GuestBanner.jsx";
import { FloatingCreateButton } from "@/components/FloatingCreateButton.jsx";
import { LazyImage, LazyVideo } from "@/components/LazyMedia.jsx";

const MAX_MEDIA_BYTES = 50 * 1024 * 1024;
const MAX_MEDIA_COUNT = 10;
const STORY_DURATION_MS = 24 * 60 * 60 * 1000;

const VOICE_PREFIX = "[vocal]";
const EMPTY_REC = { postId: null, recording: false, blob: null, url: null };

function pickCommentRecorderMime() {
  if (typeof MediaRecorder === "undefined") return "";
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/ogg;codecs=opus",
  ];
  return candidates.find((type) => MediaRecorder.isTypeSupported?.(type)) || "";
}

const FEED_TABS = [
  ["foryou", "Pour toi"],
  ["following", "Abonnés"],
];

const REPORT_REASONS = [
  "Spam ou arnaque",
  "Harcèlement ou haine",
  "Contenu inapproprié",
  "Fausse information",
  "Autre",
];

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

function detectKind(url, type) {
  if (type === "video" || type === "audio" || type === "image") return type;
  if (/\.(mp4|mov)$/i.test(url || "")) return "video";
  if (/\.(mp3|wav|m4a)$/i.test(url || "")) return "audio";
  return "image";
}

function getPostMedia(post) {
  if (Array.isArray(post.media_urls) && post.media_urls.length > 0) {
    return post.media_urls
      .filter((m) => m?.url)
      .map((m) => ({ url: m.url, type: detectKind(m.url, m.type) }));
  }
  if (post.media_url) {
    return [{ url: post.media_url, type: detectKind(post.media_url, post.media_type) }];
  }
  return [];
}

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
    media_urls: post.media_urls,
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

function parseComment(text) {
  const raw = typeof text === "string" ? text : "";
  if (!raw.startsWith(VOICE_PREFIX)) return { voiceUrl: null, caption: raw };
  const [voiceUrl, ...rest] = raw.slice(VOICE_PREFIX.length).split("\n");
  return { voiceUrl, caption: rest.join("\n").trim() };
}

/** Notification d'interaction (commentaire, etc.) via /api/social */
async function notifyPost(post, userId, interactionType) {
  if (!post?.id || !post?.author_id || !userId || post.author_id === userId) return;
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.access_token) return;

    await fetch("/api/social", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        action: "notify_interaction",
        content_type: "post",
        interaction_type: interactionType,
        target_id: post.id,
        recipient_id: post.author_id,
      }),
    });
  } catch (err) {
    console.warn("[post-notification]", err);
  }
}

/** Crée le sondage (tables polls + poll_options) rattaché à un post */
async function createPollForPost(postId, question, options) {
  const { data: poll, error: pollErr } = await supabase
    .from("polls")
    .insert({ post_id: postId, question })
    .select("id")
    .single();
  if (pollErr) throw pollErr;

  const rows = options.map((text, i) => ({
    poll_id: poll.id,
    option_text: text,
    position: i,
  }));

  const { error: optErr } = await supabase.from("poll_options").insert(rows);
  if (optErr) {
    await supabase.from("polls").delete().eq("id", poll.id);
    throw optErr;
  }
}

/** Viewer plein écran un-à-un (swipe + flèches) */
function MediaViewer({ items, startIndex = 0, onClose }) {
  const [index, setIndex] = useState(startIndex);
  const touchStartX = useRef(null);
  const current = items[index];

  const goPrev = useCallback(() => {
    setIndex((i) => (i > 0 ? i - 1 : items.length - 1));
  }, [items.length]);

  const goNext = useCallback(() => {
    setIndex((i) => (i < items.length - 1 ? i + 1 : 0));
  }, [items.length]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") goPrev();
      if (e.key === "ArrowRight") goNext();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, goPrev, goNext]);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  const onTouchStart = (e) => {
    touchStartX.current = e.touches[0].clientX;
  };

  const onTouchEnd = (e) => {
    if (touchStartX.current == null) return;
    const delta = e.changedTouches[0].clientX - touchStartX.current;
    if (Math.abs(delta) > 50) {
      if (delta > 0) goPrev();
      else goNext();
    }
    touchStartX.current = null;
  };

  if (!current) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-black/95 flex flex-col" onClick={onClose}>
      <div className="flex items-center justify-between p-3 shrink-0" onClick={(e) => e.stopPropagation()}>
        <span className="text-white/80 text-sm font-medium">
          {index + 1} / {items.length}
        </span>
        <button
          type="button"
          onClick={onClose}
          className="p-2 rounded-full bg-white/10 text-white hover:bg-white/20"
          aria-label="Fermer"
        >
          <X size={22} />
        </button>
      </div>

      <div
        className="flex-1 relative flex items-center justify-center min-h-0"
        onClick={(e) => e.stopPropagation()}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        {current.type === "video" ? (
          <video
            key={current.url}
            src={current.url}
            controls
            autoPlay
            playsInline
            className="max-w-full max-h-full object-contain"
          />
        ) : (
          <img
            key={current.url}
            src={current.url}
            alt=""
            className="max-w-full max-h-full object-contain select-none"
            draggable={false}
          />
        )}

        {items.length > 1 && (
          <>
            <button
              type="button"
              onClick={goPrev}
              className="absolute left-2 top-1/2 -translate-y-1/2 p-2.5 rounded-full bg-black/50 text-white hover:bg-black/70 active:scale-95"
              aria-label="Précédent"
            >
              <ChevronLeft size={28} />
            </button>
            <button
              type="button"
              onClick={goNext}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-2.5 rounded-full bg-black/50 text-white hover:bg-black/70 active:scale-95"
              aria-label="Suivant"
            >
              <ChevronRight size={28} />
            </button>
          </>
        )}
      </div>

      {items.length > 1 && (
        <div className="flex justify-center gap-1.5 py-3 shrink-0" onClick={(e) => e.stopPropagation()}>
          {items.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setIndex(i)}
              className={`w-2 h-2 rounded-full transition-colors ${
                i === index ? "bg-white" : "bg-white/30"
              }`}
              aria-label={`Image ${i + 1}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/** Galerie (carrousel à swipe pour plusieurs médias) + viewer plein écran */
function MediaGallery({ items }) {
  const [viewerIndex, setViewerIndex] = useState(null);
  const [slide, setSlide] = useState(0);

  if (!items.length) return null;

  const visuals = items.filter((m) => m.type !== "audio");
  const audios = items.filter((m) => m.type === "audio");

  const openViewer = (idx) => setViewerIndex(idx);

  const renderVisual = (m, single, idx) => {
    const cls = single
      ? "w-full max-h-[70vh] cursor-pointer"
      : "absolute inset-0 w-full h-full cursor-pointer";

    return m.type === "video" ? (
      <LazyVideo
        src={m.url}
        fit={single ? "contain" : "cover"}
        className={`${cls} bg-black`}
        onClick={() => openViewer(idx)}
      />
    ) : (
      <LazyImage
        src={m.url}
        variant={single ? "full" : "feed"}
        fit={single ? "contain" : "cover"}
        className={cls}
        onClick={() => openViewer(idx)}
      />
    );
  };

  return (
    <>
      <div className="flex flex-col gap-2">
        {visuals.length === 1 && (
          <div className="rounded-xl overflow-hidden border bg-black/40">
            {renderVisual(visuals[0], true, 0)}
          </div>
        )}

        {visuals.length > 1 && (
          <div className="relative rounded-xl overflow-hidden border bg-black/40">
            <div
              className="flex overflow-x-auto snap-x snap-mandatory [scrollbar-width:none]"
              onScroll={(e) =>
                setSlide(
                  Math.round(e.currentTarget.scrollLeft / e.currentTarget.clientWidth)
                )
              }
            >
              {visuals.map((m, i) => (
                <div
                  key={`${m.url}-${i}`}
                  className="relative snap-center shrink-0 w-full aspect-[4/5] max-h-[70vh] bg-black"
                >
                  {renderVisual(m, false, i)}
                </div>
              ))}
            </div>
            <span className="absolute top-2 right-2 px-2 py-0.5 rounded-full bg-black/60 text-white text-[11px]">
              {Math.min(slide + 1, visuals.length)}/{visuals.length}
            </span>
          </div>
        )}

        {audios.map((m, i) => (
          <div
            key={`${m.url}-${i}`}
            className="w-full p-4 flex items-center gap-3 bg-slate-900/50 rounded-xl"
          >
            <div className="p-2 rounded-full bg-teal-500/20 text-teal-400 shrink-0">
              <Mic size={20} />
            </div>
            <audio src={m.url} controls className="flex-1 h-8" />
          </div>
        ))}
      </div>

      {viewerIndex !== null && (
        <MediaViewer
          items={visuals}
          startIndex={viewerIndex}
          onClose={() => setViewerIndex(null)}
        />
      )}
    </>
  );
}

const COLLAPSED_HEIGHT = 150; // ≈ 6 lignes

/** Texte d'une publication : « Voir plus » si long, mis en valeur si court, #/@ cliquables */
function PostText({ text, translated, hasMedia, onHashtagClick, onMentionClick }) {
  const [expanded, setExpanded] = useState(false);
  const [overflowing, setOverflowing] = useState(false);
  const boxRef = useRef(null);

  const plain = typeof text === "string" ? text.trim() : "";
  const isStatement =
    !hasMedia &&
    !translated &&
    plain.length > 0 &&
    plain.length <= 140 &&
    !plain.includes("\n");

  const textClass = isStatement
    ? "text-xl font-semibold leading-snug tracking-tight"
    : "text-[15px] leading-[1.65]";

  useLayoutEffect(() => {
    const el = boxRef.current;
    if (!el || expanded) return undefined;

    const measure = () => setOverflowing(el.scrollHeight > el.clientHeight + 1);
    measure();

    if (typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [text, translated, expanded]);

  const collapsed = !expanded && overflowing;

  return (
    <div
      className={`text-pretty ${isStatement ? "border-l-2 pl-3" : ""}`}
      style={isStatement ? { borderColor: COLORS.gold } : undefined}
    >
      <div
        ref={boxRef}
        className="overflow-hidden"
        style={{
          maxHeight: expanded ? "none" : COLLAPSED_HEIGHT,
          ...(collapsed
            ? {
                WebkitMaskImage:
                  "linear-gradient(to bottom, #000 70%, transparent 100%)",
                maskImage: "linear-gradient(to bottom, #000 70%, transparent 100%)",
              }
            : null),
        }}
      >
        {translated ? (
          <p
            className={`whitespace-pre-wrap break-words [overflow-wrap:anywhere] ${textClass}`}
            style={{ color: COLORS.ivory }}
          >
            {translated}
          </p>
        ) : (
          <RichTextRenderer
            content={text}
            className={textClass}
            onHashtagClick={onHashtagClick}
            onMentionClick={onMentionClick}
          />
        )}
      </div>

      {(overflowing || expanded) && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-1.5 text-xs font-semibold active:opacity-70"
          style={{ color: COLORS.gold }}
        >
          {expanded ? "Voir moins" : "Voir plus"}
        </button>
      )}
    </div>
  );
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

  const {
    posts: rawPosts,
    setPosts,
    hasMore,
    loading,
    loadingMore,
    reload,
    loadMore,
  } = useCursorFeed({
    onError: (error) => handleDbError(error, showToast, "Erreur lors du chargement du fil"),
  });

  const posts = useMemo(() => rawPosts.map(formatPost), [rawPosts]);
  const loadPosts = useCallback((opts) => reload(opts), [reload]);

  const [newText, setNewText] = useState("");
  const [pollData, setPollData] = useState(null);
  const [mood, setMood] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [mediaItems, setMediaItems] = useState([]);
  const [textToolsOpen, setTextToolsOpen] = useState(false);
  const [alsoStory, setAlsoStory] = useState(false);

  const [isRecording, setIsRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState(null);
  const [audioPreviewUrl, setAudioPreviewUrl] = useState(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);

  const [commentRec, setCommentRec] = useState(EMPTY_REC);
  const [sendingComment, setSendingComment] = useState(false);
  const commentRecorderRef = useRef(null);
  const commentStreamRef = useRef(null);
  const commentChunksRef = useRef([]);

  const [currentUserId, setCurrentUserId] = useState(propUserId);
  const [menuOpenId, setMenuOpenId] = useState(null);
  const [engagement, setEngagement] = useState(null);

  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [reportPost, setReportPost] = useState(null);
  const [reportReason, setReportReason] = useState(REPORT_REASONS[0]);

  const [repostedPosts, setRepostedPosts] = useState({});
  const [commentOpen, setCommentOpen] = useState({});
  const [commentsMap, setCommentsMap] = useState({});
  const [newCommentText, setNewCommentText] = useState({});
  const [translatedMap, setTranslatedMap] = useState({});

  const [viewCounts, setViewCounts] = useState({});

  const fileInputRef = useRef(null);
  const mediaItemsRef = useRef([]);
  const seenRef = useRef(new Set());
  const sentinelRef = useRef(null);
  const autoLoadsRef = useRef(0);

  const activeUserId = currentUserId || propUserId || null;

  /* ---------- Onglets « Pour toi / Abonnés » ---------- */
  const [feedTab, setFeedTab] = useState("foryou");
  const [followingIds, setFollowingIds] = useState(null);

  useEffect(() => {
    if (!activeUserId) {
      setFollowingIds(new Set());
      return;
    }
    let cancelled = false;
    supabase
      .from("follows")
      .select("followed_id,status")
      .eq("follower_id", activeUserId)
      .then(({ data, error }) => {
        if (cancelled || error) return;
        setFollowingIds(
          new Set(
            (data || [])
              .filter((r) => !r.status || r.status === "accepted")
              .map((r) => r.followed_id)
          )
        );
      });
    return () => {
      cancelled = true;
    };
  }, [activeUserId, feedTab]);

  const handleFollowChange = useCallback((authorId, isFollowing) => {
    if (!authorId) return;

    setFollowingIds((current) => {
      const next = new Set(current || []);
      if (isFollowing) next.add(authorId);
      else next.delete(authorId);
      return next;
    });
  }, []);

  const [tagFilter, setTagFilter] = useState(null);

  const visiblePosts = useMemo(() => {
    let list = posts;

    if (feedTab === "following") {
      if (!followingIds) return [];
      list = list.filter(
        (p) => p.author_id === activeUserId || followingIds.has(p.author_id)
      );
    }

    if (tagFilter) {
      const re = new RegExp(
        `(^|[^\\p{L}\\p{N}_])#${tagFilter}(?![\\p{L}\\p{N}_])`,
        "iu"
      );
      list = list.filter((p) => typeof p.text === "string" && re.test(p.text));
    }

    return list;
  }, [feedTab, posts, followingIds, activeUserId, tagFilter]);

  const handleHashtagClick = useCallback((tag) => {
    if (!/^[\p{L}_][\p{L}\p{N}_]*$/u.test(tag || "")) return;
    autoLoadsRef.current = 0;
    setTagFilter(tag);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const handleMentionClick = useCallback(
    async (name) => {
      const clean = String(name || "").replace(/^@/, "");
      if (!clean) return;
      try {
        const lower = clean.toLowerCase();
        const variants = [...new Set([clean, `@${clean}`, lower, `@${lower}`])];
        const { data, error } = await supabase
          .from("profiles")
          .select("id")
          .in("handle", variants)
          .limit(1);
        if (error) throw error;
        if (data?.[0]?.id) onOpenProfile?.(data[0].id);
        else showToast(`Profil @${clean} introuvable`, "info");
      } catch (err) {
        handleDbError(err, showToast, "Impossible d'ouvrir ce profil");
      }
    },
    [onOpenProfile, showToast]
  );

  const visibleKey = visiblePosts.map((p) => p.id).join(",");

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

  useEffect(() => {
    mediaItemsRef.current = mediaItems;
  }, [mediaItems]);

  useEffect(() => {
    return () => {
      mediaItemsRef.current.forEach((m) => URL.revokeObjectURL(m.preview));
    };
  }, []);

  useEffect(() => {
    return () => {
      if (audioPreviewUrl) URL.revokeObjectURL(audioPreviewUrl);
    };
  }, [audioPreviewUrl]);

  useEffect(() => {
    return () => {
      try {
        if (
          commentRecorderRef.current &&
          commentRecorderRef.current.state !== "inactive"
        ) {
          commentRecorderRef.current.stop();
        }
      } catch {
        // Le composant peut être démonté pendant l'arrêt du MediaRecorder.
      }
      commentStreamRef.current?.getTracks().forEach((track) => track.stop());
      if (commentRec.url) URL.revokeObjectURL(commentRec.url);
    };
  }, [commentRec.url]);

  useEffect(() => {
    if (!isCreateOpen) {
      setAudioBlob(null);
      setAudioPreviewUrl(null);
      setIsRecording(false);
    }
  }, [isCreateOpen]);

  useEffect(() => {
    if (!menuOpenId) return;
    const close = (e) => {
      if (!e.target.closest?.("[data-post-menu]")) setMenuOpenId(null);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [menuOpenId]);

  const postIdsKey = posts.map((p) => p.id).join(",");
  useEffect(() => {
    if (!activeUserId || !postIdsKey) return;
    let cancelled = false;
    (async () => {
      const postIds = postIdsKey.split(",");
      const { data: reposts } = await supabase
        .from("post_reposts")
        .select("post_id")
        .eq("user_id", activeUserId)
        .in("post_id", postIds);
      if (!cancelled && reposts) {
        setRepostedPosts(Object.fromEntries(reposts.map((r) => [r.post_id, true])));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeUserId, postIdsKey]);

  useEffect(() => {
    loadPosts();
  }, [loadPosts]);

  useEffect(() => {
    const onRefresh = () => {
      window.scrollTo({ top: 0, behavior: "smooth" });
      loadPosts({ silent: true });
    };
    window.addEventListener(FEED_REFRESH_EVENT, onRefresh);
    return () => window.removeEventListener(FEED_REFRESH_EVENT, onRefresh);
  }, [loadPosts]);

  /* ---------- Enregistrement des vues (table post_views) ---------- */
  useEffect(() => {
    if (!activeUserId || !visibleKey || typeof IntersectionObserver === "undefined") {
      return undefined;
    }
    const timers = new Map();
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const { postId, authorId } = entry.target.dataset;
          if (!postId || authorId === activeUserId || seenRef.current.has(postId)) return;

          if (entry.isIntersecting) {
            timers.set(
              postId,
              setTimeout(() => {
                seenRef.current.add(postId);
                supabase
                  .from("post_views")
                  .upsert(
                    { post_id: postId, viewer_id: activeUserId },
                    { onConflict: "post_id,viewer_id,view_date", ignoreDuplicates: true }
                  )
                  .then(() => {});
              }, 1500)
            );
          } else {
            clearTimeout(timers.get(postId));
            timers.delete(postId);
          }
        });
      },
      { threshold: 0.6 }
    );
    document.querySelectorAll("[data-post-id]").forEach((el) => io.observe(el));
    return () => {
      timers.forEach(clearTimeout);
      io.disconnect();
    };
  }, [activeUserId, visibleKey]);

  /* ---------- Compteur de vues de mes publications ---------- */
  useEffect(() => {
    if (!activeUserId || !postIdsKey) return undefined;
    const mine = posts.filter((p) => p.author_id === activeUserId).map((p) => p.id);
    if (!mine.length) return undefined;
    let cancelled = false;
    supabase
      .from("post_views")
      .select("post_id")
      .in("post_id", mine)
      .then(({ data }) => {
        if (cancelled || !data) return;
        const counts = {};
        data.forEach((r) => {
          counts[r.post_id] = (counts[r.post_id] || 0) + 1;
        });
        setViewCounts(counts);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeUserId, postIdsKey]);

  /* ---------- Défilement infini ---------- */
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasMore || typeof IntersectionObserver === "undefined") return undefined;

    const io = new IntersectionObserver(
      (entries) => {
        if (!entries[0].isIntersecting || loadingMore) return;

        const filtered = feedTab === "following" || Boolean(tagFilter);
        if (filtered && visiblePosts.length < 5) {
          if (autoLoadsRef.current >= 10) return;
          autoLoadsRef.current += 1;
        } else {
          autoLoadsRef.current = 0;
        }
        loadMore();
      },
      { rootMargin: "600px 0px" }
    );

    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, loading, loadingMore, loadMore, feedTab, tagFilter, visiblePosts.length]);

  const handleDeletePost = async (postId) => {
    if (!window.confirm("Voulez-vous vraiment supprimer cette publication ?")) return;
    try {
      const { error } = await supabase
        .from("posts")
        .delete()
        .eq("id", postId)
        .eq("author_id", activeUserId);
      if (error) throw error;
      setPosts((prev) => prev.filter((p) => p.id !== postId));
      showToast("Publication supprimée", "success");
    } catch (err) {
      handleDbError(err, showToast, "Impossible de supprimer la publication");
    }
  };

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
        p.id === postId
          ? { ...p, reposts_count: Math.max(0, (p.reposts_count || 0) + delta) }
          : p
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
          p.id === postId
            ? { ...p, reposts_count: Math.max(0, (p.reposts_count || 0) - delta) }
            : p
        )
      );
      handleDbError(error, showToast, "Impossible de traiter la républication");
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
    } catch (err) {
      handleDbError(err, showToast, "Impossible de charger les commentaires");
    }
  };

  const toggleComments = (postId) => {
    const next = !commentOpen[postId];
    setCommentOpen((prev) => ({ ...prev, [postId]: next }));
    if (next) loadComments(postId);
  };

  const startCommentRecording = async (postId) => {
    if (commentRec.recording) return;
    if (
      !navigator.mediaDevices?.getUserMedia ||
      typeof MediaRecorder === "undefined"
    ) {
      showToast("L'enregistrement vocal n'est pas supporté sur cet appareil.", "error");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      commentStreamRef.current = stream;
      const mime = pickCommentRecorderMime();
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      commentChunksRef.current = [];
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) commentChunksRef.current.push(e.data);
      };
      rec.onerror = () => {
        commentStreamRef.current?.getTracks().forEach((track) => track.stop());
        commentStreamRef.current = null;
        setCommentRec(EMPTY_REC);
        showToast("Erreur pendant l'enregistrement vocal.", "error");
      };
      rec.onstop = () => {
        const blob = new Blob(commentChunksRef.current, {
          type: rec.mimeType || commentChunksRef.current[0]?.type || "audio/webm",
        });
        commentChunksRef.current = [];
        commentRecorderRef.current = null;
        commentStreamRef.current?.getTracks().forEach((track) => track.stop());
        commentStreamRef.current = null;

        if (!blob.size) {
          setCommentRec(EMPTY_REC);
          showToast("Aucun son n'a été enregistré.", "error");
          return;
        }

        setCommentRec({
          postId,
          recording: false,
          blob,
          url: URL.createObjectURL(blob),
        });
      };
      commentRecorderRef.current = rec;
      rec.start(250);
      setCommentRec({ postId, recording: true, blob: null, url: null });
    } catch (err) {
      commentStreamRef.current?.getTracks().forEach((track) => track.stop());
      commentStreamRef.current = null;
      console.error("Erreur accès micro commentaire :", err);
      showToast("Impossible d'accéder au microphone. Vérifiez les permissions.", "error");
    }
  };

  const stopCommentRecording = () => {
    if (commentRecorderRef.current?.state === "recording") {
      commentRecorderRef.current.requestData?.();
      commentRecorderRef.current.stop();
    }
  };

  const discardCommentRecording = () => {
    setCommentRec(EMPTY_REC);
  };

  const handleAddComment = async (postId) => {
    const typed = (newCommentText[postId] || "").trim();
    const audio = commentRec.postId === postId ? commentRec.blob : null;
    if (!typed && !audio) return;
    if (!activeUserId) {
      showToast("Vous devez être connecté", "error");
      return;
    }
    if (sendingComment) return;

    setSendingComment(true);
    try {
      let text = typed;

      if (audio) {
        const ext = (audio.type || "").includes("mp4") ? "m4a" : "webm";
        const file = new File([audio], `comment-voice.${ext}`, {
          type: audio.type || "audio/webm",
        });
        const up = await uploadExternalMedia(file, {
          folder: "comments",
          user_id: activeUserId,
          maxBytes: MAX_MEDIA_BYTES,
        });
        text = `${VOICE_PREFIX}${up.url}${typed ? `\n${typed}` : ""}`;
      }

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
      setCommentsMap((prev) => ({
        ...prev,
        [postId]: [...(prev[postId] || []), newComment],
      }));
      setPosts((prev) =>
        prev.map((p) =>
          p.id === postId
            ? { ...p, comments_count: (p.comments_count || 0) + 1 }
            : p
        )
      );
      setNewCommentText((prev) => ({ ...prev, [postId]: "" }));
      if (audio) discardCommentRecording();
      showPointsReward?.(1, "Commentaire ajouté");

      notifyPost(
        posts.find((p) => p.id === postId),
        activeUserId,
        "comment"
      );
    } catch (error) {
      handleDbError(error, showToast, "Impossible de commenter");
    } finally {
      setSendingComment(false);
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
      handleDbError(error, showToast, "Suppression impossible");
    }
  };

  const handlePickFiles = (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    if (files.length === 0) return;

    const slots = MAX_MEDIA_COUNT - mediaItems.length;
    if (slots <= 0) {
      showToast(`Maximum ${MAX_MEDIA_COUNT} médias`, "error");
      return;
    }

    const tooBig = files.filter((f) => f.size > MAX_MEDIA_BYTES);
    if (tooBig.length > 0) {
      showToast("Fichier trop lourd (50 Mo maximum) : ignoré", "error");
    }

    const accepted = files
      .filter((f) => f.size <= MAX_MEDIA_BYTES)
      .slice(0, slots);

    if (accepted.length < files.filter((f) => f.size <= MAX_MEDIA_BYTES).length) {
      showToast(`Maximum ${MAX_MEDIA_COUNT} médias`, "info");
    }

    const added = accepted.map((file) => ({
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      file,
      preview: URL.createObjectURL(file),
      kind: file.type.startsWith("video") ? "video" : "image",
    }));
    setMediaItems((prev) => [...prev, ...added]);
  };

  const removeMediaItem = (itemId) => {
    setMediaItems((prev) => {
      const target = prev.find((m) => m.id === itemId);
      if (target) URL.revokeObjectURL(target.preview);
      return prev.filter((m) => m.id !== itemId);
    });
  };

  const clearAllMedia = () => {
    mediaItemsRef.current.forEach((m) => URL.revokeObjectURL(m.preview));
    setMediaItems([]);
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorderRef.current = new MediaRecorder(stream);
      audioChunksRef.current = [];
      mediaRecorderRef.current.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };
      mediaRecorderRef.current.onstop = () => {
        const mime = mediaRecorderRef.current?.mimeType || "audio/webm";
        const blob = new Blob(audioChunksRef.current, { type: mime });
        setAudioBlob(blob);
        setAudioPreviewUrl(URL.createObjectURL(blob));
        stream.getTracks().forEach((track) => track.stop());
      };
      mediaRecorderRef.current.start();
      setIsRecording(true);
    } catch (err) {
      showToast("Impossible d'accéder au microphone. Vérifiez les permissions.", "error");
      console.error("Erreur d'enregistrement audio:", err);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const discardRecording = () => {
    setAudioBlob(null);
    setAudioPreviewUrl(null);
  };

  const resetComposer = () => {
    setNewText("");
    setMood("");
    setPollData(null);
    clearAllMedia();
    setAudioBlob(null);
    setAudioPreviewUrl(null);
    setTextToolsOpen(false);
    setAlsoStory(false);
  };

  const openCreate = () => setIsCreateOpen?.(true);

  const publishPost = async () => {
    const uploads = mediaItems.map((item) =>
      uploadExternalMedia(item.file, {
        folder: "posts",
        user_id: activeUserId,
        maxBytes: MAX_MEDIA_BYTES,
      }).then((r) => ({ url: r.url, type: item.kind }))
    );

    if (audioBlob) {
      const audioExt = (audioBlob.type || "").includes("mp4") ? "m4a" : "webm";
      const audioFile = new File([audioBlob], `voice-note.${audioExt}`, {
        type: audioBlob.type || "audio/webm",
      });
      uploads.push(
        uploadExternalMedia(audioFile, {
          folder: "posts",
          user_id: activeUserId,
          maxBytes: MAX_MEDIA_BYTES,
        }).then((r) => ({ url: r.url, type: "audio" }))
      );
    }

    const uploaded = await Promise.all(uploads);
    const first = uploaded[0] || null;

    const payload = {
      author_id: activeUserId,
      text: newText + (mood ? ` (Humeur: ${mood})` : ""),
      media_url: first?.url || null,
      media_type: first?.type || null,
      media_urls: uploaded,
    };

    let { data: created, error: postErr } = await supabase
      .from("posts")
      .insert([payload])
      .select("id")
      .single();

    if (postErr && /media_urls/i.test(postErr.message || "")) {
      const { media_urls: _ignored, ...legacy } = payload;
      ({ data: created, error: postErr } = await supabase
        .from("posts")
        .insert([legacy])
        .select("id")
        .single());
      if (!postErr && uploaded.length > 1) {
        showToast("Seul le premier média a été publié (migration SQL manquante)", "info");
      }
    }

    if (postErr) throw postErr;

    const pollQuestion = pollData?.question?.trim() || "";
    const pollOptions = (pollData?.options || [])
      .map((o) => (typeof o === "string" ? o.trim() : ""))
      .filter(Boolean);

    if (created?.id && pollQuestion && pollOptions.length >= 2) {
      try {
        await createPollForPost(created.id, pollQuestion, pollOptions);
      } catch (pollErr) {
        handleDbError(pollErr, showToast, "Publication créée, mais le sondage a échoué");
      }
    }

    if (alsoStory) {
      const storyMedia = uploaded.filter(
        (m) => m.type === "image" || m.type === "video"
      );
      try {
        const now = Date.now();
        for (const m of storyMedia) {
          await insertStory({
            author_id: activeUserId,
            media_url: m.url,
            media_type: m.type,
            caption: newText.trim() || null,
            publish_at: new Date(now).toISOString(),
            expires_at: new Date(now + STORY_DURATION_MS).toISOString(),
          });
        }
        if (storyMedia.length > 0) callSocial("story_published").catch(() => {});
      } catch (storyErr) {
        handleDbError(storyErr, showToast, "Publication créée, mais la story a échoué");
      }
    }

    resetComposer();
    setIsCreateOpen?.(false);
    showToast("Publication créée !", "success");
    loadPosts({ silent: true });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handlePublish = async () => {
    const hasText = Boolean(newText.trim());
    const hasMedia = mediaItems.length > 0;
    const hasAudio = Boolean(audioBlob);
    const pollQuestion = pollData?.question?.trim() || "";
    const pollOptions = (pollData?.options || [])
      .map((o) => (typeof o === "string" ? o.trim() : ""))
      .filter(Boolean);
    const hasPoll = Boolean(pollQuestion) && pollOptions.length >= 2;

    if (submitting) return;

    if (pollQuestion && pollOptions.length < 2) {
      showToast("Un sondage demande au moins 2 options", "error");
      return;
    }

    if (!hasText && !hasMedia && !hasAudio && !hasPoll) return;

    if (!activeUserId) {
      showToast("Veuillez vous connecter pour publier", "error");
      return;
    }

    setSubmitting(true);
    try {
      await publishPost();
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

  const canPublish = Boolean(
    newText.trim() || mediaItems.length || audioBlob || pollData?.question?.trim()
  );

  return (
    <div className="flex flex-col gap-6 max-w-2xl mx-auto w-full pb-20">
      {activeUserId && !isCreateOpen && (
        <FloatingCreateButton onCreatePost={openCreate} />
      )}

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
                  style={{
                    borderColor: COLORS.border,
                    color: COLORS.ivory,
                    background: COLORS.surface2,
                  }}
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
                  style={{
                    background: "rgba(20, 184, 166, 0.15)",
                    color: COLORS.teal,
                    border: `1px solid ${COLORS.teal}40`,
                  }}
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

              <label
                className="flex items-center gap-2 text-xs select-none"
                style={{
                  color: mediaItems.length > 0 ? COLORS.ivory : COLORS.muted,
                  opacity: mediaItems.length > 0 ? 1 : 0.6,
                }}
              >
                <input
                  type="checkbox"
                  checked={alsoStory && mediaItems.length > 0}
                  disabled={mediaItems.length === 0 || submitting}
                  onChange={(e) => setAlsoStory(e.target.checked)}
                />
                <span>
                  Publier aussi en story
                  {mediaItems.length === 0 ? " (ajoutez une photo ou une vidéo)" : ""}
                </span>
              </label>

              {mediaItems.length > 0 && (
                <div className="flex flex-col gap-1.5">
                  <div
                    className="flex items-center justify-between text-[11px]"
                    style={{ color: COLORS.muted }}
                  >
                    <span>
                      {mediaItems.length}/{MAX_MEDIA_COUNT} média
                      {mediaItems.length > 1 ? "s" : ""}
                    </span>
                    <button type="button" onClick={clearAllMedia} className="underline">
                      Tout retirer
                    </button>
                  </div>
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    {mediaItems.map((m) => (
                      <div
                        key={m.id}
                        className="relative w-24 h-24 shrink-0 rounded-xl overflow-hidden border"
                        style={{ borderColor: COLORS.border }}
                      >
                        <button
                          type="button"
                          onClick={() => removeMediaItem(m.id)}
                          className="absolute top-1 right-1 z-10 p-1 rounded-full bg-black/70 text-white"
                          aria-label="Retirer ce média"
                        >
                          <X size={12} />
                        </button>
                        {m.kind === "video" ? (
                          <video
                            src={m.preview}
                            className="w-full h-full object-cover"
                            muted
                          />
                        ) : (
                          <img
                            src={m.preview}
                            alt="Aperçu"
                            className="w-full h-full object-cover"
                          />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div
              className="flex items-center justify-between border-t p-3 flex-wrap gap-2 shrink-0 bg-inherit"
              style={{ borderColor: COLORS.border }}
            >
              <div className="flex items-center gap-2 flex-wrap">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,video/*"
                  multiple
                  className="hidden"
                  onChange={handlePickFiles}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="p-1.5 rounded-lg hover:bg-white/10 flex items-center gap-1.5 text-xs font-medium transition-colors"
                  style={{ color: COLORS.gold }}
                >
                  <ImageIcon size={16} />
                  <span>Médias</span>
                </button>

                {!isRecording && !audioBlob && (
                  <button
                    type="button"
                    onClick={startRecording}
                    className="p-1.5 rounded-lg hover:bg-white/10 flex items-center gap-1.5 text-xs font-medium transition-colors"
                    style={{ color: COLORS.teal }}
                  >
                    <Mic size={16} />
                    <span>Vocal</span>
                  </button>
                )}

                {isRecording && (
                  <button
                    type="button"
                    onClick={stopRecording}
                    className="p-1.5 rounded-lg bg-red-500/20 text-red-400 flex items-center gap-1.5 text-xs font-medium animate-pulse transition-colors"
                  >
                    <Square size={16} fill="currentColor" />
                    <span>Arrêter</span>
                  </button>
                )}

                {audioBlob && (
                  <>
                    <audio
                      src={audioPreviewUrl}
                      controls
                      className="h-8 max-w-[150px] rounded"
                    />
                    <button
                      type="button"
                      onClick={discardRecording}
                      className="p-1.5 rounded-lg hover:bg-red-500/20 text-red-400 transition-colors"
                      title="Supprimer l'enregistrement"
                    >
                      <Trash2 size={16} />
                    </button>
                  </>
                )}
              </div>

              <button
                type="button"
                onClick={handlePublish}
                disabled={submitting || !canPublish}
                className="px-4 py-1.5 rounded-xl text-xs font-bold shadow-md flex items-center gap-1.5 disabled:opacity-50 transition-opacity"
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
          showToast("Crée un compte pour débloquer toutes les fonctionnalités", "info")
        }
      />

      {activeUserId && (
        <SocialSuggestions user_id={activeUserId} onOpenProfile={onOpenProfile} />
      )}

      <div
        className="sticky top-0 z-30 flex gap-1 p-1 rounded-xl border backdrop-blur"
        style={{ borderColor: COLORS.border, background: COLORS.surface }}
      >
        {FEED_TABS.map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => {
              autoLoadsRef.current = 0;
              setFeedTab(key);
              window.scrollTo({ top: 0 });
            }}
            className="flex-1 py-2 rounded-lg text-xs font-bold transition active:scale-95"
            style={
              feedTab === key
                ? { background: COLORS.gold, color: "#000" }
                : { color: COLORS.muted }
            }
          >
            {label}
          </button>
        ))}
      </div>

      {tagFilter && (
        <div
          className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl border text-xs"
          style={{ borderColor: COLORS.borderTeal, background: COLORS.surface }}
        >
          <span style={{ color: COLORS.ivory }}>
            Publications avec{" "}
            <strong style={{ color: COLORS.teal }}>#{tagFilter}</strong>
          </span>
          <button
            type="button"
            onClick={() => {
              autoLoadsRef.current = 0;
              setTagFilter(null);
            }}
            className="p-1 rounded-lg hover:bg-white/10"
            style={{ color: COLORS.muted }}
            aria-label="Retirer le filtre"
          >
            <X size={14} />
          </button>
        </div>
      )}

      <div className="flex flex-col gap-4">
        {visiblePosts.map((post) => (
          <article
            key={post.id}
            data-post-id={post.id}
            data-author-id={post.author_id}
            className="glass-card rounded-2xl p-5 shadow-xl border flex flex-col gap-3 relative"
            style={{ borderColor: COLORS.border }}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => onOpenProfile?.(post.author_id)}
                  className="w-10 h-10 rounded-full overflow-hidden border flex items-center justify-center font-bold text-sm shrink-0"
                  style={{
                    borderColor: COLORS.borderGold,
                    background: COLORS.surface,
                  }}
                >
                  {post.avatar ? (
                    <img
                      src={post.avatar}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span style={{ color: COLORS.gold }}>
                      {post.display_name?.charAt(0) || "?"}
                    </span>
                  )}
                </button>
                <div>
                  <div className="flex items-center gap-2">
                    <p
                      className="font-bold text-sm flex items-center gap-1"
                      style={{ color: COLORS.ivory }}
                    >
                      {post.display_name} {post.flag}
                    </p>
                    <span className="text-xs" style={{ color: COLORS.muted }}>
                      ·
                    </span>
                    <span
                      className="text-xs font-normal"
                      style={{ color: COLORS.muted }}
                    >
                      {formatDate(post.created_at)}
                    </span>
                  </div>
                  <p className="text-xs" style={{ color: COLORS.muted }}>
                    {post.handle}
                  </p>
                </div>
              </div>

              <div className="relative" data-post-menu>
                <button
                  type="button"
                  onClick={() =>
                    setMenuOpenId(menuOpenId === post.id ? null : post.id)
                  }
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
                >
                  <MoreHorizontal size={18} />
                </button>

                {menuOpenId === post.id && (
                  <div
                    className="absolute right-0 top-full mt-1 w-44 rounded-xl border shadow-xl z-20 overflow-hidden py-1"
                    style={{
                      background: COLORS.surface2,
                      borderColor: COLORS.border,
                    }}
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

            {editingId === post.id ? (
              <div className="flex flex-col gap-2 my-2">
                <textarea
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  className="w-full p-3 rounded-xl border text-sm outline-none resize-none"
                  style={{
                    background: COLORS.surface,
                    borderColor: COLORS.border,
                    color: COLORS.ivory,
                  }}
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
              <PostText
                text={post.text}
                translated={translatedMap[post.id]}
                hasMedia={getPostMedia(post).length > 0}
                onHashtagClick={handleHashtagClick}
                onMentionClick={handleMentionClick}
              />
            )}

            {translatedMap[post.id] && (
              <p className="text-[10px]" style={{ color: COLORS.muted }}>
                Traduit par BAARO
              </p>
            )}

            <MediaGallery items={getPostMedia(post)} />

            <PollCard postId={post.id} user_id={activeUserId} />
            <SocialPostEnhancements
              post={post}
              user_id={activeUserId}
              isFollowing={
                followingIds ? followingIds.has(post.author_id) : null
              }
              onFollowChange={handleFollowChange}
            />

            <div
              className="flex items-center justify-between gap-2 pt-2 border-t flex-wrap"
              style={{ borderColor: COLORS.border }}
            >
              <div
                className="flex items-center gap-3 text-[11px] font-medium flex-wrap"
                style={{ color: COLORS.muted }}
              >
                <button
                  type="button"
                  onClick={() => handleRepost(post)}
                  className="flex items-center gap-1 transition active:scale-95"
                  style={{
                    color: repostedPosts[post.id] ? "#10B981" : COLORS.muted,
                  }}
                >
                  <Repeat2 size={15} />
                  {Number(post.reposts_count || 0)}
                </button>

                {post.author_id === activeUserId && (
                  <div className="flex items-center gap-1.5 ml-1">
                    <button
                      type="button"
                      onClick={() =>
                        setEngagement({ type: "postLikes", id: post.id })
                      }
                      className="text-[10px] underline hover:text-white"
                    >
                      👍 J'aime
                    </button>
                    <span>·</span>
                    <button
                      type="button"
                      onClick={() =>
                        setEngagement({ type: "postReposts", id: post.id })
                      }
                      className="text-[10px] underline hover:text-white"
                    >
                      Reposts
                    </button>
                    <span>·</span>
                    <button
                      type="button"
                      onClick={() =>
                        setEngagement({ type: "postViews", id: post.id })
                      }
                      className="text-[10px] underline hover:text-white flex items-center gap-0.5"
                    >
                      <Eye size={11} /> {viewCounts[post.id] ?? post.views_count ?? 0}
                    </button>
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
                  onTranslated={(translated) =>
                    setTranslatedMap((prev) => ({
                      ...prev,
                      [post.id]: translated,
                    }))
                  }
                  onClear={() =>
                    setTranslatedMap((prev) => ({ ...prev, [post.id]: null }))
                  }
                />

                <AskAiButton
                  text={typeof post.text === "string" ? post.text : ""}
                />

                {post.author_id !== activeUserId && (
                  <TipButton
                    recipientId={post.author_id}
                    postId={post.id}
                    compact
                  />
                )}
              </div>
            </div>

            {commentOpen[post.id] && (
              <div
                className="pt-3 border-t space-y-2"
                style={{ borderColor: COLORS.border }}
              >
                {(commentsMap[post.id] || []).map((c) => {
                  const { voiceUrl, caption } = parseComment(c.text);
                  return (
                    <div
                      key={c.id}
                      className="text-xs flex items-start justify-between gap-2"
                      style={{ color: COLORS.muted }}
                    >
                      <div className="min-w-0">
                        <span
                          className="font-bold"
                          style={{ color: COLORS.ivory }}
                        >
                          {c.author}
                        </span>
                        {caption ? <> : {caption}</> : null}
                        {voiceUrl && (
                          <audio
                            src={voiceUrl}
                            controls
                            preload="none"
                            className="mt-1 h-8 w-full max-w-[240px]"
                          />
                        )}
                      </div>
                      {c.author_id === activeUserId && (
                        <button
                          type="button"
                          onClick={() => handleDeleteComment(post.id, c.id)}
                          className="shrink-0 p-1 text-red-400 hover:text-red-300"
                        >
                          <Trash2 size={12} />
                        </button>
                      )}
                    </div>
                  );
                })}

                {activeUserId && (
                  <div className="flex items-center gap-2 pt-1">
                    <input
                      value={newCommentText[post.id] || ""}
                      onChange={(e) =>
                        setNewCommentText((prev) => ({
                          ...prev,
                          [post.id]: e.target.value,
                        }))
                      }
                      onKeyDown={(e) =>
                        e.key === "Enter" && handleAddComment(post.id)
                      }
                      placeholder="Ajouter un commentaire..."
                      className="flex-1 min-w-0 px-3 py-1.5 rounded-lg border text-xs outline-none"
                      style={{
                        background: COLORS.surface2,
                        borderColor: COLORS.border,
                        color: COLORS.ivory,
                      }}
                    />

                    {commentRec.recording && commentRec.postId === post.id ? (
                      <button
                        type="button"
                        onClick={stopCommentRecording}
                        className="p-1.5 rounded-lg bg-red-500/20 text-red-400 animate-pulse"
                        aria-label="Arrêter l'enregistrement"
                      >
                        <Square size={13} fill="currentColor" />
                      </button>
                    ) : commentRec.blob && commentRec.postId === post.id ? (
                      <>
                        <audio
                          src={commentRec.url}
                          controls
                          className="h-8 max-w-[110px]"
                        />
                        <button
                          type="button"
                          onClick={discardCommentRecording}
                          className="p-1.5 text-red-400"
                          aria-label="Supprimer le vocal"
                        >
                          <Trash2 size={13} />
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={() => startCommentRecording(post.id)}
                        className="p-1.5 rounded-lg"
                        style={{ color: COLORS.teal }}
                        aria-label="Enregistrer un vocal"
                      >
                        <Mic size={13} />
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => handleAddComment(post.id)}
                      disabled={sendingComment}
                      className="p-1.5 rounded-lg disabled:opacity-50"
                      style={{ background: COLORS.gold, color: "#000" }}
                    >
                      <Send size={13} />
                    </button>
                  </div>
                )}
              </div>
            )}
          </article>
        ))}

        {visiblePosts.length === 0 &&
          !hasMore &&
          (tagFilter || (feedTab === "following" && followingIds)) && (
            <p className="text-center text-xs py-10" style={{ color: COLORS.muted }}>
              {tagFilter
                ? `Aucune publication avec #${tagFilter} pour l'instant.`
                : "Aucune publication de vos abonnements pour l'instant."}
            </p>
          )}
      </div>

      {hasMore && (
        <div
          ref={sentinelRef}
          className="py-6 text-center text-[11px]"
          style={{ color: COLORS.muted }}
        >
          {loadingMore ? "Chargement..." : ""}
        </div>
      )}

      {!hasMore && visiblePosts.length > 0 && (
        <p className="text-center text-[11px] py-6" style={{ color: COLORS.muted }}>
          Vous avez tout vu 🎉
        </p>
      )}

      {reportPost && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div
            className="w-full max-w-md rounded-2xl p-5 border flex flex-col gap-4"
            style={{ background: COLORS.surface, borderColor: COLORS.border }}
          >
            <h3 className="font-bold text-sm" style={{ color: COLORS.ivory }}>
              Signaler cette publication
            </h3>
            <p className="text-xs" style={{ color: COLORS.muted }}>
              Choisissez le motif du signalement :
            </p>
            <div className="flex flex-col gap-2">
              {REPORT_REASONS.map((reason) => (
                <label
                  key={reason}
                  className="flex items-center gap-2 text-xs cursor-pointer"
                  style={{ color: COLORS.ivory }}
                >
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
            <div
              className="flex justify-end gap-2 pt-2 border-t"
              style={{ borderColor: COLORS.border }}
            >
              <button
                type="button"
                onClick={() => setReportPost(null)}
                className="px-3 py-1.5 rounded-lg text-xs"
                style={{ color: COLORS.muted }}
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleSendReport}
                className="px-3 py-1.5 rounded-lg text-xs font-bold bg-amber-500 text-black"
              >
                Envoyer le signalement
              </button>
            </div>
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
