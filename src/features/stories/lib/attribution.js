import { ATTRIBUTION_DAYS } from '../constants.js';
import { recordProductEvent } from '../api/storiesApi.js';

const KEY = 'baaro_story_attribution';
const MAX_AGE_MS = ATTRIBUTION_DAYS * 86_400_000;

/** Appelé quand l'utilisateur clique « Voir / Acheter » depuis une story. */
export function setStoryAttribution(storyId, productId) {
  if (!storyId || productId === undefined || productId === null) return;
  try {
    const now = Date.now();
    const previous = JSON.parse(localStorage.getItem(KEY) || '{}');
    const all = Object.fromEntries(Object.entries(previous).filter(([, a]) =>
      Number.isFinite(a?.ts) && a.ts <= now && now - a.ts <= MAX_AGE_MS
    ));
    all[String(productId)] = { storyId, ts: now };
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch { /* stockage indisponible */ }
}

export function getStoryAttribution(productId) {
  try {
    const a = JSON.parse(localStorage.getItem(KEY) || '{}')[String(productId)];
    if (!a || typeof a.storyId !== 'string' || !a.storyId) return null;
    const age = Date.now() - a.ts;
    if (!Number.isFinite(age) || age < 0 || age > MAX_AGE_MS) return null;
    return a;
  } catch { return null; }
}

/** À appeler seulement après confirmation serveur d'une commande. */
export async function recordStoryPurchase({ productId, quantity = 1, orderId }) {
  const attribution = getStoryAttribution(productId);
  if (!attribution || !orderId || !Number.isSafeInteger(quantity) || quantity < 1) return false;
  return recordProductEvent({
    storyId: attribution.storyId,
    productId,
    type: 'purchase',
    quantity,
    orderId,
  });
}
