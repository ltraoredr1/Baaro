import { useState } from "react";
import { ShieldCheck, X } from "lucide-react";
import { COLORS } from "../theme.js";
import { useApp } from "../contexts/AppContext.jsx";

const DISMISS_KEY = "baaro_guest_banner_dismissed";

function wasDismissed() {
  try {
    return sessionStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * Bannière invité — rappel de sauvegarde du compte.
 * L'invité peut tout utiliser ; on lui rappelle seulement que son compte
 * peut être perdu (navigateur vidé, appli désinstallée) tant qu'il n'est pas sécurisé.
 * Props inchangées : onUpgrade, pointsHint.
 */
export function GuestBanner({ onUpgrade, pointsHint = 0 }) {
  const { isAnonymous } = useApp();
  const [hidden, setHidden] = useState(wasDismissed);

  if (!isAnonymous || hidden) return null;

  const dismiss = () => {
    try {
      sessionStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* ignore */
    }
    setHidden(true);
  };

  return (
    <div
      className="rounded-2xl p-4 border flex flex-col sm:flex-row items-start sm:items-center gap-3 mb-4 relative"
      style={{
        background: "rgba(217, 174, 82, 0.08)",
        borderColor: "rgba(217, 174, 82, 0.35)",
      }}
    >
      <div
        className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
        style={{ background: "rgba(217, 174, 82, 0.2)", color: COLORS.gold }}
      >
        <ShieldCheck size={20} />
      </div>

      <div className="flex-1 min-w-0 pr-6">
        <p className="text-sm font-bold" style={{ color: COLORS.ivory }}>
          Sauvegarde ton compte
        </p>
        <p
          className="text-xs mt-0.5 leading-relaxed"
          style={{ color: COLORS.muted }}
        >
          Tu utilises BAARO en invité.{" "}
          {pointsHint > 0 ? (
            <>
              Tes <span style={{ color: COLORS.gold }}>{pointsHint} points</span>{" "}
              seraient perdus
            </>
          ) : (
            <>
              Tes <span style={{ color: COLORS.gold }}>points</span> et tes
              publications seraient perdus
            </>
          )}{" "}
          si tu changes d'appareil ou vides ton navigateur. Ajoute un e-mail ou
          un réseau social en 30 secondes.
        </p>
      </div>

      {onUpgrade && (
        <button
          type="button"
          onClick={onUpgrade}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold shrink-0 transition hover:opacity-90"
          style={{
            background: "linear-gradient(135deg, #D9AE52 0%, #2DBFA6 100%)",
            color: COLORS.bg,
          }}
        >
          <ShieldCheck size={14} />
          Sauvegarder
        </button>
      )}

      <button
        type="button"
        onClick={dismiss}
        aria-label="Masquer"
        className="absolute top-2 right-2 p-1 rounded-lg hover:opacity-70"
        style={{ color: COLORS.muted }}
      >
        <X size={14} />
      </button>
    </div>
  );
}
