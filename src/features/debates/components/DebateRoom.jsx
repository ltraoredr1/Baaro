import { useDebateLive } from "../hooks/useDebates.js";
import * as liveRoles from "../../../lib/liveRoles.js";
import { useState, useEffect, useRef, useCallback, memo } from "react";
import {
  ArrowLeft,
  Hash,
  Users,
  Send,
  Copy,
  Check,
  Mic,
  MicOff,
  Video,
  VideoOff,
  PhoneOff,
  Power,
} from "lucide-react";
import { COLORS } from "../../../theme.js";
import { supabase } from "../../../supabaseClient.js";

// Couleurs avec valeurs de secours
const C = {
  bg: (COLORS && COLORS.bg) || "#0f172a",
  surface: (COLORS && COLORS.surface) || "#111c33",
  surface2: (COLORS && COLORS.surface2) || "#1a2740",
  border: (COLORS && COLORS.border) || "rgba(148,163,184,0.2)",
  ivory: (COLORS && COLORS.ivory) || "#f8f5ec",
  muted: (COLORS && COLORS.muted) || "#94a3b8",
  gold: (COLORS && COLORS.gold) || "#d9ae52",
  teal: (COLORS && COLORS.teal) || "#2dbfa6",
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const DAILY_EVENTS = [
  "joined-meeting",
  "participant-joined",
  "participant-left",
  "participant-updated",
];

// Ajoute les messages inconnus (par id), triés par date : évite doublons entre envoi local, temps réel et rattrapage
function mergeMsgs(prev, incoming) {
  const seen = new Set(prev.map((m) => m.id));
  const add = (incoming || []).filter((m) => m && m.id && !seen.has(m.id));
  if (!add.length) return prev;
  return [...prev, ...add].sort(
    (a, b) => new Date(a.created_at) - new Date(b.created_at)
  );
}

// Les codes d'invitation sont alphanumériques : tout autre caractère (%, _, espace…) est refusé
// avant la recherche ilike, qui les interpréterait comme des jokers.
const CODE_RE = /^[a-z0-9]{4,12}$/i;

const ChatMessage = memo(function ChatMessage({ msg, currentId, name, isRoomHost }) {
  const isMe = msg.sender_id === currentId;
  const isAI = msg.sender_type === "ai";
  return (
    <div className={`flex gap-2 ${isMe ? "flex-row-reverse" : "flex-row"}`}>
      <div
        className={`max-w-[75%] px-4 py-2.5 rounded-2xl text-sm ${
          isMe ? "rounded-tr-sm" : "rounded-tl-sm"
        }`}
        style={{
          background: isMe
            ? C.gold
            : isAI
              ? "rgba(167,139,250,0.15)"
              : C.surface2,
          color: isMe ? "#000" : C.ivory,
        }}
      >
        {!isMe && (
          <p
            className="text-[11px] font-semibold mb-1 truncate"
            style={{ color: isAI ? "#a78bfa" : C.teal }}
          >
            {isAI ? "Assistant IA" : name || "Membre"}
            {isRoomHost && !isAI ? " · Hôte" : ""}
          </p>
        )}
        <p className="break-words">{msg.text}</p>
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
});

function ControlButton({ onClick, active, danger, label, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="flex flex-col items-center gap-1 active:scale-95 transition"
    >
      <span
        className="w-12 h-12 rounded-full flex items-center justify-center border"
        style={{
          background: danger
            ? "#dc2626"
            : active
              ? C.surface2
              : "rgba(239,68,68,0.2)",
          borderColor: danger ? "#dc2626" : C.border,
          color: danger ? "#fff" : active ? C.ivory : "#f87171",
        }}
      >
        {children}
      </span>
      <span className="text-[10px]" style={{ color: C.muted }}>
        {label}
      </span>
    </button>
  );
}

export function DebateRoom({ inviteCode, onBack }) {
  const [user_id, setUserId] = useState(null);
  const [room, setRoom] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [codeCopied, setCodeCopied] = useState(false);
  const [reopening, setReopening] = useState(false);
  const [reopenError, setReopenError] = useState(null);
  const [dbCount, setDbCount] = useState(0);
  const [liveState, setLiveState] = useState({ count: 0, mic: true, cam: true });
  const [profiles, setProfiles] = useState({}); // id utilisateur -> { display_name, ... }
  const [sendError, setSendError] = useState(null);
  const requestedProfilesRef = useRef(new Set());
  const messagesEndRef = useRef(null);
  const isHost = room?.host_id === user_id;
  const isEnded = room?.status === "ended";
  const live = useDebateLive(room, user_id, isHost);
  const roomId = room?.id;

  // ---- Chargement de la salle + messages ----
  useEffect(() => {
    let mounted = true;
    let channel = null;
    let poll = null;
    let onWake = null;

    const tryEq = async (column, value) => {
      const { data, error } = await supabase
        .from("debate_rooms")
        .select("*")
        .eq(column, value)
        .maybeSingle();
      return { data, error };
    };

    const init = async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        const uid = session?.user?.id;
        if (!uid) throw new Error("Non connecté");
        if (mounted) setUserId(uid);

        const raw = String(inviteCode || "").trim();
        if (!raw) throw new Error("Code de salle manquant");

        const codeLower = raw.toLowerCase();
        const codeUpper = raw.toUpperCase();
        const isUuid = UUID_RE.test(raw);
        // Refuse tout code contenant des caractères spéciaux (jokers ilike % et _)
        if (!isUuid && !CODE_RE.test(raw)) throw new Error("Code de salle invalide");

        let roomData = null;
        let roomErr = null;

        // Recherche progressive (casse mixte + UUID)
        if (isUuid) {
          ({ data: roomData, error: roomErr } = await tryEq("id", raw));
          if (!roomData && !roomErr) {
            ({ data: roomData, error: roomErr } = await tryEq(
              "invite_code",
              codeLower
            ));
          }
        } else {
          // 1) minuscules (format CreateDebateModal)
          ({ data: roomData, error: roomErr } = await tryEq(
            "invite_code",
            codeLower
          ));

          // 2) MAJUSCULES
          if (!roomData && !roomErr && codeUpper !== codeLower) {
            ({ data: roomData, error: roomErr } = await tryEq(
              "invite_code",
              codeUpper
            ));
          }

          // 3) casse exacte / mixte
          if (
            !roomData &&
            !roomErr &&
            raw !== codeLower &&
            raw !== codeUpper
          ) {
            ({ data: roomData, error: roomErr } = await tryEq(
              "invite_code",
              raw
            ));
          }

          // 4) ilike (insensible à la casse)
          if (!roomData && !roomErr) {
            const { data, error } = await supabase
              .from("debate_rooms")
              .select("*")
              .ilike("invite_code", codeLower)
              .maybeSingle();
            roomData = data;
            roomErr = error;
          }
        }

        if (roomErr) {
          console.error("debate_rooms select", roomErr);
          throw new Error(roomErr.message || "Salle introuvable");
        }
        if (!roomData) throw new Error("Salle introuvable");

        if (mounted) setRoom(roomData);

        // Participant : user_id = auth.users.id
        const { error: partErr } = await supabase
          .from("debate_participants")
          .upsert(
            {
              room_id: roomData.id,
              user_id: uid,
              role: roomData.host_id === uid ? "host" : "member",
              left_at: null,
            },
            { onConflict: "room_id,user_id" }
          );
        if (partErr) console.warn("participant upsert", partErr.message);

        const { data: msgs } = await supabase
          .from("debate_messages")
          .select("*")
          .eq("room_id", roomData.id)
          .order("created_at", { ascending: true })
          .limit(200);
        if (mounted) setMessages(msgs || []);

        channel = supabase
          .channel(`room:${roomData.id}:${Date.now()}`)
          .on(
            "postgres_changes",
            {
              event: "INSERT",
              schema: "public",
              table: "debate_messages",
              filter: `room_id=eq.${roomData.id}`,
            },
            (p) => setMessages((prev) => mergeMsgs(prev, [p.new]))
          )
          .on(
            "postgres_changes",
            {
              event: "UPDATE",
              schema: "public",
              table: "debate_rooms",
              filter: `id=eq.${roomData.id}`,
            },
            (p) => setRoom((prev) => (prev ? { ...prev, ...p.new } : p.new))
          )
          .subscribe((status) => {
            if (status === "SUBSCRIBED") sync();
          });

        // Rattrapage : récupère les derniers messages si le temps réel n'a rien livré
        // (coupure, table hors publication Realtime, onglet en arrière-plan…)
        function sync() {
          if (!mounted || (typeof document !== "undefined" && document.hidden)) return;
          supabase
            .from("debate_messages")
            .select("*")
            .eq("room_id", roomData.id)
            .order("created_at", { ascending: false })
            .limit(50)
            .then(({ data }) => {
              if (mounted && data?.length) setMessages((prev) => mergeMsgs(prev, data));
            })
            .catch(() => {});
        }
        poll = setInterval(sync, 4000);
        onWake = () => sync();
        document.addEventListener("visibilitychange", onWake);
        window.addEventListener("focus", onWake);
        window.addEventListener("online", onWake);
      } catch (e) {
        if (mounted) setError(e.message || "Salle introuvable");
      } finally {
        if (mounted) setLoading(false);
      }
    };

    init();
    return () => {
      mounted = false;
      if (poll) clearInterval(poll);
      if (onWake) {
        document.removeEventListener("visibilitychange", onWake);
        window.removeEventListener("focus", onWake);
        window.removeEventListener("online", onWake);
      }
      if (channel) supabase.removeChannel(channel);
    };
  }, [inviteCode]);

  // Noms des auteurs : on charge (une seule fois par personne) les profils des expéditeurs
  const loadProfiles = useCallback(async (ids) => {
    const missing = [...new Set(ids)].filter(
      (id) => id && !requestedProfilesRef.current.has(id)
    );
    if (!missing.length) return;
    missing.forEach((id) => requestedProfilesRef.current.add(id));
    try {
      const { data, error: pErr } = await supabase
        .from("profiles")
        .select("id, display_name, avatar_url, flag")
        .in("id", missing);
      if (pErr) throw pErr;
      setProfiles((prev) => {
        const next = { ...prev };
        (data || []).forEach((p) => {
          next[p.id] = p;
        });
        return next;
      });
    } catch (_) {
      missing.forEach((id) => requestedProfilesRef.current.delete(id)); // nouvel essai possible
    }
  }, []);

  useEffect(() => {
    loadProfiles(
      messages.filter((m) => m.sender_type !== "ai").map((m) => m.sender_id)
    );
  }, [messages, loadProfiles]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ---- Nombre de participants (base de données) ----
  useEffect(() => {
    if (!roomId) return;
    let cancelled = false;

    const refreshCount = async () => {
      try {
        const { count, error: cErr } = await supabase
          .from("debate_participants")
          .select("user_id", { count: "exact", head: true })
          .eq("room_id", roomId)
          .is("left_at", null);
        if (!cancelled && !cErr && typeof count === "number") {
          setDbCount(count);
        }
      } catch (_) {}
    };

    refreshCount();
    const timer = setInterval(refreshCount, 15000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [roomId]);

  // ---- Compteur et état micro/caméra synchronisés depuis Daily ----
  useEffect(() => {
    const call = live.callRef?.current;
    if (!live.joined || !call) return;

    const sync = () => {
      try {
        const parts = call.participants ? call.participants() : {};
        const local = parts.local;
        setLiveState({
          count: Object.keys(parts).length,
          mic: Boolean(local?.audio),
          cam: Boolean(local?.video),
        });
      } catch (_) {}
    };

    sync();
    DAILY_EVENTS.forEach((ev) => {
      try {
        call.on(ev, sync);
      } catch (_) {}
    });

    return () => {
      DAILY_EVENTS.forEach((ev) => {
        try {
          call.off(ev, sync);
        } catch (_) {}
      });
    };
  }, [live.joined, live.callRef]);

  // Si l'hôte termine la salle depuis un autre appareil, l'événement
  // Supabase met à jour room.status mais la connexion Daily reste ouverte.
  // Quitter explicitement évite de garder le micro/la caméra actifs derrière
  // l'interface et permet de réafficher correctement le bouton de connexion.
  useEffect(() => {
    if (isEnded && live.joined) {
      live.leaveLive().catch(() => {});
    }
  }, [isEnded, live.joined, live.leaveLive]);

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!newMessage.trim() || !room || !user_id) return;
    if (room.status === "ended") {
      setSendError("Ce live est terminé.");
      return;
    }
    const text = newMessage.trim();
    setNewMessage("");
    setSendError(null);
    // L'auteur vient de la session (user_id) ; la base doit aussi l'imposer (règle RLS sender_id = auth.uid())
    const { data: saved, error: sendErr } = await supabase
      .from("debate_messages")
      .insert({
        room_id: room.id,
        sender_id: user_id,
        sender_type: "user",
        text,
      })
      .select("*")
      .single();
    if (sendErr) {
      setNewMessage(text);
      setSendError(sendErr.message || "Message non envoyé");
      console.error(sendErr.message);
      return;
    }
    // Affichage immédiat, sans attendre le temps réel (les doublons sont écartés par id)
    if (saved) setMessages((prev) => mergeMsgs(prev, [saved]));
  };

  // ---- Contrôles du live ----
  const handleToggleMic = () => {
    const call = live.callRef?.current;
    if (!call) return;
    const next = !liveState.mic;
    setLiveState((s) => ({ ...s, mic: next }));
    try {
      call.setLocalAudio(next);
    } catch (_) {}
  };

  const handleToggleCam = () => {
    const call = live.callRef?.current;
    if (!call) return;
    const next = !liveState.cam;
    setLiveState((s) => ({ ...s, cam: next }));
    try {
      call.setLocalVideo(next);
    } catch (_) {}
  };

  const handleLeaveLive = async () => {
    try {
      await live.leaveLive();
    } catch (_) {}
  };

  const handleEndLive = async () => {
    if (!room || !isHost) return;
    const ok =
      typeof window !== "undefined"
        ? window.confirm("Terminer le live pour tout le monde ?")
        : true;
    if (!ok) return;
    try {
      await live.leaveLive();
    } catch (_) {}
    const { error: endErr } = await supabase
      .from("debate_rooms")
      .update({ status: "ended" })
      .eq("id", room.id)
      .eq("host_id", user_id);
    if (!endErr) setRoom((prev) => (prev ? { ...prev, status: "ended" } : prev));
  };

  // Retour : la salle n'est terminée que si l'hôte avait réellement démarré le live.
  const handleBack = async () => {
    const wasLive = Boolean(live?.joined);
    try {
      await live.leaveLive();
    } catch (_) {}
    if (isHost && wasLive && room && room.mode !== "text") {
      await supabase
        .from("debate_rooms")
        .update({ status: "ended" })
        .eq("id", room.id)
        .eq("host_id", user_id);
    }
    // Marque le départ pour que le compteur de participants reste exact
    if (room && user_id) {
      try {
        await supabase
          .from("debate_participants")
          .update({ left_at: new Date().toISOString() })
          .eq("room_id", room.id)
          .eq("user_id", user_id);
      } catch (_) {}
    }
    onBack();
  };

  // L'hôte peut relancer une salle terminée
  const handleReopen = async () => {
    if (!room || !isHost || reopening) return;
    setReopening(true);
    setReopenError(null);
    try {
      // handleBack marque l'hôte comme parti. Réactiver la salle sans
      // réactiver sa participation rend ensuite le live incohérent :
      // compteur faux et accès refusé pour certaines policies RLS.
      const { error: participantError } = await supabase
        .from("debate_participants")
        .upsert(
          {
            room_id: room.id,
            user_id,
            role: "host",
            left_at: null,
          },
          { onConflict: "room_id,user_id" }
        );

      if (participantError) throw participantError;

      const { error: roomError } = await supabase
        .from("debate_rooms")
        .update({ status: "active" })
        .eq("id", room.id)
        .eq("host_id", user_id);

      if (roomError) throw roomError;
      setRoom((prev) => (prev ? { ...prev, status: "active" } : prev));
    } catch (err) {
      setReopenError(err.message || "Impossible de relancer la salle");
    }
    setReopening(false);
  };

  if (error) {
    return (
      <div
        className="flex flex-col items-center justify-center h-full p-6"
        style={{ background: C.surface }}
      >
        <p className="text-red-400 mb-4 text-center">{error}</p>
        <button
          type="button"
          onClick={onBack}
          className="px-6 py-3 rounded-xl font-bold"
          style={{ background: C.gold, color: C.bg }}
        >
          Retour
        </button>
      </div>
    );
  }

  if (loading) {
    return (
      <div
        className="flex items-center justify-center h-full"
        style={{ background: C.surface }}
      >
        <div className="animate-spin w-8 h-8 border-4 border-yellow-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  const participantCount = live.joined
    ? Math.max(liveState.count, 1)
    : dbCount;

  return (
    <div
      className="flex flex-col h-full relative"
      style={{ background: C.surface }}
    >
      <div
        className="flex items-center gap-3 p-4 border-b shrink-0"
        style={{ borderColor: C.border }}
      >
        <button
          type="button"
          onClick={handleBack}
          className="p-2 rounded-full"
          style={{ color: C.ivory }}
        >
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1 min-w-0">
          <h2
            className="font-bold text-sm truncate"
            style={{ color: C.ivory }}
          >
            {room?.title}
          </h2>
          <div
            className="text-xs flex items-center gap-1"
            style={{ color: C.muted }}
          >
            <Hash size={12} /> {room?.topic}
            <button
              type="button"
              onClick={() => {
                try {
                  navigator.clipboard.writeText(room.invite_code);
                } catch (_) {}
                setCodeCopied(true);
                setTimeout(() => setCodeCopied(false), 2000);
              }}
              className="ml-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-lg border text-[11px] font-bold"
              style={{
                borderColor: codeCopied ? C.teal : C.border,
                color: codeCopied ? C.teal : C.gold,
              }}
            >
              {codeCopied ? (
                <>
                  <Check size={12} /> Copié
                </>
              ) : (
                <>
                  <Copy size={12} /> {room.invite_code}
                </>
              )}
            </button>
          </div>
        </div>
        <div
          className="flex items-center gap-1 text-xs font-bold"
          style={{ color: C.gold }}
          title="Participants"
        >
          <Users size={14} />
          <span>{participantCount}</span>
        </div>
      </div>

      {room?.mode !== "text" && (
        <div className="shrink-0">
          <div
            ref={live.containerRef}
            className={
              live.joined || live.joining ? "h-[45vh] w-full" : "hidden"
            }
          />

          {/* Contrôles pendant le live */}
          {live.joined && !isEnded && (
            <div
              className="flex items-center justify-center gap-4 py-3 border-b"
              style={{ borderColor: C.border }}
            >
              <ControlButton
                onClick={handleToggleMic}
                active={liveState.mic}
                label={liveState.mic ? "Micro" : "Micro coupé"}
              >
                {liveState.mic ? <Mic size={20} /> : <MicOff size={20} />}
              </ControlButton>

              {room?.mode !== "audio" && !live.audioOnly && (
                <ControlButton
                  onClick={handleToggleCam}
                  active={liveState.cam}
                  label={liveState.cam ? "Caméra" : "Caméra coupée"}
                >
                  {liveState.cam ? <Video size={20} /> : <VideoOff size={20} />}
                </ControlButton>
              )}

              <ControlButton onClick={handleLeaveLive} danger label="Quitter">
                <PhoneOff size={20} />
              </ControlButton>

              {isHost && (
                <ControlButton onClick={handleEndLive} danger label="Terminer">
                  <Power size={20} />
                </ControlButton>
              )}
            </div>
          )}

          {isEnded ? (
            <div
              className="m-3 p-3 rounded-xl border text-sm"
              style={{ borderColor: C.border, color: C.muted }}
            >
              <p className="mb-2">Ce live est terminé.</p>
              {isHost ? (
                <button
                  type="button"
                  onClick={handleReopen}
                  disabled={reopening}
                  className="w-full py-3 rounded-xl font-bold disabled:opacity-50"
                  style={{ background: C.gold, color: "#000" }}
                >
                  {reopening ? "Relance..." : "Relancer le live"}
                </button>
              ) : null}
              {reopenError ? (
                <p className="text-red-400 text-xs mt-2">{reopenError}</p>
              ) : null}
            </div>
          ) : (
            !live.joined && (
              <button
                type="button"
                onClick={live.joinLive}
                disabled={live.joining}
                className="m-3 py-3 rounded-xl font-bold"
                style={{
                  background: C.gold,
                  color: "#000",
                  width: "calc(100% - 1.5rem)",
                }}
              >
                {live.joining
                  ? "Connexion..."
                  : isHost
                    ? "Démarrer le live"
                    : "Rejoindre le live"}
              </button>
            )
          )}

          {live.notice && !isEnded && (
            <p
              className="text-xs px-4 py-2"
              style={{ color: "#fbbf24" }}
            >
              {live.notice}
            </p>
          )}

          {live.error && !isEnded && (
            <p className="text-red-400 text-xs px-4">{live.error}</p>
          )}
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3">
        {messages.map((m) => (
          <ChatMessage
            key={m.id}
            msg={m}
            currentId={user_id}
            name={profiles[m.sender_id]?.display_name}
            isRoomHost={Boolean(room?.host_id) && m.sender_id === room.host_id}
          />
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Zone de saisie : dégagée de la barre de navigation du bas
          et du bouton flottant de l'assistant IA (à droite) */}
      {sendError && (
        <p className="text-red-400 text-xs px-4 pt-2 shrink-0" role="alert">
          {sendError}
        </p>
      )}
      <form
        onSubmit={handleSendMessage}
        className="px-4 pt-3 border-t flex gap-2 relative shrink-0"
        style={{
          borderColor: C.border,
          paddingBottom: "calc(5.5rem + env(safe-area-inset-bottom, 0px))",
          paddingRight: "5rem",
        }}
      >
        <input
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          placeholder="Ton message..."
          className="flex-1 min-w-0 px-4 py-3 rounded-xl border text-sm outline-none"
          style={{
            background: C.surface2,
            borderColor: C.border,
            color: C.ivory,
          }}
        />
        <button
          type="submit"
          disabled={!newMessage.trim()}
          className="p-3 rounded-xl disabled:opacity-40 shrink-0"
          style={{ background: C.gold, color: "#000" }}
        >
          <Send size={18} />
        </button>
      </form>
    </div>
  );
}

export default DebateRoom;