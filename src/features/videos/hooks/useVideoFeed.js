import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../../../supabaseClient.js";
import { useSocial } from "../../../hooks/useSocial.js";
import { isMissingColumn } from "../utils/videosApi.js";
import { rankForYou, rankTrending, recordBookmarks, syncWatchHistory } from "../lib/feedScore.js";

const PAGE_SIZE = 8;

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
  saves_count,
  shares_count,
  watch_ratio_sum,
  watch_ratio_count,
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

/**
 * Construit le filtre cursor (created_at, id) pour une pagination stable.
 * On ordonne toujours par created_at DESC, id DESC.
 */
function applyCursor(query, cursor) {
  if (!cursor?.created_at || !cursor?.id) return query;

  // (created_at < cursor) OR (created_at = cursor AND id < cursor.id)
  return query.or(
    `created_at.lt.${cursor.created_at},and(created_at.eq.${cursor.created_at},id.lt.${cursor.id})`
  );
}

export function useVideoFeed() {
  const [videos, setVideos] = useState([]);
  const videosRef = useRef([]);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [likedMap, setLikedMap] = useState({});
  const [mode, setMode] = useState("forYou");
  const [profileRevision, setProfileRevision] = useState(0);
  const { friends, loading: friendsLoading } = useSocial(user?.id);

  videosRef.current = videos;
  const requestSequence = useRef(0);
  const currentUserId = useRef(null);
  const realtimeTimers = useRef(new Map());
  const likeRealtimeTimers = useRef(new Map());
  const cursorRef = useRef(null); // { created_at, id }
  const loadingMoreRef = useRef(false);
  const forYouOrderRef = useRef([]); // ordre figé : le fil ne bouge pas sous les doigts

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

  const fetchPage = useCallback(async (withSound, cursor) => {
    let query = supabase
      .from("videos")
      .select(buildVideoSelect(withSound))
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(PAGE_SIZE);

    query = applyCursor(query, cursor);

    return query;
  }, []);

  /**
   * Charge la première page (reset) ou une page suivante.
   * @param {{ reset?: boolean }} options
   */
  const loadVideos = useCallback(
    async (options = {}) => {
      const reset = options.reset !== false; // défaut = reset
      const requestId = ++requestSequence.current;
      const userId = user?.id || null;

      if (reset) {
        setLoading(true);
        setLoadError(null);
        setHasMore(true);
        cursorRef.current = null;
        forYouOrderRef.current = [];
      } else {
        if (!hasMore || loadingMoreRef.current) return;
        loadingMoreRef.current = true;
        setLoadingMore(true);
      }

      try {
        const cursor = reset ? null : cursorRef.current;

        let { data, error } = await fetchPage(true, cursor);

        if (error && isMissingColumn(error)) {
          ({ data, error } = await fetchPage(false, cursor));
        }

        if (error) throw error;

        let page = data || [];

        // Lien partagé : injecter la vidéo en tête si absente (uniquement sur reset)
        if (reset) {
          const sharedVideoId =
            typeof window !== "undefined"
              ? new URLSearchParams(window.location.search).get("video")
              : null;

          if (
            sharedVideoId &&
            !page.some((video) => String(video.id) === String(sharedVideoId))
          ) {
            try {
              let { data: sharedVideo, error: sharedVideoError } =
                await supabase
                  .from("videos")
                  .select(buildVideoSelect(true))
                  .eq("id", sharedVideoId)
                  .maybeSingle();

              if (sharedVideoError && isMissingColumn(sharedVideoError)) {
                ({ data: sharedVideo, error: sharedVideoError } =
                  await supabase
                    .from("videos")
                    .select(buildVideoSelect(false))
                    .eq("id", sharedVideoId)
                    .maybeSingle());
              }

              if (!sharedVideoError && sharedVideo) {
                page = [sharedVideo, ...page];
              }
            } catch (sharedVideoError) {
              console.warn(
                "[video-share] Chargement impossible :",
                sharedVideoError,
              );
            }
          }
        }

        if (requestId !== requestSequence.current) return;

        // Mettre à jour le cursor pour la page suivante
        if (page.length > 0) {
          const last = page[page.length - 1];
          cursorRef.current = {
            created_at: last.created_at,
            id: last.id,
          };
        }

        setHasMore(page.length >= PAGE_SIZE);

        if (reset) {
          setVideos(page);
        } else {
          setVideos((current) => {
            const existingIds = new Set(current.map((v) => String(v.id)));
            const unique = page.filter((v) => !existingIds.has(String(v.id)));
            return [...current, ...unique];
          });
        }

        // Ne récupérer que les likes des vidéos de cette page (8 maximum).
        const pageIds = page.map((video) => video.id).filter(Boolean);
        if (!userId) {
          if (reset) setLikedMap({});
        } else if (pageIds.length) {
          const { data: likes, error: likesError } = await supabase
            .from("video_likes")
            .select("video_id")
            .eq("user_id", userId)
            .in("video_id", pageIds);

          if (likesError) throw likesError;
          if (requestId !== requestSequence.current) return;

          const pageLikedMap = {};
          (likes || []).forEach((item) => {
            pageLikedMap[item.video_id] = true;
          });

          setLikedMap((current) => ({
            ...(reset ? {} : current),
            ...pageLikedMap,
            ...Object.fromEntries(pageIds
              .filter((id) => !pageLikedMap[id])
              .map((id) => [id, false])),
          }));
        }

        // Signaux de personnalisation : chargés uniquement au premier affichage.
        if (reset && userId) {
          try {
            const { data: saved } = await supabase
              .from("video_bookmarks")
              .select("video_id, videos:video_id(author_id, title, description)")
              .eq("user_id", userId)
              .order("created_at", { ascending: false })
              .limit(40);
            recordBookmarks(saved);

            const { data: watched } = await supabase
              .from("video_watch_events")
              .select("video_id, ratio, videos:video_id(author_id, title, description)")
              .eq("user_id", userId)
              .order("updated_at", { ascending: false })
              .limit(60);
            syncWatchHistory(watched);
          } catch {
            /* signal facultatif */
          } finally {
            setProfileRevision((current) => current + 1);
          }
        }
      } catch (error) {
        if (requestId !== requestSequence.current) return;
        console.error("[useVideoFeed] loadVideos:", error);
        setLoadError(error?.message || "Impossible de charger les vidéos");
      } finally {
        if (requestId === requestSequence.current) {
          setLoading(false);
          setLoadingMore(false);
          loadingMoreRef.current = false;
        }
      }
    },
    [user?.id, hasMore, fetchPage],
  );

  /** Charge la page suivante (utilisé par le feed quand on approche de la fin). */
  const loadMore = useCallback(() => {
    return loadVideos({ reset: false });
  }, [loadVideos]);

  // Chargement initial
  useEffect(() => {
    loadVideos({ reset: true });
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Realtime vidéos
  useEffect(() => {
    let active = true;

    const channel = supabase
      .channel("baaro-videos-v1")
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

          // La vidéo publiée localement sera insérée à sa position choisie.
          if (
            eventType === "INSERT" &&
            String(record?.author_id || "") === String(currentUserId.current || "")
          ) return;

          // UPDATE (compteurs, vues…) d'une vidéo absente du fil : rien à rafraîchir.
          if (
            eventType === "UPDATE" &&
            !videosRef.current.some((v) => String(v.id) === String(videoId))
          ) return;

          // UPDATE : utiliser les données déjà reçues par Realtime.
          // Évite une requête SELECT supplémentaire pour chaque modification.
          if (eventType === "UPDATE") {
            setVideos((current) =>
              current.map((video) =>
                String(video.id) === String(videoId)
                  ? { ...video, ...record, profiles: video.profiles }
                  : video
              )
            );
            return;
          }

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
                  // Nouvelles vidéos en tête, on ne touche pas au cursor
                  return [data, ...current];
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

  // Realtime likes
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

          if (!videosRef.current.some((v) => String(v.id) === String(videoId))) return;

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

  const insertVideoAtPosition = useCallback((video, anchorId, anchorIndex = 0) => {
    if (!video?.id) return;

    const id = String(video.id);
    const currentOrder = forYouOrderRef.current.length
      ? [...forYouOrderRef.current]
      : videos.map((item) => String(item.id));
    const nextOrder = currentOrder.filter((item) => item !== id);
    const orderAnchor = nextOrder.findIndex(
      (item) => item === String(anchorId)
    );
    const orderIndex = orderAnchor >= 0
      ? orderAnchor + 1
      : Math.min(Math.max(0, Number(anchorIndex) || 0), nextOrder.length);
    nextOrder.splice(orderIndex, 0, id);
    forYouOrderRef.current = nextOrder;

    setVideos((current) => {
      const next = current.filter((item) => String(item.id) !== id);
      const anchor = next.findIndex(
        (item) => String(item.id) === String(anchorId)
      );
      const index = anchor >= 0
        ? anchor + 1
        : Math.min(Math.max(0, Number(anchorIndex) || 0), next.length);
      next.splice(index, 0, video);
      return next;
    });
  }, [videos]);

  const visibleVideos = useMemo(() => {
    const list = [...videos];

    if (mode === "friends") {
      const friendIds = new Set(
        (friends || []).map((friend) => String(friend.id))
      );
      return list.filter((video) =>
        friendIds.has(String(video.author_id))
      );
    }

    if (mode === "newest") {
      return list;
    }

    if (mode === "trending") {
      return rankTrending(list);
    }

    const byId = new Map(list.map((v) => [String(v.id), v]));
    const known = forYouOrderRef.current.filter((id) => byId.has(id));
    const knownSet = new Set(known);
    const fresh = list.filter((v) => !knownSet.has(String(v.id)));
    let ids = known;

    if (fresh.length) {
      const shared =
        known.length === 0 && typeof window !== "undefined"
          ? new URLSearchParams(window.location.search).get("video")
          : null;
      ids = [
        ...known,
        ...rankForYou(fresh, { pinnedId: shared }).map((v) => String(v.id)),
      ];
    }

    forYouOrderRef.current = ids;
    return ids.map((id) => byId.get(id));
  }, [videos, mode, profileRevision, friends]);

  return {
    videos,
    setVideos,
    user,
    loading,
    loadingMore,
    hasMore,
    loadError,
    loadVideos,
    loadMore,
    likedMap,
    setLikedMap,
    mode,
    setMode,
    visibleVideos,
    insertVideoAtPosition,
    friends,
    friendsLoading,
  };
}
