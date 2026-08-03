import { useState, useEffect, useRef } from "react";
import { Sparkles, Send, Bot, User, Zap, MessageSquare, Coins, Swords } from "lucide-react";
import { COLORS } from "../theme.js";
import { useToast } from "./ToastContext.jsx";
import { API_BASE } from "../config.js";

const PRESETS = [
  { icon: Coins, text: "Comment maximiser mes points aujourd'hui ?" },
  { icon: Swords, text: "Propose-moi 3 sujets de débat viraux" },
  { icon: MessageSquare, text: "Idée de publication engageante" },
  { icon: Zap, text: "Analyse mon wallet et donne des conseils" },
];

export function AiAssistantTab({
  userId,
  userProfile,
  pointsBalance = 0,
  baroBalance = 0,
  onRewardPoints,
}) {
  const { showToast, showPointsReward } = useToast();
  const [messages, setMessages] = useState([
    {
      id: "welcome",
      role: "assistant",
      text: `Salut \( {userProfile?.display_name || "toi"} ! 👋\nJe suis ton assistant BAARO. Je connais ton solde ( \){pointsBalance} pts / ${baroBalance} BARO) et je peux t’aider à gagner plus, créer des débats ou publier du contenu viral.\nQue veux-tu faire ?`,
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const buildContext = () => ({
    display_name: userProfile?.display_name,
    handle: userProfile?.handle,
    bio: userProfile?.bio,
    points: pointsBalance,
    baro: baroBalance,
  });

  const handleSend = async (text) => {
    const query = (text || input).trim();
    if (!query || loading) return;

    const userMsg = { id: `u_${Date.now()}`, role: "user", text: query };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const conversation = messages
        .filter((m) => m.role === "user" || m.role === "assistant")
        .slice(-8)
        .map((m) => ({
          role: m.role,
          content: m.text,
        }));

      conversation.push({ role: "user", content: query });

      const res = await fetch(`${API_BASE}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: conversation,
          context: buildContext(),
          max_tokens: 1000,
        }),
      });

      const data = await res.json();

      const reply =
        data.reply ||
        data.content?.[0]?.text ||
        "Désolé, je n’ai pas pu répondre. Réessaie dans un instant.";

      setMessages((prev) => [
        ...prev,
        { id: `a_${Date.now()}`, role: "assistant", text: reply },
      ]);
    } catch (e) {
      console.error("Erreur IA:", e);
      setMessages((prev) => [
        ...prev,
        {
          id: `err_${Date.now()}`,
          role: "assistant",
          text: "Je suis temporairement indisponible. Vérifie ta connexion et réessaie.",
        },
      ]);
    } finally {
      setLoading(false);
      if (typeof onRewardPoints === "function") {
        onRewardPoints(2);
      }
      if (typeof showPointsReward === "function") {
        showPointsReward(2, "Échange avec l’IA");
      }
    }
  };

  return (
    <div className="flex flex-col gap-4 max-w-3xl mx-auto w-full pb-24">
      {/* Header */}
      <div
        className="rounded-2xl p-5 border flex items-center justify-between"
        style={{ background: COLORS.surface, borderColor: COLORS.borderGold }}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-11 h-11 rounded-2xl flex items-center justify-center"
            style={{ background: COLORS.gold, color: "#000" }}
          >
            <Bot size={22} />
          </div>
          <div>
            <h2 className="font-bold text-base" style={{ color: COLORS.ivory }}>
              Assistant IA BAARO
            </h2>
            <p className="text-xs" style={{ color: COLORS.muted }}>
              Contextuel • Conseils personnalisés • Actions concrètes
            </p>
          </div>
        </div>
        <span
          className="text-[10px] font-mono px-2.5 py-1 rounded-full border"
          style={{ borderColor: COLORS.borderTeal, color: COLORS.teal }}
        >
          Claude Sonnet
        </span>
      </div>

      {/* Presets */}
      <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
        {PRESETS.map((p, i) => (
          <button
            key={i}
            onClick={() => handleSend(p.text)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs whitespace-nowrap shrink-0 transition hover:border-amber-400/60"
            style={{
              background: COLORS.surface,
              borderColor: COLORS.border,
              color: COLORS.ivory,
            }}
          >
            <p.icon size={13} style={{ color: COLORS.gold }} />
            {p.text}
          </button>
        ))}
      </div>

      {/* Messages */}
      <div
        className="rounded-2xl border p-4 flex flex-col min-h-[420px]"
        style={{ background: COLORS.surface, borderColor: COLORS.border }}
      >
        <div className="flex-1 overflow-y-auto space-y-4 max-h-[380px] pr-1">
          {messages.map((m) => {
            const isBot = m.role === "assistant";
            return (
              <div
                key={m.id}
                className={`flex gap-3 ${isBot ? "" : "flex-row-reverse"}`}
              >
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
                  style={{
                    background: isBot ? COLORS.gold : COLORS.teal,
                    color: "#000",
                  }}
                >
                  {isBot ? <Bot size={15} /> : <User size={15} />}
                </div>
                <div
                  className="max-w-[80%] px-4 py-3 rounded-2xl text-sm leading-relaxed whitespace-pre-line"
                  style={{
                    background: isBot ? COLORS.surface2 : "rgba(45,191,166,0.15)",
                    color: COLORS.ivory,
                    border: `1px solid ${isBot ? COLORS.borderGold : COLORS.borderTeal}`,
                  }}
                >
                  {m.text}
                </div>
              </div>
            );
          })}
          {loading && (
            <div className="flex items-center gap-2 text-xs" style={{ color: COLORS.gold }}>
              <Sparkles size={14} className="animate-spin" />
              L’assistant réfléchit…
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
          className="flex gap-2 pt-4 border-t mt-3"
          style={{ borderColor: COLORS.border }}
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Pose ta question ou demande une action…"
            className="flex-1 px-4 py-3 rounded-xl border text-sm outline-none"
            style={{
              background: COLORS.surface2,
              borderColor: COLORS.border,
              color: COLORS.ivory,
            }}
          />
          <button
            type="submit"
            disabled={!input.trim() || loading}
            className="px-5 py-3 rounded-xl font-bold disabled:opacity-40"
            style={{ background: COLORS.gold, color: "#000" }}
          >
            <Send size={16} />
          </button>
        </form>
      </div>
    </div>
  );
}
