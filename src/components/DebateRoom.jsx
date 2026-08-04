import { useState, useEffect, useRef, useCallback } from "react";
import {
  ArrowLeft,
  Send,
  Users,
  Hash,
  MessageSquare,
  Mic,
  MicOff,
  Video,
  VideoOff,
  PhoneOff,
  Volume2,
  Star,
  Loader2,
} from "lucide-react";
import { COLORS } from "../theme.js";
import { supabase } from "../supabaseClient.js";
import {
  joinLiveByCode,
  leaveLive,
  enableMic,
  enableCamera,
  subscribeToEvents,
  getParticipants,
  upgradeLocalRole,
  promoteToCoHost,
  demoteToViewer,
} from "../lib/webrtc.js";

/** Attache une MediaStreamTrack vidéo à un <video> */
function attachTrackToVideo(videoEl, track) {
  if (!videoEl || !track) return;
  try {
    const stream = new MediaStream([track]);
    videoEl.srcObject = stream;
    const p = videoEl.play();
    if (p && typeof p.catch === "function") p.catch(() => {});
  } catch (e) {
    console.warn("attachTrackToVideo", e);
  }
}

function getVideoTrack(participant) {
  if (!participant?.tracks?.video) return null;
  const v = participant.tracks.video;
  return v.persistentTrack || v.track || null;
}

/** Tuile vidéo / avatar d'un participant */
function ParticipantTile({ participant, isVideoMode, isLocal, videoTrack }) {
  const videoRef = useRef(null);
  const track = videoTrack || getVideoTrack(participant);
  const hasVideo = isVideoMode && !!track && track.readyState !== "ended";

  useEffect(() => {
    if (hasVideo && videoRef.current) {
      attachTrackToVideo(videoRef.current, track);
    } else if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, [hasVideo, track]);

  const name = isLocal
    ? "Vous"
    : participant?.user_name || "Participant";

  return (
    <div
      className="relative rounded-2xl overflow-hidden border flex items-center justify-center"
      style={{
        background: COLORS.surface2,
        borderColor: COLORS.border,
        minHeight: isLocal ? 160 : 140,
        aspectRatio: "16/10",
      }}
    >
      {hasVideo ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={!!isLocal}
          className="absolute inset-0 w-full h-full object-cover"
          style={{ transform: isLocal ? "scaleX(-1)" : undefined }}
        />
      ) : (
        <div className="flex flex-col items-center gap-2 z-10">
          <div
            className="w-14 h-14 rounded-full flex items-center justify-center text-xl font-bold border"
            style={{
              background: COLORS.surface,
              borderColor: COLORS.borderGold,
              color: COLORS.gold,
            }}
          >
            {(name || "?")[0].toUpperCase()}
          </div>
          {!isVideoMode && (
            <Volume2 size={14} style={{ color: COLORS.muted }} />
          )}
        </div>
      )}

      <div
        className="absolute bottom-0 left-0 right-0 px-2 py-1.5 flex items-center gap-1.5 text-[11px] font-bold"
        style={{
          background: "linear-gradient(transparent, rgba(0,0,0,0.75))",
          color: "#fff",
        }}
      >
        <span className="truncate">{name}</span>
        {isLocal && (
          <span className="text-[9px] opacity-70 shrink-0">MOI</span>
        )}
      </div>
    </div>
  );
}

export function DebateRoom({ inviteCode, currentUserId: currentUserIdProp, onBack }) {
  const [resolvedUserId, setResolvedUserId] = useState(currentUserIdProp || null);
  const currentUserId = resolvedUserId || currentUserIdProp;

  useEffect(() => {
    if (currentUserIdProp) {
      setResolvedUserId(currentUserIdProp);
      return;
    }
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (data?.user?.id) setResolvedUserId(data.user.id);
    })();
  }, [currentUserIdProp]);

  const [room, setRoom] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [isVoiceMode, setIsVoiceMode] = useState(false);
  const [micOn, setMicOn] = useState(false);
  const [camOn, setCamOn] = useState(false);
  const [voiceConnecting, setVoiceConnecting] = useState(false);
  const [participants, setParticipants] = useState({});
  const [videoTracks, setVideoTracks] = useState({}); // session_id -> MediaStreamTrack
  const [voiceError, setVoiceError] = useState(null);
  const [dailyRoomName, setDailyRoomName] = useState(null);
  const [myRole, setMyRole] = useState("viewer");
  const [participantRoles, setParticipantRoles] = useState({});
  const [roleActionLoading, setRoleActionLoading] = useState(null);
  const [roleActionError, setRoleActionError] = useState(null);

  const isRoomOwner = !!(currentUserId && room?.host_id === currentUserId);
  const dbRole = currentUserId ? participantRoles[currentUserId] : null;
  const canBroadcast =
    isRoomOwner ||
    myRole === "host" ||
    myRole === "co_host" ||
    dbRole === "host" ||
    dbRole === "co_host";

  const messagesEndRef = useRef(null);
  const profilesCache = useRef({});
  const voiceStarted = useRef(false);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

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
          // daily_room_name = live Daily créé → forcer le mode média
          // même si la colonne mode est vide / "text" par erreur
          setIsVoiceMode(
            roomData.mode === "audio" ||
              roomData.mode === "video" ||
              !!roomData.daily_room_name
          );
          if (roomData.daily_room_name) {
            setDailyRoomName(roomData.daily_room_name);
          }
        }

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
          // Rôle en base = source de vérité (évite "Spectateur" à tort)
          const myDbRole = currentUserId ? rolesMap[currentUserId] : null;
          if (myDbRole === "host" || myDbRole === "co_host") {
            setMyRole(myDbRole);
          } else if (roomData.host_id === currentUserId) {
            setMyRole("host");
          }
        }

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
              if (!profile && payload.new.sender_id) {
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

              setParticipantRoles((prev) => ({
                ...prev,
                [row.user_id]: row.role,
              }));

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
                if (roomData.mode === "video") {
                  enableCamera(shouldBroadcast);
                  setCamOn(shouldBroadcast);
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

  useEffect(() => {
    if (!room || !isVoiceMode || voiceStarted.current || !inviteCode) return;

    let pollTimer = null;

    const startVoice = async () => {
      setVoiceConnecting(true);
      setVoiceError(null);
      voiceStarted.current = true;

      try {
        const userName =
          profilesCache.current[currentUserId]?.display_name || "Participant";

        const audioOnly =
          room.mode === "audio" ||
          (room.mode !== "video" && !room.daily_room_name);
        const { role: apiRole } = await joinLiveByCode({
          inviteCode: room.invite_code,
          userName,
          audioOnly,
        });

        // Source de vérité : host_id en base > rôle renvoyé par l'API
        // (évite le cas où l'hôte se retrouve "viewer" et n'émet rien)
        const isHostUser = !!(currentUserId && room.host_id === currentUserId);
        const dbRole = currentUserId ? participantRoles[currentUserId] : null;
        let role = apiRole || "viewer";
        if (isHostUser) role = "host";
        else if (dbRole === "host" || dbRole === "co_host") role = dbRole;
        else if (apiRole === "host" || apiRole === "co_host") role = apiRole;

        setMyRole(role);
        upgradeLocalRole(role);

        const shouldStartMedia = role === "host" || role === "co_host";

        enableMic(shouldStartMedia);
        setMicOn(shouldStartMedia);

        if (room.mode === "video") {
          enableCamera(shouldStartMedia);
          setCamOn(shouldStartMedia);
        }

        const updateParticipants = () => {
          setParticipants({ ...getParticipants() });
        };
        updateParticipants();

        subscribeToEvents({
          onParticipantJoined: updateParticipants,
          onParticipantLeft: (ev) => {
            updateParticipants();
            const sid = ev?.participant?.session_id;
            if (sid) {
              setVideoTracks((prev) => {
                const n = { ...prev };
                delete n[sid];
                return n;
              });
            }
          },
          onParticipantUpdated: updateParticipants,
          onTrackStarted: (ev) => {
            updateParticipants();
            if (ev?.track?.kind === "video" && ev?.participant?.session_id) {
              setVideoTracks((prev) => ({
                ...prev,
                [ev.participant.session_id]: ev.track,
              }));
            }
          },
          onTrackStopped: (ev) => {
            updateParticipants();
            if (ev?.track?.kind === "video" && ev?.participant?.session_id) {
              setVideoTracks((prev) => {
                const n = { ...prev };
                delete n[ev.participant.session_id];
                return n;
              });
            }
          },
          onError: (e) => {
            console.error("Daily error:", e);
            setVoiceError(
              JSON.stringify(e, Object.getOwnPropertyNames(e)) || String(e)
            );
          },
        });

        // Pistes déjà présentes au moment du join
        const existing = getParticipants();
        const initial = {};
        Object.values(existing).forEach((p) => {
          const t = getVideoTrack(p);
          if (t && p.session_id) initial[p.session_id] = t;
        });
        if (Object.keys(initial).length) setVideoTracks((prev) => ({ ...prev, ...initial }));

        pollTimer = setInterval(updateParticipants, 2000);
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

    return () => {
      if (pollTimer) clearInterval(pollTimer);
    };
  }, [room, isVoiceMode, inviteCode, currentUserId]);

  useEffect(() => {
    return () => {
      leaveLive({ roomName: dailyRoomName, isHost: isRoomOwner }).catch(
        () => {}
      );
    };
  }, [dailyRoomName, isRoomOwner]);

  const toggleMic = () => {
    if (!canBroadcast) return;
    const next = !micOn;
    enableMic(next);
    setMicOn(next);
  };

  const toggleCam = () => {
    if (!canBroadcast || room?.mode !== "video") return;
    const next = !camOn;
    enableCamera(next);
    setCamOn(next);
  };

  const handleLeaveVoice = async () => {
    await leaveLive({ roomName: dailyRoomName, isHost: isRoomOwner });
    voiceStarted.current = false;
    setMicOn(false);
    setCamOn(false);
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

  const participantList = Object.values(participants);
  const localParticipant = participantList.find((p) => p.local);
  const remoteParticipants = participantList.filter((p) => !p.local);
  const isVideoMode =
    room?.mode === "video" ||
    (!!room?.daily_room_name && room?.mode !== "audio");
  const otherForRoles = remoteParticipants.filter(
    (p) => p.user_id && p.user_id !== currentUserId
  );

  return (
    <div className="flex flex-col h-full" style={{ background: COLORS.surface }}>
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
        <div className="flex-1 min-w-0">
          <h2
            className="font-bold text-sm flex items-center gap-2 flex-wrap"
            style={{ color: COLORS.ivory }}
          >
            <span className="truncate">{room?.title}</span>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-500/20 text-green-400 font-normal shrink-0">
              LIVE
            </span>
            {isVoiceMode && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 font-normal flex items-center gap-1 shrink-0">
                <Volume2 size={10} />
                {isVideoMode ? "VIDÉO" : "VOCAL"}
              </span>
            )}
            {myRole === "co_host" && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-teal-500/20 text-teal-300 font-normal flex items-center gap-1 shrink-0">
                <Star size={10} /> CO-HÔTE
              </span>
            )}
          </h2>
          <p
            className="text-xs flex items-center gap-1"
            style={{ color: COLORS.muted }}
          >
            <Hash size={12} /> {room?.topic}
            {room?.invite_code && (
              <span className="ml-2 opacity-70">· Code {room.invite_code}</span>
            )}
          </p>
        </div>
        <div
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full shrink-0"
          style={{ background: COLORS.surface2 }}
        >
          <Users size={14} style={{ color: COLORS.gold }} />
          <span className="text-xs" style={{ color: COLORS.ivory }}>
            {participantList.length || "–"}
          </span>
        </div>
      </div>

      {isVoiceMode && (
        <div
          className="px-4 py-3 border-b"
          style={{ borderColor: COLORS.border }}
        >
          {voiceConnecting ? (
            <div
              className="flex flex-col items-center justify-center gap-3 py-10 rounded-2xl border"
              style={{ background: COLORS.surface2, borderColor: COLORS.border }}
            >
              <Loader2
                className="animate-spin"
                size={32}
                style={{ color: COLORS.gold }}
              />
              <p className="text-sm font-bold" style={{ color: COLORS.ivory }}>
                Connexion au live…
              </p>
              <p className="text-xs" style={{ color: COLORS.muted }}>
                Autorisez le micro
                {isVideoMode ? " et la caméra" : ""} si demandé
              </p>
            </div>
          ) : voiceError ? (
            <div className="p-4 rounded-xl bg-red-500/15 border border-red-500/40">
              <p className="text-xs text-red-400 break-all">{voiceError}</p>
            </div>
          ) : (
            <>
              <div
                className={`grid gap-2 mb-3 ${
                  remoteParticipants.length === 0
                    ? "grid-cols-1"
                    : remoteParticipants.length === 1
                      ? "grid-cols-2"
                      : "grid-cols-2 sm:grid-cols-3"
                }`}
              >
                {localParticipant && (
                  <ParticipantTile
                    participant={localParticipant}
                    isVideoMode={isVideoMode}
                    isLocal
                    videoTrack={videoTracks[localParticipant.session_id]}
                  />
                )}
                {remoteParticipants.map((p) => (
                  <ParticipantTile
                    key={p.session_id}
                    participant={p}
                    isVideoMode={isVideoMode}
                    isLocal={false}
                    videoTrack={videoTracks[p.session_id]}
                  />
                ))}
              </div>

              {remoteParticipants.length === 0 && (
                <div
                  className="text-center py-3 mb-2 rounded-xl border"
                  style={{
                    background: "rgba(245,158,11,0.08)",
                    borderColor: "rgba(245,158,11,0.25)",
                  }}
                >
                  <p
                    className="text-xs font-bold mb-1"
                    style={{ color: COLORS.gold }}
                  >
                    En attente d’autres participants…
                  </p>
                  <p className="text-[11px]" style={{ color: COLORS.muted }}>
                    Partagez le code{" "}
                    <span
                      className="font-mono font-bold"
                      style={{ color: COLORS.ivory }}
                    >
                      {room?.invite_code}
                    </span>{" "}
                    pour les inviter
                  </p>
                </div>
              )}

              <div className="flex items-center justify-center gap-3">
                {canBroadcast ? (
                  <>
                    <button
                      onClick={toggleMic}
                      className="p-3 rounded-full"
                      style={{
                        background: micOn
                          ? COLORS.gold
                          : "rgba(239,68,68,0.25)",
                        color: micOn ? "#000" : "#ef4444",
                      }}
                      title={micOn ? "Couper le micro" : "Activer le micro"}
                    >
                      {micOn ? <Mic size={18} /> : <MicOff size={18} />}
                    </button>
                    {isVideoMode && (
                      <button
                        onClick={toggleCam}
                        className="p-3 rounded-full"
                        style={{
                          background: camOn
                            ? COLORS.gold
                            : "rgba(239,68,68,0.25)",
                          color: camOn ? "#000" : "#ef4444",
                        }}
                        title={
                          camOn ? "Couper la caméra" : "Activer la caméra"
                        }
                      >
                        {camOn ? <Video size={18} /> : <VideoOff size={18} />}
                      </button>
                    )}
                  </>
                ) : (
                  <p className="text-[11px]" style={{ color: COLORS.muted }}>
                    Spectateur — micro et caméra désactivés
                  </p>
                )}
                <button
                  onClick={handleLeaveVoice}
                  className="p-3 rounded-full"
                  style={{
                    background: "rgba(239,68,68,0.25)",
                    color: "#ef4444",
                  }}
                  title="Quitter le live"
                >
                  <PhoneOff size={18} />
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {isRoomOwner && isVoiceMode && !voiceConnecting && (
        <div
          className="px-4 py-3 border-b"
          style={{ borderColor: COLORS.border }}
        >
          <p
            className="text-[10px] font-bold uppercase tracking-wider mb-2"
            style={{ color: COLORS.muted }}
          >
            Participants connectés
          </p>
          {roleActionError && (
            <p className="text-xs text-red-400 mb-2">{roleActionError}</p>
          )}
          {otherForRoles.length === 0 ? (
            <p className="text-xs" style={{ color: COLORS.muted }}>
              Personne d’autre n’est encore connecté.
            </p>
          ) : (
            <div className="flex flex-col gap-2 max-h-36 overflow-y-auto">
              {otherForRoles.map((p) => {
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
                        background:
                          role === "co_host"
                            ? "rgba(239,68,68,0.15)"
                            : COLORS.gold,
                        color: role === "co_host" ? "#ef4444" : "#000",
                      }}
                    >
                      {isLoadingThis
                        ? "…"
                        : role === "co_host"
                          ? "Rétrograder"
                          : "Co-hôte"}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

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
              : msg.profile || { display_name: "Membre", flag: "🌍" };

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
