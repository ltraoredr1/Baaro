/**
 * MessagesTab avec chiffrement E2E + anti-capture d'écran
 */
import { useState, useEffect, useRef } from "react";
import {
  ArrowLeft,
  Send,
  MessageCircle,
  Plus,
  X,
  Lock,
  AlertTriangle,
} from "lucide-react";
import { COLORS } from "../theme.js";
import { supabase } from "../supabaseClient.js";
import { useMessaging } from "../hooks/useMessaging.js";
import { useCryptoKeys } from "../hooks/useCryptoKeys.js";
import {
  enableSecureScreen,
  disableSecureScreen,
  attachWebPrivacyBlur,
} from "../lib/secureScreen.js";

export function MessagesTab({ onRewardPoints }) {
  const [currentUserId, setCurrentUserId] = useState(null);
  const [conversations, setConversations] = useState([]);
  const [activeChat, setActiveChat] = useState(null);
  const [newMessage, setNewMessage] = useState("");
  const [loadingConvs, setLoadingConvs] = useState(true);
  const [showUserSelector, setShowUserSelector] = useState(false);
  const [availableUsers, setAvailableUsers] = useState([]);
  const messagesEndRef = useRef(null);

  const { ready: keysReady, error: keysError } = useCryptoKeys(currentUserId);

  const {
    messages,
    loading: loadingMessages,
    sendMessage,
    sendError,
  } = useMessaging(
    activeChat?.id ?? null,
    currentUserId,
    activeChat?.otherUserId ?? null
  );

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setCurrentUserId(user.id);
    });
  }, []);

  // Anti-capture d'écran (Android FLAG_SECURE + flou web)
  useEffect(() => {
    if (!activeChat) return;

    enableSecureScreen();
    const cleanupWeb = attachWebPrivacyBlur("chat-content");

    return () => {
      disableSecureScreen();
      cleanupWeb();
    };
  }, [activeChat]);

  useEffect(() => {
    if (!currentUserId) return;

    const fetchConversations = async () => {
      setLoadingConvs(true);
      try {
        const { data, error } = await supabase
          .from("conversations")
          .select(
            `id, user1_id, user2_id, created_at,
             messages (text, created_at, sender_id)`
          )
          .or(`user1_id.eq.\( {currentUserId},user2_id.eq. \){currentUserId}`)
          .order("created_at", { ascending: false });

        if (error || !data) return;

        const otherIds = [
          ...new Set(
            data.map((c) =>
              c.user1_id === currentUserId ? c.user2_id : c.user1_id
            )
          ),
        ];

        const { data: profiles } = await supabase
          .from("profiles")
          .select("user_id, display_name, avatar_url, flag, public_key")
          .in("user_id", otherIds);

        const profileMap = {};
        (profiles || []).forEach((p) => {
          profileMap[p.user_id] = p;
        });

        const enriched = data.map((c) => {
          const otherId =
            c.user1_id === currentUserId ? c.user2_id : c.user1_id;
          const profile = profileMap[otherId] || {
            display_name: "Utilisateur",
            flag: "🌍",
          };
          return {
            ...c,
            otherUserId: otherId,
            otherUserName: profile.display_name,
            otherUserAvatar: profile.avatar_url,
            otherUserFlag: profile.flag,
            hasPublicKey: !!profile.public_key,
            lastMsg: c.messages?.[c.messages.length - 1],
          };
        });

        setConversations(enriched);
      } catch (err) {
        console.error("Erreur conversations:", err);
      } finally {
        setLoadingConvs(false);
      }
    };

    fetchConversations();

    const channel = supabase
      .channel("public:conversations")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "messages" },
        () => fetchConversations()
      )
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [currentUserId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (!showUserSelector || !currentUserId) return;
    supabase
      .from("profiles")
      .select("user_id, display_name, handle, avatar_url, flag, public_key")
      .neq("user_id", currentUserId)
      .then(({ data }) => {
        if (data) setAvailableUsers(data);
      });
  }, [showUserSelector, currentUserId]);

  const createOrOpenConversation = async (
    otherUserId,
    otherUserName,
    otherUserAvatar,
    otherUserFlag,
    hasPublicKey
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
      hasPublicKey: !!hasPublicKey,
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

  const handleSend = async (e) => {
    e.preventDefault();
    if (!newMessage.trim() || !activeChat) return;

    const text = newMessage.trim();
    setNewMessage("");

    const result = await sendMessage(text);
    if (!result.ok) {
      setNewMessage(text);
    }
  };

  // ─── Sélecteur d'utilisateur ─────────────────────────────────────────────

  if (showUserSelector) {
    return (
      <div
        className="flex flex-col h-full p-4"
        style={{ background: COLORS.surface }}
      >
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-bold" style={{ color: COLORS.ivory }}>
            Nouveau chat
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
                  user.flag,
                  !!user.public_key
                )
              }
              className="p-4 rounded-2xl border cursor-pointer hover:border-amber-400/50 transition-all"
              style={{
                background: COLORS.surface,
                borderColor: COLORS.border,
              }}
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
                    style={{
                      background: COLORS.surface2,
                      color: COLORS.ivory,
                    }}
                  >
                    {user.flag || "🌍"}
                  </div>
                )}
                <div className="flex-1">
                  <p
                    className="font-bold text-sm"
                    style={{ color: COLORS.ivory }}
                  >
                    {user.display_name || user.handle}
                  </p>
                  <p className="text-xs" style={{ color: COLORS.muted }}>
                    {user.handle}
                  </p>
                </div>
                {user.public_key ? (
                  <Lock size={14} style={{ color: COLORS.gold }} />
                ) : (
                  <span className="text-[10px]" style={{ color: COLORS.muted }}>
                    pas de clé
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ─── Fenêtre de chat ─────────────────────────────────────────────────────

  if (activeChat) {
    return (
      <div
        className="flex flex-col h-full"
        style={{ background: COLORS.surface }}
      >
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
          <div className="flex-1">
            <h3 className="font-bold text-sm" style={{ color: COLORS.ivory }}>
              {activeChat.otherUserName}
            </h3>
            {activeChat.hasPublicKey && (
              <p
                className="text-[10px] flex items-center gap-1"
                style={{ color: COLORS.gold }}
              >
                <Lock size={10} /> Chiffrement E2E actif
              </p>
            )}
          </div>
        </div>

        {!activeChat.hasPublicKey && (
          <div
            className="mx-4 mt-3 p-3 rounded-xl flex items-start gap-2 text-xs"
            style={{ background: "rgba(245,158,11,0.15)", color: "#FBBF24" }}
          >
            <AlertTriangle size={16} className="shrink-0 mt-0.5" />
            <span>
              Ce contact n'a pas encore de clé publique. Demandez-lui d'ouvrir
              BAARO une fois pour activer le chiffrement.
            </span>
          </div>
        )}

        <div
          id="chat-content"
          className="flex-1 overflow-y-auto p-4 space-y-3"
        >
          {loadingMessages ? (
            <div className="text-center py-10" style={{ color: COLORS.muted }}>
              <div className="animate-spin inline-block w-6 h-6 border-2 border-current border-t-transparent rounded-full mb-2" />
              <p className="text-sm">Déchiffrement…</p>
            </div>
          ) : messages.length === 0 ? (
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
                  className={`flex gap-2 ${
                    isMe ? "flex-row-reverse" : "flex-row"
                  }`}
                >
                  {!isMe && (
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center text-xs shrink-0 border overflow-hidden"
                      style={{
                        borderColor: COLORS.borderGold,
                        background: COLORS.surface2,
                      }}
                    >
                      {activeChat.otherUserFlag || "?"}
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
                    <p className={msg.decryptFailed ? "italic opacity-70" : ""}>
                      {msg.plaintext}
                    </p>
                    <div
                      className={`flex items-center gap-1.5 mt-1 text-[10px] ${
                        isMe ? "text-black/60" : "text-gray-400"
                      }`}
                    >
                      {msg.encrypted && !msg.decryptFailed && (
                        <Lock size={9} />
                      )}
                      <span>
                        {new Date(msg.created_at).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        {sendError && (
          <div
            className="mx-4 mb-2 p-2 rounded-lg text-xs"
            style={{ background: "rgba(239,68,68,0.15)", color: "#F87171" }}
          >
            {sendError}
          </div>
        )}

        <form
          onSubmit={handleSend}
          className="p-4 border-t flex gap-2"
          style={{ borderColor: COLORS.border }}
        >
          <input
            type="text"
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder={
              activeChat.hasPublicKey
                ? "Message chiffré…"
                : "Message (pas encore chiffré)…"
            }
            disabled={!keysReady || !activeChat.hasPublicKey}
            className="flex-1 px-4 py-3 rounded-xl border text-sm outline-none disabled:opacity-50"
            style={{
              background: COLORS.surface2,
              borderColor: COLORS.border,
              color: COLORS.ivory,
            }}
          />
          <button
            type="submit"
            disabled={
              !newMessage.trim() || !keysReady || !activeChat.hasPublicKey
            }
            className="p-3 rounded-xl disabled:opacity-50"
            style={{ background: COLORS.gold, color: "#000" }}
          >
            <Send size={18} />
          </button>
        </form>
      </div>
    );
  }

  // ─── Liste des conversations ─────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full p-4">
      <div className="flex items-center justify-between mb-6">
        <h2
          className="text-xl font-bold flex items-center gap-2"
          style={{ color: COLORS.ivory }}
        >
          <MessageCircle size={24} style={{ color: COLORS.gold }} />
          Chat
          {keysReady && <Lock size={14} style={{ color: COLORS.gold }} />}
        </h2>
        <button
          onClick={() => setShowUserSelector(true)}
          className="p-2 rounded-full hover:bg-white/10 transition-colors"
          style={{ color: COLORS.gold }}
        >
          <Plus size={20} />
        </button>
      </div>

      {keysError && (
        <div
          className="mb-4 p-3 rounded-xl text-xs"
          style={{ background: "rgba(239,68,68,0.15)", color: "#F87171" }}
        >
          Erreur crypto : {keysError}
        </div>
      )}

      <div className="flex-1 overflow-y-auto space-y-2">
        {loadingConvs ? (
          <div className="text-center py-10" style={{ color: COLORS.muted }}>
            <div className="animate-spin inline-block w-8 h-8 border-2 border-current border-t-transparent rounded-full mb-3" />
            <p className="text-sm">Chargement…</p>
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
              Aucun chat
            </p>
            <p className="text-sm" style={{ color: COLORS.muted }}>
              Appuyez sur + pour démarrer
            </p>
          </div>
        ) : (
          conversations.map((c) => (
            <div
              key={c.id}
              onClick={() =>
                setActiveChat({
                  id: c.id,
                  otherUserId: c.otherUserId,
                  otherUserName: c.otherUserName,
                  otherUserAvatar: c.otherUserAvatar,
                  otherUserFlag: c.otherUserFlag,
                  hasPublicKey: c.hasPublicKey,
                })
              }
              className="p-4 rounded-2xl border cursor-pointer hover:border-amber-400/40 transition-all"
              style={{
                background: COLORS.surface,
                borderColor: COLORS.border,
              }}
            >
              <div className="flex items-center gap-3">
                {c.otherUserAvatar ? (
                  <img
                    src={c.otherUserAvatar}
                    alt=""
                    className="w-11 h-11 rounded-full object-cover border"
                    style={{ borderColor: COLORS.borderGold }}
                  />
                ) : (
                  <div
                    className="w-11 h-11 rounded-full flex items-center justify-center font-bold"
                    style={{
                      background: COLORS.surface2,
                      color: COLORS.ivory,
                    }}
                  >
                    {c.otherUserFlag || "🌍"}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p
                      className="font-bold text-sm truncate"
                      style={{ color: COLORS.ivory }}
                    >
                      {c.otherUserName}
                    </p>
                    {c.hasPublicKey && (
                      <Lock size={11} style={{ color: COLORS.gold }} />
                    )}
                  </div>
                  <p
                    className="text-xs truncate"
                    style={{ color: COLORS.muted }}
                  >
                    {c.lastMsg
                      ? c.lastMsg.text?.startsWith("{")
                        ? "🔒 Message chiffré"
                        : c.lastMsg.text
                      : "Aucun message"}
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
