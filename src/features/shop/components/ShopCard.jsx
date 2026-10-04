import { COLORS } from "../../../theme.js";

export default function ShopCard({ shop, onSelect }) {
  return (
    <button type="button" onClick={() => onSelect?.(shop)} className="rounded-xl border p-3 text-left" style={{ background: COLORS.surface2, borderColor: COLORS.border }}>
      {shop.logo_url && <img src={shop.logo_url} alt="" className="mb-2 h-28 w-full rounded-lg object-cover" />}
      <b style={{ color: COLORS.ivory }}>{shop.name}</b>
      <div className="mt-1 text-xs" style={{ color: COLORS.muted }}>{[shop.category, shop.city, shop.country].filter(Boolean).join(" · ")}</div>
    </button>
  );
}
