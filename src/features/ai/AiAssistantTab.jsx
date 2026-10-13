import { useState, useEffect, useRef } from "react";
import { Sparkles, Send, Bot, User, Zap, MessageSquare, Coins, Swords } from "lucide-react";
import { COLORS as THEME_COLORS } from "../../theme.js";
import { useToast } from "../../components/ToastContext.jsx";
import { API_BASE } from "../../config.js";
import { supabase } from "../../supabaseClient.js";

// Fallback si theme incomplet - évite écran noir
const COLORS = {
  surface: "#1A1A1A",
  surface2: "#252525",
  border: "#333",
  borderGold: "#D4AF37",
  borderTeal: "#2DBFA6",
  ivory: "#FFFFF0",
  muted: "#888",
  gold: "#D4AF37",
  teal: "#2DBFA6",
 ...THEME_COLORS
};

const PRESETS = [
  { icon: Coins, text: "Comment maximiser mes points aujourd'hui?" },
  { icon: Swords, text: "Propose-moi 3 sujets de débat viraux" },
  { icon: MessageSquare, text: "Idée de publication engageante" },
  { icon: Zap, text: "Analyse mon activité BAARO et donne des conseils" },
];

export function AiAssistantTab({ user_id, userProfile, onRewardPoints }) {
  // FIX 1 : useToast peut être null
  let toast = { showToast: ()=>{}, showPointsReward: ()=>{} };
  try { const t = useToast(); if(t) toast = t; } catch {}
  const { showToast, showPointsReward } = toast;

  const [messages, setMessages] = useState([
    { id: "welcome", role: "assistant", text: `Salut ${userProfile?.display_name || "toi"}! 👋\nJe suis ton assistant BAARO (Gemini 3.8 Flash).\nQue veux-tu faire?` },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const handleSend = async (text) => {
    const query = (text || input).trim();
    if (!query || loading) return;
    const userMsg = { id: `u_${Date.now()}`, role: "user", text: query };
    setMessages(prev => [...prev, userMsg]);
    setInput(""); setLoading(true);

    try {
      const conversation = messages.filter(m => m.id!== "welcome").slice(-10).map(m => ({ role: m.role, content: m.text }));
      conversation.push({ role: "user", content: query });

      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("Session BAARO absente");

      // FIX 2 : évite double /api/api
      const base = (API_BASE || "").replace(/\/api\/?$/, "").replace(/\/$/, "");
      const url = `${base}/api/chat`;

      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ messages: conversation, context: { display_name: userProfile?.display_name }, max_tokens: 1000 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);

      setMessages(prev => [...prev, { id: `a_${Date.now()}`, role: "assistant", text: data.reply }]);
      onRewardPoints?.(2); showPointsReward?.(2, "Échange avec l'IA");
    } catch (e) {
      console.error("Erreur IA:", e);
      setMessages(prev => [...prev, { id: `err_${Date.now()}`, role: "assistant", text: `Je suis temporairement indisponible. ${e.message}` }]);
      showToast?.(e.message, "error");
    } finally { setLoading(false); }
  };

  return (
    <div className="flex flex-col gap-4 max-w-3xl mx-auto w-full pb-24 px-2">
      <div className="rounded-2xl p-5 border flex items-center gap-3" style={{ background: COLORS.surface, borderColor: COLORS.borderGold }}>
        <div className="w-11 h-11 rounded-2xl flex items-center justify-center" style={{ background: COLORS.gold, color: "#000" }}><Bot size={22} /></div>
        <div><h2 className="font-bold" style={{ color: COLORS.ivory }}>Assistant IA BAARO</h2><p className="text-xs" style={{ color: COLORS.muted }}>Gemini 3.8 Flash • +2 points</p></div>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {PRESETS.map((p,i)=><button key={i} onClick={()=>handleSend(p.text)} className="flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs whitespace-nowrap" style={{ background: COLORS.surface, borderColor: COLORS.border, color: COLORS.ivory }}><p.icon size={13} style={{ color: COLORS.gold }} />{p.text}</button>)}
      </div>
      <div className="rounded-2xl border p-4 flex flex-col min-h-[65vh]" style={{ background: COLORS.surface, borderColor: COLORS.border }}>
        <div className="flex-1 space-y-4 overflow-y-auto">
          {messages.map(m=>{ const isBot=m.role==="assistant"; return (
            <div key={m.id} className={`flex gap-3 ${isBot?"":"flex-row-reverse"}`}><div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0" style={{ background: isBot?COLORS.gold:COLORS.teal, color:"#000" }}>{isBot?<Bot size={15}/>:<User size={15}/>}</div><div className="max-w-[85%] px-4 py-3 rounded-2xl text-sm whitespace-pre-wrap" style={{ background: isBot?COLORS.surface2:"rgba(45,191,166,0.15)", color: COLORS.ivory, border:`1px solid ${isBot?COLORS.borderGold:COLORS.borderTeal}` }}>{m.text}</div></div>
          )})}
          {loading && <div className="flex items-center gap-2 text-xs" style={{ color: COLORS.gold }}><Sparkles size={14} className="animate-spin" /> L'assistant réfléchit...</div>}
          <div ref={bottomRef} />
        </div>
        <form onSubmit={e=>{e.preventDefault(); handleSend();}} className="flex gap-2 pt-4 border-t mt-3" style={{ borderColor: COLORS.border }}>
          <input value={input} onChange={e=>setInput(e.target.value)} placeholder="Pose ta question..." className="flex-1 px-4 py-3 rounded-xl border text-sm outline-none" style={{ background: COLORS.surface2, borderColor: COLORS.border, color: COLORS.ivory }} />
          <button type="submit" disabled={!input.trim()||loading} className="px-5 py-3 rounded-xl font-bold disabled:opacity-40" style={{ background: COLORS.gold, color: "#000" }}><Send size={16}/></button>
        </form>
      </div>
    </div>
  );
}
