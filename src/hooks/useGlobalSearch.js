import { useEffect, useState } from "react";
import { supabase } from "../supabaseClient.js";

const MIN_QUERY_LENGTH = 2;
const MAX_QUERY_LENGTH = 100;
const DEFAULT_DELAY = 300;
const EMPTY = Object.freeze({
  users: [],
  groups: [],
  debates: [],
  posts: [],
  hashtags: [],
});

function normalizeResults(data) {
  return {
    users: Array.isArray(data?.users) ? data.users : [],
    groups: Array.isArray(data?.groups) ? data.groups : [],
    debates: Array.isArray(data?.debates) ? data.debates : [],
    posts: Array.isArray(data?.posts) ? data.posts : [],
    hashtags: Array.isArray(data?.hashtags) ? data.hashtags : [],
  };
}

export function useGlobalSearch(query, delay = DEFAULT_DELAY) {
  const [results, setResults] = useState(EMPTY);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const q = typeof query === "string"
      ? query.replace(/\s+/g, " ").trim().slice(0, MAX_QUERY_LENGTH)
      : "";
    const wait = Number.isFinite(Number(delay))
      ? Math.max(0, Math.min(Number(delay), 1500))
      : DEFAULT_DELAY;

    if (q.length < MIN_QUERY_LENGTH) {
      setResults(EMPTY);
      setError(null);
      setLoading(false);
      return undefined;
    }

    // PostgREST RPC ne reçoit pas de signal AbortController ici.
    // Le drapeau active empêche une réponse obsolète de modifier l'interface.
    let active = true;
    setResults(EMPTY);
    setLoading(true);
    setError(null);

    const timer = setTimeout(async () => {
      try {
        const { data, error: rpcError } = await supabase.rpc(
          "global_discovery_search",
          { p_query: q, p_limit: 8 }
        );
        if (!active) return;
        if (rpcError) throw rpcError;
        setResults(normalizeResults(data));
      } catch (requestError) {
        if (!active) return;
        setResults(EMPTY);
        setError(requestError?.message || "Recherche indisponible");
      } finally {
        if (active) setLoading(false);
      }
    }, wait);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [query, delay]);

  return { results, loading, error };
}
