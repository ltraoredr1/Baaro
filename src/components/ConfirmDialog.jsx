/**
 * Confirmation accessible (remplace window.confirm).
 */
import { useEffect, useRef } from "react";
import { COLORS as THEME_COLORS } from "../theme.js";

const FALLBACK = {
  surface: "#12141F",
  borderGold: "rgba(217,174,82,0.2)",
  ivory: "#F5F3EF",
  muted: "rgba(245,243,239,0.55)",
  gold: "#D9AE52",
};

export function ConfirmDialog({
  open,
  title = "Confirmer",
  message,
  confirmLabel = "Confirmer",
  cancelLabel = "Annuler",
  danger = false,
  onConfirm,
  onCancel,
}) {
  const C = {...FALLBACK,...(THEME_COLORS || {}) };
  const confirmRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    confirmRef.current?.focus();
    const onKey = (e) => {
      if (e.key === "Escape") onCancel?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-title"
    >
      <div
        className="w-full max-w-sm rounded-2xl border p-5 shadow-2xl"
        style={{
          background: C.surface,
          borderColor: danger? "rgba(239,68,68,0.4)" : C.borderGold,
        }}
      >
        <h2 id="confirm-title" className="text-base font-bold mb-2" style={{ color: C.ivory }}>
          {title}
        </h2>
        {message && (
          <p className="text-sm mb-5" style={{ color: C.muted }}>
            {message}
          </p>
        )}
        <div className="flex gap-2 justify-end">
          <button type="button" onClick={onCancel} className="px-4 py-2 rounded-xl text-sm font-medium hover:bg-white/5" style={{ color: C.muted }}>
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={onConfirm}
            className="px-4 py-2 rounded-xl text-sm font-bold active:scale-[0.98] transition"
            style={{
              background: danger? "#ef4444" : C.gold,
              color: danger? "#fff" : "#0B1220",
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
