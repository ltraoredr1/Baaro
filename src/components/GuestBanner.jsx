import { UserPlus, Sparkles } from "lucide-react";
import { COLORS } from "../theme.js";
import { useApp } from "../contexts/AppContext.jsx";

/**
 * Bannière invité — orientée gain (pas seulement limitations).
 * Remplace : src/components/GuestBanner.jsx
 */
export function GuestBanner({ onUpgrade, pointsHint = 0 }) {
  const { isAnonymous, pointsBalance } = useApp();

  if (!isAnonymous) return null;

  const pts = pointsHint || pointsBalance || 0;

  return (
    <div
      className="rounded-2xl p-4 border flex flex-col sm:flex-row items-start sm:items-center gap-3 mb-4"
      style={{
        background: "rgba(217, 174, 82, 0.08)",
        borderColor: "rgba(217, 174, 82, 0.35)",
      }}
    >
      <div
        className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
        style={{ background: "rgba(217, 174, 82, 0.2)", color: COLORS.gold }}
      >
        <Sparkles size={20} />
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold" style={{ color: COLORS.ivory }}>
          {pts > 0
            ? `Tu explores en invité · solde affiché : ${pts} pts`
            : "Tu explores en invité"}
        </p>
        <p
          className="text-xs mt-0.5 leading-relaxed"
          style={{ color: COLORS.muted }}
        >
          Crée un compte gratuit pour{" "}
          <span style={{ color: COLORS.gold }}>gagner des points</span>, les
          convertir en BARO et accéder aux récompenses.
        </p>
      </div>

      {onUpgrade && (
        <button
          onClick={onUpgrade}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold shrink-0 transition hover:opacity-90"
          style={{
            background: "linear-gradient(135deg, #D9AE52 0%, #2DBFA6 100%)",
            color: COLORS.bg,
          }}
        >
          <UserPlus size={14} />
          Créer un compte
        </button>
      )}
    </div>
  );
}
