import { useState, useEffect } from "react";
import { WifiOff, Radio, Smartphone, Send, ShieldCheck, RefreshCw } from "lucide-react";
import { COLORS } from "../../theme.js";
import { useToast } from "../../components/ToastContext.jsx";
import { useNearbyChat } from "../../hooks/useNearbyChat.js";
import { getCachedUsers } from "../../lib/usersCache.js"; // ton fichier

export function OfflineTab() {
  const { showToast } = useToast();
  const [displayName, setDisplayName] = useState("Moi");
  const [p2pInput, setP2pInput] = useState("");
  const { isAvailable, isNative, debug, isScanning, devices, messages, error, start, stop, sendMessage } = useNearbyChat(displayName);

  useEffect(() => { if (error) showToast(error, "error"); }, [error, showToast]);

  if (!isAvailable) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 max-w-4xl mx-auto w-full pb-20 min-h-[60vh] p-4">
        <WifiOff size={40} color="#ef4444" />
        <h2 className="text-xl font-bold" style={{ color: COLORS.ivory }}>Mode P2P {isNative? "Plugin manquant" : "Web"}</h2>
        <p className="text-sm text-center" style={{ color: COLORS.muted }}>
          {isNative? "Fais: npx cap sync android + rebuild APK" : "Sur navigateur, le cache local marche. Le P2P Bluetooth nécessite l'APK BAARO."}
        </p>
        <div className="text-[10px] font-mono p-3 rounded-xl w-full" style={{ background: COLORS.surface, color: COLORS.muted }}>
          DEBUG: {JSON.stringify(debug, null, 2)} <br/>
          Cache local: {getCachedUsers().length} utilisateurs
        </div>
      </div>
    );
  }

  //... garde le reste de ton UI P2P, mais corrige la ligne 140:
  // borderColor: m.isMe? COLORS.teal : COLORS.border (pas m.isTe)
  return (
    <div className="flex flex-col gap-6 max-w-4xl mx-auto w-full pb-20">
      <div className="glass-card rounded-3xl p-6 border" style={{ borderColor: COLORS.borderTeal }}>
        <div className="flex gap-4">
          <input value={displayName} onChange={e=>setDisplayName(e.target.value)} className="flex-1 bg-transparent border rounded-xl px-3 py-2 text-xs" style={{ borderColor: COLORS.borderTeal, color: COLORS.ivory }} />
          <button onClick={isScanning? stop : start} className="px-4 py-2 rounded-xl text-xs font-bold" style={{ background: isScanning? COLORS.gold : COLORS.teal, color: COLORS.bg }}>
            <Radio size={16} className={isScanning? "animate-pulse" : ""} /> {isScanning? "Stop" : "Start P2P"}
          </button>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="glass-card rounded-2xl p-4 border flex flex-col gap-3" style={{ borderColor: COLORS.border }}>
          <span className="text-xs font-bold">Appareils ({devices.length})</span>
          {devices.map(d=>(
            <div key={d.endpointId} className="p-3 rounded-xl border flex justify-between" style={{ background: COLORS.surface, borderColor: COLORS.borderTeal }}>
              <span className="text-xs font-bold" style={{ color: COLORS.ivory }}>{d.name}</span>
              <button onClick={()=>sendMessage(p2pInput, d.endpointId)} style={{ background: COLORS.teal }} className="p-2 rounded-lg"><Send size={14}/></button>
            </div>
          ))}
        </div>
        <div className="md:col-span-2 glass-card rounded-2xl p-5 border flex flex-col" style={{ borderColor: COLORS.borderTeal, minHeight: "360px" }}>
          <div className="flex-1 py-4 flex flex-col gap-3 max-h-[260px] overflow-y-auto">
            {messages.map(m=>(
              <div key={m.timestamp} className={`p-3 rounded-xl text-xs border ${m.isMe? 'ml-auto' : 'mr-auto'} max-w-[85%]`} style={{ background: m.isMe? COLORS.teal : COLORS.surface, borderColor: m.isMe? COLORS.teal : COLORS.border, color: m.isMe? COLORS.bg : COLORS.ivory }}>
                <div className="flex justify-between font-bold"><span>{m.from}</span><span className="text-[10px] opacity-70">{new Date(m.timestamp).toLocaleTimeString()}</span></div>
                <p>{m.text}</p>
              </div>
            ))}
          </div>
          <form onSubmit={e=>{e.preventDefault(); if(p2pInput.trim()){sendMessage(p2pInput.trim()); setP2pInput("");}}} className="flex gap-2 pt-3 border-t" style={{ borderColor: COLORS.border }}>
            <input value={p2pInput} onChange={e=>setP2pInput(e.target.value)} placeholder="Message P2P..." className="flex-1 bg-transparent border rounded-xl px-3 py-2 text-xs" style={{ borderColor: COLORS.borderTeal, color: COLORS.ivory }} />
            <button type="submit" className="px-4 py-2 rounded-xl text-xs font-bold" style={{ background: COLORS.teal, color: COLORS.bg }}><Send size={14}/></button>
          </form>
        </div>
      </div>
    </div>
  );
}
