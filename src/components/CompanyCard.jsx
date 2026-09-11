import { COLORS } from "../theme.js";
import { MapPin } from "lucide-react";
import { COMPANY_TYPES } from "../services/companyApi.js";

export default function CompanyCard({ company, onClick }) {
  const typeMeta = COMPANY_TYPES.find((t) => t.id === company.company_type) || {
    icon: "🏢",
    label: company.company_type,
  };

  return (
    <button
      type="button"
      onClick={() => onClick?.(company)}
      className="w-full text-left rounded-2xl border p-3 flex gap-3 transition active:scale-[0.98]"
      style={{ background: COLORS.surface2, borderColor: COLORS.border }}
    >
      <div
        className="w-14 h-14 rounded-xl flex items-center justify-center shrink-0 overflow-hidden text-2xl"
        style={{ background: COLORS.surface3 || "rgba(255,255,255,0.06)" }}
      >
        {company.logo_url ? (
          <img src={company.logo_url} alt="" className="w-full h-full object-cover" />
        ) : (
          <span>{typeMeta.icon}</span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="font-bold text-sm truncate" style={{ color: COLORS.ivory }}>
          {company.name}
        </div>
        <div className="text-xs mt-0.5 flex items-center gap-1" style={{ color: COLORS.muted }}>
          <MapPin size={12} />
          {[company.city, company.country].filter(Boolean).join(" · ")}
        </div>
        <div className="text-[11px] mt-1 flex gap-2 flex-wrap">
          <span style={{ color: COLORS.gold }}>{typeMeta.label}</span>
          {company.category && (
            <span style={{ color: COLORS.muted }}>· {company.category}</span>
          )}
        </div>
      </div>
    </button>
  );
}
