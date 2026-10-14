import { useState, useRef, useEffect } from "react";
import { supabase } from "../../supabaseClient.js";
import { useCursorFeed } from "../../hooks/useCursorFeed.js";
import { recordFeedEvent } from "../../lib/feedEvents.js";
import { COLORS } from "../../theme.js";
import { RichTextComposer } from "../../components/RichTextComposer.jsx";

// EXPORT NOMME OBLIGATOIRE - Corrige ton erreur Vercel
export function FeedTab() {
  const { posts, hasMore, loadMore, refresh, loading } = useCursorFeed();
  const [text, setText] = useState("");
  const [userId, setUserId] = useState(null);
  const [localPosts, setLocalPosts] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText] = useState("");
  const [openMenuId, setOpenMenuId] = useState(null);
  const sentinelRef = useRef(null);

  useEffect(() => { supabase.auth.getUser().then(({ data }) => setUserId(data?.user?.id)); }, []);
  useEffect(() => {
    if (!sentinelRef.current ||!hasMore) return;
    const io = new IntersectionObserver((e) => { if (e[0].isIntersecting &&!loading) loadMore(); }, { rootMargin: "400px" });
    io.observe(sentinelRef.current);
    return () => io.disconnect();
  }, [hasMore, loading, loadMore]);

  const getText = (p) => p?.content || p?.text || "";
  const formatDate = (iso) => {
    if (!iso) return "";
    const d = new Date(iso); const diff = Date.now() - d.getTime();
    const m = Math.floor(diff/60000); const h = Math.floor(diff/3600000);
    if (m < 1) return "À l'instant"; if (m < 60) return `${m}min`; if (h < 24) return `${h}h`;
    return d.toLocaleDateString("fr-FR", { day:"2-digit", month:"short" });
  };
  const formatViews = (n) => { if(!n) return "0"; if(n>=1000) return `${(n/1000).toFixed(1)}k`; return n; };

  const handlePost = async () => {
    const plain = (typeof text === 'string'? text : text?.text || "").trim();
    if (!plain) return;
    const temp = { id: `temp-${Date.now()}`, content: plain, text: plain, author_id: userId, created_at: new Date().toISOString(), like_count: 0, view_count: 0, profiles: { display_name: "Toi", handle: "toi" } };
    setLocalPosts(v=>[temp,...v]);
    await supabase.from("posts").insert({ author_id: userId, content: plain, text: plain });
    setText(""); setTimeout(()=>{setLocalPosts([]); refresh();}, 500);
  };

  const allPosts = [...localPosts,...posts];

  return (
    <div className="max-w-[680px] mx-auto w-full pb-24">
      <div className="glass-card p-4 mb-3">
        <RichTextComposer value={text} onChange={setText} placeholder="Quoi de neuf chef?" />
        <div className="flex justify-end mt-3"><button onClick={handlePost} className="btn-baaro px-8 h-10 text-sm">Publier</button></div>
      </div>

      <div className="flex flex-col gap-3">
        {allPosts.map((post) => {
          const p = post.profiles; const isOwn = post.author_id === userId;
          const displayText = getText(post);
          const likes = post.like_count?? post.likes?? post.likes_count?? 0;
          const views = post.view_count?? post.views?? post.impressions?? 0;

          return (
            <article key={post.id} onMouseEnter={()=>recordFeedEvent(post.id, "view")} className="glass-card p-4">
              <div className="flex gap-3">
                <img src={p?.avatar_url || `https://api.dicebear.com/7.x/initials/svg?seed=${p?.handle}`} className="w-10 h-10 rounded-full border object-cover shrink-0" style={{borderColor: COLORS.borderGold}} alt="" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-[15px]" style={{color: COLORS.ivory}}>{p?.display_name || "Membre"}</span>
                      <span className="text-[13px]" style={{color: COLORS.muted}}>@{p?.handle}</span>
                      <span className="text-[11px]" style={{color: COLORS.muted}}>· {formatDate(post.created_at)}</span>
                    </div>
                    <div className="relative">
                      <button onClick={()=>setOpenMenuId(openMenuId===post.id? null : post.id)} className="w-8 h-8 rounded-full flex items-center justify-center" style={{background: COLORS.surface2}}>⋯</button>
                      {openMenuId===post.id && (
                        <div className="absolute right-0 top-10 z-20 w-44 rounded-xl border p-1 shadow-xl" style={{background: COLORS.surface, borderColor: COLORS.border}}>
                          {isOwn? (
                            <>
                              <button onClick={()=>{setEditingId(post.id); setEditText(displayText); setOpenMenuId(null);}} className="w-full text-left px-3 py-2.5 rounded-lg text-sm hover:bg-white/5" style={{color: COLORS.ivory}}>✏️ Modifier</button>
                              <button onClick={async()=>{setOpenMenuId(null); if(confirm("Supprimer?")){await supabase.from("posts").delete().eq("id", post.id); refresh();}}} className="w-full text-left px-3 py-2.5 rounded-lg text-sm text-red-400 hover:bg-white/5">🗑️ Supprimer</button>
                            </>
                          ) : (
                            <>
                              <button onClick={()=>{setOpenMenuId(null); alert("Signalé 🚩");}} className="w-full text-left px-3 py-2.5 rounded-lg text-sm hover:bg-white/5" style={{color: COLORS.ivory}}>🚩 Signaler</button>
                              <button onClick={()=>setOpenMenuId(null)} className="w-full text-left px-3 py-2.5 rounded-lg text-sm hover:bg-white/5" style={{color: COLORS.muted}}>🙈 Ne plus voir</button>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {editingId===post.id? (
                    <div className="mt-3"><RichTextComposer value={editText} onChange={setEditText} /><div className="flex gap-2 mt-3"><button onClick={()=>setEditingId(null)} className="flex-1 h-9 rounded-full border text-sm" style={{borderColor: COLORS.border, color: COLORS.muted}}>Annuler</button><button onClick={async()=>{await supabase.from("posts").update({content: editText, text: editText}).eq("id", post.id); setEditingId(null); refresh();}} className="flex-1 btn-baaro h-9 text-sm">Enregistrer</button></div></div>
                  ) : (
                    <div className="mt-2 text-[15px] whitespace-pre-wrap" style={{color: COLORS.ivory}}>{displayText}</div>
                  )}

                  {post.media_url && <div className="mt-3 rounded-xl overflow-hidden border" style={{borderColor: COLORS.border}}><img src={post.media_url} className="w-full max-h-[480px] object-contain" alt="" /></div>}

                  {/* BARRE RESTAURÉE: VUES + LIKES + POURBOIRE */}
                  <div className="flex items-center justify-between mt-3 pt-2.5 border-t" style={{borderColor: COLORS.border}}>
                    <div className="flex items-center gap-2">
                      <button onClick={async()=>{await supabase.from("post_likes").insert({post_id: post.id, user_id: userId}); recordFeedEvent(post.id,"like"); refresh();}} className="flex items-center gap-1.5 h-8 px-3 rounded-full border text-sm" style={{background: COLORS.surface2, borderColor: likes>0? COLORS.borderGold : COLORS.border, color: likes>0? COLORS.gold : COLORS.muted}}>
                        <span>👍</span><span>{likes>0? likes : "J'aime"}</span>
                      </button>
                      <div className="flex items-center gap-1 text-xs ml-1" style={{color: COLORS.muted}}>
                        <span>👁️</span><span>{formatViews(views)} vues</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button className="w-8 h-8 rounded-full border flex items-center justify-center" style={{background: COLORS.surface2, borderColor: COLORS.border}}>🔖</button>
                      <button className="w-8 h-8 rounded-full border flex items-center justify-center" style={{background: COLORS.surface2, borderColor: COLORS.border}}>↗️</button>
                      <button onClick={()=>{const m=prompt("Montant pourboire (Points)?"); if(m) alert(`${m} Points envoyés 💸`);}} className="h-8 px-3 rounded-full text-xs font-bold border flex items-center gap-1" style={{background: `rgba(217,174,82,0.15)`, borderColor: COLORS.borderGold, color: COLORS.gold}}>💸 Pourboire</button>
                    </div>
                  </div>
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

// DOUBLE EXPORT - Fixe ton erreur index.js
export default FeedTab;
