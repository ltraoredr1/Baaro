import { ConnectionStatus } from "../../components/ConnectionStatus.jsx";
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
  Bell,
} from "lucide-react";
import { COLORS } from "../../theme.js";
import { randomId } from "../../lib/id.js";
import { useToast } from "../../components/ToastContext.jsx";
import { supabase } from "../../supabaseClient.js";
import { handleDbError } from "../../lib/dbErrors.js";
import { checkRateLimit, rateLimitMessage } from "../../lib/rateLimit.js";
import { GuestBanner } from "../../components/GuestBanner.jsx";
import { TranslateButton } from "../../components/TranslateButton.jsx";
import { PollCard, SocialPostEnhancements, SocialSuggestions } from "./SocialEnhancements.jsx";
import { PollComposer } from "../../components/PollComposer.jsx";
import { RichTextComposer } from "../../components/RichTextComposer.jsx";
import { RichTextRenderer } from "../../components/RichTextRenderer.jsx";
import { NotificationDrawer } from "../../components/NotificationDrawer.jsx";
import { EngagementList } from "../../components/EngagementList.jsx";
import { TipButton } from "../../components/TipButton.jsx";

const PAGE_SIZE = 20;
const MAX_IMAGE_SIZE = 10 * 1024 * 1024;
const MAX_VIDEO_SIZE = 50 * 1024 * 1024;

function applyCursor(query, cursor) {
  if (!cursor) return query;
  return query.or(`created_at.lt.${cursor.created_at},and(created_at.eq.${cursor.created_at},id.lt.${cursor.id})`);
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
  const [pollQuestion, setPollQuestion] = useState("");
  const [pollOptions, setPollOptions] = useState(["", ""]);
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
  const [notifOpen, setNotifOpen] = useState(false);
  const [engagement, setEngagement] = useState(null);
  const [mediaFile, setMediaFile] = useState(null);
  const [mediaPreview, setMediaPreview] = useState(null);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const fileInputRef = useRef(null);
  const cursorRef = useRef(null);
  const sentinelRef = useRef(null);
  const postViewRefs = useRef({});
  const postViewedRef = useRef(new Set());
  const meId = user?.id || userId;

  useEffect(() => {
    const getUser = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        setUser(user);
      } catch (error) { handleDbError(error, showToast, "Erreur session"); }
    };
    getUser();
  }, [showToast]);

  useEffect(() => { return () => { if (mediaPreview) URL.revokeObjectURL(mediaPreview); }; }, [mediaPreview]);

  const fetchPostsPage = useCallback(async (cursor) => {
    let query = supabase.from("posts").select(`id, author_id, text, media_url, media_type, created_at, likes_count, comments_count, views_count, profiles ( display_name, handle, flag, avatar_url )`).order("created_at", { ascending: false }).order("id", { ascending: false }).limit(PAGE_SIZE);
    query = applyCursor(query, cursor);
    const { data, error } = await query; if (error) throw error;
    return (data || []).map((post) => {
      const profile = post.profiles || {};
      return { id: post.id, author_id: post.author_id, text: post.text, media_url: post.media_url, media_type: post.media_type, created_at: post.created_at, likes: post.likes_count || 0, comments_count: post.comments_count || 0, views_count: post.views_count || 0, display_name: profile.display_name || "Membre BAARO", handle: profile.handle || "@membre", flag: profile.flag || "🌍", avatar: profile.avatar_url || "" };
    });
  }, []);

  const fetchPostsPageFallback = useCallback(async (cursor) => {
    let query = supabase.from("posts").select("id, author_id, text, media_url, media_type, created_at, likes_count, comments_count, views_count").order("created_at", { ascending: false }).order("id", { ascending: false }).limit(PAGE_SIZE);
    query = applyCursor(query, cursor);
    const { data, error: err2 } = await query; if (err2) throw err2;
    const authorIds = [...new Set((data || []).map((p) => p.author_id).filter(Boolean))];
    let profilesMap = {};
    if (authorIds.length > 0) {
      const { data: profiles } = await supabase.from("profiles").select("id, display_name, handle, flag, avatar_url").in("id", authorIds);
      (profiles || []).forEach((p) => { profilesMap[p.id] = p; });
    }
    return (data || []).map((post) => {
      const profile = profilesMap[post.author_id] || {};
      return {...post, likes: post.likes_count || 0, comments_count: post.comments_count || 0, views_count: post.views_count || 0, display_name: profile.display_name || "Membre BAARO", handle: profile.handle || "@membre", flag: profile.flag || "🌍", avatar: profile.avatar_url || "" };
    });
  }, []);

  const updateCursorFromRows = (rows) => {
    if (rows.length > 0) { const last = rows[rows.length - 1]; cursorRef.current = { created_at: last.created_at, id: last.id }; }
    setHasMore(rows.length === PAGE_SIZE);
  };

  const loadPosts = useCallback(async () => {
    setLoading(true); cursorRef.current = null;
    try {
      const rows = await fetchPostsPage(null); setPosts(rows); updateCursorFromRows(rows);
      if (meId && rows.length) {
        const { data: likes } = await supabase.from("post_likes").select("post_id").eq("user_id", meId).in("post_id", rows.map((row) => row.id));
        setLikedPosts(Object.fromEntries((likes || []).map((like) => [like.post_id, true])));
      } else { setLikedPosts({}); }
    } catch (error) {
      try {
        const rows = await fetchPostsPageFallback(null); setPosts(rows); updateCursorFromRows(rows);
      } catch (fallbackError) { handleDbError(fallbackError, showToast, "Erreur chargement"); setPosts([]); setHasMore(false); }
    } finally { setLoading(false); }
  }, [fetchPostsPage, fetchPostsPageFallback, showToast, meId]);

  const loadMorePosts = useCallback(async () => {
    if (loadingMore ||!hasMore || loading ||!cursorRef.current) return;
    setLoadingMore(true); const cursor = cursorRef.current;
    try {
      const rows = await fetchPostsPage(cursor); setPosts((prev) => [...prev,...rows]); updateCursorFromRows(rows);
    } catch (error) {
      try { const rows = await fetchPostsPageFallback(cursor); setPosts((prev) => [...prev,...rows]); updateCursorFromRows(rows); } catch (fallbackError) { handleDbError(fallbackError, showToast, "Erreur suite du fil"); }
    } finally { setLoadingMore(false); }
  }, [fetchPostsPage, fetchPostsPageFallback, loadingMore, hasMore, loading, showToast]);

  useEffect(() => { loadPosts(); }, [loadPosts]);
  useEffect(() => { if (!sentinelRef.current) return; const observer = new IntersectionObserver((entries) => { if (entries[0].isIntersecting) loadMorePosts(); }, { rootMargin: "400px" }); observer.observe(sentinelRef.current); return () => observer.disconnect(); }, [loadMorePosts]);

  if (loading) { return <div className="text-center py-8 text-gray-400">Chargement...</div>; }

  return (
    <div className="flex flex-col gap-4 max-w-2xl mx-auto w-full pb-20">
      {meId && <div className="flex justify-end"><button onClick={() => setNotifOpen(true)} className="relative p-2 rounded-xl border" style={{ borderColor: COLORS.border, color: COLORS.ivory }}><Bell size={20} /></button><NotificationDrawer isOpen={notifOpen} onClose={() => setNotifOpen(false)} userId={meId} /></div>}
      {meId && <SocialSuggestions userId={meId} onOpenProfile={onOpenProfile} />}
      <div className="flex flex-col gap-4">
        {posts.map((post) => {
          const isLiked =!!likedPosts[post.id];
          return (
            <article key={post.id} data-post-id={post.id} ref={(el) => { if (el) postViewRefs.current[post.id] = el; }} className="glass-card rounded-2xl p-5 shadow-xl border flex flex-col gap-3" style={{ borderColor: COLORS.border }}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3"><div className="w-10 h-10 rounded-full overflow-hidden border flex items-center justify-center font-bold text-sm" style={{ borderColor: COLORS.borderGold, background: COLORS.surface }}>{post.avatar? <img src={post.avatar} alt="" className="w-full h-full object-cover" /> : <span style={{ color: COLORS.gold }}>{post.display_name?.charAt(0) || "?"}</span>}</div><div><p className="font-bold text-sm" style={{ color: COLORS.ivory }}>{post.display_name} {post.flag}</p><p className="text-xs" style={{ color: COLORS.muted }}>{post.handle} · {new Date(post.created_at).toLocaleDateString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</p></div></div>
                {post.author_id === meId && (<div className="relative"><button type="button" onClick={() => setMenuOpenId((id) => (id === post.id? null : post.id))} className="p-2 rounded-lg hover:bg-white/5"><MoreHorizontal size={18} /></button>{menuOpenId === post.id && (<div className="absolute right-0 top-9 z-20 min-w-[160px] rounded-xl border shadow-xl py-1" style={{ background: COLORS.surface, borderColor: COLORS.borderGold }}><button type="button" onClick={() => { setMenuOpenId(null); setEditingId(post.id); setEditText(post.text); }} className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-white/5" style={{ color: COLORS.ivory }}><Pencil size={14} /> Modifier</button><button type="button" onClick={async () => { setMenuOpenId(null); if (confirm("Supprimer?")) { await supabase.from("posts").delete().eq("id", post.id); loadPosts(); } }} className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-white/5 text-red-400"><Trash2 size={14} /> Supprimer</button></div>)}</div>)}
              </div>
              <p className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: COLORS.ivory }}><RichTextRenderer content={post.text} /></p>
              {post.media_url && (<div className="rounded-xl overflow-hidden">{post.media_type?.startsWith("video")? <video src={post.media_url} controls className="w-full max-h-80 object-cover bg-black" /> : <img src={post.media_url} alt="" className="w-full max-h-80 object-cover" />}</div>)}
              <PollCard postId={post.id} userId={meId} />
              <SocialPostEnhancements post={post} userId={meId} />

              {/* BARRE FINALE CORRIGEE: VUES + LIKES + POURBOIRE ARGENT REEL */}
              <div className="flex items-center justify-between gap-2 pt-2 border-t flex-wrap" style={{ borderColor: COLORS.border }}>
                <div className="flex items-center gap-3 text-[11px] font-medium" style={{ color: COLORS.muted }}>
                  <span className="flex items-center gap-1">👁️ {Number(post.views_count || 0)} vues</span>
                  <span>·</span>
                  <span className="flex items-center gap-1">❤️ {Number(post.likes || 0)} likes</span>
                  {post.author_id === meId && (<button type="button" onClick={() => setEngagement({ type: "postLikes", id: post.id })} className="text-[10px] underline ml-2">Voir les likes</button>)}
                </div>
                <div className="flex items-center gap-2">
                  {post.author_id!== meId && <TipButton recipientId={post.author_id} postId={post.id} />}
                  <button className="w-8 h-8 rounded-full border flex items-center justify-center text-xs" style={{ background: COLORS.surface2, borderColor: COLORS.border }}>🔖</button>
                  <button className="w-8 h-8 rounded-full border flex items-center justify-center text-xs" style={{ background: COLORS.surface2, borderColor: COLORS.border }}>↗️</button>
                </div>
              </div>
            </article>
          );
        })}
        {hasMore && <div ref={sentinelRef} style={{ height: 1 }} />}
      </div>
      {engagement && <EngagementList type={engagement.type} targetId={engagement.id} ownerId={meId} viewerId={meId} onClose={() => setEngagement(null)} />}
    </div>
  );
}
export default FeedTab;
