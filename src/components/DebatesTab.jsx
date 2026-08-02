import { useState, useEffect } from "react";
import { Swords, ThumbsUp, ThumbsDown, Plus, Video, LogIn, Loader2 } from "lucide-react";
import { COLORS } from "../theme.js";
import { useToast } from "./ToastContext.jsx";
import { DebateRoom } from "./DebateRoom.jsx";
import { useDebates } from "../hooks/useDebates.js";
import { supabase } from "../supabaseClient.js";

export function DebatesTab({ onRewardPoints, userName = "Vous", userId }) {
  const { showToast, showPointsReward } = useToast();
  
  // États locaux
  const [activeDebateId, setActiveDebateId] = useState(null);
  const [argumentText, setArgumentText] = useState("");
  const [argumentSide, setArgumentSide] = useState("pour");
  const [votedMap, setVotedMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [userVotes, setUserVotes] = useState({});

  // Session d'appel vidéo
  const [callSession, setCallSession] = useState(null);
  const [joinCodeInput, setJoinCodeInput] = useState("");
  const [showJoinField, setShowJoinField] = useState(false);

  // Hook pour les débats (connecté à Supabase)
  const { debates, loading: debatesLoading, createDebate, addVote, addArgument, refreshDebates } = useDebates(userId);

  // Charger les débats au montage
  useEffect(() => {
    if (userId) {
      refreshDebates();
    }
  }, [userId]);

  // Charger les votes de l'utilisateur
  useEffect(() => {
    if (!userId) return;

    const loadUserVotes = async () => {
      const { data, error } = await supabase
        .from('debate_votes')
        .select('debate_id, side')
        .eq('user_id', userId);

      if (!error && data) {
        const votes = {};
        data.forEach(v => {
          votes[v.debate_id] = v.side;
        });
        setUserVotes(votes);
        setVotedMap(votes);
      }
    };

    loadUserVotes();
  }, [userId, debates]);

  // Définir le débat actif
  useEffect(() => {
    if (debates.length > 0 && !activeDebateId) {
      setActiveDebateId(debates[0].id);
    }
  }, [debates]);

  const activeDebate = debates.find((d) => d.id === activeDebateId) || debates[0];

  // Gestion du vote
  const handleVote = async (debateId, side) => {
    if (votedMap[debateId]) {
      showToast("Vous avez déjà voté sur ce débat", "info");
      return;
    }

    setLoading(true);
    try {
      const result = await addVote(debateId, side);
      
      if (result.success) {
        setVotedMap((prev) => ({ ...prev, [debateId]: side }));
        onRewardPoints(5);
        showPointsReward(5, "Vote enregistré dans l'arène");
        await refreshDebates();
      } else {
        showToast(result.error || "Erreur lors du vote", "error");
      }
    } catch (error) {
      showToast("Erreur lors du vote", "error");
    } finally {
      setLoading(false);
    }
  };

  // Gestion de l'ajout d'argument
  const handleAddArgument = async (e) => {
    e.preventDefault();
    if (!argumentText.trim()) {
      showToast("Veuillez écrire un argument", "error");
      return;
    }

    if (!activeDebate) {
      showToast("Aucun débat actif", "error");
      return;
    }

    setLoading(true);
    try {
      const result = await addArgument(activeDebate.id, argumentText, argumentSide);
      
      if (result.success) {
        setArgumentText("");
        onRewardPoints(10);
        showPointsReward(10, "Argument publié dans le débat");
        await refreshDebates();
      } else {
        showToast(result.error || "Erreur lors de l'ajout", "error");
      }
    } catch (error) {
      showToast("Erreur lors de l'ajout de l'argument", "error");
    } finally {
      setLoading(false);
    }
  };

  // Démarrer un débat vidéo
  const handleStartVideoDebate = async () => {
    if (!activeDebate) {
      showToast("Aucun débat sélectionné", "error");
      return;
    }

    setCallSession({ 
      mode: "host", 
      debate: activeDebate,
      userId: userId
    });
  };

  // Rejoindre par code
  const handleJoinByCode = (e) => {
    e.preventDefault();
    const code = joinCodeInput.trim().toUpperCase();
    if (code.length !== 8) {
      showToast("Le code doit contenir 8 caractères", "error");
      return;
    }
    setCallSession({ 
      mode: "guest", 
      inviteCode: code,
      userId: userId
    });
  };

  // Pendant un appel vidéo actif
  if (callSession) {
    return (
      <DebateRoom
        mode={callSession.mode}
        debate={callSession.debate}
        inviteCode={callSession.inviteCode}
        userName={userName}
        userId={userId}
        onLeave={() => {
          setCallSession(null);
          setJoinCodeInput("");
        }}
      />
    );
  }

  // Affichage du chargement
  if (debatesLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <Loader2 className="animate-spin" size={40} style={{ color: COLORS.gold }} />
        <p className="mt-4 text-sm" style={{ color: COLORS.muted }}>Chargement des débats...</p>
      </div>
    );
  }

  // Pas de débats
  if (!activeDebate) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4 max-w-4xl mx-auto">
        <Swords size={48} style={{ color: COLORS.gold }} />
        <h3 className="text-lg font-bold" style={{ color: COLORS.ivory }}>Aucun débat en cours</h3>
        <p className="text-sm" style={{ color: COLORS.muted }}>Soyez le premier à lancer un débat !</p>
        <button
          onClick={() => createDebate()}
          className="px-6 py-3 rounded-xl text-sm font-bold gold-glow"
          style={{ background: COLORS.gold, color: COLORS.bg }}
        >
          <Plus size={16} className="inline mr-2" />
          Créer un débat
        </button>
      </div>
    );
  }

  const totalVotes = activeDebate.for_votes + activeDebate.against_votes;
  const forPct = totalVotes > 0 ? Math.round((activeDebate.for_votes / totalVotes) * 100) : 50;
  const hasVoted = !!votedMap[activeDebate.id];

  return (
    <div className="flex flex-col gap-6 max-w-4xl mx-auto w-full pb-20">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-bold text-gradient-gold flex items-center gap-2">
            <Swords size={22} style={{ color: COLORS.gold }} />
            Arènes de Débats Publiques
          </h2>
          <p className="text-xs" style={{ color: COLORS.muted }}>
            {debates.length} débat{debates.length > 1 ? 's' : ''} en cours
          </p>
        </div>
      </div>

      {/* Actions débat vidéo en direct */}
      <div className="flex flex-col sm:flex-row gap-2">
        <button
          onClick={handleStartVideoDebate}
          className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold gold-glow"
          style={{ background: COLORS.gold, color: COLORS.bg }}
        >
          <Video size={15} />
          Démarrer un débat vidéo
        </button>

        <button
          onClick={() => setShowJoinField((v) => !v)}
          className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold border"
          style={{ borderColor: COLORS.borderTeal, color: COLORS.teal, background: COLORS.surface }}
        >
          <LogIn size={15} />
          Rejoindre avec un code
        </button>
      </div>

      {showJoinField && (
        <form onSubmit={handleJoinByCode} className="flex gap-2">
          <input
            type="text"
            placeholder="Code à 8 caractères"
            value={joinCodeInput}
            onChange={(e) => setJoinCodeInput(e.target.value.toUpperCase().slice(0, 8))}
            maxLength={8}
            className="flex-1 bg-transparent border rounded-xl px-3 py-2 text-sm font-mono tracking-widest uppercase outline-none"
            style={{ borderColor: COLORS.borderTeal, color: COLORS.ivory }}
          />
          <button
            type="submit"
            className="px-4 py-2 rounded-xl text-xs font-bold"
            style={{ background: COLORS.teal, color: COLORS.bg }}
          >
            Rejoindre
          </button>
        </form>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Liste des débats */}
        <div className="glass-card rounded-2xl p-4 border flex flex-col gap-3" style={{ borderColor: COLORS.border }}>
          <span className="text-xs font-bold uppercase tracking-wider" style={{ color: COLORS.muted }}>Débats Récents</span>

          <div className="flex flex-col gap-2 max-h-[500px] overflow-y-auto">
            {debates.map((d) => {
              const isActive = d.id === activeDebateId;
              const isVoted = !!votedMap[d.id];
              
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
                  <div className="flex justify-between items-start">
                    <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: COLORS.teal }}>
                      {d.category || 'Débat'}
                    </div>
                    {isVoted && (
                      <span className="text-[8px] px-1.5 py-0.5 rounded" style={{ background: COLORS.gold, color: COLORS.bg }}>
                        ✓ voté
                      </span>
                    )}
                  </div>
                  <div className="text-xs font-bold mt-1 leading-snug line-clamp-2" style={{ color: COLORS.ivory }}>
                    {d.title}
                  </div>
                  <div className="text-[10px] mt-1" style={{ color: COLORS.muted }}>
                    {d.host_username || 'Anonyme'} · {d.comments?.length || 0} arguments
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Vue du débat sélectionné */}
        <div className="md:col-span-2 glass-card rounded-2xl p-5 border flex flex-col gap-5" style={{ borderColor: COLORS.borderGold }}>
          <div>
            <span className="text-xs font-mono px-2.5 py-0.5 rounded-full" style={{ background: COLORS.tealGlow, color: COLORS.teal }}>
              {activeDebate.category || 'Débat Public'}
            </span>
            <h3 className="text-lg font-bold mt-2" style={{ color: COLORS.ivory }}>{activeDebate.title}</h3>
            <div className="text-xs mt-1" style={{ color: COLORS.muted }}>
              Proposé par {activeDebate.host_username || 'Anonyme'} 
              {activeDebate.flag && ` ${activeDebate.flag}`}
            </div>
          </div>

          {/* Jauge de vote */}
          <div className="p-4 rounded-xl border flex flex-col gap-3" style={{ background: COLORS.surface, borderColor: COLORS.border }}>
            <div className="flex justify-between text-xs font-bold">
              <span style={{ color: COLORS.teal }}>POUR : {forPct}% ({activeDebate.for_votes || 0} votes)</span>
              <span style={{ color: "#EC4899" }}>CONTRE : {100 - forPct}% ({activeDebate.against_votes || 0} votes)</span>
            </div>

            <div className="w-full h-3 rounded-full overflow-hidden flex" style={{ background: COLORS.surface2 }}>
              <div className="h-full transition-all duration-500" style={{ width: `${forPct}%`, background: COLORS.teal }} />
              <div className="h-full transition-all duration-500" style={{ width: `${100 - forPct}%`, background: "#EC4899" }} />
            </div>

            {/* Boutons de vote */}
            <div className="flex gap-3 mt-1">
              <button
                onClick={() => handleVote(activeDebate.id, "pour")}
                disabled={loading || hasVoted}
                className={`flex-1 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 border transition ${
                  hasVoted && votedMap[activeDebate.id] === "pour" 
                    ? "bg-teal-500/20 border-teal-500" 
                    : "hover:border-teal-400"
                }`}
                style={{
                  background: hasVoted && votedMap[activeDebate.id] === "pour" ? COLORS.tealGlow : COLORS.surface2,
                  borderColor: hasVoted && votedMap[activeDebate.id] === "pour" ? COLORS.teal : COLORS.borderTeal,
                  color: hasVoted && votedMap[activeDebate.id] === "pour" ? COLORS.teal : COLORS.teal,
                  opacity: hasVoted ? 0.6 : 1,
                  cursor: hasVoted ? 'not-allowed' : 'pointer'
                }}
              >
                <ThumbsUp size={14} />
                <span>Voter POUR (+5 pts)</span>
              </button>

              <button
                onClick={() => handleVote(activeDebate.id, "contre")}
                disabled={loading || hasVoted}
                className={`flex-1 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 border transition ${
                  hasVoted && votedMap[activeDebate.id] === "contre" 
                    ? "bg-rose-500/20 border-rose-500" 
                    : "hover:border-rose-400"
                }`}
                style={{
                  background: hasVoted && votedMap[activeDebate.id] === "contre" ? "rgba(236,72,153,0.2)" : COLORS.surface2,
                  borderColor: hasVoted && votedMap[activeDebate.id] === "contre" ? "#EC4899" : "rgba(236,72,153,0.3)",
                  color: hasVoted && votedMap[activeDebate.id] === "contre" ? "#EC4899" : "#EC4899",
                  opacity: hasVoted ? 0.6 : 1,
                  cursor: hasVoted ? 'not-allowed' : 'pointer'
                }}
              >
                <ThumbsDown size={14} />
                <span>Voter CONTRE (+5 pts)</span>
              </button>
            </div>
            {hasVoted && (
              <p className="text-[10px] text-center" style={{ color: COLORS.gold }}>
                ✓ Vous avez voté {votedMap[activeDebate.id] === "pour" ? "POUR" : "CONTRE"}
              </p>
            )}
          </div>

          {/* Arguments */}
          <div className="flex flex-col gap-3">
            <span className="text-xs font-bold uppercase tracking-wider" style={{ color: COLORS.muted }}>
              Arguments des Membres ({activeDebate.comments?.length || 0})
            </span>
            
            {activeDebate.comments && activeDebate.comments.length > 0 ? (
              activeDebate.comments.map((c) => (
                <div 
                  key={c.id} 
                  className="p-3 rounded-xl text-xs border flex flex-col gap-1" 
                  style={{ 
                    background: COLORS.surface, 
                    borderColor: c.side === "pour" ? COLORS.borderTeal : "rgba(236,72,153,0.3)" 
                  }}
                >
                  <div className="flex justify-between font-bold">
                    <span style={{ color: COLORS.gold }}>{c.author_username || 'Anonyme'}</span>
                    <span className="uppercase text-[10px]" style={{ color: c.side === "pour" ? COLORS.teal : "#EC4899" }}>
                      Avis: {c.side}
                    </span>
                  </div>
                  <p style={{ color: COLORS.ivory }}>{c.text}</p>
                </div>
              ))
            ) : (
              <p className="text-xs" style={{ color: COLORS.muted }}>Aucun argument pour l'instant. Soyez le premier !</p>
            )}
          </div>

          {/* Formulaire d'ajout d'argument */}
          <form onSubmit={handleAddArgument} className="flex flex-col gap-2 pt-3 border-t" style={{ borderColor: COLORS.border }}>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setArgumentSide("pour")}
                className={`px-3 py-1 text-xs font-bold rounded-lg border transition ${
                  argumentSide === "pour" ? "bg-teal-500/20 text-teal-400 border-teal-500" : ""
                }`}
                style={{
                  borderColor: argumentSide === "pour" ? COLORS.teal : COLORS.border,
                  color: argumentSide === "pour" ? COLORS.teal : COLORS.muted
                }}
              >
                Position: POUR
              </button>
              <button
                type="button"
                onClick={() => setArgumentSide("contre")}
                className={`px-3 py-1 text-xs font-bold rounded-lg border transition ${
                  argumentSide === "contre" ? "bg-rose-500/20 text-rose-400 border-rose-500" : ""
                }`}
                style={{
                  borderColor: argumentSide === "contre" ? "#EC4899" : COLORS.border,
                  color: argumentSide === "contre" ? "#EC4899" : COLORS.muted
                }}
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
                disabled={loading}
                className="flex-1 bg-transparent border rounded-xl px-3 py-2 text-xs outline-none"
                style={{ borderColor: COLORS.border, color: COLORS.ivory }}
              />
              <button
                type="submit"
                disabled={loading}
                className="px-4 py-2 rounded-xl text-xs font-bold gold-glow disabled:opacity-50"
                style={{ background: COLORS.gold, color: COLORS.bg }}
              >
                {loading ? <Loader2 className="animate-spin inline" size={14} /> : 'Soumettre (+10 pts)'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
