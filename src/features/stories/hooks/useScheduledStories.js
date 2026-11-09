import { useCallback, useEffect, useRef, useState } from 'react';
import { deleteStory, fetchScheduledStories } from '../api/storiesApi.js';

export function useScheduledStories(userId) {
  const [items, setItems] = useState([]);
  const requestId = useRef(0);

  const reload = useCallback(async () => {
    const current = ++requestId.current;
    if (!userId) { setItems([]); return; }
    try {
      const next = await fetchScheduledStories(userId);
      if (current === requestId.current) setItems(next);
    } catch (e) {
      if (current === requestId.current) console.error('[Stories] scheduled:', e);
    }
  }, [userId]);

  useEffect(() => {
    setItems([]);
    reload();
    return () => { requestId.current += 1; };
  }, [reload]);

  const cancel = async (story) => {
    if (!userId) throw new Error('Connecte-toi pour annuler cette programmation.');
    await deleteStory(story.id, userId);
    setItems((prev) => prev.filter((s) => s.id !== story.id));
  };

  return { items, reload, cancel };
}
