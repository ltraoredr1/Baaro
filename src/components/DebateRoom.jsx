import { useState, useEffect, useRef, useCallback } from "react";
import {
  ArrowLeft,
  Send,
  Users,
  Hash,
  MessageSquare,
  Mic,
  MicOff,
  PhoneOff,
  Volume2,
} from "lucide-react";
import { COLORS } from "../theme.js";
import { supabase } from "../supabaseClient.js";
import {
  joinLiveByCode,
  leaveLive,
  enableMic,
  enableCamera,
  subscribeToEvents,
  getCallObject,
  getParticipants,
} from "../lib/webrtc.js";

export function DebateRoom({ inviteCode, currentUserId, onBack }) {
  const [room, setRoom] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Vocal
  const [isVoiceMode, setIsVoiceMode] = useState(false);
  const [micOn, setMicOn] = useState(false);
  const [voiceConnecting, setVoiceConnecting] = useState(false);
  const [participants, setParticipants] = useState({});
  const [voiceError, setVoiceError] = useState(null);
  const [dailyRoomName, setDailyRoomName] = useState(null);
  // Rôle réel calculé côté serveur ('host' | 'co_host' | 'viewer'),
  // renvoyé par joinLiveByCode()/joinLive(). Ne PAS le déduire localement
  // de room.host_id : ça ne tient pas compte d'une promotion co-hôte.
  const [myRole, setMyRole] = useState("viewer");
  const canBroadcast = myRole === "host" || myRole === "co_host";
  // Conservé pour l'UI (ex: bouton "terminer le live" réservé à l'hôte
  // d'origine) — distinct de canBroadcast qui gère mic/caméra.
  const isRoomOwner = room?.host_id === currentUserId;

  const messagesEndRef = useRef(null);
  const profilesCache = useRef({});
  const voiceStarted = useRef(false);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // ===== Chargement de la salle + messages =====
  useEffect(() => {
    let isMounted = true;
    let channel = null;

    const loadDebate = async () => {
      try {
        // Recherche robuste (insensible à la casse + statut actif)
        const { data: roomData, error: roomError } = await supabase
          .from("debate_rooms")
          .select(
            "id, title, topic, mode, invite_code, status, created_at, host_id, daily_room_name"
          )
          .ilike("invite_code", inviteCode)
          .eq("status", "active")
          .maybeSingle();

        if (roomError || !roomData) {
          if (isMounted) {
            setError("Salle introuvable");
            setLoading(false);
          }
          return;
        }

        if (isMounted) {
          setRoom(roomData);
          setIsVoiceMode(roomData.mode === "audio" || roomData.mode === "video");
          if (roomData.daily_room_name) {
            setDailyRoomName(roomData.daily_room_name);
          }
        }

        // Messages
        const { data: msgsData } = await supabase
          .from("debate_messages")
          .select("id, text, created_at, user_id")
          .eq("room_id", roomData.id)
          .order("created_at", { ascending: true })
          .limit(200);

        if (msgsData && isMounted) {
          const uniqueUserIds = [
            ...new Set(msgsData.map((m) => m.user_id).filter(Boolean)),
          ];
          let profilesMap = { ...profilesCache.current };

          if (uniqueUserIds.length > 0) {
            const missing = uniqueUserIds.filter((id) => !profilesMap[id]);
            if (missing.length > 0) {
              const { data: profiles } = await supabase
                .from("profiles")
                .select("user_id, display_name, avatar_url, flag")
                .in("user_id", missing);
              (profiles || []).forEach((p) => {
                profilesMap[p.user_id] = p;
              });
              profilesCache.current = profilesMap;
            }
          }

          setMessages(
            msgsData.map((m) => ({
              ...m,
              profile: profilesMap[m.user_id] || {
                display_name: "Membre",
                flag: "🌍",
              },
            }))
          );
        }

        // Realtime messages
        channel = supabase
          .channel(`room_${roomData.id}`)
          .on(
            "postgres_changes",
            {
              event: "INSERT",
              schema: "public",
              table: "debate_messages",
              filter: `room_id=eq.${roomData.id}`,
            },
            async (payload) => {
              let profile = profilesCache.current[payload.new.user_id];
              if (!profile && payload.new.user_id) {
                const { data } = await supabase
                  .from("profiles")
                  .select("display_name, avatar_url, flag")
                  .eq("user_id", payload.new.user_id)
                  .maybeSingle();
                profile = data || { display_name: "Membre", flag: "🌍" };
                profilesCache.current[payload.new.user_id] = profile;
              }
              if (isMounted) {
                setMessages((prev) => [
                  ...prev,
                  {
                    ...payload.new,
                    profile: profile || { display_name: "Membre", flag: "🌍" },
                  },
                ]);
              }
            }
          )
          .subscribe();
      } catch (err) {
        if (isMounted) setError(err.message);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadDebate();

    return () => {
      isMounted = false;
      if (channel) supabase.removeChannel(channel);
    };
  }, [inviteCode, currentUserId]);

  // ===== Connexion vocale automatique si mode audio/video =====
  useEffect(() => {
    if (!room || !isVoiceMode || voiceStarted.current || !inviteCode) return;

    const startVoice = async () => {
      setVoiceConnecting(true);
      setVoiceError(null);
      voiceStarted.current = true;

      try {
        const userName =
          profilesCache.current[currentUserId]?.display_name || "Participant";

        // joinLiveByCode() ne prend plus de paramètre isHost : le rôle est
        // désormais déterminé côté serveur (table debate_participants) et
        // renvoyé ici. C'est cette valeur qu'il faut utiliser, pas une
        // comparaison locale à room.host_id.
        const { role } = await joinLiveByCode({
          inviteCode: room.invite_code,
          userName,
          audioOnly: room.mode === "audio",
        });

        setMyRole(role);
        const shouldStartMedia = role === "host" || role === "co_host";

        enableMic(shouldStartMedia);
        setMicOn(shouldStartMedia);

        if (room.mode === "video") {
          enableCamera(shouldStartMedia);
        }

        const updateParticipants = () => {
          setParticipants(getParticipants());
        };
        updateParticipants();

        subscribeToEvents({
          onParticipantJoined: updateParticipants,
          onParticipantLeft: updateParticipants,
          onTrackStarted: updateParticipants,
          onTrackStopped: updateParticipants,
          onError: (e) => {
            console.error("Daily error:", e);
            setVoiceError(JSON.stringify(e, Object.getOwnPropertyNames(e)) || String(e));
          },
        });
      } catch (err) {
        console.error("Erreur vocal:", err);
        setVoiceError(
          JSON.stringify(err, Object.getOwnPropertyNames(err)) || String(err)
        );
        voiceStarted.current = false;
      } finally {
        setVoiceConnecting(false);
      }
    };

    startVoice();
  }, [room, isVoiceMode, inviteCode, currentUserId]);

  // Cleanup vocal au démontage
  useEffect(() => {
    return () => {
      leaveLive({ roomName: dailyRoomName, isHost: isRoomOwner }).catch(() => {});
    };
  }, [dailyRoomName, isRoomOwner]);

  const toggleMic = () => {
    if (!canBroadcast) return; // un viewer n'a pas la permission côté serveur de toute façon
    const next = !micOn;
    enableMic(next);
    setMicOn(next);
  };

  const handleLeaveVoice = async () => {
    await leaveLive({ roomName: dailyRoomName, isHost: isRoomOwner });
    voiceStarted.current = false;
    setMicOn(false);
    setMyRole("viewer");
    setParticipants({});
    onBack();
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!newMessage.trim() || !room || !currentUserId) return;

    const text = newMessage.trim();
    setNewMessage("");

    try {
      const { error } = await supabase.from("debate_messages").insert({
        room_id: room.id,
        user_id: currentUserId,
        text,
      });
      if (error) throw error;
    } catch (err) {
      console.error("Erreur envoi:", err);
      setNewMessage(text);
    }
  };

  if (error) {
    return (
      <div
        className="flex flex-col items-center justify-center h-full p-6"
        style={{ background: COLORS.surface }}
      >
        <p className="text-red-400 font-bold text-lg mb-2">⚠️ {error}</p>
        <button
          onClick={onBack}
          className="px-6 py-3 rounded-xl font-bold"
          style={{ background: COLORS.gold, color: "#000" }}
        >
          Retour
        </button>
      </div>
    );
  }

  if (loading) {
    return (
      <div
        className="flex flex-col items-center justify-center h-full"
        style={{ background: COLORS.surface }}
      >
        <div className="animate-spin w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full mb-4" />
        <p style={{ color: COLORS.ivory }}>Chargement de la salle...</p>
      </div>
    );
  }

  const participantCount = Object.keys(participants).length;

  return (
    <div className="flex flex-col h-full" style={{ background: COLORS.surface }}>
      {/* Header */}
      <div
        className="flex items-center gap-3 p-4 border-b"
        style={{ borderColor: COLORS.border }}
      >
        <button
          onClick={handleLeaveVoice}
          className="p-2 rounded-full hover:bg-white/10"
          style={{ color: COLORS.ivory }}
        >
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1">
          <h2
            className="font-bold text-sm flex items-center gap-2"
            style={{ color: COLORS.ivory }}
          >
            {room?.title}
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-500/20 text-green-400 font-normal">
              LIVE
            </span>
            {isVoiceMode && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 font-normal flex items-center gap-1">
                <Volume2 size={10} /> VOCAL
              </span>
            )}
            {myRole === "co_host" && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-teal-500/20 text-teal-300 font-normal">
                CO-HÔTE
              </span>
            )}
          </h2>
          <p className="text-xs flex items-center gap-1" style={{ color: COLORS.muted }}>
            <Hash size={12} /> {room?.topic}
          </p>
        </div>
        <div
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full"
          style={{ background: COLORS.surface2 }}
        >
          <Users size={14} style={{ color: COLORS.gold }} />
          <span className="text-xs" style={{ color: COLORS.ivory }}>
            {participantCount || "–"}
          </span>
        </div>
      </div>

      {/* Barre vocale */}
      {isVoiceMode && (
        <div
          className="px-4 py-3 border-b flex items-center justify-between gap-3"
          style={{ borderColor: COLORS.border, background: COLORS.surface2 }}
        >
          {voiceConnecting ? (
            <p className="text-xs" style={{ color: COLORS.muted }}>
              Connexion audio…
            </p>
          ) : voiceError ? (
            <p className="text-xs text-red-400 break-all">{voiceError}</p>
          ) : canBroadcast ? (
            <p className="text-xs flex items-center gap-1.5" style={{ color: COLORS.teal }}>
              <Volume2 size={14} />
              Mode vocal actif
            </p>
          ) : (
            <p className="text-xs flex items-center gap-1.5" style={{ color: COLORS.muted }}>
              <Volume2 size={14} />
              Vous regardez en spectateur
            </p>
          )}

          <div className="flex items-center gap-2">
            {canBroadcast && (
              <button
                onClick={toggleMic}
                disabled={voiceConnecting || !!voiceError}
                className="p-3 rounded-full transition disabled:opacity-40"
                style={{
                  background: micOn ? COLORS.gold : "rgba(239,68,68,0.2)",
                  color: micOn ? "#000" : "#ef4444",
                }}
                title={micOn ? "Couper le micro" : "Activer le micro"}
              >
                {micOn ? <Mic size={18} /> : <MicOff size={18} />}
              </button>
            )}

            <button
              onClick={handleLeaveVoice}
              className="p-3 rounded-full"
              style={{ background: "rgba(239,68,68,0.25)", color: "#ef4444" }}
              title="Quitter le live"
            >
              <PhoneOff size={18} />
            </button>
          </div>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 ? (
          <div className="text-center py-10" style={{ color: COLORS.muted }}>
            <MessageSquare size={48} className="mx-auto mb-3 opacity-50" />
            <p className="text-sm">Soyez le premier à donner votre avis !</p>
          </div>
        ) : (
          messages.map((msg) => {
            const isMe = msg.user_id === currentUserId;
            const profile = isMe
              ? { display_name: "Moi", flag: "🌍" }
              : msg.profile;

            return (
              <div
                key={msg.id}
                className={`flex gap-2 ${isMe ? "flex-row-reverse" : "flex-row"}`}
              >
                {!isMe && (
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center text-xs shrink-0 border overflow-hidden"
                    style={{
                      borderColor: COLORS.borderGold,
                      background: COLORS.surface2,
                    }}
                  >
                    {profile.avatar_url ? (
                      <img
                        src={profile.avatar_url}
                        className="w-full h-full object-cover"
                        alt=""
                      />
                    ) : (
                      profile.flag
                    )}
                  </div>
                )}
                <div
                  className={`max-w-[75%] px-4 py-2.5 rounded-2xl text-sm ${
                    isMe ? "rounded-tr-sm" : "rounded-tl-sm"
                  }`}
                  style={{
                    background: isMe ? COLORS.gold : COLORS.surface2,
                    color: isMe ? "#000" : COLORS.ivory,
                  }}
                >
                  {!isMe && (
                    <p
                      className="text-[10px] font-bold mb-1"
                      style={{ color: COLORS.gold }}
                    >
                      {profile.display_name} {profile.flag}
                    </p>
                  )}
                  <p>{msg.text}</p>
                  <p
                    className={`text-[10px] mt-1.5 ${
                      isMe ? "text-black/60" : "text-gray-400"
                    }`}
                  >
                    {new Date(msg.created_at).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input chat */}
      <form
        onSubmit={handleSendMessage}
        className="p-4 border-t flex gap-2"
        style={{ borderColor: COLORS.border }}
      >
        <input
          type="text"
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          placeholder="Participez au débat..."
          className="flex-1 px-4 py-3 rounded-xl border text-sm outline-none"
          style={{
            background: COLORS.surface2,
            borderColor: COLORS.border,
            color: COLORS.ivory,
          }}
        />
        <button
          type="submit"
          disabled={!newMessage.trim()}
          className="p-3 rounded-xl disabled:opacity-50"
          style={{ background: COLORS.gold, color: "#000" }}
        >
          <Send size={18} />
        </button>
      </form>
    </div>
  );
}
