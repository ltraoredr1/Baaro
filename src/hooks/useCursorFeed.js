import { useState, useCallback, useRef } from "react";
import { fetchFeedPage } from "../lib/feedPagination.js";

/**
 * Pagination du fil par curseur.
 * Le classement est entièrement géré par fetchFeedPage (lib/feedPagination.js) :
 * le hook ne reclasse plus rien et ne lit plus les abonnements, il affiche les pages
 * dans l'ordre reçu. Le curseur est opaque : on le renvoie tel quel.
 *
 * - posts : lignes brutes Supabase, dans l'ordre de pertinence
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

      setPosts((prev) => {
        if (reset) return rows;
        const seen = new Set(prev.map((p) => p.id));
        return [...prev, ...rows.filter((r) => !seen.has(r.id))];
      });

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
