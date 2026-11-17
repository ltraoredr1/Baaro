import { useCallback, useEffect, useRef, useState } from 'react';
import { DRAFT_KEY } from '../constants.js';
const DRAFT_VERSION = 1;

const read = (key) => {
  if (!key) return null;
  try {
    const value = JSON.parse(localStorage.getItem(key) || 'null');
    return value?.version === DRAFT_VERSION && value.data ? value.data : value;
  } catch { return null; }
};

export const isSnapshotEmpty = (s) =>
  !s.caption?.trim() &&
  !s.background &&
  !s.stickers?.length &&
  !s.pollData?.question &&
  !s.product &&
  !s.audio &&
  !s.publishAt;

/**
 * Sauvegarde automatique du brouillon (texte, fond, stickers, sondage, produit, musique).
 * Les fichiers médias ne sont pas conservés (impossible dans le navigateur).
 */
export function useStoryDraft(userId, snapshot, active) {
  const key = userId ? DRAFT_KEY(userId) : null;
  const [pending, setPending] = useState(() => read(key));
  const snapshotRef = useRef(snapshot);
  const pendingRef = useRef(pending);
  snapshotRef.current = snapshot;
  pendingRef.current = pending;

  useEffect(() => { setPending(read(key)); }, [key]);

  const persist = useCallback((value = snapshotRef.current) => {
    if (!key || pendingRef.current) return;
    try {
      if (isSnapshotEmpty(value)) {
        localStorage.removeItem(key);
      } else {
        localStorage.setItem(key, JSON.stringify({
          version: DRAFT_VERSION,
          updatedAt: new Date().toISOString(),
          data: value,
        }));
      }
    } catch { /* stockage plein / indisponible */ }
  }, [key]);

  // Tant qu'un ancien brouillon attend la décision de l'utilisateur, on n'écrase rien.
  useEffect(() => {
    if (!key || pending) return undefined;
    if (!active) {
      // Ne pas perdre les dernières frappes si le compositeur est fermé avant
      // l'expiration du debounce.
      persist();
      return undefined;
    }
    const t = setTimeout(() => persist(snapshot), 400);
    return () => clearTimeout(t);
  }, [key, active, pending, persist, snapshot]);

  const clear = useCallback(() => {
    try { if (key) localStorage.removeItem(key); } catch {}
    setPending(null);
    pendingRef.current = null;
  }, [key]);

  const restore = useCallback(() => {
    const d = pending;
    setPending(null);
    return d;
  }, [pending]);

  return { hasPending: !!pending, restore, discard: clear, clear };
}
