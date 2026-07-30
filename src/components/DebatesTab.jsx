import { useState } from "react";
import { Swords, ThumbsUp, ThumbsDown, MessageSquare, Plus, CheckCircle2 } from "lucide-react";
import { COLORS } from "../theme.js";
import { useToast } from "./ToastContext.jsx";

const DEMO_DEBATES = [
  {
    id: "d1",
    title: "Faut-il automatiser les récompenses de créateurs via les Smart Contracts ?",
    category: "Gouvernance & Tech",
    creator: "Mamadou Sy",
    flag: "🇲🇱",
    forVotes: 142,
    againstVotes: 38,
    comments: [
      { id: "c1", author: "Sarah J.", side: "pour", text: "Oui ! Les smart contracts garantissent la transparence et éliminent les intermédiaires." },
      { id: "c2", author: "Lars H.", side: "contre", text: "Des audits de sécurité rigoureux sont nécessaires avant toute automatisation totale." }
    ]
  },
  {
    id: "d2",
    title: "Le mode de communication P2P hors-ligne doit-il devenir la priorité de BAARO ?",
    category: "Fonctionnalités",
    creator: "Elena Rostova",
    flag: "🇷🇺",
    forVotes: 210,
    againstVotes: 15,
    comments: [
      { id: "c3", author: "Kenji T.", side: "pour", text: "Crucial pour les zones à faible connectivité internet !" }
    ]
  }
];

export function DebatesTab({ onRewardPoints }) {
  const { showToast, showPointsReward } = useToast();
  const [debates, setDebates] = useState(DEMO_DEBATES);
  const [activeDebateId, setActiveDebateId] = useState("d1");
  const [argumentText, setArgumentText] = useState("");
  const [argumentSide, setArgumentSide] = useState("pour");
  const [votedMap, setVotedMap] = useState({});

  const activeDebate = debates.find((d) => d.id === activeDebateId) || debates[0];

  const handleVote = (debateId, side) => {
    if (votedMap[debateId]) {
      showToast("Vous avez déjà voté sur ce débat", "info");
      return;
    }

    setVotedMap((prev) => ({ ...prev, [debateId]: side }));
    setDebates((prev) =>
      prev.map((d) =>
        d.id === debateId
          ? {
              ...d,
              forVotes: d.forVotes + (side === "pour" ? 1 : 0),
              againstVotes: d.againstVotes + (side === "contre" ? 1 : 0)
            }
          : d
      )
    );

    onRewardPoints(5);
    showPointsReward(5, "Vote enregistré dans l'arène");
  };

  const handleAddArgument = (e) => {
    e.preventDefault();
    if (!argumentText.trim()) return;

    const newArg = {
      id: `arg_${Date.now()}`,
      author: "Vous",
      side: argumentSide,
      text: argumentText
    };

    setDebates((prev) =>
      prev.map((d) =>
        d.id === activeDebateId
          ? { ...d, comments: [...d.comments, newArg] }
          : d
      )
    );

    setArgumentText("");
    onRewardPoints(10);
    showPointsReward(10, "Argument publié dans le débat");
  };

  const totalVotes = activeDebate.forVotes + activeDebate.againstVotes;
  const forPct = totalVotes > 0 ? Math.round((activeDebate.forVotes / totalVotes) * 100) : 50;

  return (
    <div className="flex flex-col gap-6 max-w-4xl mx-auto w-full pb-20">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-bold text-gradient-gold flex items-center gap-2">
            <Swords size={22} style={{ color: COLORS.gold }} />
            Arènes de Débats Publiques
          </h2>
          <p className="text-xs" style={{ color: COLORS.muted }}>Exprimez votre opinion et gagnez des points de gouvernance</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Debate List Column */}
        <div className="glass-card rounded-2xl p-4 border flex flex-col gap-3" style={{ borderColor: COLORS.border }}>
          <span className="text-xs font-bold uppercase tracking-wider" style={{ color: COLORS.muted }}>Débats Récents</span>

          <div className="flex flex-col gap-2">
            {debates.map((d) => {
              const isActive = d.id === activeDebateId;
              return (
                <button
                  key={d.id}
                  onClick={() => setActiveDebateId(d.id)}
                  className={`p-3 rounded-xl text-left transition border ${isActive ? "gold-glow" : "hover:bg-white/5"}`}
                  style={{
                    background: isActive ? COLORS.surface2 : COLORS.surface,
                    borderColor: isActive ? COLORS.borderGold : COLORS.border
                  }}
                >
                  <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: COLORS.teal }}>{d.category}</div>
                  <div className="text-xs font-bold mt-1 leading-snug line-clamp-2" style={{ color: COLORS.ivory }}>{d.title}</div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Selected Debate Arena View */}
        <div className="md:col-span-2 glass-card rounded-2xl p-5 border flex flex-col gap-5" style={{ borderColor: COLORS.borderGold }}>
          <div>
            <span className="text-xs font-mono px-2.5 py-0.5 rounded-full" style={{ background: COLORS.tealGlow, color: COLORS.teal }}>
              {activeDebate.category}
            </span>
            <h3 className="text-lg font-bold mt-2" style={{ color: COLORS.ivory }}>{activeDebate.title}</h3>
            <div className="text-xs mt-1" style={{ color: COLORS.muted }}>Proposé par {activeDebate.creator} {activeDebate.flag}</div>
          </div>

          {/* Voting Gauge */}
          <div className="p-4 rounded-xl border flex flex-col gap-3" style={{ background: COLORS.surface, borderColor: COLORS.border }}>
            <div className="flex justify-between text-xs font-bold">
              <span style={{ color: COLORS.teal }}>POUR : {forPct}% ({activeDebate.forVotes} votes)</span>
              <span style={{ color: "#EC4899" }}>CONTRE : {100 - forPct}% ({activeDebate.againstVotes} votes)</span>
            </div>

            <div className="w-full h-3 rounded-full overflow-hidden flex" style={{ background: COLORS.surface2 }}>
              <div className="h-full transition-all duration-500" style={{ width: `${forPct}%`, background: COLORS.teal }} />
              <div className="h-full transition-all duration-500" style={{ width: `${100 - forPct}%`, background: "#EC4899" }} />
            </div>

            {/* Vote Action Buttons */}
            <div className="flex gap-3 mt-1">
              <button
                onClick={() => handleVote(activeDebate.id, "pour")}
                className="flex-1 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 border hover:border-teal-400 transition"
                style={{ background: COLORS.surface2, borderColor: COLORS.borderTeal, color: COLORS.teal }}
              >
                <ThumbsUp size={14} />
                <span>Voter POUR (+5 pts)</span>
              </button>

              <button
                onClick={() => handleVote(activeDebate.id, "contre")}
                className="flex-1 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 border hover:border-rose-400 transition"
                style={{ background: COLORS.surface2, borderColor: "rgba(236,72,153,0.3)", color: "#EC4899" }}
              >
                <ThumbsDown size={14} />
                <span>Voter CONTRE (+5 pts)</span>
              </button>
            </div>
          </div>

          {/* Arguments Feed */}
          <div className="flex flex-col gap-3">
            <span className="text-xs font-bold uppercase tracking-wider" style={{ color: COLORS.muted }}>Arguments des Membres</span>
            {activeDebate.comments.map((c) => (
              <div key={c.id} className="p-3 rounded-xl text-xs border flex flex-col gap-1" style={{ background: COLORS.surface, borderColor: c.side === "pour" ? COLORS.borderTeal : "rgba(236,72,153,0.3)" }}>
                <div className="flex justify-between font-bold">
                  <span style={{ color: COLORS.gold }}>{c.author}</span>
                  <span className="uppercase text-[10px]" style={{ color: c.side === "pour" ? COLORS.teal : "#EC4899" }}>
                    Avis: {c.side}
                  </span>
                </div>
                <p style={{ color: COLORS.ivory }}>{c.text}</p>
              </div>
            ))}
          </div>

          {/* Add Argument Form */}
          <form onSubmit={handleAddArgument} className="flex flex-col gap-2 pt-3 border-t" style={{ borderColor: COLORS.border }}>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setArgumentSide("pour")}
                className={`px-3 py-1 text-xs font-bold rounded-lg border ${argumentSide === "pour" ? "bg-teal-500/20 text-teal-400 border-teal-500" : ""}`}
                style={{ borderColor: COLORS.border, color: argumentSide === "pour" ? COLORS.teal : COLORS.muted }}
              >
                Position: POUR
              </button>
              <button
                type="button"
                onClick={() => setArgumentSide("contre")}
                className={`px-3 py-1 text-xs font-bold rounded-lg border ${argumentSide === "contre" ? "bg-rose-500/20 text-rose-400 border-rose-500" : ""}`}
                style={{ borderColor: COLORS.border, color: argumentSide === "contre" ? "#EC4899" : COLORS.muted }}
              >
                Position: CONTRE
              </button>
            </div>

            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Rédigez votre argument réfléchi..."
                value={argumentText}
                onChange={(e) => setArgumentText(e.target.value)}
                className="flex-1 bg-transparent border rounded-xl px-3 py-2 text-xs outline-none"
                style={{ borderColor: COLORS.border, color: COLORS.ivory }}
              />
              <button
                type="submit"
                className="px-4 py-2 rounded-xl text-xs font-bold gold-glow"
                style={{ background: COLORS.gold, color: COLORS.bg }}
              >
                Soumettre (+10 pts)
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
