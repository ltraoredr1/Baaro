import { useState, useEffect } from "react";
import { Swords, ThumbsUp, ThumbsDown, Video, LogIn, Loader2, Plus, MessageCircle, Users, Sparkles } from "lucide-react";
import { COLORS } from "../theme.js";
import { useToast } from "./ToastContext.jsx";
import { DebateRoom } from "./DebateRoom.jsx";
import { useDebates } from "../hooks/useDebates.js";

export function DebatesTab({ onRewardPoints, userName = "Vous", userId }) {
  const { showToast, showPointsReward } = useToast();
  
  // Utilisation du hook existant
  const { 
    rooms, 
    loadingRooms, 
    createRoom, 
    joinByCode, 
    leaveRoom, 
    endRoom, 
    refreshRooms: loadRooms,
    useRoomChat 
  } = useDebates(userId);

  // États locaux
  const [activeRoomId, setActiveRoomId] = useState(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newRoomTitle, setNewRoomTitle] = useState("");
  const [newRoomTopic, setNewRoomTopic] = useState("");
  const [newRoomMode, setNewRoomMode] = useState("text");
  const [newRoomAiEnabled, setNewRoomAiEnabled] = useState(true);
  const [joinCodeInput, setJoinCodeInput] = useState("");
  const [showJoinField, setShowJoinField] = useState(false);
  const [creating, setCreating] = useState(false);
  const [joining, setJoining] = useState(false);
  const [localInputText, setLocalInputText] = useState("");

  // Session d'appel vidéo (pour DebateRoom)
  const [callSession, setCallSession] = useState(null);

  // Récupérer le chat du salon actif
  const roomChat = useRoomChat(activeRoomId);

  // Charger les salons au montage
  useEffect(() => {
    if (userId) {
      loadRooms();
    }
  }, [userId]);

  // Définir le premier salon actif automatiquement
  useEffect(() => {
    if (rooms.length > 0 && !activeRoomId) {
      setActiveRoomId(rooms[0].id);
    }
  }, [rooms]);

  const activeRoom = rooms.find((r) => r.id === activeRoomId) || rooms[0];

  // Créer un salon
  const handleCreateRoom = async (e) => {
    e.preventDefault();
    if (!newRoomTitle.trim()) {
      showToast("Veuillez donner un titre", "error");
      return;
    }

    setCreating(true);
    try {
      const result = await createRoom({
        title: newRoomTitle.trim(),
        topic: newRoomTopic.trim() || "Débat général",
        mode: newRoomMode,
        maxParticipants: 50,
        aiEnabled: newRoomAiEnabled
      });

      if (result.ok) {
        showToast("Salon créé avec succès !", "success");
        setNewRoomTitle("");
        setNewRoomTopic("");
        setShowCreateForm(false);
        if (result.room) {
          setActiveRoomId(result.room.id);
        }
        onRewardPoints(20);
        showPointsReward(20, "Salon de débat créé !");
      } else {
        showToast(result.reason || "Erreur lors de la création", "error");
      }
    } catch (error) {
      showToast("Erreur lors de la création", "error");
    } finally {
      setCreating(false);
    }
  };

  // Rejoindre par code
  const handleJoinByCode = async (e) => {
    e.preventDefault();
    const code = joinCodeInput.trim().toUpperCase();
    if (code.length !== 8) {
      showToast("Le code doit contenir 8 caractères", "error");
      return;
    }

    setJoining(true);
    try {
      const result = await joinByCode(code);
      if (result.ok) {
        showToast("Vous avez rejoint le live !", "success");
        setJoinCodeInput("");
        setShowJoinField(false);
        if (result.room) {
          setActiveRoomId(result.room.id);
        }
        onRewardPoints(10);
        showPointsReward(10, "Live rejoint !");
      } else {
        showToast(result.reason || "Code invalide", "error");
      }
    } catch (error) {
      showToast("Erreur lors du rejoignement", "error");
    } finally {
      setJoining(false);
    }
  };

  // Démarrer un débat vidéo
  const handleStartVideoDebate = () => {
    if (!activeRoom) {
      showToast("Aucun salon sélectionné", "error");
      return;
    }
    setCallSession({ 
      mode: "host", 
      room: activeRoom,
      userId: userId
    });
  };

  // Rejoindre un appel vidéo depuis un salon
  const handleJoinVideo = () => {
    if (!activeRoom) {
      showToast("Aucun salon sélectionné", "error");
      return;
    }
    setCallSession({ 
      mode: "guest", 
      room: activeRoom,
      userId: userId
    });
  };

  // Quitter un salon
  const handleLeaveRoom = async (roomId) => {
    if (window.confirm("Voulez-vous vraiment quitter ce salon ?")) {
      await leaveRoom(roomId);
      setActiveRoomId(null);
      showToast("Vous avez quitté le salon", "info");
    }
  };

  // Pendant un appel vidéo actif
  if (callSession) {
    return (
      <DebateRoom
        mode={callSession.mode}
        debate={callSession.room}
        inviteCode={callSession.room?.invite_code}
        userName={userName}
        userId={userId}
        onLeave={() => {
          setCallSession(null);
          loadRooms();
        }}
      />
    );
  }

  // Affichage du chargement
  if (loadingRooms) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <Loader2 className="animate-spin" size={40} style={{ color: COLORS.gold }} />
        <p className="mt-4 text-sm" style={{ color: COLORS.muted }}>Chargement des salons de débat...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 max-w-4xl mx-auto w-full pb-20">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-bold text-gradient-gold flex items-center gap-2">
            <Swords size={22} style={{ color: COLORS.gold }} />
            Arènes de Débats en Direct
          </h2>
          <p className="text-xs" style={{ color: COLORS.muted }}>
            {rooms.length} salon{rooms.length > 1 ? 's' : ''} actif{rooms.length > 1 ? 's' : ''}
          </p>
        </div>
        <button
          onClick={() => setShowCreateForm(!showCreateForm)}
          className="px-4 py-2 rounded-xl text-xs font-bold gold-glow flex items-center gap-1"
          style={{ background: COLORS.gold, color: COLORS.bg }}
        >
          <Plus size={14} />
          Créer un salon
        </button>
      </div>

      {/* Formulaire de création */}
      {showCreateForm && (
        <form onSubmit={handleCreateRoom} className="glass-card rounded-2xl p-4 border" style={{ borderColor: COLORS.borderGold }}>
          <div className="flex flex-col gap-3">
            <input
              type="text"
              placeholder="Titre du débat *"
              value={newRoomTitle}
              onChange={(e) => setNewRoomTitle(e.target.value)}
              className="bg-transparent border rounded-xl px-3 py-2 text-sm outline-none"
              style={{ borderColor: COLORS.border, color: COLORS.ivory }}
            />
            <input
              type="text"
              placeholder="Thème (optionnel)"
              value={newRoomTopic}
              onChange={(e) => setNewRoomTopic(e.target.value)}
              className="bg-transparent border rounded-xl px-3 py-2 text-sm outline-none"
              style={{ borderColor: COLORS.border, color: COLORS.ivory }}
            />
            <div className="flex gap-4">
              <label className="flex items-center gap-2 text-xs" style={{ color: COLORS.ivory }}>
                <input
                  type="radio"
                  value="text"
                  checked={newRoomMode === "text"}
                  onChange={() => setNewRoomMode("text")}
                />
                📝 Texte
              </label>
              <label className="flex items-center gap-2 text-xs" style={{ color: COLORS.ivory }}>
                <input
                  type="radio"
                  value="voice"
                  checked={newRoomMode === "voice"}
                  onChange={() => setNewRoomMode("voice")}
                />
                🎤 Vocal
              </label>
              <label className="flex items-center gap-2 text-xs" style={{ color: COLORS.ivory }}>
                <input
                  type="radio"
                  value="video"
                  checked={newRoomMode === "video"}
                  onChange={() => setNewRoomMode("video")}
                />
                📹 Vidéo
              </label>
            </div>
            <label className="flex items-center gap-2 text-xs" style={{ color: COLORS.ivory }}>
              <input
                type="checkbox"
                checked={newRoomAiEnabled}
                onChange={() => setNewRoomAiEnabled(!newRoomAiEnabled)}
              />
              🤖 Activer l'IA co-animatrice
            </label>
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={creating}
                className="flex-1 py-2 rounded-xl text-xs font-bold gold-glow disabled:opacity-50"
                style={{ background: COLORS.gold, color: COLORS.bg }}
              >
                {creating ? <Loader2 className="animate-spin inline" size={14} /> : 'Créer (+20 pts)'}
              </button>
              <button
                type="button"
                onClick={() => setShowCreateForm(false)}
                className="px-4 py-2 rounded-xl text-xs font-bold border"
                style={{ borderColor: COLORS.border, color: COLORS.muted }}
              >
                Annuler
              </button>
            </div>
          </div>
        </form>
      )}

      {/* Actions */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="flex gap-2 flex-1">
          <button
            onClick={handleStartVideoDebate}
            disabled={!activeRoom}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold gold-glow disabled:opacity-50"
            style={{ background: COLORS.gold, color: COLORS.bg }}
          >
            <Video size={15} />
            Démarrer le Live
          </button>
          <button
            onClick={handleJoinVideo}
            disabled={!activeRoom || activeRoom.mode === "text"}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold border"
            style={{ borderColor: COLORS.borderTeal, color: COLORS.teal, background: COLORS.surface }}
          >
            <Users size={15} />
            Rejoindre le Live
          </button>
        </div>
        <button
          onClick={() => setShowJoinField((v) => !v)}
          className="px-4 py-2.5 rounded-xl text-xs font-bold border"
          style={{ borderColor: COLORS.borderTeal, color: COLORS.teal, background: COLORS.surface }}
        >
          <LogIn size={15} className="inline mr-1" />
          Code
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
            disabled={joining}
            className="px-4 py-2 rounded-xl text-xs font-bold"
            style={{ background: COLORS.teal, color: COLORS.bg }}
          >
            {joining ? <Loader2 className="animate-spin inline" size={14} /> : 'Rejoindre'}
          </button>
        </form>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Liste des salons */}
        <div className="glass-card rounded-2xl p-4 border flex flex-col gap-3" style={{ borderColor: COLORS.border }}>
          <span className="text-xs font-bold uppercase tracking-wider" style={{ color: COLORS.muted }}>Vos Salons</span>

          {rooms.length === 0 ? (
            <div className="text-center py-8">
              <MessageCircle size={32} style={{ color: COLORS.muted }} className="mx-auto opacity-50" />
              <p className="text-xs mt-2" style={{ color: COLORS.muted }}>Aucun salon actif</p>
              <p className="text-[10px]" style={{ color: COLORS.muted }}>Créez-en un ou rejoignez par code</p>
            </div>
          ) : (
            <div className="flex flex-col gap-2 max-h-[500px] overflow-y-auto">
              {rooms.map((room) => {
                const isActive = room.id === activeRoomId;
                const isHost = room.host_id === userId;
                
                return (
                  <button
                    key={room.id}
                    onClick={() => setActiveRoomId(room.id)}
                    className={`p-3 rounded-xl text-left transition border ${isActive ? "gold-glow" : "hover:bg-white/5"}`}
                    style={{
                      background: isActive ? COLORS.surface2 : COLORS.surface,
                      borderColor: isActive ? COLORS.borderGold : COLORS.border
                    }}
                  >
                    <div className="flex justify-between items-start">
                      <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: COLORS.teal }}>
                        {room.mode === 'video' ? '📹' : room.mode === 'voice' ? '🎤' : '📝'} {room.topic || 'Débat'}
                      </div>
                      {isHost && (
                        <span className="text-[8px] px-1.5 py-0.5 rounded" style={{ background: COLORS.gold, color: COLORS.bg }}>
                          Hôte
                        </span>
                      )}
                    </div>
                    <div className="text-xs font-bold mt-1 leading-snug line-clamp-2" style={{ color: COLORS.ivory }}>
                      {room.title}
                    </div>
                    <div className="text-[10px] mt-1" style={{ color: COLORS.muted }}>
                      {room.status === 'active' ? '🟢 En cours' : '🔴 Terminé'}
                      {room.ai_enabled && ' 🤖 IA'}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Vue du salon actif */}
        <div className="md:col-span-2 glass-card rounded-2xl p-5 border flex flex-col gap-4" style={{ borderColor: COLORS.borderGold }}>
          {activeRoom ? (
            <>
              <div className="flex justify-between items-start">
                <div>
                  <span className="text-xs font-mono px-2.5 py-0.5 rounded-full" style={{ background: COLORS.tealGlow, color: COLORS.teal }}>
                    {activeRoom.mode === 'video' ? '📹 Live Vidéo' : activeRoom.mode === 'voice' ? '🎤 Live Vocal' : '📝 Débat Texte'}
                  </span>
                  <h3 className="text-lg font-bold mt-2" style={{ color: COLORS.ivory }}>{activeRoom.title}</h3>
                  <div className="text-xs mt-1" style={{ color: COLORS.muted }}>
                    {activeRoom.topic && `Thème: ${activeRoom.topic}`}
                    {activeRoom.ai_enabled && ' · 🤖 IA active'}
                  </div>
                </div>
                {activeRoom.host_id === userId && (
                  <button
                    onClick={() => endRoom(activeRoom.id)}
                    className="text-xs px-3 py-1 rounded-lg border"
                    style={{ borderColor: 'rgba(239,68,68,0.3)', color: '#EF4444' }}
                  >
                    Terminer
                  </button>
                )}
              </div>

              {/* Chat en direct */}
              <div className="flex flex-col gap-3 flex-1 min-h-[300px] max-h-[400px] overflow-y-auto p-3 rounded-xl border" style={{ background: COLORS.surface, borderColor: COLORS.border }}>
                {roomChat.loading ? (
                  <div className="flex items-center justify-center h-full">
                    <Loader2 className="animate-spin" size={20} style={{ color: COLORS.muted }} />
                  </div>
                ) : roomChat.messages.length === 0 ? (
                  <div className="text-center text-xs py-8" style={{ color: COLORS.muted }}>
                    <MessageCircle size={24} className="mx-auto opacity-50" />
                    <p className="mt-2">Aucun message</p>
                    <p>Soyez le premier à lancer le débat !</p>
                  </div>
                ) : (
                  roomChat.messages.map((msg) => {
                    const isAI = msg.sender_type === 'ai';
                    const isSystem = msg.sender_type === 'system';
                    const isMine = msg.sender_id === userId;
                    
                    return (
                      <div 
                        key={msg.id} 
                        className={`p-2.5 rounded-xl text-xs max-w-[85%] ${
                          isAI ? 'self-start bg-gradient-to-r from-purple-500/20 to-pink-500/20 border border-purple-500/20' :
                          isSystem ? 'self-center bg-amber-500/10 border border-amber-500/20 text-center w-full max-w-full' :
                          isMine ? 'self-end bg-teal-500/20 border border-teal-500/20' :
                          'self-start bg-white/5 border border-white/10'
                        }`}
                        style={{ borderColor: isAI ? 'rgba(168,85,247,0.3)' : isMine ? COLORS.borderTeal : 'rgba(255,255,255,0.05)' }}
                      >
                        <div className="flex justify-between items-start gap-2">
                          <span className="font-bold" style={{ color: isAI ? '#A855F7' : isMine ? COLORS.teal : COLORS.gold }}>
                            {isAI ? '🤖 IA' : isSystem ? '📢 Système' : isMine ? 'Moi' : `Participant ${msg.sender_id?.slice(0,4)}`}
                          </span>
                          <span className="text-[8px]" style={{ color: COLORS.muted }}>
                            {new Date(msg.created_at).toLocaleTimeString()}
                          </span>
                        </div>
                        <p className="mt-1 leading-relaxed" style={{ color: isSystem ? COLORS.muted : COLORS.ivory }}>
                          {msg.text}
                        </p>
                      </div>
                    );
                  })
                )}
                {roomChat.aiThinking && (
                  <div className="self-start p-2.5 rounded-xl text-xs flex items-center gap-2" style={{ background: 'rgba(168,85,247,0.1)', border: '1px solid rgba(168,85,247,0.2)' }}>
                    <Loader2 className="animate-spin" size={14} />
                    <span style={{ color: '#A855F7' }}>L'IA réfléchit...</span>
                  </div>
                )}
              </div>

              {/* Zone de saisie */}
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Écrivez votre argument..."
                  value={localInputText}
                  onChange={(e) => setLocalInputText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && localInputText.trim()) {
                      roomChat.sendText(localInputText);
                      setLocalInputText("");
                    }
                  }}
                  className="flex-1 bg-transparent border rounded-xl px-3 py-2 text-sm outline-none"
                  style={{ borderColor: COLORS.border, color: COLORS.ivory }}
                />
                {activeRoom.ai_enabled && (
                  <button
                    onClick={() => roomChat.askAI(activeRoom.topic)}
                    disabled={roomChat.aiThinking}
                    className="px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1"
                    style={{ background: 'rgba(168,85,247,0.2)', color: '#A855F7', border: '1px solid rgba(168,85,247,0.3)' }}
                  >
                    <Sparkles size={14} />
                    IA
                  </button>
                )}
                <button
                  onClick={() => {
                    if (localInputText.trim()) {
                      roomChat.sendText(localInputText);
                      setLocalInputText("");
                    }
                  }}
                  className="px-4 py-2 rounded-xl text-xs font-bold gold-glow"
                  style={{ background: COLORS.gold, color: COLORS.bg }}
                >
                  Envoyer
                </button>
              </div>

              <div className="flex justify-between text-[10px]" style={{ color: COLORS.muted }}>
                <span>{roomChat.messages.length} messages</span>
                <button
                  onClick={() => handleLeaveRoom(activeRoom.id)}
                  className="hover:underline"
                  style={{ color: '#EF4444' }}
                >
                  Quitter le salon
                </button>
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center py-12">
              <Swords size={40} style={{ color: COLORS.muted }} className="opacity-30" />
              <p className="mt-3 text-sm" style={{ color: COLORS.muted }}>Sélectionnez un salon ou rejoignez-en un</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
    }
