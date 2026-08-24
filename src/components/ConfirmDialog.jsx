/**
 * Confirmation accessible (remplace window.confirm).
 */
import { useEffect, useRef } from "react";
import { COLORS } from "../theme.js";

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
          background: COLORS.surface,
          borderColor: danger ? "rgba(239,68,68,0.4)" : COLORS.borderGold,
        }}
      >
        <h2
          id="confirm-title"
          className="text-base font-bold mb-2"
          style={{ color: COLORS.ivory }}
        >
          {title}
        </h2>
        {message && (
          <p className="text-sm mb-5" style={{ color: COLORS.muted }}>
            {message}
          </p>
        )}
        <div className="flex gap-2 justify-end">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 rounded-xl text-sm font-medium"
            style={{ color: COLORS.muted }}
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={onConfirm}
            className="px-4 py-2 rounded-xl text-sm font-bold"
            style={{
              background: danger ? "#ef4444" : COLORS.gold,
              color: danger ? "#fff" : "#0B1220",
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
