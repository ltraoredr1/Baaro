import { COLORS } from "../theme.js";
import { MapPin, Store } from "lucide-react";

export default function ShopCard({ shop, onClick }) {
  return (
    <button
      type="button"
      onClick={() => onClick?.(shop)}
      className="w-full text-left rounded-2xl border p-3 flex gap-3 transition active:scale-[0.98]"
      style={{ background: COLORS.surface2, borderColor: COLORS.border }}
    >
      <div
        className="w-14 h-14 rounded-xl flex items-center justify-center shrink-0 overflow-hidden"
        style={{ background: COLORS.surface3 || "rgba(255,255,255,0.06)" }}
      >
        {shop.logo_url ? (
          <img src={shop.logo_url} alt="" className="w-full h-full object-cover" />
        ) : (
          <Store size={22} style={{ color: COLORS.gold }} />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="font-bold text-sm truncate" style={{ color: COLORS.ivory }}>
          {shop.name}
        </div>
        <div className="text-xs mt-0.5 flex items-center gap-1" style={{ color: COLORS.muted }}>
          <MapPin size={12} />
          {[shop.city, shop.country].filter(Boolean).join(" · ")}
        </div>
        {shop.category && (
          <div className="text-[11px] mt-1 opacity-80" style={{ color: COLORS.gold }}>
            {shop.category}
          </div>
        )}
      </div>
    </button>
  );
}
