import { useState } from "react";
import {
  Send,
  Phone,
  Video,
  Mic,
  MicOff,
  VideoOff,
  PhoneOff,
  User,
  Search,
  CheckCheck,
  ShieldCheck,
  BadgeCheck
} from "lucide-react";
import { COLORS } from "../theme.js";
import { useToast } from "./ToastContext.jsx";
import { STABLE_USERS } from "../data/users.js";

const DEMO_CHATS = [
  {
    id: "c1",
    name: "Salon Mondial Débats #1",
    avatar: "💬",
    isGroup: true,
    lastMsg: "Kenji: La décentralisation est essentielle !",
    unread: 2,
    messages: [
      { id: "m1", sender: "Amina Kouyaté", text: "Bienvenue à tous dans le salon général BAARO !", time: "14:20" },
      { id: "m2", sender: "Kenji Takahashi", text: "La décentralisation est essentielle !", time: "14:22" }
    ]
  },
  {
    id: "u_sarah",
    name: "Sarah Jenkins",
    handle: "@sarah_austin",
    flag: "🇺🇸",
    avatar: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=150&q=80",
    isGroup: false,
    lastMsg: "As-tu pu tester les transferts de points ?",
    unread: 1,
    messages: [
      { id: "m3", sender: "Sarah Jenkins", text: "Salut ! As-tu pu tester les transferts de points ?", time: "12:05" }
    ]
  },
  {
    id: "u_amina",
    name: "Amina Kouyaté",
    handle: "@amina_dakar",
    flag: "🇸🇳",
    avatar: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=150&q=80",
    isGroup: false,
    lastMsg: "Le projet solaire avance très bien !",
    unread: 0,
    messages: [
      { id: "m4", sender: "Amina Kouyaté", text: "Le projet solaire avance très bien !", time: "10:15" }
    ]
  },
  {
    id: "u_kenji",
    name: "Kenji Takahashi",
    handle: "@kenji_tokyo",
    flag: "🇯🇵",
    avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=150&q=80",
    isGroup: false,
    lastMsg: "On se fait un appel WebRTC pour débriefer ?",
    unread: 0,
    messages: [
      { id: "m5", sender: "Kenji Takahashi", text: "On se fait un appel WebRTC pour débriefer ?", time: "Hier" }
    ]
  }
];

export function MessagesTab({ onRewardPoints }) {
  const { showToast, showPointsReward } = useToast();
  const [chats, setChats] = useState(DEMO_CHATS);
  const [activeChatId, setActiveChatId] = useState("c1");
  const [inputMsg, setInputMsg] = useState("");
  const [callActive, setCallActive] = useState(false);
  const [callType, setCallType] = useState("video");
  const [micMuted, setMicMuted] = useState(false);
  const [camOff, setCamOff] = useState(false);

  const activeChat = chats.find((c) => c.id === activeChatId) || chats[0];

  const handleSendMessage = (e) => {
    e.preventDefault();
    if (!inputMsg.trim()) return;

    const newMsg = {
      id: `m_${Date.now()}`,
      sender: "Vous",
      text: inputMsg,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setChats((prev) =>
      prev.map((c) =>
        c.id === activeChatId
          ? {
              ...c,
              lastMsg: `Vous: ${inputMsg}`,
              messages: [...c.messages, newMsg]
            }
          : c
      )
    );

    setInputMsg("");
    onRewardPoints(1);
    showPointsReward(1, "Message envoyé");
  };

  const startCall = (type) => {
    setCallType(type);
    setCallActive(true);
    showToast(`Appel ${type === "video" ? "Vidéo" : "Vocal"} WebRTC démarré avec ${activeChat.name}`, "info");
  };

  return (
    <div className="max-w-4xl mx-auto w-full pb-20">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 min-h-[540px]">
        {/* Left Side Conversations List */}
        <div className="glass-card rounded-2xl p-4 border flex flex-col gap-3" style={{ borderColor: COLORS.border }}>
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold text-gradient-gold">Messagerie</h3>
            <span className="text-xs px-2 py-0.5 rounded-full font-mono" style={{ background: COLORS.tealGlow, color: COLORS.teal }}>WebRTC P2P</span>
          </div>

          {/* Search */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs" style={{ background: COLORS.surface, borderColor: COLORS.border }}>
            <Search size={14} style={{ color: COLORS.muted }} />
            <input
              type="text"
              placeholder="Rechercher un membre..."
              className="bg-transparent outline-none w-full"
              style={{ color: COLORS.ivory }}
            />
          </div>

          {/* Chat Items */}
          <div className="flex flex-col gap-1 overflow-y-auto max-h-[440px]">
            {chats.map((c) => {
              const isActive = c.id === activeChatId;
              return (
                <button
                  key={c.id}
                  onClick={() => setActiveChatId(c.id)}
                  className={`w-full text-left p-3 rounded-xl transition flex items-center gap-3 border ${
                    isActive ? "gold-glow" : "hover:bg-white/5"
                  }`}
                  style={{
                    background: isActive ? COLORS.surface2 : "transparent",
                    borderColor: isActive ? COLORS.borderGold : "transparent"
                  }}
                >
                  <div className="w-10 h-10 rounded-full overflow-hidden flex items-center justify-center font-bold text-sm flex-shrink-0" style={{ background: COLORS.surface, color: COLORS.gold, border: `1px solid ${COLORS.borderGold}` }}>
                    {c.avatar && c.avatar.startsWith("http") ? (
                      <img src={c.avatar} alt={c.name} className="w-full h-full object-cover" />
                    ) : (
                      <span>{c.avatar}</span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-bold truncate flex items-center gap-1" style={{ color: COLORS.ivory }}>
                        {c.name} {c.flag}
                      </span>
                      {c.unread > 0 && (
                        <span className="w-4 h-4 rounded-full text-[10px] flex items-center justify-center font-bold" style={{ background: COLORS.teal, color: COLORS.bg }}>
                          {c.unread}
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] truncate" style={{ color: COLORS.muted }}>{c.lastMsg}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right Side Chat Window */}
        <div className="md:col-span-2 glass-card rounded-2xl p-4 border flex flex-col justify-between" style={{ borderColor: COLORS.border }}>
          {/* Chat Window Header */}
          <div className="flex items-center justify-between pb-3 border-b" style={{ borderColor: COLORS.border }}>
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full overflow-hidden flex items-center justify-center font-bold text-sm" style={{ background: COLORS.surface, color: COLORS.gold, border: `1px solid ${COLORS.borderGold}` }}>
                {activeChat.avatar && activeChat.avatar.startsWith("http") ? (
                  <img src={activeChat.avatar} alt={activeChat.name} className="w-full h-full object-cover" />
                ) : (
                  <span>{activeChat.avatar}</span>
                )}
              </div>
              <div>
                <div className="text-sm font-bold flex items-center gap-1" style={{ color: COLORS.ivory }}>
                  {activeChat.name} {activeChat.flag}
                </div>
                <div className="text-[10px] flex items-center gap-1" style={{ color: COLORS.teal }}>
                  <span className="w-1.5 h-1.5 rounded-full bg-teal-400 animate-ping" />
                  En ligne • Crypté P2P WebRTC
                </div>
              </div>
            </div>

            {/* Call Buttons */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => startCall("audio")}
                className="p-2 rounded-xl border hover:border-teal-400 transition"
                style={{ background: COLORS.surface, borderColor: COLORS.border, color: COLORS.teal }}
                title="Appel vocal WebRTC"
              >
                <Phone size={16} />
              </button>
              <button
                onClick={() => startCall("video")}
                className="p-2 rounded-xl border hover:border-amber-400 transition gold-glow"
                style={{ background: COLORS.surface2, borderColor: COLORS.borderGold, color: COLORS.gold }}
                title="Appel vidéo WebRTC"
              >
                <Video size={16} />
              </button>
            </div>
          </div>

          {/* Messages Log */}
          <div className="flex-1 py-4 flex flex-col gap-3 overflow-y-auto max-h-[360px]">
            {activeChat.messages.map((m) => {
              const isMe = m.sender === "Vous";
              return (
                <div key={m.id} className={`flex flex-col max-w-[80%] ${isMe ? "ml-auto items-end" : "mr-auto items-start"}`}>
                  <div className="text-[10px] mb-0.5 px-1 font-semibold" style={{ color: COLORS.muted }}>
                    {m.sender}
                  </div>
                  <div
                    className="p-3 rounded-2xl text-xs leading-relaxed border shadow-md"
                    style={{
                      background: isMe ? "linear-gradient(135deg, rgba(217,174,82,0.3) 0%, rgba(45,191,166,0.2) 100%)" : COLORS.surface,
                      borderColor: isMe ? COLORS.borderGold : COLORS.border,
                      color: COLORS.ivory
                    }}
                  >
                    {m.text}
                  </div>
                  <span className="text-[9px] px-1 mt-0.5" style={{ color: COLORS.muted }}>{m.time}</span>
                </div>
              );
            })}
          </div>

          {/* Input Box */}
          <form onSubmit={handleSendMessage} className="flex gap-2 pt-3 border-t" style={{ borderColor: COLORS.border }}>
            <input
              type="text"
              placeholder="Écrivez un message sécurisé..."
              value={inputMsg}
              onChange={(e) => setInputMsg(e.target.value)}
              className="flex-1 bg-transparent border rounded-xl px-3 py-2 text-xs outline-none"
              style={{ borderColor: COLORS.border, color: COLORS.ivory }}
            />
            <button
              type="submit"
              disabled={!inputMsg.trim()}
              className="px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1 disabled:opacity-40"
              style={{ background: COLORS.gold, color: COLORS.bg }}
            >
              <Send size={14} />
            </button>
          </form>
        </div>
      </div>

      {/* WebRTC Interactive Call Modal */}
      {callActive && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="w-full max-w-lg glass-card rounded-3xl p-6 border shadow-2xl flex flex-col items-center gap-6" style={{ borderColor: COLORS.borderGold }}>
            <div className="text-center">
              <span className="text-[10px] uppercase tracking-widest font-mono" style={{ color: COLORS.teal }}>Appel WebRTC Direct En Cours</span>
              <h3 className="text-xl font-bold mt-1" style={{ color: COLORS.ivory }}>{activeChat.name}</h3>
            </div>

            {/* Video Simulation Container */}
            <div className="w-full h-64 rounded-2xl bg-slate-950 border relative overflow-hidden flex items-center justify-center" style={{ borderColor: COLORS.border }}>
              {camOff ? (
                <div className="flex flex-col items-center gap-2" style={{ color: COLORS.muted }}>
                  <VideoOff size={48} />
                  <span className="text-xs">Caméra désactivée</span>
                </div>
              ) : (
                <div className="w-full h-full bg-gradient-to-tr from-slate-900 via-indigo-950 to-slate-900 flex items-center justify-center">
                  <div className="w-24 h-24 rounded-full overflow-hidden border-2 animate-pulse flex items-center justify-center text-3xl font-bold gold-glow" style={{ borderColor: COLORS.gold, background: COLORS.surface2 }}>
                    {activeChat.avatar && activeChat.avatar.startsWith("http") ? (
                      <img src={activeChat.avatar} alt={activeChat.name} className="w-full h-full object-cover" />
                    ) : (
                      <span>{activeChat.avatar}</span>
                    )}
                  </div>
                </div>
              )}

              <div className="absolute bottom-3 right-3 w-20 h-28 rounded-xl bg-slate-900 border overflow-hidden shadow-xl flex items-center justify-center text-xs font-bold" style={{ borderColor: COLORS.borderTeal, color: COLORS.teal }}>
                Vous
              </div>
            </div>

            {/* Call Controls */}
            <div className="flex items-center gap-4">
              <button
                onClick={() => setMicMuted(!micMuted)}
                className={`p-4 rounded-full border transition ${micMuted ? "bg-red-500/20 text-red-400 border-red-500" : "glass-panel"}`}
                style={{ borderColor: micMuted ? "red" : COLORS.border, color: micMuted ? "red" : COLORS.ivory }}
              >
                {micMuted ? <MicOff size={22} /> : <Mic size={22} />}
              </button>

              <button
                onClick={() => setCallActive(false)}
                className="p-4 rounded-full bg-red-600 text-white shadow-2xl hover:bg-red-700 transition"
              >
                <PhoneOff size={24} />
              </button>

              <button
                onClick={() => setCamOff(!camOff)}
                className={`p-4 rounded-full border transition ${camOff ? "bg-red-500/20 text-red-400 border-red-500" : "glass-panel"}`}
                style={{ borderColor: camOff ? "red" : COLORS.border, color: camOff ? "red" : COLORS.ivory }}
              >
                {camOff ? <VideoOff size={22} /> : <Video size={22} />}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
