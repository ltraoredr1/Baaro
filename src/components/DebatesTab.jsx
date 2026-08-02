import { useState, useEffect, useRef } from "react";
import { ArrowLeft, Send } from "lucide-react";
import { COLORS } from "../theme.js";
import { supabase } from "../supabaseClient.js";

export function DebateRoom({ inviteCode, currentUserId, onBack }) {
  const [room, setRoom] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    let isMounted = true;
    let channel = null;

    const loadDebate = async () => {
      try {
        console.log("🔍 Chargement débat - Code:", inviteCode);
        
        // 1. Trouver la salle
        const { data: roomData, error: roomError } = await supabase
          .from("debate_rooms")
          .select("*")
          .eq("invite_code", inviteCode)
          .single();

        if (roomError) {
          console.error("❌ Erreur salle:", roomError);
          if (isMounted) {
            setError("Salle introuvable");
            setLoading(false);
          }
          return;
        }

        console.log("✅ Salle trouvée:", roomData.title);
        if (isMounted) {
          setRoom(roomData);
        }

        // 2. Charger les messages
        const { data: msgsData, error: msgsError } = await supabase
          .from("debate_messages")
          .select("*")
          .eq("room_id", roomData.id)
          .order("created_at", { ascending: true });

        if (msgsError) {
          console.error(" Erreur messages:", msgsError);
        } else {
          console.log("📩 Messages chargés:", msgsData.length);
          if (isMounted) {
            setMessages(msgsData || []);
          }
        }

        // 3. S'abonner aux nouveaux messages
        channel = supabase
          .channel(`room_${roomData.id}`)
          .on("postgres_changes", { 
            event: "INSERT", 
            schema: "public", 
            table: "debate_messages",
            filter: `room_id=eq.${roomData.id}`
          }, (payload) => {
            console.log("📨 Nouveau message:", payload.new);
            if (isMounted) {
              setMessages(prev => [...prev, payload.new]);
            }
          })
          .subscribe();

      } catch (err) {
        console.error("💥 Erreur critique:", err);
        if (isMounted) {
          setError(err.message);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    loadDebate();

    // Cleanup
    return () => {
      isMounted = false;
      if (channel) {
        supabase.removeChannel(channel);
      }
    };
  }, [inviteCode]);

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!newMessage.trim() || !room || !currentUserId) return;

    try {
      const { error } = await supabase.from("debate_messages").insert({
        room_id: room.id,
        user_id: currentUserId,
        text: newMessage.trim(),
      });

      if (error) throw error;
      setNewMessage("");
    } catch (err) {
      console.error("❌ Erreur envoi:", err);
      alert("Erreur d'envoi: " + err.message);
    }
  };

  // Affichage erreur
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6" style={{ background: COLORS.surface }}>
        <div className="text-red-400 text-center mb-4">
          <p className="font-bold text-lg mb-2">⚠️ {error}</p>
          <p className="text-sm opacity-75">Le débat n'est peut-être plus disponible</p>
        </div>
        <button 
          onClick={onBack}
          className="px-6 py-3 rounded-xl font-bold"
          style={{ background: COLORS.gold, color: "#000" }}
        >
          Retour aux débats
        </button>
      </div>
    );
  }

  // Affichage chargement
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-full" style={{ background: COLORS.surface }}>
        <div className="animate-spin w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full mb-4" />
        <p style={{ color: COLORS.ivory }}>Chargement de la salle...</p>
        <p className="text-xs mt-2 opacity-50" style={{ color: COLORS.muted }}>
          Code: {inviteCode}
        </p>
      </div>
    );
  }

  // Affichage principal
  return (
    <div className="flex flex-col h-full" style={{ background: COLORS.surface }}>
      {/* Header */}
      <div className="flex items-center gap-3 p-4 border-b" style={{ borderColor: COLORS.border }}>
        <button 
          onClick={onBack} 
          className="p-2 rounded-full hover:bg-white/10"
          style={{ color: COLORS.ivory }}
        >
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1">
          <h2 className="font-bold text-sm" style={{ color: COLORS.ivory }}>
            {room?.title}
          </h2>
          <p className="text-xs" style={{ color: COLORS.muted }}>
            {room?.topic}
          </p>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 ? (
          <div className="text-center py-10" style={{ color: COLORS.muted }}>
            <p className="text-sm">Aucun message pour le moment</p>
            <p className="text-xs mt-1">Soyez le premier à écrire !</p>
          </div>
        ) : (
          messages.map((msg) => {
            const isMe = msg.user_id === currentUserId;
            return (
              <div 
                key={msg.id} 
                className={`flex ${isMe ? "justify-end" : "justify-start"}`}
              >
                <div 
                  className={`max-w-[75%] px-4 py-2 rounded-xl text-sm ${
                    isMe ? "rounded-tr-sm" : "rounded-tl-sm"
                  }`}
                  style={{ 
                    background: isMe ? COLORS.gold : COLORS.surface2,
                    color: isMe ? "#000" : COLORS.ivory
                  }}
                >
                  <p>{msg.text}</p>
                  <p className={`text-[10px] mt-1 ${isMe ? "text-black/60" : "text-gray-400"}`}>
                    {new Date(msg.created_at).toLocaleTimeString([], { 
                      hour: '2-digit', 
                      minute: '2-digit' 
                    })}
                  </p>
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <form onSubmit={handleSendMessage} className="p-4 border-t flex gap-2" style={{ borderColor: COLORS.border }}>
        <input
          type="text"
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          placeholder="Votre message..."
          className="flex-1 px-4 py-3 rounded-xl border text-sm outline-none"
          style={{ 
            background: COLORS.surface2, 
            borderColor: COLORS.border, 
            color: COLORS.ivory 
          }}
        />
        <button 
          type="submit"
          disabled={!newMessage.trim()}
          className="px-4 py-3 rounded-xl disabled:opacity-50"
          style={{ background: COLORS.gold, color: "#000" }}
        >
          <Send size={18} />
        </button>
      </form>
    </div>
  );
}
