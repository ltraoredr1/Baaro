
/**
 * Confirmation accessible (remplace window.confirm).
 */
import { useEffect, useId, useRef } from "react";
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
  const C = { ...FALLBACK, ...(THEME_COLORS || {}) };
  const confirmRef = useRef(null);
  const dialogRef = useRef(null);
  const previousFocusRef = useRef(null);
  const titleId = useId();
  const messageId = useId();

  useEffect(() => {
    if (!open) return undefined;

    previousFocusRef.current =
      typeof document !== "undefined" ? document.activeElement : null;

    confirmRef.current?.focus();

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCancel?.();
        return;
      }

      if (event.key !== "Tab") return;

      const dialog = dialogRef.current;
      if (!dialog) return;

      const focusable = dialog.querySelectorAll(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );

      const elements = Array.from(focusable).filter(
        (element) => !element.hasAttribute("hidden")
      );

      if (elements.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }

      const first = elements[0];
      const last = elements[elements.length - 1];

      if (
        event.shiftKey &&
        (document.activeElement === first ||
          !dialog.contains(document.activeElement))
      ) {
        event.preventDefault();
        last.focus();
      } else if (
        !event.shiftKey &&
        (document.activeElement === last ||
          !dialog.contains(document.activeElement))
      ) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);

      const previousFocus = previousFocusRef.current;
      if (previousFocus && typeof previousFocus.focus === "function") {
        previousFocus.focus();
      }
    };
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onCancel?.();
        }
      }}
    >
      <div
        ref={dialogRef}
        className="w-full max-w-sm rounded-2xl border p-5 shadow-2xl"
        style={{
          background: C.surface,
          borderColor: danger
            ? "rgba(239,68,68,0.4)"
            : C.borderGold,
        }}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={message ? messageId : undefined}
        tabIndex={-1}
      >
        <h2
          id={titleId}
          className="text-base font-bold mb-2"
          style={{ color: C.ivory }}
        >
          {title}
        </h2>

        {message && (
          <p
            id={messageId}
            className="text-sm mb-5"
            style={{ color: C.muted }}
          >
            {message}
          </p>
        )}

        <div className="flex gap-2 justify-end">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 rounded-xl text-sm font-medium hover:bg-white/5"
            style={{ color: C.muted }}
          >
            {cancelLabel}
          </button>

          <button
            ref={confirmRef}
            type="button"
            onClick={onConfirm}
            className="px-4 py-2 rounded-xl text-sm font-bold active:scale-[0.98] transition"
            style={{
              background: danger ? "#ef4444" : C.gold,
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
