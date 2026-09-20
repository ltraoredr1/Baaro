import { useState, useEffect } from "react";
import { WifiOff, Radio, Smartphone, Send, ShieldCheck, RefreshCw } from "lucide-react";
import { COLORS } from "../../theme.js";
import { useToast } from "../../components/ToastContext.jsx";
import { useNearbyChat } from "../../hooks/useNearbyChat.js";

export function OfflineTab({ onRewardPoints }) {
  const { showToast } = useToast();
  const [displayName, setDisplayName] = useState("Moi");
  const [p2pInput, setP2pInput] = useState("");

  // Utilisation du vrai hook Nearby Chat
  const {
    isAvailable,
    isScanning,
    devices,
    messages,
    error,
    start,
    stop,
    sendMessage,
  } = useNearbyChat(displayName);

  // Afficher les erreurs via le système de toast de l'app
  useEffect(() => {
    if (error) {
      showToast(error, "error");
    }
  }, [error, showToast]);

  const handleToggleScan = async () => {
    if (isScanning) {
      stop();
      showToast("Détection P2P arrêtée.", "info");
    } else {
      try {
        await start();
        showToast("Recherche d'appareils BAARO à proximité...", "info");
      } catch (err) {
        showToast(err.message || "Impossible de démarrer la détection.", "error");
      }
    }
  };

  const handleSendP2P = (e) => {
    e.preventDefault();
    if (!p2pInput.trim()) return;

    sendMessage(p2pInput.trim())
      .then(() => {
        setP2pInput("");
      })
      .catch((err) => {
        showToast("Échec de l'envoi : " + err.message, "error");
      });
  };

  // Affichage si le plugin natif n'est pas disponible (ex: sur le web)
  if (!isAvailable) {
    return (
      <div className="flex flex-col items-center justify-center gap-6 max-w-4xl mx-auto w-full pb-20 min-h-[60vh]">
        <div className="w-20 h-20 rounded-full flex items-center justify-center" style={{ background: "rgba(239, 68, 68, 0.1)" }}>
          <WifiOff size={40} style={{ color: "#ef4444" }} />
        </div>
        <div className="text-center space-y-2">
          <h2 className="text-xl font-bold" style={{ color: COLORS.ivory }}>
            Mode Hors-Ligne Indisponible
          </h2>
          <p className="text-sm max-w-md" style={{ color: COLORS.muted }}>
            Cette fonctionnalité nécessite l'application Android native BAARO avec le plugin Nearby installé. Elle n'est pas disponible sur le navigateur web.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 max-w-4xl mx-auto w-full pb-20">
      {/* P2P Header Banner */}
      <div className="glass-card rounded-3xl p-6 border shadow-2xl relative overflow-hidden" style={{ borderColor: COLORS.borderTeal, background: "linear-gradient(135deg, rgba(17,26,44,0.95) 0%, rgba(45,191,166,0.15) 100%)" }}>
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl font-bold" style={{ background: COLORS.tealGlow || "rgba(45,191,166,0.2)", color: COLORS.teal }}>
              <WifiOff size={28} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold" style={{ color: COLORS.ivory }}>Réseau Maillé P2P Hors-Ligne</h2>
                <span className="text-[10px] px-2 py-0.5 rounded-full font-bold uppercase" style={{ background: COLORS.teal, color: COLORS.bg }}>Bluetooth & Wi-Fi Direct</span>
              </div>
              <p className="text-xs mt-1" style={{ color: COLORS.muted }}>
                Échangez des messages avec des téléphones proches sans Internet.
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-2 w-full sm:w-auto">
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Votre nom visible"
              className="w-full sm:w-48 bg-transparent border rounded-xl px-3 py-2 text-xs outline-none"
              style={{ borderColor: COLORS.borderTeal, color: COLORS.ivory }}
            />
            <button
              onClick={handleToggleScan}
              className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold shadow-lg transition"
              style={{ background: isScanning ? COLORS.gold : COLORS.teal, color: COLORS.bg }}
            >
              <Radio size={16} className={isScanning ? "animate-pulse" : ""} />
              <span>{isScanning ? "Arrêter la Détection" : "Activer Détection P2P"}</span>
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Nearby Devices List */}
        <div className="glass-card rounded-2xl p-4 border flex flex-col gap-3" style={{ borderColor: COLORS.border }}>
          <div className="flex justify-between items-center">
            <span className="text-xs font-bold uppercase tracking-wider" style={{ color: COLORS.muted }}>Appareils Proches ({devices.length})</span>
            <button onClick={handleToggleScan} className="p-1 rounded hover:bg-white/5" style={{ color: COLORS.teal }}>
              <RefreshCw size={14} className={isScanning ? "animate-spin" : ""} />
            </button>
          </div>

          <div className="flex flex-col gap-2">
            {devices.length === 0 ? (
              <div className="p-4 text-center text-xs" style={{ color: COLORS.muted }}>
                {isScanning ? "Recherche en cours..." : "Détection inactive"}
              </div>
            ) : (
              devices.map((d) => (
                <div key={d.endpointId} className="p-3 rounded-xl border flex items-center justify-between text-xs" style={{ background: COLORS.surface, borderColor: COLORS.borderTeal }}>
                  <div className="flex items-center gap-2.5">
                    <Smartphone size={18} style={{ color: COLORS.teal }} />
                    <div>
                      <div className="font-bold" style={{ color: COLORS.ivory }}>{d.name}</div>
                      <div className="text-[10px] capitalize" style={{ color: COLORS.muted }}>{d.status}</div>
                    </div>
                  </div>
                  <button 
                    onClick={() => {
                      if (p2pInput.trim()) {
                        sendMessage(p2pInput.trim(), d.endpointId);
                        setP2pInput("");
                      } else {
                        showToast("Écrivez un message d'abord", "info");
                      }
                    }}
                    className="p-2 rounded-lg transition"
                    style={{ background: COLORS.teal, color: COLORS.bg }}
                    title="Envoyer à cet appareil"
                  >
                    <Send size={14} />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* P2P Messaging Log */}
        <div className="md:col-span-2 glass-card rounded-2xl p-5 border flex flex-col justify-between" style={{ borderColor: COLORS.borderTeal, minHeight: "360px" }}>
          <div>
            <div className="flex justify-between items-center pb-3 border-b" style={{ borderColor: COLORS.border }}>
              <span className="text-sm font-bold flex items-center gap-2" style={{ color: COLORS.ivory }}>
                <ShieldCheck size={16} style={{ color: COLORS.teal }} />
                Canal P2P Local
              </span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded" style={{ background: COLORS.surface, color: COLORS.teal }}>
                {isScanning ? "Connecté" : "En attente"}
              </span>
            </div>

            <div className="py-4 flex flex-col gap-3 max-h-[260px] overflow-y-auto">
              {messages.length === 0 ? (
                <div className="text-center text-xs py-8" style={{ color: COLORS.muted }}>
                  Aucun message échangé pour le moment.
                </div>
              ) : (
                messages.map((m) => (
                  <div 
                    key={m.timestamp} 
                    className={`p-3 rounded-xl text-xs border flex flex-col gap-1 ${m.isMe ? 'ml-auto max-w-[85%]' : 'mr-auto max-w-[85%]'}`} 
                    style={{ 
                      background: m.isMe ? COLORS.teal : COLORS.surface, 
                      borderColor: m.isTe ? COLORS.teal : COLORS.border, 
                      color: m.isMe ? COLORS.bg : COLORS.ivory 
                    }}
                  >
                    <div className="flex justify-between font-bold">
                      <span>{m.from}</span>
                      <span className="text-[10px] opacity-70">
                        {new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <p>{m.text}</p>
                  </div>
                ))
              )}
            </div>
          </div>

          <form onSubmit={handleSendP2P} className="flex gap-2 pt-3 border-t" style={{ borderColor: COLORS.border }}>
            <input
              type="text"
              placeholder="Émettre un message direct..."
              value={p2pInput}
              onChange={(e) => setP2pInput(e.target.value)}
              className="flex-1 bg-transparent border rounded-xl px-3 py-2 text-xs outline-none"
              style={{ borderColor: COLORS.borderTeal, color: COLORS.ivory }}
            />
            <button
              type="submit"
              disabled={!p2pInput.trim()}
              className="px-4 py-2 rounded-xl text-xs font-bold disabled:opacity-50"
              style={{ background: COLORS.teal, color: COLORS.bg }}
            >
              <Send size={14} />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
