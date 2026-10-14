// src/features/feed/FeedTab.jsx - COMPLET CORRIGÉ BUILD OK
import { useState, useRef, useEffect } from "react";
import { supabase } from "../../supabaseClient.js";
import { useCursorFeed } from "../../hooks/useCursorFeed.js";
import { recordFeedEvent } from "../../lib/feedEvents.js";
import { uploadExternalMedia } from "../../lib/externalMedia.js";
import { RichTextRenderer } from "../../components/RichTextRenderer.jsx";
import { RichTextComposer } from "../../components/RichTextComposer.jsx";
import SocialEnhancements from "./SocialEnhancements.jsx";

export default function FeedTab() {
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
    } catch (err) {
      console.error(err);
    } finally { setComposing(false); }
  };

  const onHide = (id) => {
    setHiddenIds(s => new Set([...s, id]));
    recordFeedEvent(id, "hide");
  };

  const filtered = posts.filter(p =>!hiddenIds.has(p.id));

  return (
    <div className="max-w-[680px] mx-auto w-full bg-[#0a0a0a] text-white min-h-screen">
      <div className="sticky top-0 z-20 bg-[#111]/80 backdrop-blur-xl border-b border-white/10 p-4">
        <RichTextComposer
          value={text}
          onChange={setText}
          placeholder="Quoi de neuf chef?"
          className="w-full bg-white/[0.06] border border-white/10 rounded-2xl p-3 min-h-[48px] outline-none"
        />
        {mediaUrl && (
          <div className="mt-3 rounded-xl overflow-hidden border border-white/10 relative">
            {mediaType?.startsWith("video")?
              <video src={mediaUrl} className="w-full max-h-[300px]" controls /> :
              <img src={mediaUrl} className="w-full max-h-[300px] object-cover" alt="" />
            }
            <button onClick={() => { setMediaUrl(""); setMediaType(null); }} className="absolute top-2 right-2 bg-black/70 rounded-full w-7 h-7">✕</button>
          </div>
        )}
        <div className="flex justify-between mt-3">
          <button onClick={() => fileInputRef.current?.click()} className="w-9 h-9 rounded-full bg-white/10">📷</button>
          <input ref={fileInputRef} type="file" accept="image/*,video/*" hidden onChange={handleFile} />
          <button onClick={handlePost} disabled={composing || uploading || (!text.trim() &&!mediaUrl)} className="px-5 h-9 rounded-full bg-white text-black font-semibold text-sm disabled:opacity-40">Publier</button>
        </div>
        {uploading && <div className="text-xs text-white/50 mt-2">Upload R2...</div>}
      </div>

      <div className="divide-y divide-white/[0.06]">
        {filtered.map(post => {
          const p = post.profiles;
          return (
            <div key={post.id} className="p-4 hover:bg-white/[0.02] group">
              <div className="flex justify-between">
                <div className="flex gap-3">
                  <img src={p?.avatar_url || `https://api.dicebear.com/7.x/initials/svg?seed=${p?.handle}`} className="w-10 h-10 rounded-full bg-white/10" alt="" />
                  <div>
                    <div className="flex gap-1.5 items-center">
                      <span className="font-semibold text-[15px]">{p?.display_name}</span>
                      <span className="text-white/40 text-[13px]">@{p?.handle} {p?.flag}</span>
                    </div>
                    <div className="mt-1.5 text-[15px] leading-[22px]"><RichTextRenderer text={post.text} /></div>
                  </div>
                </div>
                <button onClick={() => onHide(post.id)} className="opacity-0 group-hover:opacity-100 w-8 h-8 rounded-full hover:bg-white/10 text-white/40">⋯</button>
              </div>
              {post.media_url && (
                <div className="mt-3 ml-12 rounded-2xl overflow-hidden border border-white/10 bg-black">
                  {post.media_type?.startsWith("video")?
                    <video src={post.media_url} className="w-full max-h-[480px] object-contain" controls onPlay={() => recordFeedEvent(post.id, "watch")} /> :
                    <img src={post.media_url} className="w-full max-h-[480px] object-contain" alt="" onClick={() => recordFeedEvent(post.id, "open")} />
                  }
                </div>
              )}
              <div className="mt-3 ml-12">
                <SocialEnhancements
                  post={post}
                  onLike={() => recordFeedEvent(post.id, "like")}
                  onComment={() => recordFeedEvent(post.id, "comment")}
                />
              </div>
            </div>
          );
        })}
      </div>
      <div ref={sentinelRef} className="h-1" />
      {loading && <div className="py-8 flex justify-center"><div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin" /></div>}
      {!hasMore && filtered.length > 0 && <div className="py-8 text-center text-white/30 text-sm">Tu es à jour chef 👌</div>}
    </div>
  );
}
