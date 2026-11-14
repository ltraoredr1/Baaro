import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../../../supabaseClient.js";
import { isMissingColumn } from "../utils/videosApi.js";

const buildVideoSelect = (withSound) => `
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
  sound_id,${withSound ? `
  sound_url,
  sound_title,
  mute_original,` : ""}
  profiles:author_id (
    display_name,
    handle,
    flag,
    avatar_url
  )
`;

export function useVideoFeed() {
  const [videos, setVideos] = useState([]);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [likedMap, setLikedMap] = useState({});
  const [mode, setMode] = useState("forYou");

  const requestSequence = useRef(0);
  const currentUserId = useRef(null);
  const realtimeTimers = useRef(new Map());
  const likeRealtimeTimers = useRef(new Map());

  // Synchronisation des connexions et déconnexions.
  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const nextUser = session?.user || null;
      const nextUserId = nextUser?.id || null;

      if (currentUserId.current !== nextUserId) {
        currentUserId.current = nextUserId;
        requestSequence.current += 1;
        setLikedMap({});
      }

      setUser(nextUser);
    });

    return () => subscription.unsubscribe();
  }, []);

  const loadVideos = useCallback(async () => {
    const requestId = ++requestSequence.current;
    const userId = user?.id || null;

    setLoading(true);
    setLoadError(null);

    try {
      const fetchFeed = (withSound) =>
        supabase
          .from("videos")
          .select(buildVideoSelect(withSound))
          .order("created_at", { ascending: false })
          .limit(100);

      let { data, error } = await fetchFeed(true);

      if (error && isMissingColumn(error)) {
        ({ data, error } = await fetchFeed(false));
      }

      if (error) throw error;

      const sharedVideoId =
        typeof window !== "undefined"
          ? new URLSearchParams(window.location.search).get("video")
          : null;

      if (
        sharedVideoId &&
        !(data || []).some(
          (video) => String(video.id) === String(sharedVideoId),
        )
      ) {
        try {
          let { data: sharedVideo, error: sharedVideoError } =
            await supabase
              .from("videos")
              .select(buildVideoSelect(true))
              .eq("id", sharedVideoId)
              .maybeSingle();

          if (sharedVideoError && isMissingColumn(sharedVideoError)) {
            ({ data: sharedVideo, error: sharedVideoError }) =
              await supabase
                .from("videos")
                .select(buildVideoSelect(false))
                .eq("id", sharedVideoId)
                .maybeSingle();
          }

          if (!sharedVideoError && sharedVideo) {
            data = [sharedVideo, ...(data || [])];
          }
        } catch (sharedVideoError) {
          console.warn(
            "[video-share] Chargement impossible :",
            sharedVideoError,
          );
        }
      }

      if (requestId !== requestSequence.current) return;
      setVideos(data || []);

      if (!userId) {
        setLikedMap({});
      } else {
        const { data: likes, error: likesError } = await supabase
          .from("video_likes")
          .select("video_id")
          .eq("user_id", userId);

        if (likesError) throw likesError;
        if (requestId !== requestSequence.current) return;

        const map = {};
        (likes || []).forEach((item) => {
          map[item.video_id] = true;
        });
        setLikedMap(map);
      }
    } catch (error) {
      if (requestId !== requestSequence.current) return;
      console.error("[videos] Erreur de chargement :", error);
      setLoadError(error.message || "Impossible de charger les vidéos.");
    } finally {
      if (requestId === requestSequence.current) setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    loadVideos();
  }, [loadVideos]);

  // Mise à jour ciblée sans recharger tout le flux.
  useEffect(() => {
    let active = true;

    const channel = supabase
      .channel("baaro-videos-v3")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "videos" },
        (payload) => {
          if (!active) return;

          const eventType = payload.eventType;
          const record = eventType === "DELETE" ? payload.old : payload.new;
          const videoId = record?.id;

          if (!videoId) return;

          const previousTimer = realtimeTimers.current.get(videoId);
          if (previousTimer) clearTimeout(previousTimer);
          realtimeTimers.current.delete(videoId);

          if (eventType === "DELETE") {
            setVideos((current) =>
              current.filter(
                (video) => String(video.id) !== String(videoId),
              ),
            );

            setLikedMap((current) => {
              if (!(videoId in current)) return current;
              const next = { ...current };
              delete next[videoId];
              return next;
            });
            return;
          }

          if (eventType !== "INSERT" && eventType !== "UPDATE") return;

          const timer = setTimeout(async () => {
            realtimeTimers.current.delete(videoId);

            try {
              let { data, error } = await supabase
                .from("videos")
                .select(buildVideoSelect(true))
                .eq("id", videoId)
                .maybeSingle();

              if (error && isMissingColumn(error)) {
                ({ data, error } = await supabase
                  .from("videos")
                  .select(buildVideoSelect(false))
                  .eq("id", videoId)
                  .maybeSingle());
              }

              if (!active || error || !data) return;

              setVideos((current) => {
                const index = current.findIndex(
                  (video) => String(video.id) === String(videoId),
                );

                if (index >= 0) {
                  const next = [...current];
                  next[index] = { ...next[index], ...data };
                  return next;
                }

                if (eventType === "INSERT") {
                  return [data, ...current].slice(0, 100);
                }

                return current;
              });
            } catch (error) {
              console.warn(
                "[videos-realtime] Mise à jour ciblée impossible :",
                error,
              );
            }
          }, 180);

          realtimeTimers.current.set(videoId, timer);
        },
      )
      .subscribe();

    return () => {
      active = false;
      realtimeTimers.current.forEach((timer) => clearTimeout(timer));
      realtimeTimers.current.clear();
      supabase.removeChannel(channel);
    };
  }, []);

  // Synchronisation ciblée des likes entre utilisateurs.
  useEffect(() => {
    let active = true;

    const channel = supabase
      .channel("baaro-video-likes-v1")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "video_likes" },
        (payload) => {
          if (!active) return;

          const record =
            payload.eventType === "DELETE" ? payload.old : payload.new;

          const videoId = record?.video_id;
          const actorId = record?.user_id;

          if (!videoId) return;

          const previous = likeRealtimeTimers.current.get(videoId);
          if (previous) clearTimeout(previous);

          const timer = setTimeout(async () => {
            likeRealtimeTimers.current.delete(videoId);

            try {
              const { count, error } = await supabase
                .from("video_likes")
                .select("*", { count: "exact", head: true })
                .eq("video_id", videoId);

              if (!active || error || count === null) return;

              setVideos((current) =>
                current.map((video) =>
                  String(video.id) === String(videoId)
                    ? { ...video, likes: count }
                    : video,
                ),
              );

              if (actorId && actorId === currentUserId.current) {
                setLikedMap((current) => ({
                  ...current,
                  [videoId]: payload.eventType !== "DELETE",
                }));
              }
            } catch (error) {
              console.warn("[video-likes-realtime]", error);
            }
          }, 180);

          likeRealtimeTimers.current.set(videoId, timer);
        },
      )
      .subscribe();

    return () => {
      active = false;
      likeRealtimeTimers.current.forEach(clearTimeout);
      likeRealtimeTimers.current.clear();
      supabase.removeChannel(channel);
    };
  }, []);

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
