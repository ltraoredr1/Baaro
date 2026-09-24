import { useState, useEffect, useCallback } from "react";

/**
 * Hook générique requête async (Supabase ou autre).
 * @param {() => Promise<any>} queryFn
 * @param {{ enabled?: boolean, deps?: any[], initialData?: any }} options
 */
export function useSupabaseQuery(queryFn, { enabled = true, deps = [], initialData = null } = {}) {
  const [data, setData] = useState(initialData);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(Boolean(enabled));

  const execute = useCallback(async () => {
    if (!enabled || typeof queryFn !== "function") {
      setLoading(false);
      return null;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await queryFn();
      setData(result);
      return result;
    } catch (e) {
      setError(e);
      return null;
    } finally {
      setLoading(false);
    }
  }, [enabled, queryFn, ...deps]);

  useEffect(() => {
    execute();
  }, [execute]);

  return { data, error, loading, reload: execute };
}

export default useSupabaseQuery;
