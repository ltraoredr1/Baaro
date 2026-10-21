import { useDebateLive } from "../hooks/useDebates.js";
import * as liveRoles from "../lib/liveRoles.js";
import { useState, useEffect, useRef, memo } from "react";
import { ArrowLeft, Hash, Users, Send, Copy, Check } from "lucide-react";
import { COLORS } from "../theme.js";
import { supabase } from "../supabaseClient.js";

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

const ChatMessage = memo(function ChatMessage({ msg, currentId }) {
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
  const messagesEndRef = useRef(null);
  const isHost = room?.host_id === user_id;
  const isEnded = room?.status === "ended";
  const live = useDebateLive(room, user_id, isHost);

  useEffect(() => {
    let mounted = true;
    let channel = null;

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
          .channel(`room:${roomData.id}`)
          .on(
            "postgres_changes",
            {
              event: "INSERT",
              schema: "public",
              table: "debate_messages",
              filter: `room_id=eq.${roomData.id}`,
            },
            (p) =>
              setMessages((prev) =>
                prev.some((m) => m.id === p.new.id) ? prev : [...prev, p.new]
              )
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
          .subscribe();
      } catch (e) {
        if (mounted) setError(e.message || "Salle introuvable");
      } finally {
        if (mounted) setLoading(false);
      }
    };

    init();
    return () => {
      mounted = false;
      if (channel) supabase.removeChannel(channel);
    };
  }, [inviteCode]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!newMessage.trim() || !room || !user_id) return;
    const text = newMessage.trim();
    setNewMessage("");
    const { error: sendErr } = await supabase.from("debate_messages").insert({
      room_id: room.id,
      sender_id: user_id,
      sender_type: "user",
      text,
    });
    if (sendErr) {
      setNewMessage(text);
      console.error(sendErr.message);
    }
  };

  // Retour : la salle n'est terminée que si l'hôte avait réellement démarré le live.
  // Avant, un simple retour en arrière terminait la salle et rendait le live introuvable.
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
    onBack();
  };

  // L'hôte peut relancer une salle terminée
  const handleReopen = async () => {
    if (!room || !isHost || reopening) return;
    setReopening(true);
    setReopenError(null);
    const { error: upErr } = await supabase
      .from("debate_rooms")
      .update({ status: "active" })
      .eq("id", room.id)
      .eq("host_id", user_id);
    if (upErr) {
      setReopenError(upErr.message || "Impossible de relancer la salle");
    } else {
      setRoom((prev) => (prev ? { ...prev, status: "active" } : prev));
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
        <Users size={14} style={{ color: C.gold }} />
      </div>

      {room?.mode !== "text" && (
        <div className="shrink-0">
          <div
            ref={live.containerRef}
            className={
              live.joined || live.joining ? "h-[45vh] w-full" : "hidden"
            }
          />

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

          {live.error && !isEnded && (
            <p className="text-red-400 text-xs px-4">{live.error}</p>
          )}
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3">
        {messages.map((m) => (
          <ChatMessage key={m.id} msg={m} currentId={user_id} />
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Zone de saisie : dégagée de la barre de navigation du bas
          et du bouton flottant de l'assistant IA (à droite) */}
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
