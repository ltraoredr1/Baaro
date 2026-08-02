import { useState, useEffect, useRef } from "react";
import { ArrowLeft, Send, MessageCircle, Plus, Search } from "lucide-react";
import { COLORS } from "../theme.js";
import { supabase } from "../supabaseClient.js";

export default function MessagesTab({ onRewardPoints }) {
  const [currentUserId, setCurrentUserId] = useState(null);
  const [conversations, setConversations] = useState([]);
  const [activeChat, setActiveChat] = useState(null); // { id, otherUserId, otherUserName }
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const messagesEndRef = useRef(null);

  // 1. Récupérer l'utilisateur connecté
  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) setCurrentUserId(user.id);
    };
    getUser();
  }, []);

  // 2. Charger la liste des conversations
  useEffect(() => {
    if (!currentUserId) return;
    
    const fetchConversations = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from("conversations")
          .select(`
            id, user1_id, user2_id, created_at,
            messages (text, created_at, sender_id)
          `)
          .or(`user1_id.eq.${currentUserId},user2_id.eq.${currentUserId}`)
          .order("created_at", { ascending: false });

        if (!error) {
          setConversations(data || []);
        }
      } catch (err) {
        console.error("Erreur conversations:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchConversations();

    // Temps réel pour mettre à jour la liste si nouvelle conversation/message
    const channel = supabase.channel("public:conversations")
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, () => {
        fetchConversations();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [currentUserId]);

  // 3. Charger les messages d'une conversation active
  useEffect(() => {
    if (!activeChat || !activeChat.id) return;

    const fetchMessages = async () => {
      const { data, error } = await supabase
        .from("messages")
        .select("*")
        .eq("conversation_id", activeChat.id)
        .order("created_at", { ascending: true });

      if (!error) setMessages(data || []);
    };

    fetchMessages();

    // Temps réel pour les nouveaux messages
    const channel = supabase.channel(`room_${activeChat.id}`)
      .on("postgres_changes", { 
        event: "INSERT", schema: "public", table: "messages", 
        filter: `conversation_id=eq.${activeChat.id}` 
      }, (payload) => {
        setMessages((prev) => [...prev, payload.new]);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [activeChat]);

  // Scroll automatique vers le bas
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // 4. Envoyer un message
  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!newMessage.trim() || !activeChat || !currentUserId) return;

    const text = newMessage.trim();
    setNewMessage("");

    try {
      const { error } = await supabase.from("messages").insert({
        conversation_id: activeChat.id,
        sender_id: currentUserId,
        text: text,
      });
      if (error) throw error;
    } catch (err) {
      console.error("Erreur envoi:", err);
      setNewMessage(text);
    }
  };

  // 5. Démarrer une nouvelle conversation (Simulation simple pour le MVP)
  const startNewChat = async (otherUserId) => {
    if (!currentUserId || otherUserId === currentUserId) return;
    
    // Vérifier si la conversation existe déjà
    const { data: existing } = await supabase
      .from("conversations")
      .select("id")
      .or(`and(user1_id.eq.${currentUserId},user2_id.eq.${otherUserId}),and(user1_id.eq.${otherUserId},user2_id.eq.${currentUserId})`)
      .single();

    if (existing) {
      setActiveChat({ id: existing.id, otherUserId, otherUserName: "Utilisateur" });
    } else {
      // Créer la conversation
      const { data: newConv, error } = await supabase
        .from("conversations")
        .insert({ user1_id: currentUserId, user2_id: otherUserId })
        .select()
        .single();

      if (!error) {
        setActiveChat({ id: newConv.id, otherUserId, otherUserName: "Utilisateur" });
      }
    }
  };

  // --- AFFICHAGE : FENÊTRE DE CHAT ---
  if (activeChat) {
    return (
      <div className="flex flex-col h-full" style={{ background: COLORS.surface }}>
        {/* Header Chat */}
        <div className="flex items-center gap-3 p-4 border-b" style={{ borderColor: COLORS.border }}>
          <button onClick={() => setActiveChat(null)} className="p-2 rounded-full hover:bg-white/10" style={{ color: COLORS.ivory }}>
            <ArrowLeft size={20} />
          </button>
          <div className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs" style={{ background: COLORS.surface2, color: COLORS.ivory }}>
            {activeChat.otherUserName?.[0] || "?"}
          </div>
          <h3 className="font-bold text-sm" style={{ color: COLORS.ivory }}>{activeChat.otherUserName}</h3>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {messages.length === 0 ? (
            <div className="text-center py-10" style={{ color: COLORS.muted }}>
              <p className="text-sm">Dites bonjour ! 👋</p>
            </div>
          ) : (
            messages.map((msg) => {
              const isMe = msg.sender_id === currentUserId;
              return (
                <div key={msg.id} className={`flex ${isMe ? "justify-end" : "justify-start"}`}>
                  <div 
                    className={`max-w-[75%] px-4 py-2.5 rounded-2xl text-sm ${isMe ? "rounded-tr-sm" : "rounded-tl-sm"}`}
                    style={{ background: isMe ? COLORS.gold : COLORS.surface2, color: isMe ? "#000" : COLORS.ivory }}
                  >
                    <p>{msg.text}</p>
                    <p className={`text-[10px] mt-1 ${isMe ? "text-black/60" : "text-gray-400"}`}>
                      {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
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
            style={{ background: COLORS.surface2, borderColor: COLORS.border, color: COLORS.ivory }}
          />
          <button type="submit" disabled={!newMessage.trim()} className="p-3 rounded-xl disabled:opacity-50" style={{ background: COLORS.gold, color: "#000" }}>
            <Send size={18} />
          </button>
        </form>
      </div>
    );
  }

  // --- AFFICHAGE : LISTE DES CONVERSATIONS ---
  return (
    <div className="flex flex-col h-full p-4">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold flex items-center gap-2" style={{ color: COLORS.ivory }}>
          <MessageCircle size={24} style={{ color: COLORS.gold }} />
          Messages
        </h2>
        <button className="p-2 rounded-full hover:bg-white/10" style={{ color: COLORS.gold }}>
          <Plus size={20} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto space-y-2">
        {loading ? (
          <div className="text-center py-10" style={{ color: COLORS.muted }}>
            <div className="animate-spin inline-block w-8 h-8 border-2 border-current border-t-transparent rounded-full mb-3" />
            <p className="text-sm">Chargement...</p>
          </div>
        ) : conversations.length === 0 ? (
          <div className="text-center py-10">
            <div className="w-20 h-20 rounded-full mx-auto mb-4 flex items-center justify-center" style={{ background: COLORS.surface }}>
              <MessageCircle size={40} style={{ color: COLORS.muted }} />
            </div>
            <p className="font-bold mb-2" style={{ color: COLORS.ivory }}>Aucune conversation</p>
            <p className="text-sm mb-4" style={{ color: COLORS.muted }}>
              Recherchez un membre pour lui écrire !
            </p>
          </div>
        ) : (
          conversations.map((conv) => {
            const otherUserId = conv.user1_id === currentUserId ? conv.user2_id : conv.user1_id;
            const lastMsg = conv.messages?.[conv.messages.length - 1];
            
            return (
              <div
                key={conv.id}
                onClick={() => setActiveChat({ id: conv.id, otherUserId, otherUserName: "Membre" })}
                className="p-4 rounded-2xl border cursor-pointer hover:border-amber-400/50 transition-all flex items-center gap-3"
                style={{ background: COLORS.surface, borderColor: COLORS.border }}
              >
                <div className="w-12 h-12 rounded-full flex items-center justify-center font-bold" style={{ background: COLORS.surface2, color: COLORS.ivory }}>
                  ?
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-center mb-1">
                    <span className="font-bold text-sm truncate" style={{ color: COLORS.ivory }}>
                      Membre {otherUserId.slice(0, 4)}...
                    </span>
                    {lastMsg && (
                      <span className="text-[10px]" style={{ color: COLORS.muted }}>
                        {new Date(lastMsg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    )}
                  </div>
                  <p className="text-xs truncate" style={{ color: COLORS.muted }}>
                    {lastMsg ? lastMsg.text : "Aucun message"}
                  </p>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
