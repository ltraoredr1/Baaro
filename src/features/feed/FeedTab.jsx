import { useState, useRef, useEffect } from "react";
import { supabase } from "../../supabaseClient.js";
import { useCursorFeed } from "../../hooks/useCursorFeed.js";
import { recordFeedEvent } from "../../lib/feedEvents.js";
import { uploadExternalMedia } from "../../lib/externalMedia.js";
import { RichTextRenderer } from "../../components/RichTextRenderer.jsx";
import { RichTextComposer } from "../../components/RichTextComposer.jsx";
import { SocialPostEnhancements } from "./SocialEnhancements.jsx";

// EXPORT NOMMÉ POUR TON index.js
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

  const onHide = (id) => {
    setHiddenIds(s => new Set([...s, id]));
    recordFeedEvent(id, "hide");
  };

  const filtered = posts.filter(p =>!hiddenIds.has(p.id));

  return (
    <div className="max-w-[680px] mx-auto w-full bg-[#0a0a0a] text-white min-h-screen">
      <div className="sticky top-0 z-20 bg-[#111]/80 backdrop-blur-xl border-b border-white/10 p-4">
        <RichTextComposer value={text} onChange={setText} placeholder="Quoi de neuf chef?" />
        {mediaUrl && (
          <div className="mt-3 rounded-xl overflow-hidden border border-white/10 relative">
            {mediaType?.startsWith("video")? <video src={mediaUrl} className="w-full max-h-[300px]" controls /> : <img src={mediaUrl} className="w-full max-h-[300px] object-cover" alt="" />}
            <button onClick={() => { setMediaUrl(""); setMediaType(null); }} className="absolute top-2 right-2 bg-black/70 rounded-full w-7 h-7">✕</button>
          </div>
        )}
        <div className="flex justify-between mt-3">
          <button onClick={() => fileInputRef.current?.click()} className="w-9 h-9 rounded-full bg-white/10">📷</button>
          <input ref={fileInputRef} type="file" accept="image/*,video/*" hidden onChange={handleFile} />
          <button onClick={handlePost} disabled={composing || uploading || (!text.trim() &&!mediaUrl)} className="px-5 h-9 rounded-full bg-white text-black font-semibold text-sm disabled:opacity-40">Publier</button>
        </div>
      </div>

      <div className="divide-y divide-white/[0.06]">
        {filtered.map(post => {
          const p = post.profiles;
          return (
            <div key={post.id} className="p-4 hover:bg-white/[0.02]">
              <div className="flex gap-3">
                <img src={p?.avatar_url || `https://api.dicebear.com/7.x/initials/svg?seed=${p?.handle}`} className="w-10 h-10 rounded-full bg-white/10" alt="" />
                <div>
                  <span className="font-semibold text-[15px]">{p?.display_name}</span>
                  <span className="text-white/40 text-[13px]"> @{p?.handle}</span>
                  <div className="mt-1.5 text-[15px]"><RichTextRenderer text={post.text} /></div>
                </div>
              </div>
              {post.media_url && <div className="mt-3 ml-12 rounded-2xl overflow-hidden border border-white/10"><img src={post.media_url} className="w-full max-h-[480px] object-contain" alt="" /></div>}
              <div className="mt-3 ml-12"><SocialPostEnhancements post={post} user_id={userId} /></div>
            </div>
          );
        })}
      </div>
      <div ref={sentinelRef} className="h-1" />
    </div>
  );
}

// ET AUSSI EXPORT DEFAULT POUR COMPATIBILITÉ
export default FeedTab;
