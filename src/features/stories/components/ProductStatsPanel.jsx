import { COLORS as C } from '../../../theme.js';

const pct = (a, b) => (b > 0 ? `${Math.round((a / b) * 100)} %` : '—');

/** Stats boutique par story : vues, clics, ajouts panier, ventes. `products` sert à afficher les noms. */
export function ProductStatsPanel({ stats, products }) {
  const names = new Map(products.map((p) => [String(p.id), p.name]));
  const { rows, loading, error } = stats;

  return (
    <div className="rounded-2xl p-3 border space-y-3" style={{ background: C.surface, borderColor: C.border, color: C.ivory }}>
      <div className="text-xs font-bold" style={{ color: C.gold }}>Stats boutique des stories</div>
      {loading && <p className="text-xs" style={{ color: C.muted }}>Chargement…</p>}
      {error && <p className="text-xs text-red-300">{error}</p>}
      {!loading && !error && rows.length === 0 && (
        <p className="text-xs" style={{ color: C.muted }}>Aucune donnée : publie une story avec un produit.</p>
      )}
      {rows.map((r) => (
        <div key={`${r.story_id}-${r.product_id}`} className="rounded-xl p-2 bg-white/5 space-y-1">
          <div className="flex justify-between text-xs">
            <b className="truncate">{names.get(String(r.product_id)) || `Produit ${r.product_id}`}</b>
            <span className="opacity-60 shrink-0">{new Date(r.story_created_at).toLocaleDateString()}</span>
          </div>
          <div className="grid grid-cols-4 gap-1 text-center text-[11px]">
            <div><div className="font-bold text-sm">{r.views}</div>👁 vues</div>
            <div><div className="font-bold text-sm">{r.clicks}</div>👆 clics</div>
            <div><div className="font-bold text-sm">{r.add_to_cart}</div>🛒 paniers</div>
            <div><div className="font-bold text-sm">{r.units}</div>💰 ventes</div>
          </div>
          <div className="text-[10px] opacity-60 text-center">
            Clic/vue {pct(r.clicks, r.views)} · Vente/vue {pct(r.purchases, r.views)}
          </div>
        </div>
      ))}
    </div>
  );
}
