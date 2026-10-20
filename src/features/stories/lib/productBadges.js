import { LOW_STOCK_THRESHOLD } from '../constants.js';

/**
 * Déduit les badges d'un produit. Colonnes lues (toutes optionnelles) :
 *  - compare_at_price | old_price  → ancien prix (promo si > price)
 *  - discount_percent | is_promo   → promo explicite
 *  - stock | stock_quantity | quantity → stock (seuil : low_stock_threshold du produit, sinon constante)
 *  - is_available === false        → indisponible
 */
export function getProductBadges(p) {
  if (!p) return [];
  const badges = [];
  const price = Number(p.price);
  const old = Number(p.compare_at_price ?? p.old_price);
  const pct = Number(p.discount_percent);

  if ((old > price && price >= 0) || pct > 0 || p.is_promo === true) {
    const percent = old > price ? Math.round((1 - price / old) * 100) : pct > 0 ? Math.round(pct) : null;
    badges.push({ id: 'promo', tone: 'promo', label: percent ? `Promo -${percent}%` : 'Promo' });
  }

  const rawStock = p.stock ?? p.stock_quantity ?? p.quantity;
  const stock = rawStock === null || rawStock === undefined || rawStock === '' ? null : Number(rawStock);

  if (p.is_available === false || stock === 0) {
    badges.push({ id: 'out', tone: 'out', label: 'Épuisé' });
  } else if (stock !== null && !Number.isNaN(stock) && stock <= (Number(p.low_stock_threshold) || LOW_STOCK_THRESHOLD)) {
    badges.push({ id: 'low', tone: 'low', label: `Stock limité (${stock})` });
  }
  return badges;
}
