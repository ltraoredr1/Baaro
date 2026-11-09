import { useCallback, useEffect, useRef, useState } from 'react';
import * as api from '../api/highlightsApi.js';

/** Highlights d'un profil. Utilisable aussi depuis la page profil : useHighlights(profileId). */
export function useHighlights(ownerId) {
  const [list, setList] = useState([]);
  const [owner, setOwner] = useState(null);
  const [loading, setLoading] = useState(true);
  const requestId = useRef(0);

  const load = useCallback(async () => {
    const current = ++requestId.current;
    if (!ownerId) {
      setList([]); setOwner(null); setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [nextList, nextOwner] = await Promise.all([api.fetchHighlights(ownerId), api.fetchProfile(ownerId)]);
      if (current === requestId.current) {
        setList(nextList);
        setOwner(nextOwner);
      }
    } catch (e) {
      if (current === requestId.current) console.error('[Highlights] load:', e);
    } finally {
      if (current === requestId.current) setLoading(false);
    }
  }, [ownerId]);

  useEffect(() => {
    setList([]); setOwner(null);
    load();
    return () => { requestId.current += 1; };
  }, [load]);

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
