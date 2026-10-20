import { useState, useCallback, useRef } from "react";
import { fetchFeedPage } from "../lib/feedPagination.js";

/**
 * Pagination du fil par curseur.
 * - posts : lignes brutes Supabase (à formater côté composant)
 * - setPosts : pour les mises à jour optimistes (reposts, commentaires, etc.)
 * - reload({ silent }) : recharge la première page
 * - loadMore() : charge la page suivante
 */
export function useCursorFeed({ onError } = {}) {
  const [posts, setPosts] = useState([]);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const cursorRef = useRef(null);
  const busyRef = useRef(false);
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  const load = useCallback(async ({ reset = false, silent = false } = {}) => {
    if (busyRef.current) return null;
    if (!reset && !cursorRef.current) return null;

    busyRef.current = true;
    if (reset && !silent) setLoading(true);
    if (!reset) setLoadingMore(true);

    try {
      const { rows, nextCursor } = await fetchFeedPage({
        cursor: reset ? null : cursorRef.current,
      });
      setPosts((prev) => (reset ? rows : [...prev, ...rows]));
      cursorRef.current = nextCursor;
      setHasMore(Boolean(nextCursor));
      return rows;
    } catch (e) {
      onErrorRef.current?.(e);
      if (reset) {
        if (!silent) setPosts([]);
        setHasMore(false);
      }
      return null;
    } finally {
      busyRef.current = false;
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  const reload = useCallback((opts) => load({ ...opts, reset: true }), [load]);
  const loadMore = useCallback(() => load({ reset: false }), [load]);

  return { posts, setPosts, hasMore, loading, loadingMore, reload, loadMore };
}
