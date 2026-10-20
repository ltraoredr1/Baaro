import { useCallback, useEffect, useState } from 'react';
import { DRAFT_KEY } from '../constants.js';

const read = (key) => {
  if (!key) return null;
  try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; }
};

export const isSnapshotEmpty = (s) =>
  !s.caption?.trim() && !s.background && !s.stickers?.length && !s.pollData?.question && !s.product && !s.audio;

/**
 * Sauvegarde automatique du brouillon (texte, fond, stickers, sondage, produit, musique).
 * Les fichiers médias ne sont pas conservés (impossible dans le navigateur).
 */
export function useStoryDraft(userId, snapshot, active) {
  const key = userId ? DRAFT_KEY(userId) : null;
  const [pending, setPending] = useState(() => read(key));
  const serialized = JSON.stringify(snapshot);

  useEffect(() => { setPending(read(key)); }, [key]);

  // Tant qu'un ancien brouillon attend la décision de l'utilisateur, on n'écrase rien.
  useEffect(() => {
    if (!key || !active || pending) return;
    const t = setTimeout(() => {
      try {
        if (isSnapshotEmpty(snapshot)) localStorage.removeItem(key);
        else localStorage.setItem(key, serialized);
      } catch { /* stockage plein / indisponible */ }
    }, 500);
    return () => clearTimeout(t);
  }, [key, active, pending, serialized]);

  const clear = useCallback(() => {
    try { if (key) localStorage.removeItem(key); } catch {}
    setPending(null);
  }, [key]);

  const restore = useCallback(() => {
    const d = pending;
    setPending(null);
    return d;
  }, [pending]);

  return { hasPending: !!pending, restore, discard: clear, clear };
}
