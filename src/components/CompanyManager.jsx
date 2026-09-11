import { useEffect, useState } from "react";
import { COLORS } from "../../../theme.js";
import {
  fetchCompanyPrograms,
  fetchCompanyTariffs,
  fetchCompanyInfos,
  createProgram,
  createTariff,
  createInfo,
  deleteProgram,
  deleteTariff,
  deleteInfo,
  PROGRAM_TYPES,
  DAYS_LABELS,
} from "../services/companyApi.js";
import { useToast } from "../../../components/ToastContext.jsx";

/**
 * Gestion des programmes, tarifs et infos pour le propriétaire d'une entreprise.
 */
export default function CompanyManager({ companyId, companyCurrency = "XOF" }) {
  const { showToast } = useToast();
  const [tab, setTab] = useState("programs");
  const [programs, setPrograms] = useState([]);
  const [tariffs, setTariffs] = useState([]);
  const [infos, setInfos] = useState([]);
  const [loading, setLoading] = useState(true);

  // Forms
  const [progTitle, setProgTitle] = useState("");
  const [progType, setProgType] = useState("schedule");
  const [progDesc, setProgDesc] = useState("");
  const [progOrigin, setProgOrigin] = useState("");
  const [progDest, setProgDest] = useState("");
  const [progStart, setProgStart] = useState("");
  const [progEnd, setProgEnd] = useState("");
  const [progPrice, setProgPrice] = useState("");
  const [progDays, setProgDays] = useState([]);

  const [tariffName, setTariffName] = useState("");
  const [tariffPrice, setTariffPrice] = useState("");
  const [tariffUnit, setTariffUnit] = useState("");
  const [tariffDesc, setTariffDesc] = useState("");

  const [infoTitle, setInfoTitle] = useState("");
  const [infoContent, setInfoContent] = useState("");

  const [saving, setSaving] = useState(false);

  async function reload() {
    setLoading(true);
    try {
      const [p, t, i] = await Promise.all([
        fetchCompanyPrograms(companyId, { onlyActive: false }),
        fetchCompanyTariffs(companyId, { onlyActive: false }),
        fetchCompanyInfos(companyId),
      ]);
      setPrograms(p);
      setTariffs(t);
      setInfos(i);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (companyId) reload();
  }, [companyId]);

  function toggleDay(d) {
    setProgDays((prev) =>
      prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort()
    );
  }

  async function handleAddProgram(e) {
    e.preventDefault();
    if (!progTitle.trim()) return;
    setSaving(true);
    try {
      await createProgram({
        company_id: companyId,
        title: progTitle.trim(),
        description: progDesc.trim() || null,
        program_type: progType,
        origin: progOrigin.trim() || null,
        destination: progDest.trim() || null,
        start_time: progStart || null,
        end_time: progEnd || null,
        price: progPrice ? Number(progPrice) : null,
        currency: companyCurrency,
        days_of_week: progDays,
      });
      setProgTitle("");
      setProgDesc("");
      setProgOrigin("");
      setProgDest("");
      setProgStart("");
      setProgEnd("");
      setProgPrice("");
      setProgDays([]);
      showToast("Programme ajouté", "success");
      await reload();
    } catch (err) {
      showToast(err.message || "Erreur", "error");
    } finally {
      setSaving(false);
    }
  }

  async function handleAddTariff(e) {
    e.preventDefault();
    if (!tariffName.trim() || !tariffPrice) return;
    setSaving(true);
    try {
      await createTariff({
        company_id: companyId,
        name: tariffName.trim(),
        description: tariffDesc.trim() || null,
        price: Number(tariffPrice),
        currency: companyCurrency,
        unit: tariffUnit.trim() || null,
      });
      setTariffName("");
      setTariffPrice("");
      setTariffUnit("");
      setTariffDesc("");
      showToast("Tarif ajouté", "success");
      await reload();
    } catch (err) {
      showToast(err.message || "Erreur", "error");
    } finally {
      setSaving(false);
    }
  }

  async function handleAddInfo(e) {
    e.preventDefault();
    if (!infoTitle.trim() || !infoContent.trim()) return;
    setSaving(true);
    try {
      await createInfo({
        company_id: companyId,
        title: infoTitle.trim(),
        content: infoContent.trim(),
      });
      setInfoTitle("");
      setInfoContent("");
      showToast("Info ajoutée", "success");
      await reload();
    } catch (err) {
      showToast(err.message || "Erreur", "error");
    } finally {
      setSaving(false);
    }
  }

  const inputStyle = {
    background: COLORS.surface2,
    borderColor: COLORS.border,
    color: COLORS.ivory,
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2 flex-wrap">
        {[
          { id: "programs", label: "Programmes" },
          { id: "tariffs", label: "Tarifs" },
          { id: "infos", label: "Infos" },
        ].map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className="px-3 py-1.5 rounded-xl text-xs font-bold border"
            style={{
              background: tab === t.id ? COLORS.tealGlow || COLORS.goldGlow : COLORS.surface2,
              borderColor: tab === t.id ? COLORS.borderTeal || COLORS.borderGold : COLORS.border,
              color: tab === t.id ? COLORS.teal || COLORS.gold : COLORS.ivory,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading && (
        <p className="text-sm" style={{ color: COLORS.muted }}>
          Chargement…
        </p>
      )}

      {/* PROGRAMS */}
      {tab === "programs" && !loading && (
        <>
          <form onSubmit={handleAddProgram} className="flex flex-col gap-2">
            <input
              type="text"
              placeholder="Titre (ex: Ligne Bamako-Sikasso, Journal 20h)"
              value={progTitle}
              onChange={(e) => setProgTitle(e.target.value)}
              className="rounded-xl border px-3 py-2 text-sm"
              style={inputStyle}
              required
            />
            <select
              value={progType}
              onChange={(e) => setProgType(e.target.value)}
              className="rounded-xl border px-3 py-2 text-sm"
              style={inputStyle}
            >
              {PROGRAM_TYPES.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
            <textarea
              placeholder="Description"
              value={progDesc}
              onChange={(e) => setProgDesc(e.target.value)}
              rows={2}
              className="rounded-xl border px-3 py-2 text-sm"
              style={inputStyle}
            />
            {progType === "route" && (
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Origine"
                  value={progOrigin}
                  onChange={(e) => setProgOrigin(e.target.value)}
                  className="flex-1 rounded-xl border px-3 py-2 text-sm"
                  style={inputStyle}
                />
                <input
                  type="text"
                  placeholder="Destination"
                  value={progDest}
                  onChange={(e) => setProgDest(e.target.value)}
                  className="flex-1 rounded-xl border px-3 py-2 text-sm"
                  style={inputStyle}
                />
              </div>
            )}
            <div className="flex gap-2">
              <input
                type="time"
                value={progStart}
                onChange={(e) => setProgStart(e.target.value)}
                className="flex-1 rounded-xl border px-3 py-2 text-sm"
                style={inputStyle}
              />
              <input
                type="time"
                value={progEnd}
                onChange={(e) => setProgEnd(e.target.value)}
                className="flex-1 rounded-xl border px-3 py-2 text-sm"
                style={inputStyle}
              />
              <input
                type="number"
                placeholder={`Prix (${companyCurrency})`}
                value={progPrice}
                onChange={(e) => setProgPrice(e.target.value)}
                min="0"
                step="0.01"
                className="flex-1 rounded-xl border px-3 py-2 text-sm"
                style={inputStyle}
              />
            </div>
            <div className="flex flex-wrap gap-1">
              {DAYS_LABELS.map((label, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => toggleDay(i)}
                  className="px-2 py-1 rounded-lg text-[11px] border"
                  style={{
                    background: progDays.includes(i) ? COLORS.goldGlow : COLORS.surface2,
                    borderColor: progDays.includes(i) ? COLORS.borderGold : COLORS.border,
                    color: progDays.includes(i) ? COLORS.gold : COLORS.muted,
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
            <button
              type="submit"
              disabled={saving}
              className="rounded-xl py-2 text-sm font-bold"
              style={{ background: COLORS.goldGlow, color: COLORS.gold }}
            >
              {saving ? "Ajout…" : "Ajouter le programme"}
            </button>
          </form>

          <div className="flex flex-col gap-2 mt-2">
            {programs.map((p) => (
              <div
                key={p.id}
                className="rounded-xl border p-3 flex justify-between items-start"
                style={{ background: COLORS.surface2, borderColor: COLORS.border }}
              >
                <div>
                  <div className="text-sm font-bold" style={{ color: COLORS.ivory }}>
                    {p.title}
                  </div>
                  <div className="text-xs" style={{ color: COLORS.muted }}>
                    {p.program_type}
                    {p.origin && ` · ${p.origin} → ${p.destination || "?"}`}
                    {p.price != null && ` · ${p.price} ${p.currency}`}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={async () => {
                    await deleteProgram(p.id);
                    await reload();
                  }}
                  className="text-xs px-2 py-1 rounded-lg border"
                  style={{ borderColor: COLORS.border, color: "#f87171" }}
                >
                  Suppr.
                </button>
              </div>
            ))}
          </div>
        </>
      )}

      {/* TARIFFS */}
      {tab === "tariffs" && !loading && (
        <>
          <form onSubmit={handleAddTariff} className="flex flex-col gap-2">
            <input
              type="text"
              placeholder="Nom du tarif (ex: Ticket simple, Spot 30s)"
              value={tariffName}
              onChange={(e) => setTariffName(e.target.value)}
              className="rounded-xl border px-3 py-2 text-sm"
              style={inputStyle}
              required
            />
            <div className="flex gap-2">
              <input
                type="number"
                placeholder={`Prix (${companyCurrency})`}
                value={tariffPrice}
                onChange={(e) => setTariffPrice(e.target.value)}
                min="0"
                step="0.01"
                className="flex-1 rounded-xl border px-3 py-2 text-sm"
                style={inputStyle}
                required
              />
              <input
                type="text"
                placeholder="Unité (par trajet, par mois…)"
                value={tariffUnit}
                onChange={(e) => setTariffUnit(e.target.value)}
                className="flex-1 rounded-xl border px-3 py-2 text-sm"
                style={inputStyle}
              />
            </div>
            <textarea
              placeholder="Description"
              value={tariffDesc}
              onChange={(e) => setTariffDesc(e.target.value)}
              rows={2}
              className="rounded-xl border px-3 py-2 text-sm"
              style={inputStyle}
            />
            <button
              type="submit"
              disabled={saving}
              className="rounded-xl py-2 text-sm font-bold"
              style={{ background: COLORS.goldGlow, color: COLORS.gold }}
            >
              {saving ? "Ajout…" : "Ajouter le tarif"}
            </button>
          </form>

          <div className="flex flex-col gap-2 mt-2">
            {tariffs.map((t) => (
              <div
                key={t.id}
                className="rounded-xl border p-3 flex justify-between items-start"
                style={{ background: COLORS.surface2, borderColor: COLORS.border }}
              >
                <div>
                  <div className="text-sm font-bold" style={{ color: COLORS.ivory }}>
                    {t.name}
                  </div>
                  <div className="text-xs" style={{ color: COLORS.muted }}>
                    {t.price} {t.currency}
                    {t.unit ? ` · ${t.unit}` : ""}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={async () => {
                    await deleteTariff(t.id);
                    await reload();
                  }}
                  className="text-xs px-2 py-1 rounded-lg border"
                  style={{ borderColor: COLORS.border, color: "#f87171" }}
                >
                  Suppr.
                </button>
              </div>
            ))}
          </div>
        </>
      )}

      {/* INFOS */}
      {tab === "infos" && !loading && (
        <>
          <form onSubmit={handleAddInfo} className="flex flex-col gap-2">
            <input
              type="text"
              placeholder="Titre (ex: Conditions, Couverture…)"
              value={infoTitle}
              onChange={(e) => setInfoTitle(e.target.value)}
              className="rounded-xl border px-3 py-2 text-sm"
              style={inputStyle}
              required
            />
            <textarea
              placeholder="Contenu"
              value={infoContent}
              onChange={(e) => setInfoContent(e.target.value)}
              rows={4}
              className="rounded-xl border px-3 py-2 text-sm"
              style={inputStyle}
              required
            />
            <button
              type="submit"
              disabled={saving}
              className="rounded-xl py-2 text-sm font-bold"
              style={{ background: COLORS.goldGlow, color: COLORS.gold }}
            >
              {saving ? "Ajout…" : "Ajouter l'info"}
            </button>
          </form>

          <div className="flex flex-col gap-2 mt-2">
            {infos.map((i) => (
              <div
                key={i.id}
                className="rounded-xl border p-3 flex justify-between items-start"
                style={{ background: COLORS.surface2, borderColor: COLORS.border }}
              >
                <div>
                  <div className="text-sm font-bold" style={{ color: COLORS.ivory }}>
                    {i.title}
                  </div>
                  <p className="text-xs mt-1 line-clamp-2" style={{ color: COLORS.muted }}>
                    {i.content}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={async () => {
                    await deleteInfo(i.id);
                    await reload();
                  }}
                  className="text-xs px-2 py-1 rounded-lg border"
                  style={{ borderColor: COLORS.border, color: "#f87171" }}
                >
                  Suppr.
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
