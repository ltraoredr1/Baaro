import { useState, useEffect, useCallback, useRef } from "react";
import { Compass, Play, Pause, ExternalLink, Users } from "lucide-react";
import { supabase } from "../supabaseClient.js";
import { COLORS } from "../theme.js";
import FollowButton from "../features/friends/FollowButton.jsx";
import { getProfilesByIds } from "../lib/queries.js";

export function DiscoverHub({ user_id, onOpenPost }) {
  const [videos, setVideos] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [playingVideoId, setPlayingVideoId] = useState(null);

  // Références pour contrôler la lecture/pause directe
  const videoRefs = useRef({});

  const load = useCallback(async (isCancelled = () => false) => {
    setLoading(true);

    try {
      // 1. Charger les vidéos
      const { data: videoRows, error: videoError } = await supabase
        .from("posts")
        .select(
          "id, text, media_url, media_type, created_at, likes_count, comments_count, author_id"
        )
        .eq("media_type", "video")
        .not("media_url", "is", null)
        .order("created_at", { ascending: false })
        .limit(12);

      if (videoError) throw videoError;
      if (isCancelled()) return;

      let videosWithProfiles = videoRows || [];

      // 2. Charger les profils des auteurs
      const authorIds = [
        ...new Set(
          videosWithProfiles
            .map((post) => post.author_id)
            .filter(Boolean)
        ),
      ];

      if (authorIds.length > 0) {
        const { data: profiles, error: profilesError } = await getProfilesByIds(authorIds);

        if (profilesError) {
          console.warn("DiscoverHub - profils vidéo :", profilesError.message);
        }

        if (isCancelled()) return;

        const profileMap = Object.fromEntries(
          (profiles || []).map((profile) => [profile.id, profile])
        );

        videosWithProfiles = videosWithProfiles.map((post) => ({
          ...post,
          profiles: profileMap[post.author_id] || null,
        }));
      }

      if (isCancelled()) return;
      setVideos(videosWithProfiles);

      // 3. Suggestions sociales
      let suggestionsList = [];

      if (user_id) {
        try {
          const { data, error } = await supabase.rpc(
            "get_social_suggestions",
            {
              p_user_id: user_id,
              p_limit: 8,
            }
          );

          if (error) {
            console.warn("DiscoverHub - suggestions :", error.message);
          } else if (Array.isArray(data)) {
            suggestionsList = data;
          }
        } catch (error) {
          console.warn("DiscoverHub - RPC suggestions :", error?.message || error);
        }
      }

      if (isCancelled()) return;

      if (suggestionsList.length === 0) {
        let query = supabase
          .from("profiles")
          .select("id, display_name, handle, avatar_url")
          .order("created_at", { ascending: false })
          .limit(8);

        if (user_id) {
          query = query.neq("id", user_id);
        }

        const { data: fallback, error: fallbackError } = await query;

        if (fallbackError) {
          console.warn("DiscoverHub - profils suggérés :", fallbackError.message);
        }

        if (isCancelled()) return;
        suggestionsList = fallback || [];
      }

      setSuggestions(suggestionsList);
    } catch (error) {
      if (isCancelled()) return;

      console.warn("DiscoverHub :", error?.message || error);
      setVideos([]);
      setSuggestions([]);
    } finally {
      if (!isCancelled()) {
        setLoading(false);
      }
    }
  }, [user_id]);

  useEffect(() => {
    let cancelled = false;
    load(() => cancelled);
    return () => {
      cancelled = true;
    };
  }, [load]);

  // Gestion de la lecture/pause directement sur la carte
  const handleTogglePlay = (postId) => {
    const currentVideo = videoRefs.current[postId];
    if (!currentVideo) return;

    // Met en pause toutes les autres vidéos si une autre jouait
    Object.keys(videoRefs.current).forEach((id) => {
      if (id !== String(postId) && videoRefs.current[id]) {
        videoRefs.current[id].pause();
      }
    });

    if (currentVideo.paused) {
      currentVideo.play().then(() => {
        setPlayingVideoId(postId);
      }).catch(() => {});
    } else {
      currentVideo.pause();
      setPlayingVideoId(null);
    }
  };

  // Redirection explicite vers la publication complète dans le fil parent
  const handleOpenPost = useCallback(
    (e, post) => {
      e.stopPropagation(); // Évite de déclencher la lecture/pause
      if (!post?.id || typeof onOpenPost !== "function") return;

      // Pause la vidéo en cours si elle tourne
      if (videoRefs.current[post.id]) {
        videoRefs.current[post.id].pause();
      }
      onOpenPost(post);
    },
    [onOpenPost]
  );

  if (loading) {
    return (
      <div
        className="h-40 rounded-2xl bg-white/5 animate-pulse"
        role="status"
        aria-label="Chargement de Découvrir"
      />
    );
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-2 px-1">
        <Compass size={20} style={{ color: COLORS.gold }} />
        <div>
          <h2 className="text-white font-bold text-[16px]">Découvrir</h2>
          <p className="text-[11px] text-white/40">Vidéos et personnes pour toi</p>
        </div>
      </div>

      {/* GRILLE VIDÉO */}
      {videos.length > 0 && (
        <div className="grid grid-cols-2 gap-2.5">
          {videos.map((post) => {
            const isPlaying = playingVideoId === post.id;

            return (
              <div
                key={post.id}
                onClick={() => handleTogglePlay(post.id)}
                className="relative aspect-[9/13] overflow-hidden rounded-[16px] bg-black text-left cursor-pointer group select-none"
              >
                {/* LECTEUR VIDÉO DIRECT */}
                <video
                  ref={(el) => (videoRefs.current[post.id] = el)}
                  src={post.media_url}
                  playsInline
                  preload="metadata"
                  onEnded={() => setPlayingVideoId(null)}
                  className="absolute inset-0 w-full h-full object-cover"
                />

                <div
                  className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/10 to-transparent pointer-events-none"
                  aria-hidden="true"
                />

                {/* BOUTON PLAY / PAUSE FLOTTANT */}
                <div
                  className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/50 backdrop-blur flex items-center justify-center transition-transform active:scale-95 z-10"
                >
                  {isPlaying ? (
                    <Pause size={13} className="text-white" />
                  ) : (
                    <Play size={13} className="text-white ml-0.5" />
                  )}
                </div>

                {/* LIEN D'ACCÈS RAPIDE À LA PUBLICATION COMPLÈTE */}
                <button
                  type="button"
                  onClick={(e) => handleOpenPost(e, post)}
                  title="Voir la publication complète"
                  className="absolute top-2 left-2 px-2 py-1 rounded-full bg-black/50 backdrop-blur text-[10px] text-white/90 font-medium flex items-center gap-1 z-10 hover:bg-black/80 transition-colors"
                >
                  <span>Post</span>
                  <ExternalLink size={10} />
                </button>

                {/* CONTENU & AUTEUR (Un clic redirige aussi vers la publication) */}
                <div className="absolute inset-x-0 bottom-0 p-2.5 z-10">
                  <div
                    onClick={(e) => handleOpenPost(e, post)}
                    className="flex items-center gap-1.5 mb-1 cursor-pointer hover:opacity-90 transition-opacity"
                  >
                    {post.profiles?.avatar_url ? (
                      <img
                        src={post.profiles.avatar_url}
                        className="w-5 h-5 rounded-full object-cover bg-white/10"
                        alt=""
                        loading="lazy"
                      />
                    ) : (
                      <div className="w-5 h-5 rounded-full bg-white/10" />
                    )}

                    <span className="text-[10px] text-white/90 font-bold truncate hover:underline">
                      {post.profiles?.handle || "@membre"}
                    </span>
                  </div>

                  <div
                    onClick={(e) => handleOpenPost(e, post)}
                    className="text-white text-[11px] line-clamp-2 leading-[1.2] cursor-pointer hover:text-amber-200/90 transition-colors"
                  >
                    {post.text || "Vidéo BAARO"}
                  </div>

                  <div className="text-white/50 text-[9px] mt-1 flex items-center justify-between">
                    <span>♥ {post.likes_count || 0} · 💬 {post.comments_count || 0}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {videos.length === 0 && (
        <p className="text-xs text-white/40 px-1">
          Aucune vidéo à découvrir pour le moment.
        </p>
      )}

      {/* PERSONNES À SUIVRE */}
      {suggestions.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 px-1 pt-2">
            <Users size={14} className="opacity-50" />
            <h3 className="text-xs font-black uppercase tracking-wider opacity-50">
              Personnes à suivre
            </h3>
          </div>

          <div className="flex gap-2.5 overflow-x-auto scrollbar-none pb-1">
            {suggestions.map((suggestion, index) => {
              const profile = suggestion.profile || suggestion;

              if (!profile?.id) return null;

              return (
                <div
                  key={profile.id || index}
                  className="min-w-[110px] rounded-[14px] bg-white/[0.04] border border-white/5 p-3 flex flex-col items-center gap-2"
                >
                  {profile.avatar_url ? (
                    <img
                      src={profile.avatar_url}
                      className="w-12 h-12 rounded-full object-cover bg-white/10"
                      alt=""
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-12 h-12 rounded-full bg-white/10" />
                  )}

                  <div className="text-center min-w-0 w-full">
                    <p className="text-[11px] font-bold truncate max-w-[90px] mx-auto text-white">
                      {profile.display_name || profile.handle || "Membre"}
                    </p>
                    <p className="text-[9px] opacity-40 truncate">
                      {profile.handle || ""}
                    </p>
                  </div>

                  {profile.id !== user_id && (
                    <FollowButton targetId={profile.id} compact />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}

export default DiscoverHub;
