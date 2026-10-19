import { useState, useEffect, useCallback, useRef } from "react";

/**
 * Hook générique requête async (Supabase ou autre).
 * @param {() => Promise<any>} queryFn
 * @param {{ enabled?: boolean, deps?: any[], initialData?: any }} options
 *
 * Corrections : queryFn est lu via une ref (une fonction passée "en ligne" ne relance plus la requête
 * à chaque rendu → plus de boucle infinie), seule la dernière requête met à jour l'état, et plus aucun
 * setState après démontage.
 */
export function useSupabaseQuery(queryFn, { enabled = true, deps = [], initialData = null } = {}) {
  const [data, setData] = useState(initialData);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(Boolean(enabled));

  const queryFnRef = useRef(queryFn);
  queryFnRef.current = queryFn;
  const requestRef = useRef(0);

  const execute = useCallback(async () => {
    const fn = queryFnRef.current;
    if (!enabled || typeof fn !== "function") {
      setLoading(false);
      return null;
    }
    const request = ++requestRef.current;
    setLoading(true);
    setError(null);
    try {
      const result = await fn();
      if (request === requestRef.current) setData(result);
      return result;
    } catch (e) {
      if (request === requestRef.current) setError(e);
      return null;
    } finally {
      if (request === requestRef.current) setLoading(false);
    }
  }, [enabled]);

  // Relance quand `enabled` ou une des `deps` change
  useEffect(() => {
    execute();
    return () => {
      requestRef.current++; // invalide la requête en cours (démontage / nouvelles deps)
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [execute, ...deps]);

  return { data, error, loading, reload: execute };
}

export default useSupabaseQuery;
