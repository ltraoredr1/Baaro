import { useState, useEffect } from "react";
import { supabase } from "../../supabaseClient.js";
import { createPayment, getAvailableProviders } from "../../lib/paymentProvider.js";

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
  DE: "EUR",
  ES: "EUR",
  IT: "EUR",
  US: "USD",
  CA: "USD",
};

const TRIAL_DAYS = 30;

function guessDefaultCountry() {
  try {
    const locale = navigator.language || navigator.languages?.[0] || "";
    const region = locale.split("-")[1];
    if (region && region.length === 2) return region.toUpperCase();
  } catch {
    /* ignore */
  }
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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [eligibleForTrial, setEligibleForTrial] = useState(false);
  const [checkingTrial, setCheckingTrial] = useState(true);

  useEffect(() => {
    async function loadUserAndTrial() {
      setCheckingTrial(true);
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setEligibleForTrial(false);
        setCheckingTrial(false);
        return;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("is_premium")
        .eq("user_id", user.id)
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

  const price = pricing
    ? isPremium
      ? pricing.amount_premium
      : pricing.amount_normal
    : null;
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

      // Re-vérifier l'éligibilité côté client (la vérité reste en base)
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
          .insert({
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

        // Trace abonnement gratuit
        await supabase.from("shop_subscriptions").insert({
          shop_id: shop.id,
          amount: 0,
          currency: COUNTRY_CURRENCY[country] || "XOF",
          was_premium_rate: false,
          provider: "trial",
          payment_ref: `trial_\( {shop.id}_ \){Date.now()}`,
          status: "trial",
        });

        onRegistered?.(shop);
        return;
      }

      // --- Parcours payant (pas d'essai / renouvellement) ---
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

      const paymentRef = `shop_\( {shop.id}_ \){Date.now()}`;
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
      <p className="text-sm text-center p-4 text-gray-400">
        Vérification de l&apos;offre d&apos;essai…
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-md mx-auto space-y-4 p-4">
      <h2 className="text-lg font-semibold">Créer ma boutique</h2>

      {eligibleForTrial ? (
        <div className="rounded-lg p-3 text-sm bg-emerald-50 text-emerald-800 border border-emerald-200">
          <strong>Offre de bienvenue</strong>
          <br />
          Création <strong>gratuite pendant {TRIAL_DAYS} jours</strong> pour les
          nouveaux utilisateurs. Ensuite, abonnement annuel selon ton pays.
        </div>
      ) : pricing ? (
        <div
          className={`rounded-lg p-3 text-sm ${
            isPremium ? "bg-yellow-50 text-yellow-800" : "bg-gray-50 text-gray-600"
          }`}
        >
          {isPremium
            ? `Tarif premium : ${pricing.amount_premium} ${currency} / an (au lieu de ${pricing.amount_normal} ${currency})`
            : `Tarif : ${pricing.amount_normal} ${currency} / an (premium : ${pricing.amount_premium} ${currency})`}
        </div>
      ) : null}

      <select
        value={country}
        onChange={(e) => setCountry(e.target.value)}
        className="w-full border rounded-lg px-3 py-2"
      >
        {Object.keys(COUNTRY_CURRENCY).map((code) => (
          <option key={code} value={code}>
            {code}
          </option>
        ))}
      </select>

      <input
        type="text"
        placeholder="Nom de la boutique"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="w-full border rounded-lg px-3 py-2"
        required
      />
      <input
        type="text"
        placeholder="Catégorie (ex: alimentation, services…)"
        value={category}
        onChange={(e) => setCategory(e.target.value)}
        className="w-full border rounded-lg px-3 py-2"
      />
      <input
        type="text"
        placeholder="Ville / quartier"
        value={city}
        onChange={(e) => setCity(e.target.value)}
        className="w-full border rounded-lg px-3 py-2"
        required
      />
      <textarea
        placeholder="Description (optionnel)"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        className="w-full border rounded-lg px-3 py-2"
        rows={3}
      />

      {!eligibleForTrial && providers.length > 0 && (
        <div className="space-y-1">
          <label className="text-sm font-medium">Moyen de paiement</label>
          {providers.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setSelectedProvider(p)}
              className={`w-full text-left border rounded-lg px-3 py-2 text-sm ${
                selectedProvider?.id === p.id ? "border-blue-600 bg-blue-50" : ""
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      )}

      {error && <p className="text-red-600 text-sm">{error}</p>}

      <button
        type="submit"
        disabled={loading || (!eligibleForTrial && !pricing)}
        className="w-full bg-blue-600 text-white rounded-lg py-2 disabled:opacity-50"
      >
        {loading
          ? eligibleForTrial
            ? "Activation de l'essai…"
            : "Préparation du paiement…"
          : eligibleForTrial
            ? `Activer gratuitement (${TRIAL_DAYS} jours)`
            : price
              ? `Payer ${price} ${currency} et activer`
              : "Chargement…"}
      </button>

      <p className="text-xs text-gray-400 text-center">
        {eligibleForTrial
          ? `Après ${TRIAL_DAYS} jours, un abonnement annuel sera requis pour rester visible.`
          : "Paiement sécurisé — le montant est revalidé côté serveur."}
      </p>
    </form>
  );
}
