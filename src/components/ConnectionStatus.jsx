import { useState, useEffect } from "react";
import { Wifi, WifiOff } from "lucide-react";
import { COLORS } from "../theme.js";

export function ConnectionStatus() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [showBanner, setShowBanner] = useState(false);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      setShowBanner(true);
      setTimeout(() => setShowBanner(false), 3000);
      // Recharger la page pour synchroniser les données
      window.location.reload();
    };

    const handleOffline = () => {
      setIsOnline(false);
      setShowBanner(true);
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  return (
    <>
      {/* Petit indicateur discret en haut à droite */}
      <div
        className="fixed top-2 right-2 z-40 flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-bold shadow-lg transition-all duration-300"
        style={{
          background: isOnline ? "rgba(45, 191, 166, 0.15)" : "rgba(239, 68, 68, 0.15)",
          color: isOnline ? COLORS.teal : "#ef4444",
          border: `1px solid ${isOnline ? COLORS.teal : "#ef4444"}40`,
          backdropFilter: "blur(8px)"
        }}
      >
        {isOnline ? <Wifi size={10} /> : <WifiOff size={10} />}
        <span>{isOnline ? "En ligne" : "Hors ligne"}</span>
      </div>

      {/* Bannière d'alerte quand on passe hors-ligne */}
      {showBanner && !isOnline && (
        <div
          className="fixed top-12 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-2 rounded-xl shadow-2xl animate-in slide-in-from-top fade-in duration-300"
          style={{
            background: "rgba(239, 68, 68, 0.95)",
            color: "#fff",
            backdropFilter: "blur(12px)"
          }}
        >
          <WifiOff size={16} />
          <span className="text-xs font-bold">
            Vous êtes hors ligne. Le contenu affiché est en cache.
          </span>
        </div>
      )}

      {/* Bannière de retour en ligne */}
      {showBanner && isOnline && (
        <div
          className="fixed top-12 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-2 rounded-xl shadow-2xl animate-in slide-in-from-top fade-in duration-300"
          style={{
            background: "rgba(45, 191, 166, 0.95)",
            color: "#fff",
            backdropFilter: "blur(12px)"
          }}
        >
          <Wifi size={16} />
          <span className="text-xs font-bold">
            Connexion rétablie ! Synchronisation en cours...
          </span>
        </div>
      )}
    </>
  );
            }
