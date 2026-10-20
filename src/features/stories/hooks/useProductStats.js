import { useCallback, useEffect, useState } from 'react';
import { fetchProductStats } from '../api/storiesApi.js';

export function useProductStats(enabled) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const reload = useCallback(async () => {
    setLoading(true); setError('');
    try { setRows(await fetchProductStats()); }
    catch (e) { setError(e.message || 'Statistiques indisponibles'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { if (enabled) reload(); }, [enabled, reload]);
  return { rows, loading, error, reload };
}
