// src/components/DebateRoom.jsx
// Salle d'appel vidéo Daily.co pour un débat BAARO.
// Avec messagerie privée entre participants.

import { useState, useEffect, useRef, useCallback } from "react";
import { 
  Mic, MicOff, Video, VideoOff, PhoneOff, Copy, Check, 
  Users, Loader2, MessageCircle, X, Send 
} from "lucide-react";
import { COLORS } from "../theme.js";
import { useToast } from "./ToastContext.jsx";
import {
  startLive,
  joinLiveByCode,
  leaveLive,
  enableMic,
  enableCamera,
  subscribeToEvents,
  getCallObject,
} from "../lib/webrtc.js";
import { useDebateMessaging } from "../hooks/useDebateMessaging.js";
import { DebatePrivateChat } from "./DebatePrivateChat.jsx";

export function DebateRoom({ mode, debate, inviteCode: joinCode, userName, userId, onLeave }) {
  const { showToast } = useToast();
  
  // États Daily
  const [status, setStatus] = useState("connecting");
  const [errorMsg, setErrorMsg] = useState("");
  const [inviteCode, setInviteCode] = useState(mode === "guest" ? joinCode : null);
  const [participants, setParticipants] = useState({});
  const [micOn, setMicOn] = useState(mode === "host");
  const [camOn, setCamOn] = useState(mode === "host");
  const [copied, setCopied] = useState(false);
  
  // États pour le chat privé
  const [showParticipantsList, setShowParticipantsList] = useState(false);
  const [selectedParticipant, setSelectedParticipant] = useState(null);
  const [messageInput, setMessageInput] = useState("");
  const [isChatOpen, setIsChatOpen] = useState(false);

  const videoRefs = useRef({});
  const roomNameRef = useRef(null);
  const messagesEndRef = useRef(null);

  // Hook de messagerie privée
  const {
    privateChats,
    activePrivateChat,
    openPrivateChat,
    sendPrivateMessage,
    closePrivateChat,
    sending: sendingPrivate,
    messages: privateMessages,
    loading: loadingPrivate
  } = useDebateMessaging(debate?.id, userId);

  const attachTrack = useCallback((participantId, track) => {
    const el = videoRefs.current[participantId];
    if (!el || !track) return;
    el.srcObject = new MediaStream([track]);
  }, []);

  const refreshParticipants = useCallback(() => {
    const callObject = getCallObject();
    if (!callObject) return;
    const all = callObject.participants();
    setParticipants(all);
    Object.values(all).forEach((p) => {
      if (p.tracks?.video?.track) attachTrack(p.session_id, p.tracks.video.track);
    });
  }, [attachTrack]);

  // Connexion au live
  useEffect(() => {
    let cancelled = false;

    async function connect() {
      try {
        if (mode === "host") {
          const result = await startLive({ userName, debateId: debate?.id });
          if (cancelled) return;
          roomNameRef.current = result.roomName;
          setInviteCode(result.inviteCode);
        } else {
          if (!joinCode) throw new Error("Code d'invitation manquant");
          await joinLiveByCode({ inviteCode: joinCode, userName, isHost: false });
          if (cancelled) return;
          roomNameRef.current = joinCode;
        }

        subscribeToEvents({
          onParticipantJoined: refreshParticipants,
          onParticipantLeft: refreshParticipants,
          onTrackStarted: refreshParticipants,
          onError: (e) => {
            console.error("Erreur Daily:", e);
            if (!cancelled) {
              setStatus("error");
              setErrorMsg("Connexion perdue avec le débat");
            }
          },
        });

        refreshParticipants();
        if (!cancelled) setStatus("live");
      } catch (err) {
        console.error(err);
        if (!cancelled) {
          setStatus("error");
          setErrorMsg(err.message || "Impossible de rejoindre le débat");
        }
      }
    }

    connect();

    return () => {
      cancelled = true;
      leaveLive({ roomName: roomNameRef.current, isHost: mode === "host" });
    };
  }, [mode, joinCode, userName, debate?.id, refreshParticipants]);

  // Scroll automatique des messages privés
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [privateMessages]);

  const handleToggleMic = () => {
    const next = !micOn;
    setMicOn(next);
    enableMic(next);
  };

  const handleToggleCamera = () => {
    const next = !camOn;
    setCamOn(next);
    enableCamera(next);
  };

  const handleLeave = async () => {
    await leaveLive({ roomName: roomNameRef.current, isHost: mode === "host" });
    closePrivateChat();
    onLeave?.();
  };

  const handleCopyCode = async () => {
    if (!inviteCode) return;
    await navigator.clipboard.writeText(inviteCode);
    setCopied(true);
    showToast("Code copié !", "success");
    setTimeout(() => setCopied(false), 2000);
  };

  // Envoyer un message privé
  const handleSendPrivateMessage = async () => {
    if (!messageInput.trim() || !activePrivateChat) return;
    await sendPrivateMessage(messageInput);
    setMessageInput("");
  };

  // Ouvrir une conversation avec un participant
  const handleOpenChat = async (participantId) => {
    if (participantId === userId) return;
    await openPrivateChat(participantId);
    setSelectedParticipant(participantId);
    setIsChatOpen(true);
  };

  const participantList = Object.values(participants);

  // Filtrer les participants pour la sidebar
  const participantsForSidebar = participantList.filter(p => {
    // Exclure l'utilisateur courant
    if (p.user_name === userName || p.local) return false;
    return true;
  });

  if (status === "connecting") {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-20">
        <Loader2 className="animate-spin" size={28} style={{ color: COLORS.gold }} />
        <span className="text-sm" style={{ color: COLORS.muted }}>Connexion au débat…</span>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-20 text-center px-6">
        <span className="text-sm font-bold" style={{ color: "#EC4899" }}>{errorMsg}</span>
        <button
          onClick={onLeave}
          className="px-4 py-2 rounded-xl text-xs font-bold"
          style={{ background: COLORS.gold, color: COLORS.bg }}
        >
          Retour aux débats
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 max-w-4xl mx-auto w-full pb-24">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold" style={{ color: COLORS.ivory }}>
            {debate?.title || "Débat en direct"}
          </h2>
          <div className="flex items-center gap-3 text-xs" style={{ color: COLORS.muted }}>
            <div className="flex items-center gap-1">
              <Users size={12} />
              <span>
                {participantList.length} participant{participantList.length > 1 ? "s" : ""}
              </span>
            </div>
            <div className="flex items-center gap-1">
              <MessageCircle size={12} />
              <span>
                {Object.keys(privateChats).length} conversation{Object.keys(privateChats).length > 1 ? "s" : ""}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Bouton participants / chat privé */}
          <button
            onClick={() => setShowParticipantsList(!showParticipantsList)}
            className="relative p-2 rounded-lg border hover:bg-white/5 transition"
            style={{ borderColor: COLORS.border, color: COLORS.ivory }}
          >
            <MessageCircle size={18} />
            {Object.values(privateChats).some(c => c.unreadCount > 0) && (
              <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-red-500 rounded-full animate-pulse" />
            )}
          </button>

          {mode === "host" && inviteCode && (
            <button
              onClick={handleCopyCode}
              className="flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-bold"
              style={{ borderColor: COLORS.borderGold, color: COLORS.gold, background: COLORS.surface2 }}
            >
              {copied ? <Check size={14} /> : <Copy size={14} />}
              <span className="font-mono tracking-widest">{inviteCode}</span>
            </button>
          )}
        </div>
      </div>

      {/* Corps principal avec sidebar */}
      <div className="flex gap-4">
        {/* Grille vidéo principale */}
        <div className="flex-1">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {participantList.map((p) => (
              <div
                key={p.session_id}
                className="relative aspect-video rounded-xl overflow-hidden border flex items-center justify-center group"
                style={{ background: COLORS.surface, borderColor: COLORS.border }}
              >
                <video
                  ref={(el) => {
                    videoRefs.current[p.session_id] = el;
                    if (el && p.tracks?.video?.track) attachTrack(p.session_id, p.tracks.video.track);
                  }}
                  autoPlay
                  playsInline
                  muted={p.local}
                  className="w-full h-full object-cover"
                />
                <span
                  className="absolute bottom-1.5 left-1.5 text-[10px] font-bold px-2 py-0.5 rounded-full"
                  style={{ background: "rgba(0,0,0,0.6)", color: COLORS.ivory }}
                >
                  {p.user_name || (p.local ? "Vous" : "Participant")}
                </span>

                {/* Bouton chat privé sur le participant */}
                {!p.local && (
                  <button
                    onClick={() => handleOpenChat(p.user_id || p.session_id)}
                    className="absolute top-1.5 right-1.5 p-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition bg-black/60 hover:bg-black/80"
                  >
                    <MessageCircle size={14} style={{ color: COLORS.ivory }} />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Sidebar des participants (chat privé) */}
        {showParticipantsList && (
          <div 
            className="w-64 border rounded-xl p-3 overflow-y-auto flex-shrink-0 max-h-[400px]"
            style={{ borderColor: COLORS.border, background: 'rgba(0,0,0,0.3)' }}
          >
            <div className="flex justify-between items-center mb-3">
              <span className="text-xs font-bold uppercase tracking-wider" style={{ color: COLORS.muted }}>
                Participants
              </span>
              <button 
                onClick={() => setShowParticipantsList(false)} 
                className="p-1 hover:bg-white/5 rounded-lg"
              >
                <X size={14} style={{ color: COLORS.muted }} />
              </button>
            </div>

            {participantsForSidebar.length === 0 ? (
              <p className="text-xs text-center" style={{ color: COLORS.muted }}>
                Aucun autre participant
              </p>
            ) : (
              participantsForSidebar.map((p) => {
                const hasChat = Object.values(privateChats).some(c => 
                  c.otherUser?.id === p.user_id || c.otherUser?.username === p.user_name
                );
                const hasUnread = Object.values(privateChats).some(c => 
                  (c.otherUser?.id === p.user_id || c.otherUser?.username === p.user_name) && 
                  c.unreadCount > 0
                );

                return (
                  <button
                    key={p.session_id}
                    onClick={() => handleOpenChat(p.user_id || p.session_id)}
                    className={`flex items-center gap-3 w-full p-2 rounded-lg hover:bg-white/5 text-left relative ${
                      selectedParticipant === p.user_id ? 'bg-white/5' : ''
                    }`}
                  >
                    <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold"
                      style={{ background: COLORS.tealGlow, color: COLORS.teal }}
                    >
                      {p.user_name?.[0] || '?'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{p.user_name || 'Participant'}</p>
                      <p className="text-[10px]" style={{ color: hasChat ? COLORS.teal : COLORS.muted }}>
                        {hasChat ? '💬 Discuter' : 'Nouvelle conversation'}
                      </p>
                    </div>
                    {hasUnread && (
                      <span className="w-2 h-2 bg-red-500 rounded-full flex-shrink-0" />
                    )}
                  </button>
                );
              })
            )}
          </div>
        )}
      </div>

      {/* Contrôles */}
      <div className="fixed bottom-16 left-0 right-0 flex justify-center gap-3 z-20">
        <button
          onClick={handleToggleMic}
          className="w-12 h-12 rounded-full flex items-center justify-center border"
          style={{
            background: micOn ? COLORS.surface2 : "#EC4899",
            borderColor: COLORS.border,
            color: micOn ? COLORS.ivory : "#fff",
          }}
        >
          {micOn ? <Mic size={18} /> : <MicOff size={18} />}
        </button>

        <button
          onClick={handleToggleCamera}
          className="w-12 h-12 rounded-full flex items-center justify-center border"
          style={{
            background: camOn ? COLORS.surface2 : "#EC4899",
            borderColor: COLORS.border,
            color: camOn ? COLORS.ivory : "#fff",
          }}
        >
          {camOn ? <Video size={18} /> : <VideoOff size={18} />}
        </button>

        <button
          onClick={handleLeave}
          className="w-12 h-12 rounded-full flex items-center justify-center"
          style={{ background: "#EC4899", color: "#fff" }}
        >
          <PhoneOff size={18} />
        </button>
      </div>

      {/* Modal de chat privé */}
      <DebatePrivateChat
        isOpen={!!activePrivateChat}
        onClose={() => {
          closePrivateChat();
          setIsChatOpen(false);
        }}
        chatData={activePrivateChat}
        userId={userId}
        onSendMessage={sendPrivateMessage}
        onSendFile={(file) => sendPrivateMessage('', file)}
        sending={sendingPrivate}
      />
    </div>
  );
                                                  }
