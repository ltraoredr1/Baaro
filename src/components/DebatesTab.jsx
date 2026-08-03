import { useState, useEffect, useCallback } from "react";
import { Swords, Plus, Hash, MessageSquare, Mic, Video } from "lucide-react";
import { COLORS } from "../theme.js";
import { supabase } from "../supabaseClient.js";
import { CreateDebateModal } from "./CreateDebateModal.jsx";
import { DebateRoom } from "./DebateRoom.jsx";

export default function DebatesTab({ currentUserId, onRewardPoints }) {
  const [debates, setDebates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [activeDebateCode, setActiveDebateCode] = useState(null);

  const fetchDebates = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Une seule requête légère + colonnes minimales
      const { data, error } = await supabase
        .from("debate_rooms")
        .select("id, title, topic, mode, invite_code, status, created_at, creator_id")
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) {
        console.error("Erreur Supabase:", error);
        setError(error.message);
        setDebates([]);
      } else {
        setDebates(data || []);
      }
    } catch (err) {
      console.error("Erreur critique:", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDebates();

    const channel = supabase
      .channel("debates_channel")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "debate_rooms" },
        () => fetchDebates()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchDebates]);

  if (activeDebateCode) {
    return (
      <DebateRoom
        inviteCode={activeDebateCode}
        currentUserId={currentUserId}
        onBack={() => setActiveDebateCode(null)}
      />
    );
  }

  return (
    <>
      <div className="flex flex-col h-full p-4">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold flex items-center gap-2" style={{ color: COLORS.ivory }}>
            <Swords size={24} style={{ color: COLORS.gold }} />
            Débats en cours
          </h2>
          <button
            onClick={() => setIsCreateOpen(true)}
            className="px-4 py-2 rounded-xl font-bold text-sm flex items-center gap-2"
            style={{ background: COLORS.gold, color: "#000" }}
          >
            <Plus size={16} />
            Créer
          </button>
        </div>

        {error && (
          <div className="bg-red-500/20 border border-red-500 p-4 rounded-xl mb-4">
            <p className="text-red-400 font-bold text-sm mb-1">Erreur</p>
            <p className="text-red-300 text-xs">{error}</p>
            <button
              onClick={fetchDebates}
              className="mt-2 px-3 py-1 bg-red-500 text-white text-xs rounded"
            >
              Réessayer
            </button>
          </div>
        )}

        <div className="flex-1 overflow-y-auto space-y-3">
          {loading ? (
            <div className="text-center py-10" style={{ color: COLORS.muted }}>
              <div className="animate-spin inline-block w-8 h-8 border-2 border-current border-t-transparent rounded-full mb-3" />
              <p className="text-sm">Chargement...</p>
            </div>
          ) : debates.length === 0 ? (
            <div className="text-center py-10">
              <div
                className="w-20 h-20 rounded-full mx-auto mb-4 flex items-center justify-center"
                style={{ background: COLORS.surface }}
              >
                <Swords size={40} style={{ color: COLORS.muted }} />
              </div>
              <p className="font-bold mb-2" style={{ color: COLORS.ivory }}>
                Aucun débat actif
              </p>
              <button
                onClick={() => setIsCreateOpen(true)}
                className="px-6 py-3 rounded-xl font-bold text-sm mt-4"
                style={{ background: COLORS.gold, color: "#000" }}
              >
                Créer un débat
              </button>
            </div>
          ) : (
            debates.map((debate) => (
              <div
                key={debate.id}
                onClick={() => setActiveDebateCode(debate.invite_code)}
                className="p-4 rounded-2xl border cursor-pointer hover:border-amber-400/50 transition-all"
                style={{ background: COLORS.surface, borderColor: COLORS.border }}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <h3 className="font-bold text-sm" style={{ color: COLORS.ivory }}>
                        {debate.title}
                      </h3>
                      <span
                        className="text-[10px] px-2 py-0.5 rounded-full font-normal"
                        style={{ background: COLORS.teal + "20", color: COLORS.teal }}
                      >
                        LIVE
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-xs" style={{ color: COLORS.muted }}>
                      <Hash size={12} /> {debate.topic}
                    </div>
                  </div>
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center"
                    style={{ background: COLORS.surface2 }}
                  >
                    {debate.mode === "video" ? (
                      <Video size={18} style={{ color: COLORS.gold }} />
                    ) : debate.mode === "audio" ? (
                      <Mic size={18} style={{ color: COLORS.gold }} />
                    ) : (
                      <MessageSquare size={18} style={{ color: COLORS.gold }} />
                    )}
                  </div>
                </div>
                <div className="text-xs" style={{ color: COLORS.muted }}>
                  {new Date(debate.created_at).toLocaleDateString("fr-FR", {
                    day: "numeric",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <CreateDebateModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        currentUserId={currentUserId}
        onSuccess={(room) => {
          setIsCreateOpen(false);
          setActiveDebateCode(room.invite_code);
        }}
      />
    </>
  );
}
