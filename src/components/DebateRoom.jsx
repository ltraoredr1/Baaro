import { useState, useEffect, useRef } from "react";
import { ArrowLeft, Send, Users, Hash, MessageSquare } from "lucide-react";
import { COLORS } from "../theme.js";
import { supabase } from "../supabaseClient.js";

export function DebateRoom({ inviteCode, currentUserId, onBack }) {
  const [room, setRoom] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const messagesEndRef = useRef(null);

  // 1. Charger les infos de la salle et les messages
  useEffect(() => {
    if (!inviteCode || !currentUserId) return;

    const loadData = async () => {
      setLoading(true);
      try {
        // Récupérer la salle
        const { data: roomData, error: roomError } = await supabase
          .from("debate_rooms")
          .select("*")
          .eq("invite_code", inviteCode)
          .single();

        if (roomError) {
          console.error("Erreur salle:", roomError);
          throw roomError;
        }
        setRoom(roomData);

        // Ajouter le participant si ce n'est pas déjà fait
        await supabase.from("debate_participants").upsert({
          room_id: roomData.id,
          user_id: currentUserId,
          role: "participant"
        }, { onConflict: "room_id_user_id" });

        // Récupérer les messages avec les profils
        const { data: msgsData, error: msgsError } = await supabase
          .from("debate_messages")
          .select(`
            id, 
            text, 
            created_at, 
            user_id,
            profiles:profiles!debate_messages_user_id_fkey (
              display_name, 
              flag, 
              avatar_url
            )
          `)
          .eq("room_id", roomData.id)
          .order("created_at", { ascending: true });

        if (msgsError) {
          console.error("Erreur messages:", msgsError);
        } else {
          setMessages(msgsData || []);
        }
      } catch (error) {
        console.error("Erreur chargement débat:", error);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [inviteCode, currentUserId]);

  // 2. Temps réel : écouter les nouveaux messages
  useEffect(() => {
    if (!room) return;

    const channel = supabase
      .channel(`debate_room_${room.id}`)
      .on(
        "postgres_changes",
        { 
          event: "INSERT", 
          schema: "public", 
          table: "debate_messages", 
          filter: `room_id=eq.${room.id}` 
        },
        async (payload) => {
          // Récupérer le profil du nouveau message
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

  // 3. Scroll automatique vers le bas
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // 4. Envoyer un message
  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!newMessage.trim() || !room || !currentUserId) return;

    const messageText = newMessage.trim();
    setNewMessage("");

    try {
      const { error } = await supabase.from("debate_messages").insert({
        room_id: room.id,
        user_id: currentUserId,
        text: messageText,
      });

      if (error) {
        console.error("Erreur envoi:", error);
        setNewMessage(messageText);
      }
    } catch (error) {
      console.error("Erreur:", error);
      setNewMessage(messageText);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-full" style={{ color: COLORS.muted }}>
        <div className="animate-spin inline-block w-8 h-8 border-2 border-current border-t-transparent rounded-full mb-3" />
        <p>Chargement de la salle...</p>
      </div>
    );
  }

  if (!room) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 p-6">
        <p style={{ color: COLORS.ivory }}>Salle de débat introuvable ou fermée.</p>
        <button 
          onClick={onBack} 
          className="px-4 py-2 rounded-xl text-sm font-bold" 
          style={{ background: COLORS.surface, color: COLORS.ivory }}
        >
          Retour
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full max-h-screen glass-card border shadow-2xl" style={{ borderColor: COLORS.borderGold }}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b" style={{ borderColor: COLORS.border }}>
        <div className="flex items-center gap-3">
          <button 
            onClick={onBack} 
            className="p-2 rounded-full hover:bg-white/10 transition-colors" 
            style={{ color: COLORS.ivory }}
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <h2 className="font-bold text-sm flex items-center gap-2" style={{ color: COLORS.ivory }}>
              {room.title}
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-500/20 text-green-400 font-normal">
                LIVE
              </span>
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
          <div className="text-center py-10">
            <MessageSquare size={48} className="mx-auto mb-3 opacity-50" style={{ color: COLORS.muted }} />
            <p className="text-sm" style={{ color: COLORS.muted }}>
              Soyez le premier à donner votre avis !
            </p>
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
                    <span>{msg.profiles?.flag || ""}</span>
                  )}
                </div>
                <div 
                  className={`max-w-[75%] px-4 py-2.5 rounded-2xl text-sm ${isMe ? "rounded-tr-sm" : "rounded-tl-sm"}`}
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
