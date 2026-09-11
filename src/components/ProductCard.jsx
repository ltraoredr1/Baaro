import { Plus } from "lucide-react";
import { COLORS } from "../../../theme.js";

export default function ProductCard({ product, onAdd }) {
  return (
    <div
      className="rounded-xl border p-3 flex gap-3 items-center"
      style={{ background: COLORS.surface2, borderColor: COLORS.border }}
    >
      <div
        className="w-12 h-12 rounded-lg shrink-0 overflow-hidden flex items-center justify-center"
        style={{ background: "rgba(255,255,255,0.05)" }}
      >
        {product.image_url ? (
          <img src={product.image_url} alt="" className="w-full h-full object-cover" />
        ) : (
          <span className="text-xs" style={{ color: COLORS.muted }}>—</span>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-bold truncate" style={{ color: COLORS.ivory }}>
          {product.name}
        </div>
        <div className="text-xs" style={{ color: COLORS.muted }}>
          {product.price} {product.currency} · {product.type}
        </div>
      </div>
      {onAdd && (
        <button
          type="button"
          onClick={onAdd}
          className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
          style={{ background: COLORS.goldGlow, color: COLORS.gold }}
        >
          <Plus size={18} />
        </button>
      )}
    </div>
  );
}
