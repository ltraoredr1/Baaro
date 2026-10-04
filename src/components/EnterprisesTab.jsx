import { useState, useEffect, useCallback } from "react";
import { Building2, Plus, Search, Loader2, ArrowLeft } from "lucide-react";
import { COLORS } from "../theme.js";
import {
  COMPANY_TYPES,
  fetchActiveCompanies,
  fetchMyCompany,
} from "../services/companyApi.js";
import CompanyCard from "./CompanyCard.jsx";
import CompanyDetail from "./CompanyDetail.jsx";
import CompanyRegistrationForm from "./CompanyRegistrationForm.jsx";
import CompanyManager from "./CompanyManager.jsx";
import { EmptyState } from "./EmptyState.jsx";
import { useToast } from "./ToastContext.jsx";

/**
 * Onglet Entreprises / services — branche CompanyCard, Detail, Registration, Manager.
 * Modes : directory | detail | register | manage
 */
export default function EnterprisesTab({ id, onOpenProfile }) {
  const { showToast } = useToast();
  const [mode, setMode] = useState("directory");
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [companyType, setCompanyType] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [myCompany, setMyCompany] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [list, mine] = await Promise.all([
        fetchActiveCompanies({
          query,
          companyType: companyType || undefined,
          limit: 48,
        }),
        id ? fetchMyCompany(id) : Promise.resolve(null),
      ]);
      setCompanies(list || []);
      setMyCompany(mine);
    } catch (e) {
      setError(e?.message || "Impossible de charger les entreprises.");
      setCompanies([]);
    } finally {
      setLoading(false);
    }
  }, [query, companyType, id]);

  useEffect(() => {
    load();
  }, [load]);

  if (mode === "detail" && selectedId) {
    return (
      <CompanyDetail
        companyId={selectedId}
        userId={id}
        onBack={() => {
          setMode("directory");
          setSelectedId(null);
          load();
        }}
      />
    );
  }

  if (mode === "register") {
    return (
      <div className="space-y-4 pb-28">
        <button
          type="button"
          onClick={() => setMode("directory")}
          className="flex items-center gap-2 text-xs"
          style={{ color: COLORS.teal }}
        >
          <ArrowLeft size={14} /> Retour à l’annuaire
        </button>
        <CompanyRegistrationForm
          onRegistered={(company) => {
            showToast?.("Entreprise enregistrée", "success");
            setMyCompany(company);
            setSelectedId(company?.id);
            setMode(company?.id ? "manage" : "directory");
            load();
          }}
        />
      </div>
    );
  }

  if (mode === "manage" && myCompany?.id) {
    return (
      <div className="space-y-4 pb-28">
        <button
          type="button"
          onClick={() => setMode("directory")}
          className="flex items-center gap-2 text-xs"
          style={{ color: COLORS.teal }}
        >
          <ArrowLeft size={14} /> Retour à l’annuaire
        </button>
        <CompanyManager
          companyId={myCompany.id}
          companyCurrency={myCompany.currency || "XOF"}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-28">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Building2 size={22} style={{ color: COLORS.gold }} />
          <div>
            <h1 className="text-lg font-bold" style={{ color: COLORS.ivory }}>
              Entreprises & services
            </h1>
            <p className="text-xs" style={{ color: COLORS.muted }}>
              Transport, médias, banques, santé…
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {myCompany ? (
            <button
              type="button"
              onClick={() => setMode("manage")}
              className="px-3 py-2 rounded-xl text-xs font-semibold border"
              style={{ borderColor: COLORS.border, color: COLORS.ivory }}
            >
              Gérer ma fiche
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setMode("register")}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold"
              style={{
                background: "linear-gradient(135deg, #D9AE52 0%, #2DBFA6 100%)",
                color: COLORS.bg,
              }}
            >
              <Plus size={14} /> Inscrire mon entreprise
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2"
            style={{ color: COLORS.muted }}
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher une entreprise…"
            className="w-full pl-9 pr-3 py-2.5 rounded-xl border text-sm outline-none"
            style={{
              background: COLORS.surface2,
              borderColor: COLORS.border,
              color: COLORS.ivory,
            }}
          />
        </div>
        <select
          value={companyType}
          onChange={(e) => setCompanyType(e.target.value)}
          className="px-3 py-2.5 rounded-xl border text-sm outline-none"
          style={{
            background: COLORS.surface2,
            borderColor: COLORS.border,
            color: COLORS.ivory,
          }}
        >
          <option value="">Tous les types</option>
          {COMPANY_TYPES.map((t) => (
            <option key={t.id} value={t.id}>
              {t.icon} {t.label}
            </option>
          ))}
        </select>
      </div>

      {error && (
        <p className="text-xs text-red-400 px-1">{error}</p>
      )}

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="animate-spin" style={{ color: COLORS.gold }} />
        </div>
      ) : companies.length === 0 ? (
        <EmptyState
          title="Aucune entreprise"
          description="Modifie les filtres ou inscris la première fiche."
          actionLabel={id ? "Inscrire mon entreprise" : null}
          onAction={id ? () => setMode("register") : undefined}
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {companies.map((c) => (
            <CompanyCard
              key={c.id}
              company={c}
              onClick={() => {
                setSelectedId(c.id);
                setMode("detail");
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
