/**
 * État vide unifié — messages clairs pour tous les niveaux
 */
import { COLORS as THEME_COLORS } from "../theme.js";

const FALLBACK_COLORS = {
  ivory: "#F5F3EF",
  muted: "rgba(245,243,239,0.55)",
  gold: "#D9AE52",
  surface: "#121212",
};

export function EmptyState({
  icon = "📭",
  title = "Rien à afficher",
  description,
  actionLabel,
  onAction,
  compact = false,
}) {
  const C = {...FALLBACK_COLORS,...(THEME_COLORS || {}) };
  const isNode = typeof icon!== "string";

  return (
    <div
      className={`flex flex-col items-center justify-center text-center ${compact? "py-8 px-4" : "py-12 px-6"}`}
      role="status"
      aria-live="polite"
    >
      <div className={`${compact? "text-4xl mb-2" : "text-5xl mb-3"} select-none`} aria-hidden>
        {isNode? icon : <span>{icon}</span>}
      </div>

      <h3 className={`font-bold mb-1 ${compact? "text-[14px]" : "text-[15px]"}`} style={{ color: C.ivory }}>
        {title}
      </h3>

      {description && (
        <p className={`max-w-[300px] leading-[1.4] ${compact? "text-[12px] mb-4" : "text-[13px] mb-5"}`} style={{ color: C.muted }}>
          {description}
        </p>
      )}

      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="px-5 py-2.5 rounded-xl text-[13px] font-bold active:scale-[0.98] transition-transform"
          style={{ background: C.gold, color: "#0B1220" }}
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}

// Variantes prêtes à l'emploi pour BAARO
export function EmptyDebates({ onAction }) {
  return (
    <EmptyState
      icon="🎙️"
      title="Aucun débat"
      description="Crée ton premier live ou rejoins une salle avec un code d'invitation."
      actionLabel="Nouveau live"
      onAction={onAction}
    />
  );
}

export function EmptyMessages() {
  return (
    <EmptyState
      icon="💬"
      title="Pas encore de messages"
      description="Sois le premier à lancer la discussion."
      compact
    />
  );
}
