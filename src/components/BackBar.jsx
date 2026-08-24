/**
 * Barre de retour générique (modales, sous-écrans).
 */
import { ArrowLeft } from "lucide-react";
import { COLORS } from "../theme.js";

export function BackBar({ title, onBack, right = null }) {
  return (
    <div
      className="flex items-center gap-3 px-3 py-3 border-b sticky top-0 z-30"
      style={{
        background: COLORS.surface || "#111A2C",
        borderColor: COLORS.border,
      }}
    >
      <button
        type="button"
        onClick={onBack}
        className="p-2 rounded-xl hover:bg-white/5"
        style={{ color: COLORS.ivory }}
        aria-label="Retour"
      >
        <ArrowLeft size={20} />
      </button>
      {title ? (
        <h2
          className="flex-1 font-bold text-sm truncate"
          style={{ color: COLORS.ivory }}
        >
          {title}
        </h2>
      ) : (
        <div className="flex-1" />
      )}
      {right}
    </div>
  );
}
