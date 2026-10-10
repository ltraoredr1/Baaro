import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../../../supabaseClient.js";
import { isMissingColumn } from "../utils/videosApi.js";

// Chargement du flux (vidéos, likes de l'utilisateur), temps réel et tri.
export function useVideoFeed() {
  const [videos, setVideos] = useState([]);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [likedMap, setLikedMap] = useState({});
  const [mode, setMode] = useState("forYou");

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data?.user || null));
  }, []);

  const loadVideos = useCallback(async () => {
    setLoading(true);
    setLoadError(null);

    try {
      const buildSelect = (withSound) => `
        id,
        title,
        description,
        video_url,
        thumbnail_url,
        duration,
        views,
        likes,
        comments_count,
        is_repost,
        created_at,
        author_id,
        sound_id,${withSound ? "\n        sound_url,\n        sound_title,\n        mute_original," : ""}
        profiles:author_id (
          display_name,
          handle,
          flag,
          avatar_url
        )
      `;

      const fetchFeed = (withSound) =>
        supabase
          .from("videos")
          .select(buildSelect(withSound))
          .order("created_at", { ascending: false })
          .limit(100);

      let { data, error } = await fetchFeed(true);
      if (error && isMissingColumn(error)) {
        ({ data, error } = await fetchFeed(false));
      }

      if (error) throw error;
      setVideos(data || []);

      if (user?.id) {
        const { data: likes } = await supabase
          .from("video_likes")
          .select("video_id")
          .eq("user_id", user.id);

        const map = {};
        (likes || []).forEach((item) => {
          map[item.video_id] = true;
        });
        setLikedMap(map);
      }
    } catch (error) {
      console.error(error);
      setLoadError(error.message || "Impossible de charger les vidéos.");
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    loadVideos();
  }, [loadVideos]);

  useEffect(() => {
    const channel = supabase
      .channel("baaro-videos-v2")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "videos" },
        () => loadVideos(),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadVideos]);

  const visibleVideos = useMemo(() => {
    const list = [...videos];

    if (mode === "trending") {
      return list.sort((a, b) => {
        const scoreA =
          Number(a.views || 0) +
          Number(a.likes || 0) * 4 +
          Number(a.comments_count || 0) * 6;
        const scoreB =
          Number(b.views || 0) +
          Number(b.likes || 0) * 4 +
          Number(b.comments_count || 0) * 6;
        return scoreB - scoreA;
      });
    }

    return list;
  }, [videos, mode]);

  return {
    videos,
    setVideos,
    user,
    loading,
    loadError,
    loadVideos,
    likedMap,
    setLikedMap,
    mode,
    setMode,
    visibleVideos,
  };
}
