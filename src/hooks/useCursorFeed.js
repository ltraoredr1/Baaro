/**
 * Hook pagination curseur pour le fil.
 * Place : src/hooks/useCursorFeed.js
 *
 * Usage dans FeedTab :
 *   const { posts, loading, hasMore, loadMore, refresh, error } = useCursorFeed();
 */
import { useState, useCallback, useEffect, useRef } from "react";
import { fetchFeedPage } from "../lib/feedPagination.js";

export function useCursorFeed({ autoLoad = true } = {}) {
  const [posts, setPosts] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const loadingRef = useRef(false);

  const loadMore = useCallback(async (reset = false) => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    setError(null);
    try {
      const { rows, nextCursor } = await fetchFeedPage({
        cursor: reset ? null : cursor,
      });
      setPosts((prev) => (reset ? rows : [...prev, ...rows]));
      setCursor(nextCursor);
      setHasMore(!!nextCursor);
    } catch (e) {
      setError(e?.message || "Erreur de chargement");
      console.error("[useCursorFeed]", e);
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, [cursor]);

  const refresh = useCallback(() => loadMore(true), [loadMore]);

  useEffect(() => {
    if (autoLoad) loadMore(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    posts,
    loading,
    hasMore,
    error,
    loadMore: () => loadMore(false),
    refresh,
  };
}
