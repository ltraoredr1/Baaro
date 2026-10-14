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
        cursor: reset? null : cursor,
      });
      setPosts((prev) => (reset? rows : [...prev,...rows]));
      setCursor(nextCursor);
      setHasMore(!!nextCursor);
    } catch (e) {
      setError(e?.message || "Erreur");
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, [cursor]);

  const refresh = useCallback(() => loadMore(true), [loadMore]);

  useEffect(() => { if (autoLoad) loadMore(true); }, []);

  return { posts, loading, hasMore, error, loadMore: () => loadMore(false), refresh, cursor };
}
