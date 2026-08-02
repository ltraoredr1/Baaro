import { useState, useEffect, useRef } from "react";
import { ArrowLeft, Send, Users, Hash } from "lucide-react";
import { COLORS } from "../theme.js";
import { supabase } from "../supabaseClient.js";

export function DebateRoom({ inviteCode, currentUserId, onBack }) {
  const [room, setRoom] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const messagesEndRef = useRef(null);

  // 1. Charger les infos de la salle et l'historique des messages
  useEffect(() => {
    if (!inviteCode) return;

    const loadData = async () => {
      setLoading(true);
      try {
        // Récupérer la salle
        const { data: roomData, error: roomError } = await supabase
          .from("debate_rooms")
          .select("*")
          .eq("invite_code", inviteCode)
          .single();

        if (roomError) throw roomError;
        setRoom(roomData);

        // Récupérer les messages (joindre avec profiles pour avoir le nom de l'auteur)
        const { data: msgsData, error: msgsError } = await supabase
          .from("debate_messages")
          .select(`
            id, text, created_at, user_id,
            profiles (display_name, flag, avatar_url)
          `)
          .eq("room_id", roomData.id)
          .order("created_at", { ascending: true });

        if (!msgsError) setMessages(msgsData || []);
      } catch (error) {
        console.error("Erreur chargement débat:", error);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [inviteCode]);

  // 2. S'abonner aux nouveaux messages en temps réel (Supabase Realtime)
  useEffect(() => {
    if (!room) return;

    const channel = supabase
      .channel(`debate_room_${room.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "debate_messages", filter: `room_id=eq.${room.id}` },
        async (payload) => {
          // Récupérer les infos du profil du nouveau message pour l'affichage
          const { data: profile } = await supabase
            .from("profiles")
            .select("display_name, flag, avatar_url")
            .eq("id", payload.new.user_id)
            .single();

          setMessages((prev) => [
            ...prev,
            { ...payload.new, profiles: profile }
          ]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [room]);

  // 3. Scroll automatique vers le bas à chaque nouveau message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // 4. Envoyer un message
  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!newMessage.trim() || !room || !currentUserId) return;

    const messageText = newMessage.trim();
    setNewMessage(""); // Vider l'input immédiatement pour une meilleure UX

    try {
      const { error } = await supabase.from("debate_messages").insert({
        room_id: room.id,
        user_id: currentUserId,
        text: messageText,
      });

      if (error) throw error;
    } catch (error) {
      console.error("Erreur envoi message:", error);
      setNewMessage(messageText); // Restaurer en cas d'échec
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full" style={{ color: COLORS.muted }}>
        Chargement de la salle...
      </div>
    );
  }

  if (!room) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <p style={{ color: COLORS.ivory }}>Salle de débat introuvable ou fermée.</p>
        <button onClick={onBack} className="px-4 py-2 rounded-xl text-sm font-bold" style={{ background: COLORS.surface, color: COLORS.ivory }}>
          Retour
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full max-h-[80vh] glass-card rounded-3xl border shadow-2xl" style={{ borderColor: COLORS.borderGold }}>
      {/* Header de la salle */}
      <div className="flex items-center justify-between p-4 border-b" style={{ borderColor: COLORS.border }}>
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="p-2 rounded-full hover:bg-white/10 transition-colors" style={{ color: COLORS.ivory }}>
            <ArrowLeft size={20} />
          </button>
          <div>
            <h2 className="font-bold text-sm flex items-center gap-2" style={{ color: COLORS.ivory }}>
              {room.title}
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-500/20 text-green-400 font-normal">LIVE</span>
            </h2>
            <p className="text-xs flex items-center gap-1" style={{ color: COLORS.muted }}>
              <Hash size={12} /> {room.topic}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full" style={{ background: COLORS.surface }}>
          <Users size={14} style={{ color: COLORS.gold }} />
          <span className="text-xs font-bold" style={{ color: COLORS.ivory }}>En direct</span>
        </div>
      </div>

      {/* Zone des messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
        {messages.length === 0 ? (
          <div className="text-center py-10" style={{ color: COLORS.muted }}>
            <p className="text-sm">Soyez le premier à donner votre avis !</p>
          </div>
        ) : (
          messages.map((msg) => {
            const isMe = msg.user_id === currentUserId;
            return (
              <div key={msg.id} className={`flex gap-3 ${isMe ? "flex-row-reverse" : "flex-row"}`}>
                <div 
                  className="w-8 h-8 rounded-full flex items-center justify-center text-xs shrink-0 border"
                  style={{ borderColor: COLORS.borderGold, background: COLORS.surface2 }}
                >
                  {msg.profiles?.avatar_url ? (
                    <img src={msg.profiles.avatar_url} alt="avatar" className="w-full h-full rounded-full object-cover" />
                  ) : (
                    <span>{msg.profiles?.flag || "🌍"}</span>
                  )}
                </div>
                <div className={`max-w-[75%] px-4 py-2.5 rounded-2xl text-sm ${isMe ? "rounded-tr-sm" : "rounded-tl-sm"}`}
                  style={{ 
                    background: isMe ? COLORS.gold : COLORS.surface,
                    color: isMe ? "#000" : COLORS.ivory
                  }}
                >
                  {!isMe && (
                    <div className="text-[10px] font-bold mb-1 flex items-center gap-1" style={{ color: COLORS.gold }}>
                      {msg.profiles?.display_name || "Membre"} {msg.profiles?.flag}
                    </div>
                  )}
                  <p className="leading-relaxed">{msg.text}</p>
                  <div className={`text-[10px] mt-1.5 ${isMe ? "text-black/60" : "text-slate-400"}`}>
                    {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Zone de saisie */}
      <form onSubmit={handleSendMessage} className="p-4 border-t flex items-center gap-3" style={{ borderColor: COLORS.border, background: COLORS.surface }}>
        <input
          type="text"
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          placeholder="Participez au débat..."
          className="flex-1 px-4 py-3 rounded-xl border text-sm outline-none focus:ring-2 transition-all"
          style={{ background: COLORS.surface2, borderColor: COLORS.border, color: COLORS.ivory }}
        />
        <button
          type="submit"
          disabled={!newMessage.trim()}
          className="p-3 rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          style={{ background: COLORS.gold, color: "#000" }}
        >
          <Send size={18} />
        </button>
      </form>
    </div>
  );
          }
