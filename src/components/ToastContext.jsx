import { createContext, useContext, useState, useCallback } from "react";
import { Sparkles, Coins, CheckCircle2, AlertCircle, X } from "lucide-react";
import { COLORS } from "../theme.js";

const ToastContext = createContext({
  showToast: () => {},
  showPointsReward: () => {},
});

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback((message, type = "info", duration = 4000) => {
    const id = randomId("toast");
    setToasts((prev) => [...prev, { id, message, type, duration }]);
    setTimeout(() => removeToast(id), duration);
  }, [removeToast]);

  const showPointsReward = useCallback((pts, reason) => {
    showToast(`+${pts} pts — ${reason}`, "points", 4000);
  }, [showToast]);

  return (
    <ToastContext.Provider value={{ showToast, showPointsReward }}>
      {children}
      {/* Toast container */}
      <div className="fixed top-20 right-4 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none px-2">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className="pointer-events-auto flex items-center gap-3 p-3.5 rounded-xl shadow-2xl transition-all transform animate-float border"
            style={{
              background: toast.type === "points"
                ? "linear-gradient(135deg, rgba(26, 39, 64, 0.95), rgba(217, 174, 82, 0.2))"
                : "rgba(26, 39, 64, 0.95)",
              borderColor: toast.type === "points" ? COLORS.gold : "rgba(255,255,255,0.12)",
              backdropFilter: "blur(12px)",
            }}
          >
            {toast.type === "points" && (
              <div className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs" style={{ background: COLORS.goldGlow, color: COLORS.gold }}>
                <Coins size={18} />
              </div>
            )}
            {toast.type === "success" && (
              <CheckCircle2 size={18} style={{ color: COLORS.teal }} />
            )}
            {toast.type === "error" && (
              <AlertCircle size={18} className="text-red-400" />
            )}
            {toast.type === "info" && (
              <Sparkles size={18} style={{ color: COLORS.gold }} />
            )}

            <div className="flex-1 text-xs font-medium" style={{ color: COLORS.ivory }}>
              {toast.message}
            </div>

            <button onClick={() => removeToast(toast.id)} className="p-1 rounded-md hover:opacity-80" style={{ color: COLORS.muted }}>
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
