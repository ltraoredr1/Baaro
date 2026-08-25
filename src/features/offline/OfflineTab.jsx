import { useState } from "react";
import { WifiOff, Radio, Smartphone, Send, ShieldCheck, Zap, RefreshCw } from "lucide-react";
import { COLORS } from "../../theme.js";
import { useToast } from "../../components/ToastContext.jsx";

const DEMO_NEARBY_DEVICES = [
  { id: "dev1", name: "Samsung Galaxy A53 (Amina)", distance: "~ 3m", signal: "Fort" },
  { id: "dev2", name: "Redmi Note 12 (Moussa)", distance: "~ 7m", signal: "Moyen" },
];

const DEMO_P2P_MESSAGES = [
  { id: "p1", sender: "Amina (Redmi)", text: "Salut ! Message de démonstration du mode hors-ligne.", time: "14:32" }
];

export function OfflineTab({ onRewardPoints }) {
  const { showToast, showPointsReward } = useToast();
  const [isScanning, setIsScanning] = useState(false);
  const [devices, setDevices] = useState(DEMO_NEARBY_DEVICES);
  const [messages, setMessages] = useState(DEMO_P2P_MESSAGES);
  const [p2pInput, setP2pInput] = useState("");

  const toggleScan = () => {
    setIsScanning(!isScanning);
    if (!isScanning) {
      showToast("Recherche d'appareils BAARO à proximité via Bluetooth/Wi-Fi...", "info");
    }
  };

  const handleSendP2P = (e) => {
    e.preventDefault();
    if (!p2pInput.trim()) return;

    const newP2pMsg = {
      id: `p2p_${Date.now()}`,
      sender: "Vous (Local P2P)",
      text: p2pInput,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setMessages([...messages, newP2pMsg]);
    setP2pInput("");
    showToast("Mode hors-ligne : prototype local, aucun point crédité.", "info");
  };

  return (
    <div className="flex flex-col gap-6 max-w-4xl mx-auto w-full pb-20">
      {/* P2P Header Banner */}
      <div className="glass-card rounded-3xl p-6 border shadow-2xl relative overflow-hidden teal-glow" style={{ borderColor: COLORS.borderTeal, background: "linear-gradient(135deg, rgba(17,26,44,0.95) 0%, rgba(45,191,166,0.15) 100%)" }}>
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl font-bold teal-glow" style={{ background: COLORS.tealGlow, color: COLORS.teal }}>
              <WifiOff size={28} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold" style={{ color: COLORS.ivory }}>Réseau Maillé P2P Hors-Ligne</h2>
                <span className="text-[10px] px-2 py-0.5 rounded-full font-bold uppercase" style={{ background: COLORS.teal, color: COLORS.bg }}>Bluetooth & Wi-Fi Direct</span>
              </div>
              <p className="text-xs" style={{ color: COLORS.muted }}>Prototype d’interface pour le mode hors-ligne. Le transport Bluetooth/Wi-Fi Direct réel dépend du plugin natif et n’est pas simulé comme une connexion active.</p>
            </div>
          </div>

          <button
            onClick={toggleScan}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold shadow-lg transition"
            style={{ background: isScanning ? COLORS.gold : COLORS.teal, color: COLORS.bg }}
          >
            <Radio size={16} className={isScanning ? "animate-pulse" : ""} />
            <span>{isScanning ? "Détection Active..." : "Activer Détection P2P"}</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Nearby Devices List */}
        <div className="glass-card rounded-2xl p-4 border flex flex-col gap-3" style={{ borderColor: COLORS.border }}>
          <div className="flex justify-between items-center">
            <span className="text-xs font-bold uppercase tracking-wider" style={{ color: COLORS.muted }}>Appareils Proches ({devices.length})</span>
            <button onClick={toggleScan} className="p-1 rounded hover:bg-white/5" style={{ color: COLORS.teal }}>
              <RefreshCw size={14} className={isScanning ? "animate-spin" : ""} />
            </button>
          </div>

          <div className="flex flex-col gap-2">
            {devices.map((d) => (
              <div key={d.id} className="p-3 rounded-xl border flex items-center justify-between text-xs" style={{ background: COLORS.surface, borderColor: COLORS.borderTeal }}>
                <div className="flex items-center gap-2.5">
                  <Smartphone size={18} style={{ color: COLORS.teal }} />
                  <div>
                    <div className="font-bold" style={{ color: COLORS.ivory }}>{d.name}</div>
                    <div className="text-[10px]" style={{ color: COLORS.muted }}>Signal: {d.signal}</div>
                  </div>
                </div>
                <span className="text-[10px] font-mono font-bold" style={{ color: COLORS.gold }}>{d.distance}</span>
              </div>
            ))}
          </div>
        </div>

        {/* P2P Messaging Log */}
        <div className="md:col-span-2 glass-card rounded-2xl p-5 border flex flex-col justify-between" style={{ borderColor: COLORS.borderTeal, minHeight: "360px" }}>
          <div>
            <div className="flex justify-between items-center pb-3 border-b" style={{ borderColor: COLORS.border }}>
              <span className="text-sm font-bold flex items-center gap-2" style={{ color: COLORS.ivory }}>
                <ShieldCheck size={16} style={{ color: COLORS.teal }} />
                Canal P2P Local (prototype)
              </span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded" style={{ background: COLORS.surface, color: COLORS.teal }}>
                Mode démonstration
              </span>
            </div>

            <div className="py-4 flex flex-col gap-3 max-h-[260px] overflow-y-auto">
              {messages.map((m) => (
                <div key={m.id} className="p-3 rounded-xl text-xs border flex flex-col gap-1" style={{ background: COLORS.surface, borderColor: COLORS.border }}>
                  <div className="flex justify-between font-bold">
                    <span style={{ color: COLORS.teal }}>{m.sender}</span>
                    <span className="text-[10px]" style={{ color: COLORS.muted }}>{m.time}</span>
                  </div>
                  <p style={{ color: COLORS.ivory }}>{m.text}</p>
                </div>
              ))}
            </div>
          </div>

          <form onSubmit={handleSendP2P} className="flex gap-2 pt-3 border-t" style={{ borderColor: COLORS.border }}>
            <input
              type="text"
              placeholder="Émettre un message direct par onde radio Bluetooth/Wi-Fi..."
              value={p2pInput}
              onChange={(e) => setP2pInput(e.target.value)}
              className="flex-1 bg-transparent border rounded-xl px-3 py-2 text-xs outline-none"
              style={{ borderColor: COLORS.borderTeal, color: COLORS.ivory }}
            />
            <button
              type="submit"
              className="px-4 py-2 rounded-xl text-xs font-bold"
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
