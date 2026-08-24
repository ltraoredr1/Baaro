/**
 * Bandeau hors-ligne discret + reconnect.
 */
import { useEffect, useState } from "react";
import { WifiOff } from "lucide-react";
import { COLORS } from "../theme.js";

export function useOnlineStatus() {
  const [online, setOnline] = useState(
    typeof navigator !== "undefined" ? navigator.onLine : true
  );

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  return online;
}

export function OfflineBanner() {
  const online = useOnlineStatus();
  if (online) return null;

  return (
    <div
      className="fixed top-0 left-0 right-0 z-[200] flex items-center justify-center gap-2 px-3 py-2 text-xs font-semibold"
      style={{
        background: "#7f1d1d",
        color: "#fecaca",
        paddingTop: "max(0.5rem, env(safe-area-inset-top))",
      }}
      role="status"
      aria-live="polite"
    >
      <WifiOff size={14} aria-hidden />
      Pas de connexion — certaines actions sont indisponibles
    </div>
  );
}
