import { useState, useEffect, useCallback, useRef } from "react";

/**
 * Hook générique pour exécuter une requête Supabase
 * avec loading / error / data + rechargement manuel.
 *
 * Usage :
 *   const { data, loading, error, reload } = useSupabaseQuery(
 *     () => getFriends(userId),
 *     [userId]
 *   );
 *
 * @param {() => Promise<{ data, error }>} queryFn  - fonction async qui retourne { data, error }
 * @param {any[]} deps                              - dépendances (comme useEffect)
 * @param {object} options
 * @param {boolean} options.enabled                 - si false, ne lance pas la requête
 * @param {any} options.initialData                 - valeur initiale de data
 */
export function useSupabaseQuery(queryFn, deps = [], options = {}) {
  const { enabled = true, initialData = null } = options;

  const [data, setData] = useState(initialData);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState(null);

  // Évite les setState après unmount
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const execute = useCallback(async () => {
    if (!enabled) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const result = await queryFn();
      if (!mounted.current) return;

      if (result?.error) {
        setError(result.error);
        setData(initialData);
      } else {
        setData(result?.data ?? result ?? null);
        setError(null);
      }
    } catch (err) {
      if (!mounted.current) return;
      console.error("[useSupabaseQuery]", err);
      setError(err);
      setData(initialData);
    } finally {
      if (mounted.current) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    execute();
  }, [execute]);

  return {
    data,
    loading,
    error,
    reload: execute,
    setData, // permet une mise à jour optimiste
  };
}

/**
 * Hook pour une mutation (insert / update / delete)
 * avec état loading / error.
 *
 * Usage :
 *   const { mutate, loading, error } = useSupabaseMutation(
 *     (targetId) => followUser(userId, targetId)
 *   );
 *   await mutate(targetId);
 */
export function useSupabaseMutation(mutationFn) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const mutate = useCallback(
    async (...args) => {
      setLoading(true);
      setError(null);
      try {
        const result = await mutationFn(...args);
        if (result?.error) {
          setError(result.error);
          return { data: null, error: result.error };
        }
        return { data: result?.data ?? result, error: null };
      } catch (err) {
        console.error("[useSupabaseMutation]", err);
        setError(err);
        return { data: null, error: err };
      } finally {
        setLoading(false);
      }
    },
    [mutationFn]
  );

  return { mutate, loading, error };
}

export default useSupabaseQuery;
