import { useState } from "react";
import { Gift, BadgeCheck, Rocket, CreditCard, Landmark } from "lucide-react";
import { COLORS } from "../theme.js";
import { useToast } from "./ToastContext.jsx";
import { useWallet } from "../hooks/useWallet.js";
import { supabase } from "../supabaseClient";
import { API_BASE } from "../config.js";

const REWARDS = [
  {
    id: "r3",
    cost: 300,
    label: "Badge Créateur Premium",
    desc: "Statut visible sur ton profil",
    cash: false,
    icon: BadgeCheck,
  },
  {
    id: "r4",
    cost: 150,
    label: "Boost de visibilité 48h",
    desc: "Mise en avant de tes publications",
    cash: false,
    icon: Rocket,
  },
  {
    id: "r1",
    cost: 500,
    label: "Carte cadeau partenaire — 5 €",
    desc: "Rachat cash bientôt disponible · payout sécurisé",
    cash: true,
    icon: CreditCard,
  },
  {
    id: "r2",
    cost: 1000,
    label: "Virement — 10 €",
    desc: "Rachat cash bientôt disponible · payout sécurisé",
    cash: true,
    icon: Landmark,
  },
];

async function createStripeSession(optionId) {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) {
    return { ok: false, error: "Non authentifié" };
  }

  try {
    const res = await fetch(`${API_BASE}/api/stripe-redeem`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ action: "create-session", optionId }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: data.error || "Erreur serveur" };
    return { ok: true, ...data };
  } catch {
    return { ok: false, error: "Impossible de joindre le serveur" };
  }
}

export function RedeemSection() {
  const { pointsBalance, redeemReward, isAnonymous, refreshWalletStatus } =
    useWallet();
  const { showToast } = useToast();
  const [loadingId, setLoadingId] = useState(null);

  const handleRedeem = async (opt) => {
    if (loadingId) return;

    if (isAnonymous) {
      showToast("Créez un compte pour accéder aux récompenses", "info");
      return;
    }

    if (pointsBalance < opt.cost) {
      showToast("Solde insuffisant", "error");
      return;
    }

    if (!window.confirm(`Échanger ${opt.cost} pts contre « ${opt.label} » ?`)) {
      return;
    }

    setLoadingId(opt.id);

    // --- Rachats cash : volontairement désactivés jusqu'à l'intégration payout. ---
    if (opt.cash) {
      const result = await createStripeSession(opt.id);
      setLoadingId(null);

      if (!result.ok) {
        showToast(result.error || "Échange impossible", "error");
        return;
      }

      if (result.mode === "stripe" && result.url) {
        showToast("Le payout réel n'est pas encore activé.", "info");
        return;
      }
      showToast(result.error || "Le rachat cash n'est pas encore disponible.", "info");
      return;
    }

    // --- Rachats non-cash → API wallet classique ---
    const result = await redeemReward(opt.id);
    setLoadingId(null);

    if (result.ok) {
      showToast(`Récompense obtenue : ${opt.label}`, "success");
      await refreshWalletStatus?.();
    } else {
      showToast(result.error || "Échange impossible", "error");
    }
  };

  return (
    <div
      className="glass-card rounded-2xl p-5 border flex flex-col gap-4"
      style={{ borderColor: COLORS.borderGold }}
    >
      <div className="flex items-center justify-between">
        <h3 className="text-base font-bold text-gradient-gold flex items-center gap-2">
          <Gift size={18} />
          Récompenses
        </h3>
        <span className="text-xs font-mono" style={{ color: COLORS.muted }}>
          Solde : {pointsBalance} pts
        </span>
      </div>

      {isAnonymous && (
        <p className="text-xs" style={{ color: COLORS.rose }}>
          Compte invité : les rachats sont désactivés.
        </p>
      )}

      <div className="flex flex-col gap-2">
        {REWARDS.map((opt) => {
          const Icon = opt.icon;
          const canAfford = pointsBalance >= opt.cost;
          const disabled = isAnonymous || !canAfford || loadingId === opt.id;

          return (
            <div
              key={opt.id}
              className="p-3 rounded-xl border flex items-center justify-between gap-3"
              style={{
                background: COLORS.surface,
                borderColor: COLORS.border,
                opacity: isAnonymous ? 0.7 : 1,
              }}
            >
              <div className="flex items-center gap-3 min-w-0">
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                  style={{
                    background: opt.cash ? COLORS.goldGlow : COLORS.tealGlow,
                    color: opt.cash ? COLORS.gold : COLORS.teal,
                  }}
                >
                  <Icon size={18} />
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-bold truncate" style={{ color: COLORS.ivory }}>
                    {opt.label}
                  </div>
                  <div className="text-[10px]" style={{ color: COLORS.muted }}>
                    {opt.desc}
                  </div>
                </div>
              </div>

              <button
                onClick={() => handleRedeem(opt)}
                disabled={disabled}
                className="shrink-0 px-3 py-1.5 rounded-lg text-[11px] font-bold border transition disabled:opacity-50"
                style={{
                  background: canAfford && !isAnonymous ? COLORS.gold : COLORS.surface2,
                  borderColor: COLORS.borderGold,
                  color: canAfford && !isAnonymous ? COLORS.bg : COLORS.muted,
                }}
              >
                {loadingId === opt.id ? "…" : `${opt.cost} pts`}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
