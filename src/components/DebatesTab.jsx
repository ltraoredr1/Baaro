import { useState, useEffect } from "react";
import { Swords, Plus, Hash, Users, MessageSquare, Mic, Video } from "lucide-react";
import { COLORS } from "../theme.js";
import { supabase } from "../supabaseClient.js";
import { CreateDebateModal } from "./CreateDebateModal.jsx";
import { DebateRoom } from "./DebateRoom.jsx";

export function DebatesTab({ currentUserId }) {
  const [debates, setDebates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [activeDebateCode, setActiveDebateCode] = useState(null);

  // Charger les débats au montage
  useEffect(() => {
    if (!currentUserId) return;
    fetchDebates();

    // Écouter les nouveaux débats en temps réel
    const channel = supabase
      .channel("public:debate_rooms")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "debate_rooms" },
        () => fetchDebates()
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [currentUserId]);

  const fetchDebates = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("debate_rooms")
        .select(`
          id, title, topic, mode, invite_code, status, created_at, creator_id,
          debate_participants (user_id)
        `)
        .eq("status", "active")
        .order("created_at", { ascending: false });

      if (error) throw error;

      const debatesWithCount = (data || []).map(debate => ({
        ...debate,
        participantsCount: debate.debate_participants?.length || 0
      }));

      setDebates(debatesWithCount);
    } catch (error) {
      console.error("Erreur chargement débats:", error);
    } finally {
      setLoading(false);
    }
  };

  // Quand un débat est créé avec succès
  const handleDebateCreated = (newRoom) => {
    setIsCreateOpen(false);
    setActiveDebateCode(newRoom.invite_code);
    fetchDebates(); // Rafraîchir la liste
  };

  // Si un débat est actif, afficher la salle
  if (activeDebateCode) {
    return (
      <DebateRoom
        inviteCode={activeDebateCode}
        currentUserId={currentUserId}
        onBack={() => setActiveDebateCode(null)}
      />
    );
  }

  // Sinon afficher la liste
  return (
    <>
      <div className="flex flex-col h-full p-4">
        {/* Header avec bouton Créer */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold flex items-center gap-2" style={{ color: COLORS.ivory }}>
            <Swords size={24} style={{ color: COLORS.gold }} />
            Débats en cours
          </h2>
          <button
            onClick={() => setIsCreateOpen(true)}
            className="px-4 py-2 rounded-xl font-bold text-sm flex items-center gap-2 transition-all hover:scale-105 active:scale-95"
            style={{ background: COLORS.gold, color: "#000" }}
          >
            <Plus size={16} />
            Créer
          </button>
        </div>

        {/* Liste des débats */}
        <div className="flex-1 overflow-y-auto custom-scrollbar space-y-3">
          {loading ? (
            <div className="text-center py-10" style={{ color: COLORS.muted }}>
              <div className="animate-spin inline-block w-6 h-6 border-2 border-current border-t-transparent rounded-full mb-2" />
              <p className="text-sm">Chargement des débats...</p>
            </div>
          ) : debates.length === 0 ? (
            <div className="text-center py-10">
              <div 
                className="w-20 h-20 rounded-full mx-auto mb-4 flex items-center justify-center"
                style={{ background: COLORS.surface }}
              >
                <Swords size={40} style={{ color: COLORS.muted }} />
              </div>
              <p className="font-bold mb-2" style={{ color: COLORS.ivory }}>Aucun débat actif</p>
              <p className="text-sm mb-4" style={{ color: COLORS.muted }}>
                Soyez le premier à lancer un débat !
              </p>
              <button
                onClick={() => setIsCreateOpen(true)}
                className="px-6 py-3 rounded-xl font-bold text-sm flex items-center gap-2 mx-auto"
                style={{ background: COLORS.gold, color: "#000" }}
              >
                <Plus size={16} />
                Créer un débat
              </button>
            </div>
          ) : (
            debates.map((debate) => (
              <div
                key={debate.id}
                onClick={() => setActiveDebateCode(debate.invite_code)}
                className="p-4 rounded-2xl border cursor-pointer hover:border-amber-400/50 transition-all group"
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
                    <div className="flex items-center gap-2 text-xs mb-3" style={{ color: COLORS.muted }}>
                      <Hash size={12} />
                      {debate.topic}
                    </div>
                  </div>
                  <div 
                    className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
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

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 text-xs" style={{ color: COLORS.muted }}>
                    <span className="flex items-center gap-1">
                      <Users size={12} />
                      {debate.participantsCount} participant{debate.participantsCount > 1 ? "s" : ""}
                    </span>
                    <span>•</span>
                    <span>
                      {new Date(debate.created_at).toLocaleDateString("fr-FR", {
                        day: "numeric",
                        month: "short"
                      })}
                    </span>
                  </div>
                  <span 
                    className="text-[10px] font-bold px-2 py-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                    style={{ background: COLORS.gold, color: "#000" }}
                  >
                    REJOINDRE →
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Modale de création */}
      <CreateDebateModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        currentUserId={currentUserId}
        onSuccess={handleDebateCreated}
      />
    </>
  );
}
