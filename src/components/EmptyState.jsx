/**
 * État vide unifié — messages clairs pour tous les niveaux d'utilisateur.
 */
import { COLORS } from "../theme.js";

export function EmptyState({
  icon = "📭",
  title = "Rien à afficher",
  description,
  actionLabel,
  onAction,
}) {
  return (
    <div
      className="flex flex-col items-center justify-center text-center py-12 px-6"
      role="status"
    >
      <div className="text-5xl mb-3" aria-hidden>
        {icon}
      </div>
      <h3 className="text-base font-bold mb-1" style={{ color: COLORS.ivory }}>
        {title}
      </h3>
      {description && (
        <p className="text-sm max-w-xs mb-5" style={{ color: COLORS.muted }}>
          {description}
        </p>
      )}
      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="px-5 py-2.5 rounded-xl text-sm font-bold"
          style={{ background: COLORS.gold, color: "#0B1220" }}
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}
