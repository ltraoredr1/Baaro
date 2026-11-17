import { useState, useCallback, useRef } from "react";
import { fetchFeedPage } from "../lib/feedPagination.js";
import { mergeLatestFeedRows } from "../lib/feedState.js";

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
  const [error, setError] = useState(null);

  const cursorRef = useRef(null);
  const busyRef = useRef(false);
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  const load = useCallback(async ({ reset = false, silent = false } = {}) => {
    if (busyRef.current) return null;
    if (!reset && !cursorRef.current) return null;

    busyRef.current = true;
    setError(null);
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
      setError(e);
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

  // Recharge la première page sans perdre les pages déjà parcourues.
  // Le curseur existant est conservé afin que le prochain loadMore ne répète
  // pas les publications qui étaient déjà chargées.
  const refreshLatest = useCallback(async () => {
    if (busyRef.current) return null;
    busyRef.current = true;
    setError(null);
    try {
      const { rows, nextCursor } = await fetchFeedPage({ cursor: null });
      setPosts((previous) => {
        return mergeLatestFeedRows(previous, rows);
      });
      if (!cursorRef.current) cursorRef.current = nextCursor;
      setHasMore(Boolean(cursorRef.current));
      return rows;
    } catch (e) {
      onErrorRef.current?.(e);
      setError(e);
      return null;
    } finally {
      busyRef.current = false;
    }
  }, []);

  const reload = useCallback((opts) => load({ ...opts, reset: true }), [load]);
  const loadMore = useCallback(() => load({ reset: false }), [load]);

  return { posts, setPosts, hasMore, loading, loadingMore, error, reload, refreshLatest, loadMore };
}
