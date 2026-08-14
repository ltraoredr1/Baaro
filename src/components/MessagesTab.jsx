import { useState, useEffect, useRef, useCallback } from "react";
import {
  ArrowLeft,
  Send,
  MessageCircle,
  Plus,
  X,
  Search,
  Users,
  UserPlus,
} from "lucide-react";
import { COLORS } from "../theme.js";
import { supabase } from "../supabaseClient.js";
import {
  getFriends,
  getFollowing,
  getFollowers,
} from "../supabaseClient.js";

/**
 * Messages + liste d'amis + recherche pour démarrer un chat
 */
export function MessagesTab({ onRewardPoints, userId: propUserId }) {
  const [currentUserId, setCurrentUserId] = useState(propUserId || null);
  const [conversations, setConversations] = useState([]);
  const [activeChat, setActiveChat] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [showNewChat, setShowNewChat] = useState(false);
  const [pickerTab, setPickerTab] = useState("friends"); // friends | search
  const [friends, setFriends] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [loadingFriends, setLoadingFriends] = useState(false);
  const messagesEndRef = useRef(null);
  const profilesCache = useRef({});

  useEffect(() => {
    if (propUserId) {
      setCurrentUserId(propUserId);
      return;
    }
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setCurrentUserId(user.id);
    });
  }, [propUserId]);

  const fetchProfiles = useCallback(async (ids) => {
    const missing = ids.filter((id) => id && !profilesCache.current[id]);
    if (missing.length === 0) return profilesCache.current;
    const { data } = await supabase
      .from("profiles")
      .select("user_id, display_name, handle, avatar_url, flag")
      .in("user_id", missing);
    (data || []).forEach((p) => {
      profilesCache.current[p.user_id] = p;
    });
    return profilesCache.current;
  }, []);

  const fetchConversations = useCallback(async () => {
    if (!currentUserId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("conversations")
        .select("id, user1_id, user2_id, created_at")
        .or(`user1_id.eq.${currentUserId},user2_id.eq.${currentUserId}`)
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) throw error;

      const rows = data || [];
      const otherIds = rows.map((c) =>
        c.user1_id === currentUserId ? c.user2_id : c.user1_id
      );
      await fetchProfiles(otherIds);

      // Derniers messages (best-effort)
      const enriched = await Promise.all(
        rows.map(async (c) => {
          const otherId =
            c.user1_id === currentUserId ? c.user2_id : c.user1_id;
          const profile = profilesCache.current[otherId] || {
            display_name: "Membre",
            flag: "🌍",
            handle: "membre",
          };
          const { data: msgs } = await supabase
            .from("messages")
            .select("text, created_at, sender_id")
            .eq("conversation_id", c.id)
            .order("created_at", { ascending: false })
            .limit(1);
          const lastMsg = msgs?.[0] || null;
          return {
            id: c.id,
            otherUserId: otherId,
            otherUserName: profile.display_name || profile.handle || "Membre",
            otherUserHandle: profile.handle,
            otherUserAvatar: profile.avatar_url,
            otherUserFlag: profile.flag || "🌍",
            lastMsg,
            created_at: c.created_at,
          };
        })
      );

      // Trier par dernier message
      enriched.sort((a, b) => {
        const ta = a.lastMsg?.created_at || a.created_at || "";
        const tb = b.lastMsg?.created_at || b.created_at || "";
        return tb.localeCompare(ta);
      });

      setConversations(enriched);
    } catch (err) {
      console.error("Erreur conversations:", err);
    } finally {
      setLoading(false);
    }
  }, [currentUserId, fetchProfiles]);

  useEffect(() => {
    if (!currentUserId) return;
    fetchConversations();
    const channel = supabase
      .channel("public:messages-list")
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
        .limit(200);
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
          setMessages((prev) => {
            if (prev.some((m) => m.id === payload.new.id)) return prev;
            return [...prev, payload.new];
          });
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

  // ---- Amis ----
  const loadFriends = useCallback(async () => {
    if (!currentUserId) return;
    setLoadingFriends(true);
    try {
      const [{ data: friendIds }, { data: followingIds }, { data: followerIds }] =
        await Promise.all([
          getFriends(),
          getFollowing(),
          getFollowers(),
        ]);

      const ids = [
        ...new Set([
          ...(friendIds || []),
          ...(followingIds || []),
          ...(followerIds || []),
        ]),
      ].filter((id) => id && id !== currentUserId);

      if (ids.length === 0) {
        setFriends([]);
        return;
      }

      await fetchProfiles(ids);
      setFriends(
        ids.map((id) => {
          const p = profilesCache.current[id] || {};
          return {
            user_id: id,
            display_name: p.display_name || "Membre",
            handle: p.handle || `@user_${String(id).slice(0, 8)}`,
            avatar_url: p.avatar_url,
            flag: p.flag || "🌍",
            isFriend: (friendIds || []).includes(id),
          };
        })
      );
    } catch (e) {
      console.error(e);
      setFriends([]);
    } finally {
      setLoadingFriends(false);
    }
  }, [currentUserId, fetchProfiles]);

  useEffect(() => {
    if (showNewChat && pickerTab === "friends") loadFriends();
  }, [showNewChat, pickerTab, loadFriends]);

  // ---- Recherche membres ----
  useEffect(() => {
    if (!showNewChat || pickerTab !== "search") return;
    const q = searchQuery.trim();
    if (q.length < 2) {
      setSearchResults([]);
      return;
    }
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const pattern = `%${q}%`;
        const { data, error } = await supabase
          .from("profiles")
          .select("user_id, display_name, handle, avatar_url, flag")
          .or(`display_name.ilike.${pattern},handle.ilike.${pattern}`)
          .neq("user_id", currentUserId)
          .limit(25);
        if (error) throw error;
        setSearchResults(data || []);
      } catch (e) {
        console.error(e);
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [searchQuery, showNewChat, pickerTab, currentUserId]);

  const createOrOpenConversation = async (otherUserId, name, avatar, flag) => {
    if (!currentUserId || !otherUserId) return;

    // Chercher conversation existante (dans les deux sens)
    const { data: existingList } = await supabase
      .from("conversations")
      .select("id")
      .or(
        `and(user1_id.eq.${currentUserId},user2_id.eq.${otherUserId}),and(user1_id.eq.${otherUserId},user2_id.eq.${currentUserId})`
      )
      .limit(1);

    const existing = existingList?.[0];
    const chatData = {
      otherUserId,
      otherUserName: name || "Membre",
      otherUserAvatar: avatar,
      otherUserFlag: flag || "🌍",
    };

    if (existing) {
      setActiveChat({ id: existing.id, ...chatData });
      setShowNewChat(false);
      return;
    }

    // user1 = plus petit uuid pour respecter unique (optionnel)
    const [u1, u2] =
      currentUserId < otherUserId
        ? [currentUserId, otherUserId]
        : [otherUserId, currentUserId];

    const { data: newConv, error } = await supabase
      .from("conversations")
      .insert({ user1_id: u1, user2_id: u2 })
      .select()
      .single();

    if (error) {
      console.error(error);
      alert("Impossible de créer la conversation : " + error.message);
      return;
    }
    setActiveChat({ id: newConv.id, ...chatData });
    setShowNewChat(false);
    fetchConversations();
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
        recipient_id: activeChat.otherUserId,
        text,
      });
      if (error) throw error;
      if (typeof onRewardPoints === "function") onRewardPoints(1);
    } catch (err) {
      console.error("Erreur envoi:", err);
      setNewMessage(text);
    }
  };

  const renderUserRow = (user, badge) => (
    <button
      key={user.user_id}
      type="button"
      onClick={() =>
        createOrOpenConversation(
          user.user_id,
          user.display_name,
          user.avatar_url,
          user.flag
        )
      }
      className="w-full p-3 rounded-2xl border text-left hover:border-amber-400/50 transition flex items-center gap-3"
      style={{ background: COLORS.surface, borderColor: COLORS.border }}
    >
      <div className="w-11 h-11 rounded-full bg-white/10 flex items-center justify-center overflow-hidden text-lg shrink-0">
        {user.avatar_url ? (
          <img src={user.avatar_url} className="w-full h-full object-cover" alt="" />
        ) : (
          user.flag || "🌍"
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-sm truncate" style={{ color: COLORS.ivory }}>
          {user.display_name || "Membre"}
        </p>
        <p className="text-xs truncate" style={{ color: COLORS.muted }}>
          {user.handle || ""}
        </p>
      </div>
      {badge && (
        <span
          className="text-[10px] px-2 py-0.5 rounded-full font-bold shrink-0"
          style={{ background: "rgba(217,174,82,0.2)", color: COLORS.gold }}
        >
          {badge}
        </span>
      )}
      <MessageCircle size={16} style={{ color: COLORS.gold }} />
    </button>
  );

  // --- Nouvelle conversation (amis + recherche) ---
  if (showNewChat) {
    return (
      <div className="flex flex-col h-full max-w-2xl mx-auto w-full pb-20">
        <div className="flex items-center justify-between mb-4 px-1">
          <h2 className="text-lg font-bold" style={{ color: COLORS.ivory }}>
            Nouvelle conversation
          </h2>
          <button
            onClick={() => setShowNewChat(false)}
            className="p-2 rounded-full hover:bg-white/10"
            style={{ color: COLORS.muted }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Sous-onglets */}
        <div className="flex gap-2 mb-4">
          <button
            onClick={() => setPickerTab("friends")}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold border"
            style={{
              background:
                pickerTab === "friends"
                  ? "rgba(217,174,82,0.2)"
                  : "rgba(255,255,255,0.03)",
              borderColor:
                pickerTab === "friends" ? COLORS.borderGold : COLORS.border,
              color: pickerTab === "friends" ? COLORS.gold : COLORS.muted,
            }}
          >
            <Users size={16} />
            Amis
          </button>
          <button
            onClick={() => setPickerTab("search")}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold border"
            style={{
              background:
                pickerTab === "search"
                  ? "rgba(217,174,82,0.2)"
                  : "rgba(255,255,255,0.03)",
              borderColor:
                pickerTab === "search" ? COLORS.borderGold : COLORS.border,
              color: pickerTab === "search" ? COLORS.gold : COLORS.muted,
            }}
          >
            <Search size={16} />
            Recherche
          </button>
        </div>

        {pickerTab === "search" && (
          <div className="relative mb-4">
            <Search
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2"
              style={{ color: COLORS.muted }}
            />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Nom ou @handle…"
              className="w-full pl-10 pr-4 py-3 rounded-xl border text-sm outline-none"
              style={{
                background: COLORS.surface2,
                borderColor: COLORS.border,
                color: COLORS.ivory,
              }}
              autoFocus
            />
          </div>
        )}

        <div className="flex-1 overflow-y-auto space-y-2">
          {pickerTab === "friends" && (
            <>
              {loadingFriends && (
                <p className="text-center text-sm py-8" style={{ color: COLORS.muted }}>
                  Chargement des amis…
                </p>
              )}
              {!loadingFriends && friends.length === 0 && (
                <div className="text-center py-12" style={{ color: COLORS.muted }}>
                  <UserPlus size={36} className="mx-auto mb-3 opacity-40" />
                  <p className="text-sm mb-1">Aucun ami pour l’instant</p>
                  <p className="text-xs opacity-70">
                    Suis des membres dans Communauté, ou utilise Recherche
                  </p>
                </div>
              )}
              {friends.map((u) =>
                renderUserRow(u, u.isFriend ? "Ami" : "Suivi")
              )}
            </>
          )}

          {pickerTab === "search" && (
            <>
              {searchQuery.trim().length < 2 && (
                <p className="text-center text-sm py-8" style={{ color: COLORS.muted }}>
                  Tape au moins 2 caractères
                </p>
              )}
              {searching && (
                <p className="text-center text-sm py-4" style={{ color: COLORS.muted }}>
                  Recherche…
                </p>
              )}
              {!searching &&
                searchQuery.trim().length >= 2 &&
                searchResults.length === 0 && (
                  <p className="text-center text-sm py-8" style={{ color: COLORS.muted }}>
                    Aucun membre trouvé
                  </p>
                )}
              {searchResults.map((u) => renderUserRow(u))}
            </>
          )}
        </div>
      </div>
    );
  }

  // --- Conversation active ---
  if (activeChat) {
    return (
      <div className="flex flex-col h-[calc(100dvh-140px)] max-w-2xl mx-auto w-full">
        <div
          className="flex items-center gap-3 p-3 border-b"
          style={{ borderColor: COLORS.border }}
        >
          <button
            onClick={() => {
              setActiveChat(null);
              setMessages([]);
              fetchConversations();
            }}
            className="p-2 rounded-full hover:bg-white/10"
            style={{ color: COLORS.ivory }}
          >
            <ArrowLeft size={20} />
          </button>
          <div className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center overflow-hidden text-sm">
            {activeChat.otherUserAvatar ? (
              <img
                src={activeChat.otherUserAvatar}
                className="w-full h-full object-cover"
                alt=""
              />
            ) : (
              activeChat.otherUserFlag || "🌍"
            )}
          </div>
          <div className="min-w-0">
            <p className="font-bold text-sm truncate" style={{ color: COLORS.ivory }}>
              {activeChat.otherUserName}
            </p>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {messages.length === 0 && (
            <p className="text-center text-sm py-10" style={{ color: COLORS.muted }}>
              Début de la conversation — dis bonjour 👋
            </p>
          )}
          {messages.map((msg) => {
            const isMe = msg.sender_id === currentUserId;
            return (
              <div
                key={msg.id}
                className={`flex ${isMe ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[75%] px-4 py-2.5 rounded-2xl text-sm ${
                    isMe ? "rounded-tr-sm" : "rounded-tl-sm"
                  }`}
                  style={{
                    background: isMe ? COLORS.gold : COLORS.surface2,
                    color: isMe ? "#000" : COLORS.ivory,
                  }}
                >
                  <p className="whitespace-pre-wrap break-words">{msg.text}</p>
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
          })}
          <div ref={messagesEndRef} />
        </div>

        <form
          onSubmit={handleSendMessage}
          className="p-3 border-t flex gap-2"
          style={{ borderColor: COLORS.border }}
        >
          <input
            type="text"
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder="Votre message…"
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

  // --- Liste des conversations ---
  return (
    <div className="flex flex-col h-full max-w-2xl mx-auto w-full pb-20 p-4">
      <div className="flex items-center justify-between mb-5">
        <h2
          className="text-xl font-bold flex items-center gap-2"
          style={{ color: COLORS.ivory }}
        >
          <MessageCircle size={24} style={{ color: COLORS.gold }} />
          Messages
        </h2>
        <button
          onClick={() => {
            setShowNewChat(true);
            setPickerTab("friends");
            setSearchQuery("");
          }}
          className="flex items-center gap-1.5 px-3 py-2 rounded-full text-sm font-bold"
          style={{ background: "rgba(217,174,82,0.2)", color: COLORS.gold }}
        >
          <Plus size={16} />
          Nouveau
        </button>
      </div>

      {/* Accès rapide amis */}
      <button
        onClick={() => {
          setShowNewChat(true);
          setPickerTab("friends");
        }}
        className="mb-4 w-full flex items-center gap-3 p-3 rounded-2xl border text-left"
        style={{ background: "rgba(255,255,255,0.03)", borderColor: COLORS.border }}
      >
        <Users size={18} style={{ color: COLORS.gold }} />
        <div>
          <p className="text-sm font-semibold" style={{ color: COLORS.ivory }}>
            Écrire à un ami
          </p>
          <p className="text-xs" style={{ color: COLORS.muted }}>
            Liste d’amis ou recherche par nom / @handle
          </p>
        </div>
      </button>

      {loading && (
        <p className="text-center py-10 text-sm" style={{ color: COLORS.muted }}>
          Chargement…
        </p>
      )}

      {!loading && conversations.length === 0 && (
        <div className="text-center py-16" style={{ color: COLORS.muted }}>
          <MessageCircle size={40} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm mb-2">Aucune conversation</p>
          <button
            onClick={() => setShowNewChat(true)}
            className="text-sm font-bold"
            style={{ color: COLORS.gold }}
          >
            Commencer un chat
          </button>
        </div>
      )}

      <div className="space-y-2">
        {conversations.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setActiveChat(c)}
            className="w-full p-3 rounded-2xl border text-left hover:border-amber-400/40 transition flex items-center gap-3"
            style={{ background: COLORS.surface, borderColor: COLORS.border }}
          >
            <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center overflow-hidden text-lg shrink-0">
              {c.otherUserAvatar ? (
                <img
                  src={c.otherUserAvatar}
                  className="w-full h-full object-cover"
                  alt=""
                />
              ) : (
                c.otherUserFlag
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-sm truncate" style={{ color: COLORS.ivory }}>
                {c.otherUserName}
              </p>
              <p className="text-xs truncate" style={{ color: COLORS.muted }}>
                {c.lastMsg?.text || "Nouvelle conversation"}
              </p>
            </div>
            {c.lastMsg?.created_at && (
              <span className="text-[10px] shrink-0" style={{ color: COLORS.muted }}>
                {new Date(c.lastMsg.created_at).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
