import { ShieldAlert, UserPlus } from "lucide-react";
import { COLORS } from "../theme.js";
import { useApp } from "../contexts/AppContext.jsx";

/**
 * Bannière visible uniquement pour les comptes anonymes.
 * Explique les limitations et invite à créer un vrai compte.
 */
export function GuestBanner({ onUpgrade }) {
  const { isAnonymous } = useApp();

  if (!isAnonymous) return null;

  return (
    <div
      className="rounded-2xl p-4 border flex flex-col sm:flex-row items-start sm:items-center gap-3 mb-4"
      style={{
        background: "rgba(236, 72, 153, 0.08)",
        borderColor: "rgba(236, 72, 153, 0.35)",
      }}
    >
      <div
        className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
        style={{ background: "rgba(236, 72, 153, 0.2)", color: COLORS.rose }}
      >
        <ShieldAlert size={20} />
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold" style={{ color: COLORS.ivory }}>
          Mode invité
        </p>
        <p className="text-xs mt-0.5 leading-relaxed" style={{ color: COLORS.muted }}>
          Vous pouvez explorer l’app, liker et commenter. Pour gagner des points,
          convertir en BARO ou accéder aux rachats, créez un compte gratuit.
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
