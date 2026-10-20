import { useCallback, useEffect, useState } from 'react';
import { deleteStory, fetchScheduledStories } from '../api/storiesApi.js';

export function useScheduledStories(userId) {
  const [items, setItems] = useState([]);

  const reload = useCallback(async () => {
    if (!userId) return setItems([]);
    try { setItems(await fetchScheduledStories(userId)); }
    catch (e) { console.error('[Stories] scheduled:', e); }
  }, [userId]);

  useEffect(() => { reload(); }, [reload]);

  const cancel = async (story) => {
    await deleteStory(story.id, userId);
    setItems((prev) => prev.filter((s) => s.id !== story.id));
  };

  return { items, reload, cancel };
}
