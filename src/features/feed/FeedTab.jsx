import { useState, useRef, useEffect } from "react";
import { supabase } from "../../supabaseClient.js";
import { useCursorFeed } from "../../hooks/useCursorFeed.js";
import { recordFeedEvent } from "../../lib/feedEvents.js";
import { uploadExternalMedia } from "../../lib/externalMedia.js";
import { RichTextComposer } from "../../components/RichTextComposer.jsx";
import { SocialPostEnhancements } from "./SocialEnhancements.jsx";
import { COLORS } from "../../theme.js";

export function FeedTab() {
  const { posts, loading, hasMore, loadMore, refresh } = useCursorFeed();
  const [text, setText] = useState("");
  const [mediaUrl, setMediaUrl] = useState("");
  const [mediaType, setMediaType] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [composing, setComposing] = useState(false);
  const [userId, setUserId] = useState(null);
  const [localPosts, setLocalPosts] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText] = useState("");
  const [openMenuId, setOpenMenuId] = useState(null);
  const sentinelRef = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => { supabase.auth.getUser().then(({ data }) => setUserId(data?.user?.id)); }, []);
  useEffect(() => {
    if (!sentinelRef.current ||!hasMore) return;
    const io = new IntersectionObserver((e) => { if (e[0].isIntersecting &&!loading) loadMore(); }, { rootMargin: "400px" });
    io.observe(sentinelRef.current);
    return () => io.disconnect();
  }, [hasMore, loading, loadMore]);

  const getPlainText = (val) => {
    if (!val) return "";
    if (typeof val === "string") return val;
    if (val?.text) return val.text;
    if (Array.isArray(val?.content)) return val.content.map(b => b.content?.map(c => c.text || "").join("") || "").join("\n");
    return "";
  };

  const handleFile = async (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    setUploading(true);
    try { const { url, type } = await uploadExternalMedia(file); setMediaUrl(url); setMediaType(type); }
    finally { setUploading(false); }
  };

  const handlePost = async () => {
    const plain = getPlainText(text).trim();
    if (!plain &&!mediaUrl) return;
    setComposing(true);
    const temp = { id: `temp-${Date.now()}`, text: plain, content: plain, media_url: mediaUrl, media_type: mediaType, author_id: userId, created_at: new Date().toISOString(), profiles: { display_name: "Toi", handle: "toi" } };
    setLocalPosts(p => [temp,...p]);
    try {
      await supabase.from("posts").insert({ author_id: userId, text: plain, content: plain, media_url: mediaUrl || null, media_type: mediaType || null });
      setText(""); setMediaUrl(""); setMediaType(null);
      setTimeout(() => { setLocalPosts([]); refresh(); }, 600);
    } finally { setComposing(false); }
  };

  const handleDelete = async (id) => {
    if (!confirm("Supprimer?")) return;
    await supabase.from("posts").delete().eq("id", id);
    setLocalPosts(p => p.filter(x => x.id!== id));
    refresh();
  };

  const handleEditSave = async (id) => {
    const plain = getPlainText(editText).trim();
    if (!plain) return;
    await supabase.from("posts").update({ text: plain, content: plain }).eq("id", id);
    setEditingId(null); refresh();
  };

  const allPosts = [...localPosts,...posts];

  return (
    <div className="max-w-[680px] mx-auto w-full pb-24">
      <section className="glass-card p-4 mb-3">
        <RichTextComposer value={text} onChange={setText} placeholder="Quoi de neuf chef?" />
        {mediaUrl && <div className="mt-3 rounded-xl overflow-hidden border relative" style={{ borderColor: COLORS.border }}><img src={mediaUrl} className="w-full max-h-[320px] object-cover" alt="" /><button onClick={() => { setMediaUrl(""); setMediaType(null); }} className="absolute top-2 right-2 bg-black/60 rounded-full w-7 h-7 text-white">✕</button></div>}
        <div className="flex justify-between items-center mt-4">
          <button onClick={() => fileInputRef.current?.click()} className="w-10 h-10 rounded-full border flex items-center justify-center" style={{ background: COLORS.surface2, borderColor: COLORS.border }}>📷</button>
          <input ref={fileInputRef} type="file" accept="image/*,video/*" hidden onChange={handleFile} />
          <button onClick={handlePost} disabled={composing || uploading || (!getPlainText(text).trim() &&!mediaUrl)} className="btn-baaro px-8 h-11 text-sm disabled:opacity-40">Publier</button>
        </div>
      </section>

      <div className="flex flex-col gap-3">
        {allPosts.map((post) => {
          const p = post.profiles; const isOwn = post.author_id === userId; const isEditing = editingId === post.id;
          const displayText = post.content || post.text || "";
          return (
            <article key={post.id} className="glass-card p-4 relative">
              <div className="flex gap-3">
                <img src={p?.avatar_url || `https://api.dicebear.com/7.x/initials/svg?seed=${p?.handle}`} className="w-10 h-10 rounded-full border object-cover" style={{ borderColor: COLORS.borderGold }} alt="" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <div className="flex gap-1.5"><span className="font-bold text-[15px]" style={{ color: COLORS.ivory }}>{p?.display_name || "Membre"}</span><span className="text-[13px]" style={{ color: COLORS.muted }}>@{p?.handle || "user"}</span></div>
                    {isOwn && <div className="relative"><button onClick={() => setOpenMenuId(openMenuId === post.id? null : post.id)} className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: COLORS.surface2 }}>⋯</button>{openMenuId === post.id && <div className="absolute right-0 top-10 z-20 w-36 rounded-xl border p-1 shadow-xl" style={{ background: COLORS.surface, borderColor: COLORS.border }}><button onClick={() => { setEditingId(post.id); setEditText(displayText); setOpenMenuId(null); }} className="w-full text-left px-3 py-2 rounded-lg text-sm" style={{ color: COLORS.ivory }}>✏️ Modifier</button><button onClick={() => { setOpenMenuId(null); handleDelete(post.id); }} className="w-full text-left px-3 py-2 rounded-lg text-sm text-red-400">🗑️ Supprimer</button></div>}</div>}
                  </div>
                  {isEditing? <div className="mt-3"><RichTextComposer value={editText} onChange={setEditText} /><div className="flex gap-2 mt-3"><button onClick={() => setEditingId(null)} className="flex-1 h-9 rounded-full border text-sm" style={{ borderColor: COLORS.border, color: COLORS.muted }}>Annuler</button><button onClick={() => handleEditSave(post.id)} className="flex-1 btn-baaro h-9 text-sm">Enregistrer</button></div></div> : <div className="mt-2 text-[15px] leading-[22px] whitespace-pre-wrap" style={{ color: COLORS.ivory }}>{displayText}</div>}
                  {post.media_url &&!isEditing && <div className="mt-3 rounded-xl overflow-hidden border" style={{ borderColor: COLORS.border }}><img src={post.media_url} className="w-full max-h-[480px] object-contain" alt="" /></div>}
                  <div className="mt-3"><SocialPostEnhancements post={post} user_id={userId} onLiked={() => recordFeedEvent(post.id, "like")} /></div>
                </div>
              </div>
            </article>
          );
        })}
      </div>
      <div ref={sentinelRef} className="h-10" />
    </div>
  );
}

// EXPORTS OBLIGATOIRES POUR TON index.js - NE PAS SUPPRIMER
export default FeedTab;
