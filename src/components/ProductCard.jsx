import { Plus, Minus, ShoppingCart, AlertTriangle, XCircle, CheckCircle2 } from "lucide-react";
import { COLORS } from "../theme.js";

export default function ProductCard({ product, quantity = 0, onAdd, onRemove }) {
  const hasDiscount = product.compare_at_price && Number(product.compare_at_price) > Number(product.price);
  const discountPercent = hasDiscount 
    ? Math.round((1 - Number(product.price) / Number(product.compare_at_price)) * 100) 
    : 0;

  let stockBadge = null;
  if (product.type === "produit" || product.type === "physical") {
    const stock = Number(product.stock ?? 0);
    const threshold = Number(product.low_stock_threshold ?? 5);
    if (stock === 0) {
      stockBadge = { label: "Rupture", icon: XCircle, color: "#ef4444", bg: "rgba(239,68,68,0.15)" };
    } else if (stock <= threshold) {
      stockBadge = { label: `Plus que ${stock}`, icon: AlertTriangle, color: "#f59e0b", bg: "rgba(245,158,11,0.15)" };
    } else {
      stockBadge = { label: "En stock", icon: CheckCircle2, color: "#22c55e", bg: "rgba(34,197,94,0.15)" };
    }
  }

  const imageUrl = product.images?.[0] || product.image_url;

  return (
    <div className="rounded-xl border overflow-hidden transition-all hover:shadow-md" style={{ background: COLORS.surface2, borderColor: COLORS.border }}>
      <div className="flex gap-3 p-3">
        <div className="w-24 h-24 rounded-lg shrink-0 overflow-hidden relative" style={{ background: "rgba(255,255,255,0.05)" }}>
          {imageUrl ? (
            <img src={imageUrl} alt={product.name} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <ShoppingCart size={24} style={{ color: COLORS.muted, opacity: 0.5 }} />
            </div>
          )}
          {hasDiscount && (
            <span className="absolute top-1 left-1 text-[9px] font-black px-1.5 py-0.5 rounded bg-red-500 text-white shadow-sm">
              -{discountPercent}%
            </span>
          )}
        </div>

        <div className="flex-1 min-w-0 flex flex-col justify-between">
          <div>
            <div className="flex items-start justify-between gap-2">
              <h3 className="text-sm font-bold truncate leading-tight" style={{ color: COLORS.ivory }}>{product.name}</h3>
            </div>
            {product.category && <p className="text-[10px] mt-0.5" style={{ color: COLORS.muted }}>{product.category}</p>}
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-base font-black" style={{ color: COLORS.gold }}>{Number(product.price).toLocaleString()} {product.currency}</span>
              {hasDiscount && <span className="text-xs line-through" style={{ color: COLORS.muted }}>{Number(product.compare_at_price).toLocaleString()}</span>}
            </div>
          </div>

          <div className="flex items-end justify-between mt-2">
            <div className="flex flex-col gap-1">
              {stockBadge && (
                <span className="inline-flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded w-fit" style={{ background: stockBadge.bg, color: stockBadge.color }}>
                  <stockBadge.icon size={10} /> {stockBadge.label}
                </span>
              )}
              {product.tags?.length > 0 && (
                <div className="flex gap-1 flex-wrap">
                  {product.tags.slice(0, 2).map((tag, i) => (
                    <span key={i} className="text-[9px] px-1.5 py-0.5 rounded" style={{ background: `${COLORS.teal}22`, color: COLORS.teal }}>{tag}</span>
                  ))}
                </div>
              )}
            </div>

            {quantity > 0 ? (
              <div className="flex items-center gap-2 rounded-lg border p-1" style={{ borderColor: COLORS.gold }}>
                <button onClick={onRemove} className="p-1 rounded hover:bg-white/10" style={{ color: COLORS.gold }}><Minus size={16} /></button>
                <span className="text-sm font-bold min-w-[20px] text-center" style={{ color: COLORS.ivory }}>{quantity}</span>
                <button onClick={onAdd} className="p-1 rounded hover:bg-white/10" style={{ color: COLORS.gold }}><Plus size={16} /></button>
              </div>
            ) : (
              <button
                type="button"
                onClick={onAdd}
                disabled={stockBadge?.label === "Rupture" || !product.is_available}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ background: (stockBadge?.label === "Rupture" || !product.is_available) ? COLORS.surface : COLORS.gold, color: (stockBadge?.label === "Rupture" || !product.is_available) ? COLORS.muted : COLORS.bg }}
              >
                <Plus size={14} /> Ajouter
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
