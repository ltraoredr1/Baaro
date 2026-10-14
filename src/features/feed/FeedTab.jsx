import { useState, useRef, useEffect } from "react";
import { supabase } from "../../supabaseClient.js";
import { useCursorFeed } from "../../hooks/useCursorFeed.js";
import { recordFeedEvent } from "../../lib/feedEvents.js";
import { uploadExternalMedia } from "../../lib/externalMedia.js";
import { RichTextRenderer } from "../../components/RichTextRenderer.jsx";
import { RichTextComposer } from "../../components/RichTextComposer.jsx";
import { SocialPostEnhancements } from "./SocialEnhancements.jsx";
import { COLORS } from "../../theme.js";

export function FeedTab() {
  const { posts, loading, hasMore, loadMore, refresh } = useCursorFeed();
  const [hiddenIds, setHiddenIds] = useState(new Set());
  const [text, setText] = useState("");
  const [mediaUrl, setMediaUrl] = useState("");
  const [mediaType, setMediaType] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [composing, setComposing] = useState(false);
  const [userId, setUserId] = useState(null);
  const sentinelRef = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data?.user?.id));
  }, []);

  useEffect(() => {
    if (!sentinelRef.current ||!hasMore) return;
    const io = new IntersectionObserver(
      (e) => { if (e[0].isIntersecting &&!loading) loadMore(); },
      { rootMargin: "400px" }
    );
    io.observe(sentinelRef.current);
    return () => io.disconnect();
  }, [hasMore, loading, loadMore]);

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const { url, type } = await uploadExternalMedia(file);
      setMediaUrl(url);
      setMediaType(type);
    } finally { setUploading(false); }
  };

  const handlePost = async () => {
    if (!text.trim() &&!mediaUrl) return;
    if (!userId) return;
    setComposing(true);
    try {
      await supabase.from("posts").insert({
        author_id: userId,
        text: text.trim(),
        media_url: mediaUrl || null,
        media_type: mediaType || null,
      });
      setText(""); setMediaUrl(""); setMediaType(null);
      refresh();
    } finally { setComposing(false); }
  };

  const filtered = posts.filter((p) =>!hiddenIds.has(p.id));

  return (
    <div className="max-w-[680px] mx-auto w-full min-h-screen pb-24">
      {/* COMPOSER - style onboarding */}
      <section className="glass-card p-4 mb-4">
        <RichTextComposer value={text} onChange={setText} placeholder="Quoi de neuf chef?" />
        {mediaUrl && (
          <div className="mt-3 rounded-xl overflow-hidden border relative" style={{ borderColor: COLORS.border }}>
            {mediaType?.startsWith("video")? (
              <video src={mediaUrl} className="w-full max-h-[320px]" controls />
            ) : (
              <img src={mediaUrl} className="w-full max-h-[320px] object-cover" alt="" />
            )}
            <button onClick={() => { setMediaUrl(""); setMediaType(null); }} className="absolute top-2 right-2 bg-black/60 rounded-full w-7 h-7 text-white">✕</button>
          </div>
        )}
        <div className="flex gap-2 mt-4">
          <div className="baaro-feature-card flex-1 p-3 text-center">
            <div className="text-lg">🪙</div>
            <p className="text-[11px] mt-1 font-semibold" style={{ color: COLORS.muted }}>Points & Gains</p>
          </div>
          <div className="baaro-feature-card flex-1 p-3 text-center">
            <div className="text-lg">📡</div>
            <p className="text-[11px] mt-1 font-semibold" style={{ color: COLORS.muted }}>Lives & IA</p>
          </div>
          <div className="baaro-feature-card flex-1 p-3 text-center">
            <div className="text-lg">🛡️</div>
            <p className="text-[11px] mt-1 font-semibold" style={{ color: COLORS.muted }}>Sécurisé</p>
          </div>
        </div>
        <div className="flex justify-between items-center mt-4">
          <button onClick={() => fileInputRef.current?.click()} className="w-10 h-10 rounded-full border flex items-center justify-center active:scale-95" style={{ background: COLORS.surface2, borderColor: COLORS.border }}>📷</button>
          <input ref={fileInputRef} type="file" accept="image/*,video/*" hidden onChange={handleFile} />
          <button onClick={handlePost} disabled={composing || uploading || (!text.trim() &&!mediaUrl)} className="btn-baaro px-8 h-11 text-sm disabled:opacity-40">Publier</button>
        </div>
        {uploading && <div className="text-[11px] mt-2" style={{ color: COLORS.muted }}>Upload R2...</div>}
      </section>

      {/* POSTS */}
      <div className="flex flex-col gap-3">
        {filtered.map((post) => {
          const p = post.profiles;
          return (
            <article key={post.id} className="glass-card p-4">
              <div className="flex gap-3">
                <img src={p?.avatar_url || `https://api.dicebear.com/7.x/initials/svg?seed=${p?.handle}`} className="w-10 h-10 rounded-full border object-cover shrink-0" style={{ borderColor: COLORS.borderGold }} alt="" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-[15px]" style={{ color: COLORS.ivory }}>{p?.display_name || p?.full_name || "Membre"}</span>
                    <span className="text-[13px] truncate" style={{ color: COLORS.muted }}>@{p?.handle || "user"}</span>
                  </div>
                  <div className="mt-2 text-[15px] leading-[22px] break-words" style={{ color: COLORS.ivory }}>
                    <RichTextRenderer text={post.text} />
                  </div>
                  {post.media_url && (
                    <div className="mt-3 rounded-xl overflow-hidden border" style={{ borderColor: COLORS.border }}>
                      <img src={post.media_url} className="w-full object-contain max-h-[480px]" alt="" onClick={() => recordFeedEvent(post.id, "open")} />
                    </div>
                  )}
                  <div className="mt-3">
                    <SocialPostEnhancements post={post} user_id={userId} onLiked={() => recordFeedEvent(post.id, "like")} />
                  </div>
                </div>
              </div>
            </article>
          );
        })}
      </div>
      <div ref={sentinelRef} className="h-10" />
      {loading && <div className="py-6 flex justify-center"><div className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: `${COLORS.border} ${COLORS.border} ${COLORS.gold} ${COLORS.border}` }} /></div>}
    </div>
  );
}

export default FeedTab;
