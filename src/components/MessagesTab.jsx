import { useState, useEffect, useRef, useCallback } from "react";
import { ArrowLeft, Send, MessageCircle, Plus, X } from "lucide-react";
import { COLORS } from "../theme.js";
import { supabase } from "../supabaseClient.js";

export function MessagesTab({ onRewardPoints }) {
  const [currentUserId, setCurrentUserId] = useState(null);
  const [conversations, setConversations] = useState([]);
  const [activeChat, setActiveChat] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [showUserSelector, setShowUserSelector] = useState(false);
  const [availableUsers, setAvailableUsers] = useState([]);
  const messagesEndRef = useRef(null);
  const profilesCache = useRef({});

  useEffect(() => {
    const getUser = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) setCurrentUserId(user.id);
    };
    getUser();
  }, []);

  const fetchConversations = useCallback(async () => {
    if (!currentUserId) return;
    setLoading(true);
    try {
      // Requête optimisée : conversations + dernier message
      const { data, error } = await supabase
        .from("conversations")
        .select(
          `
          id,
          user1_id,
          user2_id,
          created_at,
          messages (
            text,
            created_at,
            sender_id
          )
        `
        )
        .or(`user1_id.eq.\( {currentUserId},user2_id.eq. \){currentUserId}`)
        .order("created_at", { ascending: false })
        .limit(40);

      if (error) throw error;

      const otherUserIds = [
        ...new Set(
          (data || []).map((c) =>
            c.user1_id === currentUserId ? c.user2_id : c.user1_id
          )
        ),
      ];

      let profileMap = { ...profilesCache.current };

      if (otherUserIds.length > 0) {
        const missing = otherUserIds.filter((id) => !profileMap[id]);
        if (missing.length > 0) {
          const { data: profiles } = await supabase
            .from("profiles")
            .select("user_id, display_name, avatar_url, flag")
            .in("user_id", missing);

          (profiles || []).forEach((p) => {
            profileMap[p.user_id] = p;
          });
          profilesCache.current = profileMap;
        }
      }

      const enriched = (data || []).map((c) => {
        const otherId =
          c.user1_id === currentUserId ? c.user2_id : c.user1_id;
        const profile = profileMap[otherId] || {
          display_name: "Utilisateur",
          flag: "🌍",
        };
        const msgs = c.messages || [];
        const lastMsg = msgs.length > 0 ? msgs[msgs.length - 1] : null;

        return {
          id: c.id,
          otherUserId: otherId,
          otherUserName: profile.display_name,
          otherUserAvatar: profile.avatar_url,
          otherUserFlag: profile.flag,
          lastMsg,
          created_at: c.created_at,
        };
      });

      setConversations(enriched);
    } catch (err) {
      console.error("Erreur conversations:", err);
    } finally {
      setLoading(false);
    }
  }, [currentUserId]);

  useEffect(() => {
    if (!currentUserId) return;

    fetchConversations();

    const channel = supabase
      .channel("public:messages")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "messages" },
        () => fetchConversations()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUserId, fetchConversations]);

  useEffect(() => {
    if (!activeChat?.id) return;

    const fetchMessages = async () => {
      const { data, error } = await supabase
        .from("messages")
        .select("id, text, created_at, sender_id")
        .eq("conversation_id", activeChat.id)
        .order("created_at", { ascending: true })
        .limit(150);

      if (!error) setMessages(data || []);
    };

    fetchMessages();

    const channel = supabase
      .channel(`room_${activeChat.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${activeChat.id}`,
        },
        (payload) => {
          setMessages((prev) => [...prev, payload.new]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeChat]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (!showUserSelector || !currentUserId) return;

    const fetchUsers = async () => {
      const { data: users } = await supabase
        .from("profiles")
        .select("user_id, display_name, handle, avatar_url, flag")
        .neq("user_id", currentUserId)
        .limit(50);

      if (users) setAvailableUsers(users);
    };
    fetchUsers();
  }, [showUserSelector, currentUserId]);

  const createOrOpenConversation = async (
    otherUserId,
    otherUserName,
    otherUserAvatar,
    otherUserFlag
  ) => {
    if (!currentUserId || otherUserId === currentUserId) return;
    setShowUserSelector(false);

    const { data: existing } = await supabase
      .from("conversations")
      .select("id")
      .or(
        `and(user1_id.eq.\( {currentUserId},user2_id.eq. \){otherUserId}),and(user1_id.eq.\( {otherUserId},user2_id.eq. \){currentUserId})`
      )
      .maybeSingle();

    const chatData = {
      otherUserId,
      otherUserName: otherUserName || "Utilisateur",
      otherUserAvatar,
      otherUserFlag: otherUserFlag || "🌍",
    };

    if (existing) {
      setActiveChat({ id: existing.id, ...chatData });
    } else {
      const { data: newConv, error } = await supabase
        .from("conversations")
        .insert({ user1_id: currentUserId, user2_id: otherUserId })
        .select()
        .single();

      if (!error) {
        setActiveChat({ id: newConv.id, ...chatData });
      } else {
        console.error("Erreur création conversation:", error);
        alert("Impossible de créer la conversation");
      }
    }
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!newMessage.trim() || !activeChat || !currentUserId) return;

    const text = newMessage.trim();
    setNewMessage("");

    try {
      const { error } = await supabase.from("messages").insert({
        conversation_id: activeChat.id,
        sender_id: currentUserId,
        text,
      });
      if (error) throw error;
      if (typeof onRewardPoints === "function") onRewardPoints(1);
    } catch (err) {
      console.error("Erreur envoi:", err);
      setNewMessage(text);
    }
  };

  // --- SÉLECTION D'UTILISATEUR ---
  if (showUserSelector) {
    return (
      <div className="flex flex-col h-full p-4" style={{ background: COLORS.surface }}>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-bold" style={{ color: COLORS.ivory }}>
            Nouvelle conversation
          </h2>
          <button
            onClick={() => setShowUserSelector(false)}
            className="p-2 rounded-full hover:bg-white/10"
            style={{ color: COLORS.muted }}
          >
            <X size={20} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto space-y-2">
          {availableUsers.map((user) => (
            <div
              key={user.user_id}
              onClick={() =>
                createOrOpenConversation(
                  user.user_id,
                  user.display_name,
                  user.avatar_url,
                  user.flag
                )
              }
              className="p-4 rounded-2xl border cursor-pointer hover:border-amber-400/50 transition-all"
              style={{ background: COLORS.surface, borderColor: COLORS.border }}
            >
              <div className="flex items-center gap-3">
                {user.avatar_url ? (
                  <img
                    src={user.avatar_url}
                    alt=""
                    className="w-10 h-10 rounded-full object-cover border"
                    style={{ borderColor: COLORS.borderGold }}
                  />
                ) : (
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-lg"
                    style={{ background: COLORS.surface2, color: COLORS.ivory }}
                  >
                    {user.flag || "🌍"}
                  </div>
                )}
                <div>
                  <p className="font-bold text-sm" style={{ color: COLORS.ivory }}>
                    {user.display_name || user.handle}
                  </p>
                  <p className="text-xs" style={{ color: COLORS.muted }}>
                    {user.handle}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // --- FENÊTRE DE CHAT ---
  if (activeChat) {
    return (
      <div className="flex flex-col h-full" style={{ background: COLORS.surface }}>
        <div
          className="flex items-center gap-3 p-4 border-b"
          style={{ borderColor: COLORS.border }}
        >
          <button
            onClick={() => setActiveChat(null)}
            className="p-2 rounded-full hover:bg-white/10"
            style={{ color: COLORS.ivory }}
          >
            <ArrowLeft size={20} />
          </button>
          {activeChat.otherUserAvatar ? (
            <img
              src={activeChat.otherUserAvatar}
              alt=""
              className="w-8 h-8 rounded-full object-cover border"
              style={{ borderColor: COLORS.borderGold }}
            />
          ) : (
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs"
              style={{ background: COLORS.surface2, color: COLORS.ivory }}
            >
              {activeChat.otherUserFlag || "?"}
            </div>
          )}
          <h3 className="font-bold text-sm" style={{ color: COLORS.ivory }}>
            {activeChat.otherUserName}
          </h3>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {messages.length === 0 ? (
            <div className="text-center py-10" style={{ color: COLORS.muted }}>
              <p className="text-sm">
                Dites bonjour à {activeChat.otherUserName} ! 👋
              </p>
            </div>
          ) : (
            messages.map((msg) => {
              const isMe = msg.sender_id === currentUserId;
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
                      {activeChat.otherUserAvatar ? (
                        <img
                          src={activeChat.otherUserAvatar}
                          className="w-full h-full object-cover"
                          alt=""
                        />
                      ) : (
                        activeChat.otherUserFlag
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
                    <p>{msg.text}</p>
                    <p
                      className={`text-[10px] mt-1 ${
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
            placeholder="Votre message..."
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

  // --- LISTE DES CONVERSATIONS ---
  return (
    <div className="flex flex-col h-full p-4">
      <div className="flex items-center justify-between mb-6">
        <h2
          className="text-xl font-bold flex items-center gap-2"
          style={{ color: COLORS.ivory }}
        >
          <MessageCircle size={24} style={{ color: COLORS.gold }} />
          Messages
        </h2>
        <button
          onClick={() => setShowUserSelector(true)}
          className="p-2 rounded-full hover:bg-white/10 transition-colors"
          style={{ color: COLORS.gold }}
        >
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
            <div
              className="w-20 h-20 rounded-full mx-auto mb-4 flex items-center justify-center"
              style={{ background: COLORS.surface }}
            >
              <MessageCircle size={40} style={{ color: COLORS.muted }} />
            </div>
            <p className="font-bold mb-2" style={{ color: COLORS.ivory }}>
              Aucune conversation
            </p>
            <button
              onClick={() => setShowUserSelector(true)}
              className="px-6 py-3 rounded-xl font-bold text-sm mt-4"
              style={{ background: COLORS.gold, color: "#000" }}
            >
              Démarrer une conversation
            </button>
          </div>
        ) : (
          conversations.map((conv) => (
            <div
              key={conv.id}
              onClick={() => setActiveChat(conv)}
              className="p-4 rounded-2xl border cursor-pointer hover:border-amber-400/50 transition-all"
              style={{ background: COLORS.surface, borderColor: COLORS.border }}
            >
              <div className="flex items-center gap-3">
                {conv.otherUserAvatar ? (
                  <img
                    src={conv.otherUserAvatar}
                    alt=""
                    className="w-12 h-12 rounded-full object-cover border"
                    style={{ borderColor: COLORS.borderGold }}
                  />
                ) : (
                  <div
                    className="w-12 h-12 rounded-full flex items-center justify-center font-bold text-lg"
                    style={{ background: COLORS.surface2, color: COLORS.ivory }}
                  >
                    {conv.otherUserFlag || "🌍"}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-sm truncate" style={{ color: COLORS.ivory }}>
                    {conv.otherUserName}
                  </p>
                  <p className="text-xs truncate" style={{ color: COLORS.muted }}>
                    {conv.lastMsg?.text || "Aucun message"}
                  </p>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
        }
