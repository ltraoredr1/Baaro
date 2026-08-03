import { useState, useEffect, useRef, useCallback } from "react";
import { ArrowLeft, Send, Users, Hash, MessageSquare } from "lucide-react";
import { COLORS } from "../theme.js";
import { supabase } from "../supabaseClient.js";

export function DebateRoom({ inviteCode, currentUserId, onBack }) {
  const [room, setRoom] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const messagesEndRef = useRef(null);
  const profilesCache = useRef({});

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  useEffect(() => {
    let isMounted = true;
    let channel = null;

    const loadDebate = async () => {
      try {
        // 1. Charger la salle
        const { data: roomData, error: roomError } = await supabase
          .from("debate_rooms")
          .select("id, title, topic, mode, invite_code, status, created_at, creator_id")
          .eq("invite_code", inviteCode)
          .single();

        if (roomError || !roomData) {
          if (isMounted) {
            setError("Salle introuvable");
            setLoading(false);
          }
          return;
        }

        if (isMounted) setRoom(roomData);

        // 2. Charger les messages (colonnes minimales)
        const { data: msgsData, error: msgsError } = await supabase
          .from("debate_messages")
          .select("id, text, created_at, user_id")
          .eq("room_id", roomData.id)
          .order("created_at", { ascending: true })
          .limit(200);

        if (!msgsError && msgsData && isMounted) {
          // 3. Une seule requête pour tous les profils
          const uniqueUserIds = [
            ...new Set(msgsData.map((m) => m.user_id).filter(Boolean)),
          ];

          let profilesMap = { ...profilesCache.current };

          if (uniqueUserIds.length > 0) {
            const missingIds = uniqueUserIds.filter((id) => !profilesMap[id]);
            if (missingIds.length > 0) {
              const { data: profiles } = await supabase
                .from("profiles")
                .select("user_id, display_name, avatar_url, flag")
                .in("user_id", missingIds);

              (profiles || []).forEach((p) => {
                profilesMap[p.user_id] = p;
              });
              profilesCache.current = profilesMap;
            }
          }

          const enrichedMessages = msgsData.map((m) => ({
            ...m,
            profile: profilesMap[m.user_id] || {
              display_name: "Membre",
              flag: "🌍",
            },
          }));

          setMessages(enrichedMessages);
        }

        // 4. Realtime
        channel = supabase
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
              let profile = profilesCache.current[payload.new.user_id];

              if (!profile && payload.new.user_id) {
                const { data } = await supabase
                  .from("profiles")
                  .select("display_name, avatar_url, flag")
                  .eq("user_id", payload.new.user_id)
                  .maybeSingle();

                profile = data || { display_name: "Membre", flag: "🌍" };
                profilesCache.current[payload.new.user_id] = profile;
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
      } catch (err) {
        if (isMounted) setError(err.message);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadDebate();

    return () => {
      isMounted = false;
      if (channel) supabase.removeChannel(channel);
    };
  }, [inviteCode]);

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!newMessage.trim() || !room || !currentUserId) return;

    const text = newMessage.trim();
    setNewMessage("");

    try {
      const { error } = await supabase.from("debate_messages").insert({
        room_id: room.id,
        user_id: currentUserId,
        text,
      });
      if (error) throw error;
    } catch (err) {
      console.error("Erreur envoi:", err);
      setNewMessage(text);
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

  return (
    <div className="flex flex-col h-full" style={{ background: COLORS.surface }}>
      <div
        className="flex items-center gap-3 p-4 border-b"
        style={{ borderColor: COLORS.border }}
      >
        <button
          onClick={onBack}
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
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 ? (
          <div className="text-center py-10" style={{ color: COLORS.muted }}>
            <MessageSquare size={48} className="mx-auto mb-3 opacity-50" />
            <p className="text-sm">Soyez le premier à donner votre avis !</p>
          </div>
        ) : (
          messages.map((msg) => {
            const isMe = msg.user_id === currentUserId;
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
