import { useEffect, useState } from "react";
import { ArrowLeft, Phone, Globe, Mail } from "lucide-react";
import { COLORS } from "../../../theme.js";
import {
  fetchCompanyById,
  fetchCompanyPrograms,
  fetchCompanyTariffs,
  fetchCompanyInfos,
  COMPANY_TYPES,
  DAYS_LABELS,
} from "../services/companyApi.js";
import CompanyReviews from "./CompanyReviews.jsx";

function formatTime(t) {
  if (!t) return "";
  return String(t).slice(0, 5);
}

function formatDays(days) {
  if (!days || days.length === 0) return "Tous les jours";
  return days.map((d) => DAYS_LABELS[d] || d).join(", ");
}

export default function CompanyDetail({ companyId, userId, onBack }) {
  const [company, setCompany] = useState(null);
  const [programs, setPrograms] = useState([]);
  const [tariffs, setTariffs] = useState([]);
  const [infos, setInfos] = useState([]);
  const [tab, setTab] = useState("programs");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [c, p, t, i] = await Promise.all([
          fetchCompanyById(companyId),
          fetchCompanyPrograms(companyId),
          fetchCompanyTariffs(companyId),
          fetchCompanyInfos(companyId),
        ]);
        setCompany(c);
        setPrograms(p);
        setTariffs(t);
        setInfos(i);
      } finally {
        setLoading(false);
      }
    })();
  }, [companyId]);

  if (loading) {
    return (
      <p className="text-sm p-4" style={{ color: COLORS.muted }}>
        Chargement…
      </p>
    );
  }
  if (!company) {
    return (
      <p className="text-sm p-4" style={{ color: COLORS.muted }}>
        Entreprise introuvable.
      </p>
    );
  }

  const typeMeta = COMPANY_TYPES.find((t) => t.id === company.company_type);

  return (
    <div className="flex flex-col gap-4">
      <button
        type="button"
        onClick={onBack}
        className="flex items-center gap-1 text-sm self-start"
        style={{ color: COLORS.muted }}
      >
        <ArrowLeft size={16} /> Retour
      </button>

      <div
        className="rounded-2xl border p-4"
        style={{ background: COLORS.surface2, borderColor: COLORS.border }}
      >
        <div className="flex items-start gap-3">
          <div
            className="w-16 h-16 rounded-xl flex items-center justify-center text-3xl shrink-0 overflow-hidden"
            style={{ background: "rgba(255,255,255,0.06)" }}
          >
            {company.logo_url ? (
              <img src={company.logo_url} alt="" className="w-full h-full object-cover" />
            ) : (
              <span>{typeMeta?.icon || "🏢"}</span>
            )}
          </div>
          <div className="min-w-0">
            <h2 className="text-lg font-bold" style={{ color: COLORS.ivory }}>
              {company.name}
            </h2>
            <p className="text-xs mt-0.5" style={{ color: COLORS.gold }}>
              {typeMeta?.label}
              {company.category ? ` · ${company.category}` : ""}
            </p>
            <p className="text-xs mt-1" style={{ color: COLORS.muted }}>
              {[company.city, company.country].filter(Boolean).join(" · ")}
            </p>
          </div>
        </div>

        {company.description && (
          <p className="text-sm mt-3" style={{ color: COLORS.muted }}>
            {company.description}
          </p>
        )}

        <div className="flex flex-wrap gap-3 mt-3 text-xs" style={{ color: COLORS.muted }}>
          {company.phone && (
            <a href={`tel:${company.phone}`} className="flex items-center gap-1">
              <Phone size={12} /> {company.phone}
            </a>
          )}
          {company.email && (
            <a href={`mailto:${company.email}`} className="flex items-center gap-1">
              <Mail size={12} /> {company.email}
            </a>
          )}
          {company.website && (
            <a
              href={company.website}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1"
            >
              <Globe size={12} /> Site web
            </a>
          )}
        </div>
      </div>

      <div className="flex gap-2 flex-wrap">
        {[
          { id: "programs", label: "Programmes" },
          { id: "tariffs", label: "Tarifs" },
          { id: "infos", label: "Infos" },
          { id: "reviews", label: "Avis" },
        ].map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className="px-3 py-1.5 rounded-xl text-xs font-bold border"
            style={{
              background: tab === t.id ? COLORS.goldGlow : COLORS.surface2,
              borderColor: tab === t.id ? COLORS.borderGold : COLORS.border,
              color: tab === t.id ? COLORS.gold : COLORS.ivory,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "programs" && (
        <div className="flex flex-col gap-2">
          {programs.length === 0 ? (
            <p className="text-sm" style={{ color: COLORS.muted }}>
              Aucun programme publié.
            </p>
          ) : (
            programs.map((p) => (
              <div
                key={p.id}
                className="rounded-xl border p-3"
                style={{ background: COLORS.surface2, borderColor: COLORS.border }}
              >
                <div className="font-bold text-sm" style={{ color: COLORS.ivory }}>
                  {p.title}
                </div>
                {p.description && (
                  <p className="text-xs mt-1" style={{ color: COLORS.muted }}>
                    {p.description}
                  </p>
                )}
                <div className="text-xs mt-2 flex flex-wrap gap-2" style={{ color: COLORS.muted }}>
                  {p.program_type === "route" && (p.origin || p.destination) && (
                    <span>
                      {p.origin || "?"} → {p.destination || "?"}
                    </span>
                  )}
                  {(p.start_time || p.end_time) && (
                    <span>
                      {formatTime(p.start_time)}
                      {p.end_time ? ` – ${formatTime(p.end_time)}` : ""}
                    </span>
                  )}
                  {p.days_of_week?.length > 0 && <span>{formatDays(p.days_of_week)}</span>}
                  {p.frequency && <span>{p.frequency}</span>}
                  {p.price != null && (
                    <span style={{ color: COLORS.gold }}>
                      {Number(p.price).toLocaleString()} {p.currency}
                    </span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {tab === "tariffs" && (
        <div className="flex flex-col gap-2">
          {tariffs.length === 0 ? (
            <p className="text-sm" style={{ color: COLORS.muted }}>
              Aucun tarif publié.
            </p>
          ) : (
            tariffs.map((t) => (
              <div
                key={t.id}
                className="rounded-xl border p-3 flex justify-between items-start"
                style={{ background: COLORS.surface2, borderColor: COLORS.border }}
              >
                <div>
                  <div className="font-bold text-sm" style={{ color: COLORS.ivory }}>
                    {t.name}
                  </div>
                  {t.description && (
                    <p className="text-xs mt-1" style={{ color: COLORS.muted }}>
                      {t.description}
                    </p>
                  )}
                  {t.unit && (
                    <p className="text-[11px] mt-1" style={{ color: COLORS.muted }}>
                      {t.unit}
                    </p>
                  )}
                </div>
                <div className="text-sm font-bold shrink-0" style={{ color: COLORS.gold }}>
                  {Number(t.price).toLocaleString()} {t.currency}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {tab === "infos" && (
        <div className="flex flex-col gap-2">
          {infos.length === 0 ? (
            <p className="text-sm" style={{ color: COLORS.muted }}>
              Aucune information supplémentaire.
            </p>
          ) : (
            infos.map((i) => (
              <div
                key={i.id}
                className="rounded-xl border p-3"
                style={{ background: COLORS.surface2, borderColor: COLORS.border }}
              >
                <div className="font-bold text-sm" style={{ color: COLORS.ivory }}>
                  {i.title}
                </div>
                <p className="text-xs mt-2 whitespace-pre-wrap" style={{ color: COLORS.muted }}>
                  {i.content}
                </p>
              </div>
            ))
          )}
        </div>
      )}

      {tab === "reviews" && (
        <CompanyReviews companyId={companyId} userId={userId} />
      )}
    </div>
  );
}
