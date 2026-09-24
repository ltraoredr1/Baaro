import ImageUpload from "../../components/ImageUpload.jsx";
import { useState, useEffect } from "react";
import { supabase } from "../../supabaseClient.js";
import { createPayment, getAvailableProviders } from "../../lib/paymentProvider.js";
import { COLORS } from "../../theme.js"; // 🆕 Import du thème pour la cohérence visuelle

const COUNTRY_CURRENCY = {
  ML: "XOF", CI: "XOF", SN: "XOF", BF: "XOF", BJ: "XOF", TG: "XOF", GN: "XOF", CM: "XOF",
  FR: "EUR", BE: "EUR", DE: "EUR", ES: "EUR", IT: "EUR", US: "USD", CA: "USD",
};

const TRIAL_DAYS = 30;

function guessDefaultCountry() {
  try {
    const locale = navigator.language || navigator.languages?.[0] || "";
    const region = locale.split("-")[1];
    if (region && region.length === 2) return region.toUpperCase();
  } catch { /* ignore */ }
  return "ML";
}

/**
 * Inscription boutique
 * - Nouveaux users : 30 jours gratuits (trial)
 * - Après / renouvellement : paiement annuel
 */
export default function ShopRegistrationForm({ onRegistered }) {
  const [country, setCountry] = useState(guessDefaultCountry);
  const [isPremium, setIsPremium] = useState(false);
  const [pricing, setPricing] = useState(null);
  const [providers, setProviders] = useState([]);
  const [selectedProvider, setSelectedProvider] = useState(null);

  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [city, setCity] = useState("");
  const [description, setDescription] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [ownerId, setOwnerId] = useState(null);
  // logo via ImageUpload
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [eligibleForTrial, setEligibleForTrial] = useState(false);
  const [checkingTrial, setCheckingTrial] = useState(true);

  useEffect(() => {
    async function loadUserAndTrial() {
      setCheckingTrial(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (user) setOwnerId(user.id);
      if (!user) {
        setEligibleForTrial(false);
        setCheckingTrial(false);
        return;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("is_premium")
        .eq("id", user.id)
        .maybeSingle();
      setIsPremium(!!profile?.is_premium);

      // Essai = jamais eu de boutique (première création)
      const { count } = await supabase
        .from("shops")
        .select("id", { count: "exact", head: true })
        .eq("owner_id", user.id);

      setEligibleForTrial((count || 0) === 0);
      setCheckingTrial(false);
    }
    loadUserAndTrial();
  }, []);

  useEffect(() => {
    async function loadPricingAndProviders() {
      const currency = COUNTRY_CURRENCY[country] || "USD";

      const { data } = await supabase
        .from("shop_pricing")
        .select("currency, amount_normal, amount_premium")
        .eq("currency", currency)
        .maybeSingle();

      if (data) {
        setPricing(data);
      } else {
        const { data: usdFallback } = await supabase
          .from("shop_pricing")
          .select("currency, amount_normal, amount_premium")
          .eq("currency", "USD")
          .maybeSingle();
        setPricing(usdFallback ?? null);
      }

      const available = getAvailableProviders(country);
      setProviders(available);
      setSelectedProvider(available[0] ?? null);
    }
    loadPricingAndProviders();
  }, [country]);

  const price = pricing ? (isPremium ? pricing.amount_premium : pricing.amount_normal) : null;
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
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Non connecté");

      const { count } = await supabase
        .from("shops")
        .select("id", { count: "exact", head: true })
        .eq("owner_id", user.id);
      const canTrial = (count || 0) === 0;

      if (canTrial) {
        const trialEnds = new Date();
        trialEnds.setDate(trialEnds.getDate() + TRIAL_DAYS);

        const { data: shop, error: shopError } = await supabase
          .from("shops")
          .insert({ logo_url: logoUrl || null,
            owner_id: user.id,
            name: name.trim(),
            description: description.trim() || null,
            category: category.trim() || null,
            country,
            city: city.trim(),
            currency: COUNTRY_CURRENCY[country] || "XOF",
            is_active: true,
            subscription_status: "trial",
            trial_ends_at: trialEnds.toISOString(),
          })
          .select()
          .single();

        if (shopError) throw shopError;

        await supabase.from("shop_subscriptions").insert({
          shop_id: shop.id,
          amount: 0,
          currency: COUNTRY_CURRENCY[country] || "XOF",
          was_premium_rate: false,
          provider: "trial",
          payment_ref: `trial_${shop.id}_${Date.now()}`,
          status: "trial",
        });

        onRegistered?.(shop);
        return;
      }

      // --- Parcours payant ---
      if (!pricing || !selectedProvider) {
        setError("Choisissez un moyen de paiement.");
        setLoading(false);
        return;
      }

      const { data: shop, error: shopError } = await supabase
        .from("shops")
        .insert({
          owner_id: user.id,
          name: name.trim(),
          description: description.trim() || null,
          category: category.trim() || null,
          country,
          city: city.trim(),
          currency: currency || "XOF",
          is_active: false,
          subscription_status: "none",
        })
        .select()
        .single();

      if (shopError) throw shopError;

      const paymentRef = `shop_${shop.id}_${Date.now()}`;
      const { error: subError } = await supabase.from("shop_subscriptions").insert({
        shop_id: shop.id,
        amount: price,
        currency,
        was_premium_rate: isPremium,
        provider: selectedProvider.id,
        payment_ref: paymentRef,
        status: "pending",
      });
      if (subError) throw subError;

      const paymentData = await createPayment({
        provider: selectedProvider.id,
        shopId: shop.id,
        paymentRef,
        amount: price,
        currency,
        channel: selectedProvider.channels?.[0],
      });

      onRegistered?.(shop);
      if (paymentData?.payment_url) {
        window.location.href = paymentData.payment_url;
      } else {
        setError("Paiement créé mais URL manquante. Contactez le support.");
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
        Vérification de l&apos;offre d&apos;essai…
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-md mx-auto space-y-4 p-4">
      <h2 className="text-lg font-semibold" style={{ color: COLORS.ivory }}>
        Créer ma boutique
      </h2>
      <div className="mb-4">
        <p className="text-xs mb-2 font-bold" style={{ color: COLORS.muted }}>Logo boutique</p>
        <ImageUpload
          userId={ownerId}
          folder="shops"
          value={logoUrl}
          onChange={setLogoUrl}
          label="Logo"
          compact
        />
      </div>

      {eligibleForTrial ? (
        <div className="rounded-xl p-3 text-sm border" style={{ background: "rgba(45, 191, 166, 0.1)", borderColor: COLORS.borderTeal, color: COLORS.teal }}>
          <strong>Offre de bienvenue</strong>
          <br />
          Création <strong>gratuite pendant {TRIAL_DAYS} jours</strong> pour les nouveaux utilisateurs. Ensuite, abonnement annuel selon ton pays.
        </div>
      ) : pricing ? (
        <div className="rounded-xl p-3 text-sm border" style={{ background: isPremium ? "rgba(217, 174, 82, 0.1)" : COLORS.surface2, borderColor: isPremium ? COLORS.borderGold : COLORS.border, color: isPremium ? COLORS.gold : COLORS.muted }}>
          {isPremium
            ? `Tarif premium : ${pricing.amount_premium} ${currency} / an (au lieu de ${pricing.amount_normal} ${currency})`
            : `Tarif : ${pricing.amount_normal} ${currency} / an (premium : ${pricing.amount_premium} ${currency})`}
        </div>
      ) : null}

      <select
        value={country}
        onChange={(e) => setCountry(e.target.value)}
        className="w-full border rounded-xl px-3 py-2 text-sm outline-none"
        style={{ background: COLORS.surface2, borderColor: COLORS.border, color: COLORS.ivory }}
      >
        {Object.keys(COUNTRY_CURRENCY).map((code) => (
          <option key={code} value={code} style={{ background: COLORS.surface, color: COLORS.ivory }}>
            {code}
          </option>
        ))}
      </select>

      <input
        type="text"
        placeholder="Nom de la boutique"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="w-full border rounded-xl px-3 py-2 text-sm outline-none"
        style={{ background: COLORS.surface2, borderColor: COLORS.border, color: COLORS.ivory }}
        required
      />
      <input
        type="text"
        placeholder="Catégorie (ex: alimentation, services…)"
        value={category}
        onChange={(e) => setCategory(e.target.value)}
        className="w-full border rounded-xl px-3 py-2 text-sm outline-none"
        style={{ background: COLORS.surface2, borderColor: COLORS.border, color: COLORS.ivory }}
      />
      <input
        type="text"
        placeholder="Ville / quartier"
        value={city}
        onChange={(e) => setCity(e.target.value)}
        className="w-full border rounded-xl px-3 py-2 text-sm outline-none"
        style={{ background: COLORS.surface2, borderColor: COLORS.border, color: COLORS.ivory }}
        required
      />
      <textarea
        placeholder="Description (optionnel)"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        className="w-full border rounded-xl px-3 py-2 text-sm outline-none resize-none"
        style={{ background: COLORS.surface2, borderColor: COLORS.border, color: COLORS.ivory }}
        rows={3}
      />

      {!eligibleForTrial && providers.length > 0 && (
        <div className="space-y-2">
          <label className="text-sm font-medium" style={{ color: COLORS.ivory }}>Moyen de paiement</label>
          {providers.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setSelectedProvider(p)}
              className="w-full text-left border rounded-xl px-3 py-2 text-sm transition-all active:scale-[0.98]"
              style={{
                background: selectedProvider?.id === p.id ? "rgba(217, 174, 82, 0.1)" : COLORS.surface2,
                borderColor: selectedProvider?.id === p.id ? COLORS.borderGold : COLORS.border,
                color: selectedProvider?.id === p.id ? COLORS.gold : COLORS.ivory
              }}
            >
              {p.label}
            </button>
          ))}
        </div>
      )}

      {error && <p className="text-sm" style={{ color: "#ef4444" }}>{error}</p>}

      <button
        type="submit"
        disabled={loading || (!eligibleForTrial && !pricing)}
        className="w-full rounded-xl py-2.5 text-sm font-bold transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
        style={{ background: COLORS.gold, color: COLORS.bg }}
      >
        {loading
          ? eligibleForTrial ? "Activation de l'essai…" : "Préparation du paiement…"
          : eligibleForTrial
            ? `Activer gratuitement (${TRIAL_DAYS} jours)`
            : price ? `Payer ${price} ${currency} et activer` : "Chargement…"}
      </button>

      <p className="text-xs text-center" style={{ color: COLORS.muted }}>
        {eligibleForTrial
          ? `Après ${TRIAL_DAYS} jours, un abonnement annuel sera requis pour rester visible.`
          : "Paiement sécurisé — le montant est revalidé côté serveur."}
      </p>
    </form>
  );
}
