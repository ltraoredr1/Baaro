import { useEffect, useState } from 'react';
import { fetchLiveProduct } from '../api/storiesApi.js';

/** story.product est une copie figée : on récupère prix / stock actuels et on les fusionne. */
export function useLiveProduct(snapshot) {
  const pid = snapshot?.id;
  const [live, setLive] = useState(null);

  useEffect(() => {
    setLive(null);
    if (pid === undefined || pid === null) return;
    let on = true;
    fetchLiveProduct(pid).then((p) => { if (on) setLive(p); }).catch(() => {});
    return () => { on = false; };
  }, [pid]);

  return live ? { ...snapshot, ...live } : snapshot;
}
