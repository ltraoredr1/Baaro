import { getProductBadges } from '../lib/productBadges.js';
import { setStoryAttribution } from '../lib/attribution.js';
import { recordProductEvent } from '../api/storiesApi.js';

const TONES = {
  promo: 'bg-red-500/90 text-white',
  low:   'bg-amber-400 text-black',
  out:   'bg-zinc-600 text-white',
};

/** Badges (Promo / Stock limité / Épuisé) + boutons « Voir le produit » et « Acheter ». */
export function ProductCTA({ product, trackingStoryId, onOpenProduct }) {
  const badges = getProductBadges(product);
  const soldOut = badges.some((b) => b.tone === 'out');

  const go = (buy) => {
    if (trackingStoryId) {
      recordProductEvent({ storyId: trackingStoryId, productId: product.id, type: 'click' });
      setStoryAttribution(trackingStoryId, product.id);
    }
    onOpenProduct?.(product, { storyId: trackingStoryId || undefined, buy });
  };

  return (
    <div className="space-y-2">
      {badges.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {badges.map((b) => (
            <span key={b.id} className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${TONES[b.tone]}`}>{b.label}</span>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <button onClick={() => go(false)} className="flex-1 py-2 rounded-xl text-xs font-semibold text-white bg-white/15 border border-white/30 backdrop-blur-md">
          Voir le produit
        </button>
        <button
          onClick={() => go(true)}
          disabled={soldOut}
          className="flex-1 py-2 rounded-xl text-xs font-bold text-black bg-amber-400 disabled:opacity-40"
        >
          {soldOut ? 'Indisponible' : 'Acheter'}
        </button>
      </div>
    </div>
  );
}
