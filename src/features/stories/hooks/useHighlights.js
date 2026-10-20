import { useCallback, useEffect, useState } from 'react';
import * as api from '../api/highlightsApi.js';

/** Highlights d'un profil. Utilisable aussi depuis la page profil : useHighlights(profileId). */
export function useHighlights(ownerId) {
  const [list, setList] = useState([]);
  const [owner, setOwner] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!ownerId) { setLoading(false); return; }
    try {
      const [l, o] = await Promise.all([api.fetchHighlights(ownerId), api.fetchProfile(ownerId)]);
      setList(l);
      setOwner(o);
    } catch (e) {
      console.error('[Highlights] load:', e);
    } finally {
      setLoading(false);
    }
  }, [ownerId]);

  useEffect(() => { load(); }, [load]);

  const create = async (title, story) => { await api.createHighlight(title, story); await load(); };

  const addStory = async (highlightId, story) => {
    const h = list.find((x) => x.id === highlightId);
    await api.addStoryToHighlight(highlightId, story, h?.items?.length || 0);
    await load();
  };

  const remove = async (highlightId) => {
    await api.deleteHighlight(highlightId);
    setList((prev) => prev.filter((h) => h.id !== highlightId));
  };

  return { list, owner, loading, reload: load, create, addStory, remove };
}
