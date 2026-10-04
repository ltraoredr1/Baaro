import { useEffect, useState, useCallback } from "react";
import { Compass, Play, Users } from "lucide-react";
import { supabase } from "../supabaseClient.js";
import { COLORS } from "../theme.js";
import FollowButton from "../features/friends/FollowButton.jsx";

export function DiscoverHub({ userId, onOpenPost }) {
  const [videos, setVideos] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // 1. Vidéos - requête simple sans join qui casse
      const { data: videoRows, error: vErr } = await supabase
      .from("posts")
      .select("id, text, media_url, media_type, created_at, likes_count, comments_count, author_id")
      .eq("media_type", "video")
      .not("media_url", "is", null)
      .order("created_at", { ascending: false })
      .limit(12);

      if (vErr) throw vErr;

      // 2. Profiles des vidéos en 2e requête (pas de!inner)
      let videosWithProfiles = videoRows || [];
      if (videosWithProfiles.length) {
        const authorIds = [...new Set(videosWithProfiles.map(v => v.author_id).filter(Boolean))];
        if (authorIds.length) {
          const { data: profs } = await supabase.from("profiles").select("id, display_name, handle, avatar_url").in("id", authorIds);
          const map = Object.fromEntries((profs||[]).map(p=>[p.id,p]));
          videosWithProfiles = videosWithProfiles.map(v => ({...v, profiles: map[v.author_id] || null }));
        }
      }
      setVideos(videosWithProfiles);

      // 3. Suggestions - avec fallback si RPC n'existe pas
      let suggs = [];
      if (userId) {
        try {
          const { data, error } = await supabase.rpc("get_social_suggestions", { p_user_id: userId, p_limit: 8 });
          if (!error && data) suggs = data;
        } catch {
          // RPC n'existe pas -> fallback
        }
      }
      if (!suggs.length) {
        const { data: fallback } = await supabase
        .from("profiles")
        .select("id, display_name, handle, avatar_url")
        .neq("id", userId || "")
        .order("created_at", { ascending: false })
        .limit(8);
        suggs = fallback || [];
      }
      setSuggestions(suggs);

    } catch (e) {
      console.warn("DiscoverHub:", e.message);
      setVideos([]); setSuggestions([]);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { load(); }, [load]);

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

      {/* VIDÉOS */}
      <div className="grid grid-cols-2 gap-2.5">
        {videos.map((post) => (
          <button key={post.id} onClick={() => onOpenPost?.(post)}
            className="relative aspect-[9/13] overflow-hidden rounded-[16px] bg-black text-left group">
            <video src={post.media_url} muted playsInline preload="metadata" className="absolute inset-0 w-full h-full object-cover" />
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

      {suggestions.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 px-1 pt-2"><Users size={14} className="opacity-50" /><h3 className="text-xs font-black uppercase tracking-wider opacity-50">Personnes à suivre</h3></div>
          <div className="flex gap-2.5 overflow-x-auto scrollbar-none pb-1">
            {suggestions.map((u) => {
              const profile = u.profile || u;
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
