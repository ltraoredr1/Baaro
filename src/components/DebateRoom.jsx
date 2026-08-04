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
  Star,
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
  upgradeLocalRole,
  promoteToCoHost,
  demoteToViewer,
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
  // renvoyé par joinLiveByCode()/joinLive(), et tenu à jour ensuite par
  // Realtime sur debate_participants (voir plus bas).
  const [myRole, setMyRole] = useState("viewer");
  const canBroadcast = myRole === "host" || myRole === "co_host";
  const isRoomOwner = room?.host_id === currentUserId;

  // Rôles de tous les participants du salon (user_id -> role), utilisés
  // pour afficher le panneau de promotion côté hôte.
  const [participantRoles, setParticipantRoles] = useState({});
  const [roleActionLoading, setRoleActionLoading] = useState(null); // user_id en cours d'action
  const [roleActionError, setRoleActionError] = useState(null);

  const messagesEndRef = useRef(null);
  const profilesCache = useRef({});
  const voiceStarted = useRef(false);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // ===== Chargement de la salle + messages + rôles =====
  useEffect(() => {
    let isMounted = true;
    let messagesChannel = null;
    let participantsChannel = null;

    const loadDebate = async () => {
      try {
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
          .select("id, text, created_at, sender_id, sender_type")
          .eq("room_id", roomData.id)
          .order("created_at", { ascending: true })
          .limit(200);

        if (msgsData && isMounted) {
          const uniqueUserIds = [
            ...new Set(msgsData.map((m) => m.sender_id).filter(Boolean)),
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
              profile: profilesMap[m.sender_id] || {
                display_name: "Membre",
                flag: "🌍",
              },
            }))
          );
        }

        // Rôles actuels de tous les participants du salon
        const { data: rolesData } = await supabase
          .from("debate_participants")
          .select("user_id, role")
          .eq("room_id", roomData.id)
          .is("left_at", null);

        if (isMounted) {
          const rolesMap = {};
          (rolesData || []).forEach((p) => {
            rolesMap[p.user_id] = p.role;
          });
          setParticipantRoles(rolesMap);
        }

        // Realtime messages
        messagesChannel = supabase
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
              let profile = profilesCache.current[payload.new.sender_id];
              if (!profile && payload.new.user_id) {
                const { data } = await supabase
                  .from("profiles")
                  .select("display_name, avatar_url, flag")
                  .eq("user_id", payload.new.sender_id)
                  .maybeSingle();
                profile = data || { display_name: "Membre", flag: "🌍" };
                profilesCache.current[payload.new.sender_id] = profile;
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

        // Realtime rôles (promotions/rétrogradations, arrivées/départs)
        participantsChannel = supabase
          .channel(`room_participants_${roomData.id}`)
          .on(
            "postgres_changes",
            {
              event: "*",
              schema: "public",
              table: "debate_participants",
              filter: `room_id=eq.${roomData.id}`,
            },
            (payload) => {
              const row =
                payload.new && Object.keys(payload.new).length
                  ? payload.new
                  : payload.old;
              if (!row?.user_id) return;

              if (payload.eventType === "DELETE") {
                setParticipantRoles((prev) => {
                  const copy = { ...prev };
                  delete copy[row.user_id];
                  return copy;
                });
                return;
              }

              setParticipantRoles((prev) => ({ ...prev, [row.user_id]: row.role }));

              // Si c'est MON rôle qui vient de changer (promotion ou
              // rétrogradation par l'hôte), applique-le immédiatement :
              // le serveur a déjà mis à jour les permissions Daily.
              if (
                row.user_id === currentUserId &&
                payload.eventType === "UPDATE" &&
                row.role !== "host"
              ) {
                upgradeLocalRole(row.role);
                setMyRole(row.role);
                const shouldBroadcast = row.role === "co_host";
                enableMic(shouldBroadcast);
                setMicOn(shouldBroadcast);
                if (isMounted && roomData.mode === "video") {
                  enableCamera(shouldBroadcast);
                }
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
      if (messagesChannel) supabase.removeChannel(messagesChannel);
      if (participantsChannel) supabase.removeChannel(participantsChannel);
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
    if (!canBroadcast) return;
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
        sender_id: currentUserId,
        sender_type: "user",
        text,
      });
      if (error) throw error;
    } catch (err) {
      console.error("Erreur envoi:", err);
      setNewMessage(text);
    }
  };

  // Promotion / rétrogradation, réservée à l'hôte d'origine du salon.
  // La mise à jour de participantRoles/myRole pour la cible arrive via
  // Realtime (voir ci-dessus) — pas besoin de le faire manuellement ici.
  const handleToggleCoHost = async (targetUserId, currentRole) => {
    if (!room || roleActionLoading) return;
    setRoleActionLoading(targetUserId);
    setRoleActionError(null);

    try {
      const dailyName = room.daily_room_name || dailyRoomName;
      if (currentRole === "co_host") {
        await demoteToViewer(room.id, targetUserId, dailyName);
      } else {
        await promoteToCoHost(room.id, targetUserId, dailyName);
      }
    } catch (err) {
      setRoleActionError(err.message || "Erreur lors du changement de rôle");
    } finally {
      setRoleActionLoading(null);
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
  // Participants Daily actifs, hors moi-même, pour le panneau de
  // promotion (être connecté au vocal permet une application immédiate ;
  // sinon le rôle change en base et s'appliquera à la prochaine connexion).
  const otherParticipants = Object.values(participants).filter(
    (p) => !p.local && p.user_id && p.user_id !== currentUserId
  );

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
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-teal-500/20 text-teal-300 font-normal flex items-center gap-1">
                <Star size={10} /> CO-HÔTE
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

      {/* Panneau de promotion co-hôte — réservé à l'hôte d'origine */}
      {isRoomOwner && isVoiceMode && (
        <div className="px-4 py-3 border-b" style={{ borderColor: COLORS.border }}>
          <p
            className="text-[10px] font-bold uppercase tracking-wider mb-2"
            style={{ color: COLORS.muted }}
          >
            Participants connectés au vocal
          </p>

          {roleActionError && (
            <p className="text-xs text-red-400 mb-2">{roleActionError}</p>
          )}

          {otherParticipants.length === 0 ? (
            <p className="text-xs" style={{ color: COLORS.muted }}>
              Personne d'autre n'est encore connecté au vocal.
            </p>
          ) : (
            <div className="flex flex-col gap-2 max-h-36 overflow-y-auto">
              {otherParticipants.map((p) => {
                const role = participantRoles[p.user_id] || "viewer";
                const isLoadingThis = roleActionLoading === p.user_id;
                return (
                  <div
                    key={p.session_id}
                    className="flex items-center justify-between gap-2 text-xs"
                  >
                    <span
                      className="flex items-center gap-1.5 truncate"
                      style={{ color: COLORS.ivory }}
                    >
                      {role === "co_host" && (
                        <Star size={12} style={{ color: COLORS.teal }} />
                      )}
                      {p.user_name || "Participant"}
                    </span>
                    <button
                      onClick={() => handleToggleCoHost(p.user_id, role)}
                      disabled={isLoadingThis}
                      className="px-2.5 py-1.5 rounded-lg font-bold shrink-0 disabled:opacity-50"
                      style={{
                        background: role === "co_host" ? "rgba(239,68,68,0.15)" : COLORS.gold,
                        color: role === "co_host" ? "#ef4444" : "#000",
                      }}
                    >
                      {isLoadingThis ? "…" : role === "co_host" ? "Rétrograder" : "Promouvoir"}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
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
            const isMe = msg.sender_id === currentUserId;
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
