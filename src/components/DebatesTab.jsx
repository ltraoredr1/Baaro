import { useState, useEffect, useRef } from "react";
import { Swords, Video, LogIn, Loader2, Plus, MessageCircle, Users, Sparkles, Send } from "lucide-react";
import { COLORS } from "../theme.js";
import { useToast } from "./ToastContext.jsx";
import { DebateRoom } from "./DebateRoom.jsx";
import { useDebates } from "../hooks/useDebates.js";

export function DebatesTab({ onRewardPoints, userName = "Vous", userId }) {
  const { showToast, showPointsReward } = useToast();
  const chatEndRef = useRef(null);

  // Hook personnalisé pour la gestion des salons de débat
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
  const [messageInput, setMessageInput] = useState(""); // État local propre pour la saisie
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newRoomTitle, setNewRoomTitle] = useState("");
  const [newRoomTopic, setNewRoomTopic] = useState("");
  const [newRoomMode, setNewRoomMode] = useState("text");
  const [newRoomAiEnabled, setNewRoomAiEnabled] = useState(true);
  const [joinCodeInput, setJoinCodeInput] = useState("");
  const [showJoinField, setShowJoinField] = useState(false);
  const [creating, setCreating] = useState(false);
  const [joining, setJoining] = useState(false);

  // Session d'appel vidéo
  const [callSession, setCallSession] = useState(null);

  // Récupérer le chat du salon actif
  const roomChat = useRoomChat(activeRoomId);

  // Charger les salons au montage
  useEffect(() => {
    if (userId) {
      loadRooms();
    }
  }, [userId]);

  // Définir le premier salon comme actif si aucun n'est sélectionné
  useEffect(() => {
    if (rooms.length > 0 && (!activeRoomId || !rooms.some(r => r.id === activeRoomId))) {
      setActiveRoomId(rooms[0].id);
    }
  }, [rooms]);

  // Défiler automatiquement vers le dernier message
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [roomChat?.messages, roomChat?.aiThinking]);

  const activeRoom = rooms.find((r) => r.id === activeRoomId) || rooms[0];

  // Envoi de message texte
  const handleSendMessage = async () => {
    if (!messageInput.trim() || !roomChat?.sendText) return;
    const textToSend = messageInput.trim();
    setMessageInput(""); // Vider le champ immédiatement
    await roomChat.sendText(textToSend);
  };

  // Interroger l'IA
  const handleAskAI = async () => {
    if (!roomChat?.askAI) return;
    const prompt = messageInput.trim() || activeRoom?.topic || "Donne un argument structuré sur ce débat.";
    setMessageInput("");
    await roomChat.askAI(prompt);
  };

  // Créer un salon
  const handleCreateRoom = async (e) => {
    e.preventDefault();
    if (!newRoomTitle.trim()) {
      showToast("Veuillez donner un titre au débat", "error");
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
        if (onRewardPoints) onRewardPoints(20);
        if (showPointsReward) showPointsReward(20, "Salon de débat créé !");
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
        if (onRewardPoints) onRewardPoints(10);
        if (showPointsReward) showPointsReward(10, "Live rejoint !");
      } else {
        showToast(result.reason || "Code invalide", "error");
      }
    } catch (error) {
      showToast("Erreur lors de l'accès au salon", "error");
    } finally {
      setJoining(false);
    }
  };

  // Démarrer / Rejoindre la vidéo
  const handleStartVideoDebate = () => {
    if (!activeRoom) return showToast("Aucun salon sélectionné", "error");
    setCallSession({ mode: "host", room: activeRoom, userId });
  };

  const handleJoinVideo = () => {
    if (!activeRoom) return showToast("Aucun salon sélectionné", "error");
    setCallSession({ mode: "guest", room: activeRoom, userId });
  };

  // Quitter un salon
  const handleLeaveRoom = async (roomId) => {
    if (window.confirm("Voulez-vous vraiment quitter ce salon ?")) {
      await leaveRoom(roomId);
      setActiveRoomId(null);
      showToast("Vous avez quitté le salon", "info");
    }
  };

  // Affichage du Live Vidéo
  if (callSession) {
    return (
      <DebateRoom
        mode={callSession.mode}
        room={callSession.room}
        userName={userName}
        userId={userId}
        onLeave={() => {
          setCallSession(null);
          loadRooms();
        }}
      />
    );
  }

  // Écran de chargement initial
  if (loadingRooms) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <Loader2 className="animate-spin" size={40} style={{ color: COLORS.gold }} />
        <p className="mt-4 text-sm" style={{ color: COLORS.muted }}>Chargement des arènes de débat...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 max-w-4xl mx-auto w-full pb-20">
      {/* En-tête */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2" style={{ color: COLORS.gold }}>
            <Swords size={22} style={{ color: COLORS.gold }} />
            Arènes de Débats en Direct
          </h2>
          <p className="text-xs" style={{ color: COLORS.muted }}>
            {rooms.length} salon{rooms.length > 1 ? 's' : ''} disponible{rooms.length > 1 ? 's' : ''}
          </p>
        </div>
        <button
          onClick={() => setShowCreateForm(!showCreateForm)}
          className="px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1 transition active:scale-95"
          style={{ background: COLORS.gold, color: COLORS.bg }}
        >
          <Plus size={14} />
          Créer un salon
        </button>
      </div>

      {/* Formulaire de création */}
      {showCreateForm && (
        <form onSubmit={handleCreateRoom} className="rounded-2xl p-4 border flex flex-col gap-3" style={{ background: COLORS.surface, borderColor: COLORS.borderGold }}>
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
            {['text', 'voice', 'video'].map((m) => (
              <label key={m} className="flex items-center gap-1.5 text-xs capitalize cursor-pointer" style={{ color: COLORS.ivory }}>
                <input
                  type="radio"
                  name="roomMode"
                  value={m}
                  checked={newRoomMode === m}
                  onChange={() => setNewRoomMode(m)}
                />
                {m === 'text' ? '📝 Texte' : m === 'voice' ? '🎤 Vocal' : '📹 Vidéo'}
              </label>
            ))}
          </div>
          <label className="flex items-center gap-2 text-xs cursor-pointer" style={{ color: COLORS.ivory }}>
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
              className="flex-1 py-2 rounded-xl text-xs font-bold disabled:opacity-50"
              style={{ background: COLORS.gold, color: COLORS.bg }}
            >
              {creating ? <Loader2 className="animate-spin mx-auto" size={14} /> : 'Créer (+20 pts)'}
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
        </form>
      )}

      {/* Barre d'action rapide */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="flex gap-2 flex-1">
          <button
            onClick={handleStartVideoDebate}
            disabled={!activeRoom}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold disabled:opacity-50"
            style={{ background: COLORS.gold, color: COLORS.bg }}
          >
            <Video size={15} />
            Démarrer le Live
          </button>
          <button
            onClick={handleJoinVideo}
            disabled={!activeRoom || activeRoom.mode === "text"}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold border disabled:opacity-50"
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
            {joining ? <Loader2 className="animate-spin" size={14} /> : 'Rejoindre'}
          </button>
        </form>
      )}

      {/* Grille principale : Liste des salons + Chat */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Liste des salons */}
        <div className="rounded-2xl p-4 border flex flex-col gap-3" style={{ background: COLORS.surface, borderColor: COLORS.border }}>
          <span className="text-xs font-bold uppercase tracking-wider" style={{ color: COLORS.muted }}>Vos Salons</span>

          {rooms.length === 0 ? (
            <div className="text-center py-8">
              <MessageCircle size={32} style={{ color: COLORS.muted }} className="mx-auto opacity-50" />
              <p className="text-xs mt-2" style={{ color: COLORS.muted }}>Aucun salon actif</p>
            </div>
          ) : (
            <div className="flex flex-col gap-2 max-h-[450px] overflow-y-auto">
              {rooms.map((room) => {
                const isActive = room.id === activeRoomId;
                const isHost = room.host_id === userId;
                
                return (
                  <button
                    key={room.id}
                    onClick={() => setActiveRoomId(room.id)}
                    className="p-3 rounded-xl text-left transition border"
                    style={{
                      background: isActive ? COLORS.surface2 : 'transparent',
                      borderColor: isActive ? COLORS.borderGold : COLORS.border
                    }}
                  >
                    <div className="flex justify-between items-start">
                      <span className="text-[10px] font-bold uppercase" style={{ color: COLORS.teal }}>
                        {room.mode === 'video' ? '📹' : room.mode === 'voice' ? '🎤' : '📝'} {room.topic || 'Débat'}
                      </span>
                      {isHost && (
                        <span className="text-[8px] px-1.5 py-0.5 rounded font-bold" style={{ background: COLORS.gold, color: COLORS.bg }}>
                          Hôte
                        </span>
                      )}
                    </div>
                    <div className="text-xs font-bold mt-1 line-clamp-2" style={{ color: COLORS.ivory }}>
                      {room.title}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Vue du salon actif */}
        <div className="md:col-span-2 rounded-2xl p-5 border flex flex-col gap-4" style={{ background: COLORS.surface, borderColor: COLORS.borderGold }}>
          {activeRoom ? (
            <>
              <div className="flex justify-between items-start">
                <div>
                  <span className="text-xs font-mono px-2.5 py-0.5 rounded-full" style={{ background: COLORS.tealGlow, color: COLORS.teal }}>
                    {activeRoom.mode === 'video' ? '📹 Live Vidéo' : activeRoom.mode === 'voice' ? '🎤 Live Vocal' : '📝 Débat Texte'}
                  </span>
                  <h3 className="text-lg font-bold mt-2" style={{ color: COLORS.ivory }}>{activeRoom.title}</h3>
                  <p className="text-xs mt-1" style={{ color: COLORS.muted }}>
                    {activeRoom.topic && `Thème: ${activeRoom.topic}`}
                    {activeRoom.ai_enabled && ' · 🤖 IA active'}
                  </p>
                </div>
                {activeRoom.host_id === userId && (
                  <button
                    onClick={() => endRoom(activeRoom.id)}
                    className="text-xs px-3 py-1 rounded-lg border hover:bg-red-500/10"
                    style={{ borderColor: 'rgba(239,68,68,0.3)', color: '#EF4444' }}
                  >
                    Terminer
                  </button>
                )}
              </div>

              {/* Chat en direct */}
              <div className="flex flex-col gap-3 flex-1 min-h-[280px] max-h-[380px] overflow-y-auto p-3 rounded-xl border" style={{ background: COLORS.bg, borderColor: COLORS.border }}>
                {roomChat?.loading ? (
                  <div className="flex items-center justify-center h-full">
                    <Loader2 className="animate-spin" size={20} style={{ color: COLORS.muted }} />
                  </div>
                ) : !roomChat?.messages || roomChat.messages.length === 0 ? (
                  <div className="text-center text-xs py-8" style={{ color: COLORS.muted }}>
                    <MessageCircle size={24} className="mx-auto opacity-50" />
                    <p className="mt-2">Aucun message pour le moment</p>
                    <p>Posez le premier argument !</p>
                  </div>
                ) : (
                  roomChat.messages.map((msg) => {
                    const isAI = msg.sender_type === 'ai';
                    const isSystem = msg.sender_type === 'system';
                    const isMine = msg.sender_id === userId;
                    
                    return (
                      <div 
                        key={msg.id || Math.random()} 
                        className={`p-2.5 rounded-xl text-xs max-w-[85%] ${
                          isAI ? 'self-start bg-purple-900/20 border border-purple-500/30' :
                          isSystem ? 'self-center bg-amber-500/10 border border-amber-500/20 text-center w-full max-w-full' :
                          isMine ? 'self-end bg-teal-900/30 border border-teal-500/30' :
                          'self-start bg-white/5 border border-white/10'
                        }`}
                      >
                        <div className="flex justify-between items-start gap-2">
                          <span className="font-bold" style={{ color: isAI ? '#A855F7' : isMine ? COLORS.teal : COLORS.gold }}>
                            {isAI ? '🤖 IA Co-hôte' : isSystem ? '📢 Système' : isMine ? 'Vous' : `Participant ${msg.sender_id?.slice(0,4)}`}
                          </span>
                          <span className="text-[8px]" style={{ color: COLORS.muted }}>
                            {msg.created_at ? new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                          </span>
                        </div>
                        <p className="mt-1 leading-relaxed" style={{ color: COLORS.ivory }}>
                          {msg.text}
                        </p>
                      </div>
                    );
                  })
                )}
                {roomChat?.aiThinking && (
                  <div className="self-start p-2.5 rounded-xl text-xs flex items-center gap-2 bg-purple-900/20 border border-purple-500/30">
                    <Loader2 className="animate-spin" size={14} style={{ color: '#A855F7' }} />
                    <span style={{ color: '#A855F7' }}>L'IA analyse les arguments...</span>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>

              {/* Zone de saisie corrigée */}
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Écrivez votre argument..."
                  value={messageInput}
                  onChange={(e) => setMessageInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSendMessage();
                  }}
                  className="flex-1 bg-transparent border rounded-xl px-3 py-2 text-sm outline-none"
                  style={{ borderColor: COLORS.border, color: COLORS.ivory }}
                />
                
                {activeRoom.ai_enabled && (
                  <button
                    type="button"
                    onClick={handleAskAI}
                    disabled={roomChat?.aiThinking}
                    className="px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1 border hover:bg-purple-500/10"
                    style={{ borderColor: 'rgba(168,85,247,0.4)', color: '#A855F7' }}
                    title="Demander une intervention de l'IA"
                  >
                    <Sparkles size={14} />
                    IA
                  </button>
                )}

                <button
                  type="button"
                  onClick={handleSendMessage}
                  disabled={!messageInput.trim()}
                  className="px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1 disabled:opacity-50"
                  style={{ background: COLORS.gold, color: COLORS.bg }}
                >
                  <Send size={14} />
                </button>
              </div>

              <div className="flex justify-between text-[10px]" style={{ color: COLORS.muted }}>
                <span>{roomChat?.messages?.length || 0} intervention(s)</span>
                <button
                  onClick={() => handleLeaveRoom(activeRoom.id)}
                  className="hover:underline text-red-400"
                >
                  Quitter le salon
                </button>
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center py-12">
              <Swords size={40} style={{ color: COLORS.muted }} className="opacity-30" />
              <p className="mt-3 text-sm" style={{ color: COLORS.muted }}>Sélectionnez ou créez un salon pour commencer</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
