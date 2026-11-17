import { useEffect, useState, useRef } from 'react';
import { supabase } from '../supabaseClient';

const MIN_QUERY_LENGTH = 2;
const EMPTY = {
  users: [],
  groups: [],
  debates: [],
  posts: [],
  hashtags: [],
};

export function useGlobalSearch(query, delay = 300) {
  const [results, setResults] = useState(EMPTY);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const abortRef = useRef(null);

  useEffect(() => {
    const q = (query || '').trim();

    // Annuler la requête précédente
    if (abortRef.current) {
      abortRef.current.abort();
    }

    if (q.length < MIN_QUERY_LENGTH) {
      setResults(EMPTY);
      setError(null);
      setLoading(false);
      return undefined;
    }

    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);

    const timer = setTimeout(async () => {
      try {
        const { data, error: rpcError } = await supabase.rpc(
          'global_discovery_search',
          { p_query: q, p_limit: 8 }
        );

        if (controller.signal.aborted) return;

        if (rpcError) throw rpcError;

        setResults({
          ...EMPTY,
          ...(data || {}),
        });
      } catch (e) {
        if (controller.signal.aborted) return;
        setResults(EMPTY);
        setError(e?.message || 'Recherche indisponible');
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }, delay);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, delay]);

  return { results, loading, error };
}
