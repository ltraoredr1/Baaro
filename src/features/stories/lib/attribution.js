import { ATTRIBUTION_DAYS } from '../constants.js';
import { recordProductEvent } from '../api/storiesApi.js';

const KEY = 'baaro_story_attribution';

/** Appelé quand l'utilisateur clique « Voir / Acheter » depuis une story. */
export function setStoryAttribution(storyId, productId) {
  try {
    const all = JSON.parse(localStorage.getItem(KEY) || '{}');
    all[String(productId)] = { storyId, ts: Date.now() };
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch { /* stockage indisponible */ }
}

export function getStoryAttribution(productId) {
  try {
    const a = JSON.parse(localStorage.getItem(KEY) || '{}')[String(productId)];
    if (!a) return null;
    return Date.now() - a.ts <= ATTRIBUTION_DAYS * 86400000 ? a : null;
  } catch { return null; }
}

/**
 * À appeler dans ton checkout, une fois la commande confirmée, pour chaque ligne :
 *   recordStoryPurchase({ productId, quantity, orderId })
 * Retourne true si la vente a été attribuée à une story.
 */
export async function recordStoryPurchase({ productId, quantity = 1, orderId }) {
  const a = getStoryAttribution(productId);
  if (!a) return false;
  await recordProductEvent({ storyId: a.storyId, productId, type: 'purchase', quantity, orderId });
  return true;
}
