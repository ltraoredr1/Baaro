import { useState, useEffect } from "react";
import { Building2, PlusCircle, Store, Package } from "lucide-react";
import { COLORS } from "../theme.js";
import { fetchActiveCompanies, fetchMyCompany, COMPANY_TYPES } from "../services/companyApi.js";
import CompanyCard from "./CompanyCard.jsx";
import CompanyDetail from "./CompanyDetail.jsx";
import CompanyRegistrationForm from "./CompanyRegistrationForm.jsx";
import CompanyManager from "./CompanyManager.jsx";

/**
 * Onglet Entreprises & Services
 * - Annuaire (transport, radio, TV, entreprises privées…)
 * - Auto-inscription
 * - Gestion programmes / tarifs / infos
 */
export default function CompaniesTab({ userId }) {
  const [mode, setMode] = useState("directory"); // directory | register | manage | detail
  const [companies, setCompanies] = useState([]);
  const [myCompany, setMyCompany] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [query, setQuery] = useState("");
  const [filterType, setFilterType] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) return;
    (async () => {
      const mine = await fetchMyCompany(userId);
      setMyCompany(mine || null);
    })();
  }, [userId, mode]);

  useEffect(() => {
    if (mode !== "directory") return;
    (async () => {
      setLoading(true);
      try {
        const data = await fetchActiveCompanies({
          query,
          companyType: filterType || undefined,
        });
        setCompanies(data);
      } finally {
        setLoading(false);
      }
    })();
  }, [mode, query, filterType]);

  return (
    <div className="flex flex-col gap-4">
      <div
        className="rounded-2xl border p-4"
        style={{ background: COLORS.surface2, borderColor: COLORS.border }}
      >
        <div className="flex items-start gap-3">
          <div
            className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: COLORS.goldGlow, color: COLORS.gold }}
          >
            <Building2 size={22} />
          </div>
          <div>
            <h2 className="text-base font-bold" style={{ color: COLORS.ivory }}>
              Entreprises & Services
            </h2>
            <p className="text-xs mt-1" style={{ color: COLORS.muted }}>
              Créez une entreprise indépendante d'une boutique : transport, voyage,
              radio, TV, télécoms, énergie, banque, assurance, éducation, santé,
              hôtellerie et autres services.
            </p>
          </div>
        </div>
      </div>

      {/* Navigation modes */}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => {
            setMode("directory");
            setSelectedId(null);
          }}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border"
          style={{
            background: mode === "directory" || mode === "detail" ? COLORS.goldGlow : COLORS.surface2,
            borderColor: mode === "directory" || mode === "detail" ? COLORS.borderGold : COLORS.border,
            color: mode === "directory" || mode === "detail" ? COLORS.gold : COLORS.ivory,
          }}
        >
          <Building2 size={14} />
          Annuaire
        </button>
        <button
          type="button"
          onClick={() => setMode("register")}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border"
          style={{
            background: mode === "register" ? COLORS.goldGlow : COLORS.surface2,
            borderColor: mode === "register" ? COLORS.borderGold : COLORS.border,
            color: mode === "register" ? COLORS.gold : COLORS.ivory,
          }}
        >
          <PlusCircle size={14} />
          Créer une entreprise
        </button>
        {myCompany && (
          <button
            type="button"
            onClick={() => setMode("manage")}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border"
            style={{
              background: mode === "manage" ? COLORS.tealGlow || COLORS.goldGlow : COLORS.surface2,
              borderColor: mode === "manage" ? COLORS.borderTeal || COLORS.borderGold : COLORS.border,
              color: mode === "manage" ? COLORS.teal || COLORS.gold : COLORS.ivory,
            }}
          >
            <Package size={14} />
            Gérer ({myCompany.name})
          </button>
        )}
      </div>

      {/* DIRECTORY */}
      {(mode === "directory" || mode === "detail") && !selectedId && (
        <>
          <input
            type="search"
            placeholder="Rechercher une entreprise, ville, catégorie…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full rounded-xl border px-3 py-2 text-sm"
            style={{
              background: COLORS.surface2,
              borderColor: COLORS.border,
              color: COLORS.ivory,
            }}
          />

          <div className="flex gap-2 overflow-x-auto pb-1">
            <button
              type="button"
              onClick={() => setFilterType("")}
              className="shrink-0 px-3 py-1 rounded-lg text-[11px] font-bold border"
              style={{
                background: !filterType ? COLORS.goldGlow : COLORS.surface2,
                borderColor: !filterType ? COLORS.borderGold : COLORS.border,
                color: !filterType ? COLORS.gold : COLORS.muted,
              }}
            >
              Tous
            </button>
            {COMPANY_TYPES.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setFilterType(t.id)}
                className="shrink-0 px-3 py-1 rounded-lg text-[11px] font-bold border"
                style={{
                  background: filterType === t.id ? COLORS.goldGlow : COLORS.surface2,
                  borderColor: filterType === t.id ? COLORS.borderGold : COLORS.border,
                  color: filterType === t.id ? COLORS.gold : COLORS.muted,
                }}
              >
                {t.icon} {t.label}
              </button>
            ))}
          </div>

          {loading ? (
            <p className="text-sm" style={{ color: COLORS.muted }}>
              Chargement…
            </p>
          ) : companies.length === 0 ? (
            <p className="text-sm" style={{ color: COLORS.muted }}>
              Aucune entreprise active pour le moment.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {companies.map((c) => (
                <CompanyCard
                  key={c.id}
                  company={c}
                  onClick={(company) => {
                    setSelectedId(company.id);
                    setMode("detail");
                  }}
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* DETAIL */}
      {mode === "detail" && selectedId && (
        <CompanyDetail
          userId={userId}
          companyId={selectedId}
          onBack={() => {
            setSelectedId(null);
            setMode("directory");
          }}
        />
      )}

      {/* REGISTER */}
      {mode === "register" && (
        <CompanyRegistrationForm
          onRegistered={() => {
            setMode("manage");
          }}
        />
      )}

      {/* MANAGE */}
      {mode === "manage" && myCompany && (
        <CompanyManager
          companyId={myCompany.id}
          companyCurrency={myCompany.currency || "XOF"}
        />
      )}
      {mode === "manage" && !myCompany && (
        <p className="text-sm" style={{ color: COLORS.muted }}>
          Aucune entreprise trouvée. Inscris-en une d&apos;abord.
        </p>
      )}
    </div>
  );
}
