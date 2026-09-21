import { useEffect, useMemo, useState, useCallback } from "react";
import { Compass, Play, Users, Hash, Sparkles } from "lucide-react";
import { supabase } from "../supabaseClient.js";
import { COLORS } from "../theme.js";
import FollowButton from "../features/friends/FollowButton.jsx";

export function DiscoverHub({ userId, onOpenPost, onOpenProfile }) {
  const [videos, setVideos] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // 1 requête avec profil direct grâce à FK profiles.id = author_id
      const [{ data: videoRows }, { data: suggestionRows }] = await Promise.all([
        supabase
         .from("posts")
         .select(`
            id, text, media_url, media_type, created_at, likes_count, comments_count,
            profiles:profiles!author_id(id, display_name, handle, avatar_url)
          `)
         .eq("media_type", "video")
         .not("media_url", "is", null)
         .order("created_at", { ascending: false })
         .range(0, 11), // 12 seulement, pas 20
        userId
         ? supabase.rpc("get_social_suggestions", { p_user_id: userId, p_limit: 8 }).then(r => r.data? r : { data: [] })
          : Promise.resolve({ data: [] }),
      ]);
      setVideos(videoRows || []);
      setSuggestions(suggestionRows || []);
    } catch (e) {
      console.warn("DiscoverHub:", e.message);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { load() }, [load]);

  const sections = useMemo(() => [
    { icon: Play, title: "Vidéos", count: videos.length },
    { icon: Users, title: "Personnes", count: suggestions.length },
  ], [videos.length, suggestions.length]);

  if (loading) return <div className="h-40 rounded-2xl bg-white/5 animate-pulse" />;

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-2 px-1">
        <Compass size={20} style={{ color: COLORS.gold }} />
        <div>
          <h2 className="text-white font-bold text-[16px]">Découvrir</h2>
          <p className="text-[11px] text-white/40">Vidéos et personnes pour toi</p>
        </div>
      </div>

      {/* TABS */}
      <div className="flex gap-2 overflow-x-auto scrollbar-none px-1">
        {sections.map(({ icon: Icon, title, count }) => (
          <div key={title} className="min-w-[90px] rounded-[12px] border border-white/10 p-2.5 bg-white/[0.03]">
            <Icon size={16} className="mb-1.5 opacity-60" />
            <div className="text-[11px] text-white/70 font-bold">{title}</div>
            <div className="text-[10px] text-white/30">{count}</div>
          </div>
        ))}
      </div>

      {/* VIDÉOS - avec thumbnail, pas 20 <video> */}
      <div className="grid grid-cols-2 gap-2.5">
        {videos.map((post) => (
          <button key={post.id} onClick={() => onOpenPost?.(post)}
            className="relative aspect-[9/13] overflow-hidden rounded-[16px] bg-black text-left group">
            {post.media_url? (
              <img
                src={post.media_url}
                loading="lazy"
                className="absolute inset-0 w-full h-full object-cover group-active:scale-105 transition-transform"
                alt=""
              />
            ) : null}
            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/10 to-transparent" />
            <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-black/40 backdrop-blur flex items-center justify-center">
              <Play size={12} className="text-white ml-0.5" />
            </div>
            <div className="absolute inset-x-0 bottom-0 p-2.5">
              <div className="flex items-center gap-1.5 mb-1">
                <img src={post.profiles?.avatar_url} className="w-5 h-5 rounded-full object-cover bg-white/10" alt="" />
                <span className="text-[10px] text-white/80 font-bold truncate">{post.profiles?.handle || 'BAARO'}</span>
              </div>
              <div className="text-white text-[11px] line-clamp-2 leading-[1.2]">{post.text || "Vidéo BAARO"}</div>
              <div className="text-white/50 text-[9px] mt-1">♥ {post.likes_count || 0} · 💬 {post.comments_count || 0}</div>
            </div>
          </button>
        ))}
      </div>

      {/* SUGGESTIONS - tu l'avais oublié */}
      {suggestions.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 px-1 pt-2"><Users size={14} className="opacity-50" /><h3 className="text-xs font-black uppercase tracking-wider opacity-50">Personnes à suivre</h3></div>
          <div className="flex gap-2.5 overflow-x-auto scrollbar-none pb-1">
            {suggestions.map((u) => {
              const profile = u.profile || u; // selon ce que renvoie ton RPC
              return (
                <div key={profile.id} className="min-w-[110px] rounded-[14px] bg-white/[0.04] border border-white/5 p-3 flex flex-col items-center gap-2">
                  <img src={profile.avatar_url} className="w-12 h-12 rounded-full object-cover bg-white/10" alt="" />
                  <div className="text-center"><p className="text-[11px] font-bold truncate max-w-[90px]">{profile.display_name}</p><p className="text-[9px] opacity-40 truncate">{profile.handle}</p></div>
                  <FollowButton targetId={profile.id} compact />
                </div>
              )
            })}
          </div>
        </div>
      )}
    </section>
  );
}
