import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';

const MIN_QUERY_LENGTH = 2;
const EMPTY = { users: [], groups: [], debates: [], posts: [] };

export function useGlobalSearch(query, delay = 300) {
  const [results, setResults] = useState(EMPTY);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const q = (query || '').trim();
    if (q.length < MIN_QUERY_LENGTH) {
      setResults(EMPTY);
      setError(null);
      setLoading(false);
      return undefined;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    const t = setTimeout(async () => {
      try {
        const { data, error: rpcError } = await supabase.rpc('global_discovery_search', { p_query: q, p_limit: 8 });
        if (rpcError) throw rpcError;
        if (!cancelled) setResults({ ...EMPTY, ...(data || {}) });
      } catch (e) {
        if (!cancelled) { setResults(EMPTY); setError(e.message || 'Recherche indisponible'); }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, delay);
    return () => { cancelled = true; clearTimeout(t); };
  }, [query, delay]);

  return { results, loading, error };
}
