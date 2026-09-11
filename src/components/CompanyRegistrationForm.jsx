import { useState, useEffect } from "react";
import { supabase } from "../supabaseClient.js";
import { COLORS } from "../theme.js";
import { COMPANY_TYPES, createCompany } from "../services/companyApi.js";
import { createPayment, getAvailableProviders } from "../lib/paymentProvider.js";

const COUNTRY_CURRENCY = {
  ML: "XOF",
  CI: "XOF",
  SN: "XOF",
  BF: "XOF",
  BJ: "XOF",
  TG: "XOF",
  GN: "XOF",
  CM: "XOF",
  FR: "EUR",
  BE: "EUR",
  US: "USD",
};

const TRIAL_DAYS = 30;

function guessDefaultCountry() {
  try {
    const locale = navigator.language || "";
    const region = locale.split("-")[1];
    if (region && region.length === 2) return region.toUpperCase();
  } catch {
    /* ignore */
  }
  return "ML";
}

/**
 * Auto-inscription entreprise (transport, radio, TV, privé, etc.)
 * Même logique que ShopRegistrationForm : 30 jours gratuits puis abo annuel.
 */
export default function CompanyRegistrationForm({ onRegistered }) {
  const [country, setCountry] = useState(guessDefaultCountry);
  const [companyType, setCompanyType] = useState("transport");
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [city, setCity] = useState("");
  const [description, setDescription] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [website, setWebsite] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [eligibleForTrial, setEligibleForTrial] = useState(false);
  const [checkingTrial, setCheckingTrial] = useState(true);
  const [pricing, setPricing] = useState(null);
  const [providers, setProviders] = useState([]);
  const [selectedProvider, setSelectedProvider] = useState(null);

  useEffect(() => {
    async function checkTrial() {
      setCheckingTrial(true);
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setEligibleForTrial(false);
        setCheckingTrial(false);
        return;
      }
      const { count } = await supabase
        .from("companies")
        .select("id", { count: "exact", head: true })
        .eq("owner_id", user.id);
      setEligibleForTrial((count || 0) === 0);
      setCheckingTrial(false);
    }
    checkTrial();
  }, []);

  useEffect(() => {
    async function loadPricing() {
      const currency = COUNTRY_CURRENCY[country] || "USD";
      const { data } = await supabase
        .from("shop_pricing")
        .select("currency, amount_normal, amount_premium")
        .eq("currency", currency)
        .maybeSingle();
      setPricing(data || null);
      const available = getAvailableProviders(country);
      setProviders(available);
      setSelectedProvider(available[0] ?? null);
    }
    loadPricing();
  }, [country]);

  const price = pricing?.amount_normal ?? null;
  const currency = pricing?.currency;

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    if (!name.trim() || !city.trim()) {
      setError("Nom et ville sont obligatoires.");
      return;
    }
    setLoading(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Non connecté");

      const { count } = await supabase
        .from("companies")
        .select("id", { count: "exact", head: true })
        .eq("owner_id", user.id);
      const canTrial = (count || 0) === 0;

      if (canTrial) {
        const trialEnds = new Date();
        trialEnds.setDate(trialEnds.getDate() + TRIAL_DAYS);

        const company = await createCompany({
          owner_id: user.id,
          name: name.trim(),
          description: description.trim() || null,
          company_type: companyType,
          category: category.trim() || null,
          country,
          city: city.trim(),
          phone: phone.trim() || null,
          email: email.trim() || null,
          website: website.trim() || null,
          currency: COUNTRY_CURRENCY[country] || "XOF",
          is_active: true,
          subscription_status: "trial",
          trial_ends_at: trialEnds.toISOString(),
        });

        await supabase.from("company_subscriptions").insert({
          company_id: company.id,
          amount: 0,
          currency: COUNTRY_CURRENCY[country] || "XOF",
          was_premium_rate: false,
          provider: "trial",
          payment_ref: `trial_${company.id}_${Date.now()}`,
          status: "trial",
        });

        onRegistered?.(company);
        return;
      }

      // Parcours payant
      if (!pricing || !selectedProvider) {
        setError("Choisissez un moyen de paiement.");
        setLoading(false);
        return;
      }

      const company = await createCompany({
        owner_id: user.id,
        name: name.trim(),
        description: description.trim() || null,
        company_type: companyType,
        category: category.trim() || null,
        country,
        city: city.trim(),
        phone: phone.trim() || null,
        email: email.trim() || null,
        website: website.trim() || null,
        currency: currency || "XOF",
        is_active: false,
        subscription_status: "none",
      });

      const paymentRef = `company_${company.id}_${Date.now()}`;
      await supabase.from("company_subscriptions").insert({
        company_id: company.id,
        amount: price,
        currency,
        was_premium_rate: false,
        provider: selectedProvider.id,
        payment_ref: paymentRef,
        status: "pending",
      });

      const paymentData = await createPayment({
        provider: selectedProvider.id,
        shopId: company.id, // réutilise l'endpoint (adapter côté API si besoin)
        paymentRef,
        amount: price,
        currency,
        channel: selectedProvider.channels?.[0],
      });

      onRegistered?.(company);
      if (paymentData?.payment_url) {
        window.location.href = paymentData.payment_url;
      } else {
        setError("Paiement créé mais URL manquante.");
      }
    } catch (err) {
      setError(err.message || "Erreur lors de l'inscription");
    } finally {
      setLoading(false);
    }
  }

  if (checkingTrial) {
    return (
      <p className="text-sm text-center p-4" style={{ color: COLORS.muted }}>
        Vérification de l'offre d'essai…
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 max-w-md">
      <h2 className="text-lg font-semibold" style={{ color: COLORS.ivory }}>
        Inscrire mon entreprise
      </h2>

      {eligibleForTrial ? (
        <div
          className="rounded-xl p-3 text-sm border"
          style={{
            background: "rgba(16,185,129,0.1)",
            borderColor: "rgba(16,185,129,0.3)",
            color: "#6ee7b7",
          }}
        >
          <strong>Offre de bienvenue</strong>
          <br />
          Gratuit pendant {TRIAL_DAYS} jours pour les nouveaux comptes.
        </div>
      ) : pricing ? (
        <div
          className="rounded-xl p-3 text-sm"
          style={{ background: COLORS.surface2, color: COLORS.muted }}
        >
          Tarif : {pricing.amount_normal} {currency} / an
        </div>
      ) : null}

      <select
        value={companyType}
        onChange={(e) => setCompanyType(e.target.value)}
        className="rounded-xl border px-3 py-2 text-sm"
        style={{
          background: COLORS.surface2,
          borderColor: COLORS.border,
          color: COLORS.ivory,
        }}
      >
        {COMPANY_TYPES.map((t) => (
          <option key={t.id} value={t.id}>
            {t.icon} {t.label}
          </option>
        ))}
      </select>

      <select
        value={country}
        onChange={(e) => setCountry(e.target.value)}
        className="rounded-xl border px-3 py-2 text-sm"
        style={{
          background: COLORS.surface2,
          borderColor: COLORS.border,
          color: COLORS.ivory,
        }}
      >
        {Object.keys(COUNTRY_CURRENCY).map((code) => (
          <option key={code} value={code}>
            {code}
          </option>
        ))}
      </select>

      <input
        type="text"
        placeholder="Nom de l'entreprise *"
        value={name}
        onChange={(e) => setName(e.target.value)}
        required
        className="rounded-xl border px-3 py-2 text-sm"
        style={{
          background: COLORS.surface2,
          borderColor: COLORS.border,
          color: COLORS.ivory,
        }}
      />
      <input
        type="text"
        placeholder="Catégorie (ex: bus interurbain, FM locale…)"
        value={category}
        onChange={(e) => setCategory(e.target.value)}
        className="rounded-xl border px-3 py-2 text-sm"
        style={{
          background: COLORS.surface2,
          borderColor: COLORS.border,
          color: COLORS.ivory,
        }}
      />
      <input
        type="text"
        placeholder="Ville *"
        value={city}
        onChange={(e) => setCity(e.target.value)}
        required
        className="rounded-xl border px-3 py-2 text-sm"
        style={{
          background: COLORS.surface2,
          borderColor: COLORS.border,
          color: COLORS.ivory,
        }}
      />
      <textarea
        placeholder="Description"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        rows={3}
        className="rounded-xl border px-3 py-2 text-sm"
        style={{
          background: COLORS.surface2,
          borderColor: COLORS.border,
          color: COLORS.ivory,
        }}
      />
      <input
        type="tel"
        placeholder="Téléphone"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        className="rounded-xl border px-3 py-2 text-sm"
        style={{
          background: COLORS.surface2,
          borderColor: COLORS.border,
          color: COLORS.ivory,
        }}
      />
      <input
        type="email"
        placeholder="Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="rounded-xl border px-3 py-2 text-sm"
        style={{
          background: COLORS.surface2,
          borderColor: COLORS.border,
          color: COLORS.ivory,
        }}
      />
      <input
        type="url"
        placeholder="Site web"
        value={website}
        onChange={(e) => setWebsite(e.target.value)}
        className="rounded-xl border px-3 py-2 text-sm"
        style={{
          background: COLORS.surface2,
          borderColor: COLORS.border,
          color: COLORS.ivory,
        }}
      />

      {!eligibleForTrial && providers.length > 0 && (
        <div className="space-y-1">
          <label className="text-xs font-medium" style={{ color: COLORS.muted }}>
            Moyen de paiement
          </label>
          {providers.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setSelectedProvider(p)}
              className="w-full text-left border rounded-xl px-3 py-2 text-sm"
              style={{
                borderColor:
                  selectedProvider?.id === p.id ? COLORS.borderGold : COLORS.border,
                background:
                  selectedProvider?.id === p.id ? COLORS.goldGlow : COLORS.surface2,
                color: COLORS.ivory,
              }}
            >
              {p.label}
            </button>
          ))}
        </div>
      )}

      {error && (
        <p className="text-sm" style={{ color: "#f87171" }}>
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={loading || (!eligibleForTrial && !pricing)}
        className="w-full py-3 rounded-xl font-bold text-sm disabled:opacity-50"
        style={{ background: COLORS.goldGlow, color: COLORS.gold }}
      >
        {loading
          ? eligibleForTrial
            ? "Activation…"
            : "Préparation du paiement…"
          : eligibleForTrial
            ? `Activer gratuitement (${TRIAL_DAYS} jours)`
            : price
              ? `Payer ${price} ${currency} et activer`
              : "Chargement…"}
      </button>
    </form>
  );
}
