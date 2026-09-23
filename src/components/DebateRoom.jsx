import { useState, useEffect, useRef, memo } from "react";
import { ArrowLeft, Hash, Users, Send, Copy, Check } from "lucide-react";
import { COLORS } from "../theme.js";
import { supabase } from "../supabaseClient.js";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const ChatMessage = memo(function ChatMessage({ msg, currentId }) {
  const isMe = msg.sender_id === currentId;
  const isAI = msg.sender_type === "ai";
  return (
    <div className={`flex gap-2 ${isMe ? "flex-row-reverse" : "flex-row"}`}>
      <div
        className={`max-w-[75%] px-4 py-2.5 rounded-2xl text-sm ${isMe ? "rounded-tr-sm" : "rounded-tl-sm"}`}
        style={{
          background: isMe ? COLORS.gold : isAI ? "rgba(167,139,250,0.15)" : COLORS.surface2,
          color: isMe ? "#000" : COLORS.ivory,
        }}
      >
        <p className="break-words">{msg.text}</p>
        <p className={`text-[10px] mt-1.5 ${isMe ? "text-black/60" : "text-gray-400"}`}>
          {new Date(msg.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </p>
      </div>
    </div>
  );
});

export function DebateRoom({ inviteCode, onBack }) {
  const [userId, setUserId] = useState(null);
  const [room, setRoom] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [codeCopied, setCodeCopied] = useState(false);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    let mounted = true;
    let channel = null;

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
        const isUuid = UUID_RE.test(raw);

        // 1) Recherche stable : invite_code d'abord, id seulement si UUID
        let roomData = null;
        let roomErr = null;

        if (isUuid) {
          const res = await supabase
            .from("debate_rooms")
            .select("*")
            .or(`id.eq.\( {raw},invite_code.eq. \){codeLower}`)
            .maybeSingle();
          roomData = res.data;
          roomErr = res.error;
        } else {
          const res = await supabase
            .from("debate_rooms")
            .select("*")
            .eq("invite_code", codeLower)
            .maybeSingle();
          roomData = res.data;
          roomErr = res.error;

          // Fallback si ancien code stocké en majuscules
          if (!roomData && !roomErr) {
            const res2 = await supabase
              .from("debate_rooms")
              .select("*")
              .eq("invite_code", raw.toUpperCase())
              .maybeSingle();
            roomData = res2.data;
            roomErr = res2.error;
          }
        }

        if (roomErr) {
          console.error("debate_rooms select", roomErr);
          throw new Error(roomErr.message || "Salle introuvable");
        }
        if (!roomData) throw new Error("Salle introuvable");

        if (mounted) setRoom(roomData);

        // 2) S'enregistrer participant (identité = auth.users.id)
        const { error: partErr } = await supabase.from("debate_participants").upsert(
          {
            room_id: roomData.id,
            user_id: uid,
            role: roomData.host_id === uid ? "host" : "member",
            left_at: null,
          },
          { onConflict: "room_id,user_id" }
        );
        if (partErr) console.warn("participant upsert", partErr.message);

        // 3) Messages
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
    if (!newMessage.trim() || !room || !userId) return;
    const text = newMessage.trim();
    setNewMessage("");
    const { error: sendErr } = await supabase.from("debate_messages").insert({
      room_id: room.id,
      sender_id: userId,
      sender_type: "user",
      text,
    });
    if (sendErr) {
      setNewMessage(text);
      console.error(sendErr.message);
    }
  };

  if (error) {
    return (
      <div
        className="flex flex-col items-center justify-center h-full p-6"
        style={{ background: COLORS.surface }}
      >
        <p className="text-red-400 mb-4 text-center">{error}</p>
        <button
          type="button"
          onClick={onBack}
          className="px-6 py-3 rounded-xl font-bold"
          style={{ background: COLORS.gold, color: COLORS.bg }}
        >
          Retour
        </button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full" style={{ background: COLORS.surface }}>
        <div className="animate-spin w-8 h-8 border-4 border-yellow-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full" style={{ background: COLORS.surface }}>
      <div className="flex items-center gap-3 p-4 border-b" style={{ borderColor: COLORS.border }}>
        <button type="button" onClick={onBack} className="p-2 rounded-full" style={{ color: COLORS.ivory }}>
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1 min-w-0">
          <h2 className="font-bold text-sm truncate" style={{ color: COLORS.ivory }}>
            {room?.title}
          </h2>
          <div className="text-xs flex items-center gap-1" style={{ color: COLORS.muted }}>
            <Hash size={12} /> {room?.topic}
            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(room.invite_code);
                setCodeCopied(true);
                setTimeout(() => setCodeCopied(false), 2000);
              }}
              className="ml-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-lg border text-[11px] font-bold"
              style={{
                borderColor: codeCopied ? COLORS.teal : COLORS.border,
                color: codeCopied ? COLORS.teal : COLORS.gold,
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
        <Users size={14} style={{ color: COLORS.gold }} />
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.map((m) => (
          <ChatMessage key={m.id} msg={m} currentId={userId} />
        ))}
        <div ref={messagesEndRef} />
      </div>

      <form onSubmit={handleSendMessage} className="p-4 border-t flex gap-2" style={{ borderColor: COLORS.border }}>
        <input
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          placeholder="Ton message..."
          className="flex-1 px-4 py-3 rounded-xl border text-sm outline-none"
          style={{ background: COLORS.surface2, borderColor: COLORS.border, color: COLORS.ivory }}
        />
        <button
          type="submit"
          disabled={!newMessage.trim()}
          className="p-3 rounded-xl disabled:opacity-40"
          style={{ background: COLORS.gold, color: "#000" }}
        >
          <Send size={18} />
        </button>
      </form>
    </div>
  );
}
