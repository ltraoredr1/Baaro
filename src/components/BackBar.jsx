/**
 * Barre de retour générique (modales, sous-écrans).
 */
import { ArrowLeft } from "lucide-react";
import { COLORS as THEME_COLORS } from "../theme.js";

const FALLBACK = {
  surface: "#111A2C",
  border: "rgba(255,255,255,0.08)",
  ivory: "#F5F3EF",
};

export function BackBar({ title, onBack, right = null }) {
  const C = {...FALLBACK,...(THEME_COLORS || {}) };

  return (
    <div
      className="flex items-center gap-3 px-3 py-3 border-b sticky top-0 z-30 backdrop-blur-xl"
      style={{
        background: C.surface,
        borderColor: C.border,
        top: 'env(safe-area-inset-top, 0px)',
      }}
    >
      <button
        type="button"
        onClick={onBack}
        className="p-2 rounded-xl hover:bg-white/10 active:scale-95 transition"
        style={{ color: C.ivory }}
        aria-label="Retour"
      >
        <ArrowLeft size={20} />
      </button>
      {title? (
        <h2 className="flex-1 font-bold text-[14px] truncate" style={{ color: C.ivory }}>
          {title}
        </h2>
      ) : (
        <div className="flex-1" />
      )}
      {right && <div className="shrink-0">{right}</div>}
    </div>
  );
}
