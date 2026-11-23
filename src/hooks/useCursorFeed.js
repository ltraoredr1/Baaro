import { useState, useCallback, useRef } from "react";
import { fetchFeedPage } from "../lib/feedPagination.js";
import { dedupeFeedRows, mergeFeedRows, mergeLatestFeedRows } from "../lib/feedState.js";

/**
 * Pagination du fil par curseur.
 * - posts : lignes brutes Supabase (à formater côté composant)
 * - setPosts : pour les mises à jour optimistes (reposts, commentaires, etc.)
 * - reload({ silent }) : recharge la première page
 * - refreshLatest() : ajoute les nouveautés sans perdre les pages chargées
 * - loadMore() : charge la page suivante
 */
export function useCursorFeed({ onError } = {}) {
  const [posts, setPosts] = useState([]);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);

  const cursorRef = useRef(null);
  const generationRef = useRef(0);
  const refreshVersionRef = useRef(0);
  const loadMoreBusyRef = useRef(false);
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  const load = useCallback(async ({ reset = false, silent = false } = {}) => {
    // Un reset invalide les anciennes requêtes de pagination. Leur réponse
    // ne pourra donc pas écraser le nouveau fil si elle arrive en retard.
    const generation = reset ? ++generationRef.current : generationRef.current;
    if (!reset && (loadMoreBusyRef.current || !cursorRef.current)) return null;

    const requestedCursor = reset ? null : cursorRef.current;
    if (!reset) loadMoreBusyRef.current = true;

    setError(null);
    if (reset && !silent) setLoading(true);
    if (!reset) setLoadingMore(true);

    try {
      const { rows = [], nextCursor = null } = await fetchFeedPage({
        cursor: requestedCursor,
      });

      if (generation !== generationRef.current) return null;
      if (!reset && cursorRef.current !== requestedCursor) return null;

      if (reset) {
        setPosts(dedupeFeedRows(rows));
      } else {
        setPosts((previous) => mergeFeedRows(previous, rows));
      }
      cursorRef.current = nextCursor;
      setHasMore(Boolean(nextCursor));
      return rows;
    } catch (e) {
      if (generation === generationRef.current) {
        onErrorRef.current?.(e);
        setError(e);
      }
      // En cas d'échec du reset, conserver le fil et son curseur précédents.
      return null;
    } finally {
      if (!reset) loadMoreBusyRef.current = false;
      if (generation === generationRef.current) {
        if (reset) setLoading(false);
        setLoadingMore(false);
      }
    }
  }, []);

  // Charge les nouveautés en parallèle d'une pagination éventuelle, sans
  // modifier le curseur des pages déjà parcourues.
  const refreshLatest = useCallback(async () => {
    const generation = generationRef.current;
    const refreshVersion = ++refreshVersionRef.current;
    setError(null);

    try {
      const { rows = [], nextCursor = null } = await fetchFeedPage({ cursor: null });
      if (
        generation !== generationRef.current ||
        refreshVersion !== refreshVersionRef.current
      ) return null;

      setPosts((previous) => mergeLatestFeedRows(previous, rows));
      if (!cursorRef.current) cursorRef.current = nextCursor;
      setHasMore(Boolean(cursorRef.current));
      return rows;
    } catch (e) {
      if (
        generation === generationRef.current &&
        refreshVersion === refreshVersionRef.current
      ) {
        onErrorRef.current?.(e);
        setError(e);
      }
      return null;
    }
  }, []);

  const reload = useCallback((opts) => load({ ...opts, reset: true }), [load]);
  const loadMore = useCallback(() => load({ reset: false }), [load]);

  return { posts, setPosts, hasMore, loading, loadingMore, error, reload, refreshLatest, loadMore };
}
