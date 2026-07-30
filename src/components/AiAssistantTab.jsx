import { useState } from "react";
import { Sparkles, Send, Bot, User, Zap, HelpCircle, Coins, ShieldCheck } from "lucide-react";
import { COLORS } from "../theme.js";
import { useToast } from "./ToastContext.jsx";
import { API_BASE } from "../config.js";

const PRESET_PROMPTS = [
  "Comment gagner plus de points BAARO ?",
  "Quelle est la différence entre Points et BARO Coin ?",
  "Idée de publication virale pour ma communauté",
  "Comment fonctionne la messagerie P2P hors-ligne ?"
];

export function AiAssistantTab({ onRewardPoints }) {
  const { showToast, showPointsReward } = useToast();
  const [messages, setMessages] = useState([
    { id: "m1", role: "assistant", text: "Bonjour ! Je suis l'assistant IA de BAARO. Comment puis-je vous aider aujourd'hui à maximiser vos points, comprendre la crypto BARO ou interagir avec la communauté ?" }
  ]);
  const [inputMsg, setInputMsg] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSend = async (textToSend) => {
    const query = textToSend || inputMsg;
    if (!query.trim() || loading) return;

    const userMsg = { id: `u_${Date.now()}`, role: "user", text: query };
    setMessages((prev) => [...prev, userMsg]);
    setInputMsg("");
    setLoading(true);

    try {
      // Try calling serverless endpoint api/chat.js
      const res = await fetch(`${API_BASE}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: query }),
      });

      if (res.ok) {
        const data = await res.json();
        const botReply = data.reply || "Désolé, je n'ai pas pu générer une réponse.";
        setMessages((prev) => [...prev, { id: `b_${Date.now()}`, role: "assistant", text: botReply }]);
      } else {
        throw new Error("API non disponible");
      }
    } catch (e) {
      // Fallback AI Smart responses
      let fallbackText = "Sur BAARO, chaque interaction (publication, commentaire, parrainage) vous fait gagner des points réels convertibles en BARO Coins !";
      if (query.toLowerCase().includes("point")) {
        fallbackText = "Pour accumuler des points rapidement :\n1. Publiez des contenus utiles (+15 pts)\n2. Réclamez votre bonus quotidien (+10 pts)\n3. Invitez des amis avec votre lien de parrainage (+20 pts)\n4. Participez aux débats publics (+10 pts).";
      } else if (query.toLowerCase().includes("baro") || query.toLowerCase().includes("crypto")) {
        fallbackText = "Le BARO Coin est notre crypto-monnaie interne native. 100 Points réseau = 1 BARO Coin ($1.06 USD). Vous pouvez échanger vos points contre des BARO à tout moment dans l'onglet BARO Coin !";
      } else if (query.toLowerCase().includes("hors-ligne") || query.toLowerCase().includes("p2p")) {
        fallbackText = "La technologie P2P de BAARO utilise l'API Google Nearby (Bluetooth + Wi-Fi Direct) pour transmettre des messages entre appareils distants de moins de 100m, sans nécessiter d'antenne relais ni d'Internet.";
      }

      setMessages((prev) => [...prev, { id: `b_${Date.now()}`, role: "assistant", text: fallbackText }]);
    } finally {
      setLoading(false);
      onRewardPoints(1);
      showPointsReward(1, "Question à l'assistant IA");
    }
  };

  return (
    <div className="flex flex-col gap-4 max-w-3xl mx-auto w-full pb-20">
      {/* Header */}
      <div className="glass-card rounded-2xl p-5 border flex items-center justify-between" style={{ borderColor: COLORS.borderGold }}>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl flex items-center justify-center font-bold text-xl gold-glow" style={{ background: COLORS.gold, color: COLORS.bg }}>
            <Bot size={22} />
          </div>
          <div>
            <h2 className="text-base font-bold text-gradient-gold">Assistant IA BAARO</h2>
            <div className="text-xs" style={{ color: COLORS.muted }}>Conseils personnalisés & stratégie de points</div>
          </div>
        </div>

        <span className="text-xs font-mono px-2.5 py-1 rounded-full border" style={{ background: COLORS.surface, borderColor: COLORS.borderTeal, color: COLORS.teal }}>
          Claude 3.5 Sonnet
        </span>
      </div>

      {/* Preset Prompts Pills */}
      <div className="flex items-center gap-2 overflow-x-auto py-1 no-scrollbar">
        {PRESET_PROMPTS.map((prompt, idx) => (
          <button
            key={idx}
            onClick={() => handleSend(prompt)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs whitespace-nowrap hover:border-amber-400/50 transition flex-shrink-0"
            style={{ background: COLORS.surface, borderColor: COLORS.border, color: COLORS.ivory }}
          >
            <Sparkles size={12} style={{ color: COLORS.gold }} />
            <span>{prompt}</span>
          </button>
        ))}
      </div>

      {/* Chat Messages Container */}
      <div className="glass-card rounded-2xl p-5 border flex flex-col justify-between min-h-[420px]" style={{ borderColor: COLORS.border }}>
        <div className="flex flex-col gap-4 overflow-y-auto max-h-[360px] pr-1">
          {messages.map((m) => {
            const isBot = m.role === "assistant";
            return (
              <div key={m.id} className={`flex gap-3 max-w-[85%] ${isBot ? "mr-auto" : "ml-auto flex-row-reverse"}`}>
                <div className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs flex-shrink-0" style={{ background: isBot ? COLORS.gold : COLORS.teal, color: COLORS.bg }}>
                  {isBot ? <Bot size={16} /> : <User size={16} />}
                </div>
                <div
                  className="p-3.5 rounded-2xl text-xs leading-relaxed border whitespace-pre-line shadow-md"
                  style={{
                    background: isBot ? COLORS.surface : "linear-gradient(135deg, rgba(45,191,166,0.2) 0%, rgba(26,39,64,0.8) 100%)",
                    borderColor: isBot ? COLORS.borderGold : COLORS.borderTeal,
                    color: COLORS.ivory
                  }}
                >
                  {m.text}
                </div>
              </div>
            );
          })}
          {loading && (
            <div className="flex gap-2 items-center text-xs font-mono" style={{ color: COLORS.gold }}>
              <Sparkles size={14} className="animate-spin" />
              <span>L'assistant réfléchit...</span>
            </div>
          )}
        </div>

        {/* Input Bar */}
        <form onSubmit={(e) => { e.preventDefault(); handleSend(); }} className="flex gap-2 pt-3 border-t mt-4" style={{ borderColor: COLORS.border }}>
          <input
            type="text"
            placeholder="Posez une question à l'intelligence artificielle BAARO..."
            value={inputMsg}
            onChange={(e) => setInputMsg(e.target.value)}
            className="flex-1 bg-transparent border rounded-xl px-4 py-2.5 text-xs outline-none"
            style={{ borderColor: COLORS.borderGold, color: COLORS.ivory }}
          />
          <button
            type="submit"
            disabled={!inputMsg.trim() || loading}
            className="px-5 py-2.5 rounded-xl text-xs font-bold shadow-lg transition gold-glow disabled:opacity-40"
            style={{ background: COLORS.gold, color: COLORS.bg }}
          >
            <Send size={16} />
          </button>
        </form>
      </div>
    </div>
  );
}
