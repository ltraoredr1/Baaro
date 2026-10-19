/**
 * BAARO MessagesTab — version intégrée avec ChatInput & MessageBubble
 */
import { useMessaging } from "../hooks/useMessaging.js";
import { useState, useEffect, useRef, useCallback } from "react";
import {
  ArrowLeft, MessageCircle, Plus, X, Search,
  Phone, Video, MoreHorizontal, Loader2
} from "lucide-react";
import { COLORS as THEME_COLORS } from "../../../theme.js";
import { supabase } from "../../../supabaseClient.js";
import { uploadChatFile, mimeToMessageType } from "../../../lib/chatMedia.js";
import { createCallRoom, getCallToken, createCallRecord } from "../lib/chatCalls.js";
import { ChatCallModal } from "./ChatCallModal.jsx";
import { deserializePayload } from "../lib/crypto.js";
import { makeClientMessageId } from "../lib/chatFeatures.js";
import { ChatInput } from "./ChatInput.jsx";
import { MessageBubble } from "./MessageBubble.jsx";

/** auth.users.id (UUID) uniquement */
function isValidAuthUserId(value) {
  if (!value || typeof value !== "string") return false;
  if (value.startsWith("@") || (value.includes("@") && value.includes("."))) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function formatRelativeTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const now = Date.now();
  const diff = Math.floor((now - d.getTime()) / 1000);
  if (diff < 60) return "À l’instant";
  if (diff < 3600) return `${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} h`;
  if (diff < 604800) return `${Math.floor(diff / 86400)} j`;
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

function lastMessagePreview(msg) {
  if (!msg) return "Nouvelle conversation";
  if (msg.deleted_at) return "Message supprimé";
  if (msg.type === "voice") return "🎤 Message vocal";
  if (msg.type === "image") return "📷 Photo";
  if (msg.type === "video") return "🎬 Vidéo";
  if (msg.type === "file") return `📎 ${msg.file_name || "Fichier"}`;
  const payload = deserializePayload(msg.text);
  if (payload) return "🔒 Message chiffré";
  return (msg.text || "").slice(0, 80) || "…";
}

const FALLBACK = {
  bg: "#0B1220",
  surface: "#111A2C",
  surface2: "rgba(255,255,255,0.06)",
  surfaceHover: "rgba(255,255,255,0.09)",
  border: "rgba(255,255,255,0.08)",
  borderGold: "rgba(217,174,82,0.28)",
  ivory: "#F5F3EF",
  muted: "rgba(245,243,239,0.55)",
  gold: "#D9AE52",
  goldLight: "#F5C86B",
  teal: "#2DBFA6",
};

export function MessagesTab({ id: propId, onOpenProfile }) {
  const C = { ...FALLBACK, ...(THEME_COLORS || {}) };
  const [id, setId] = useState(propId || null);
  const [conversations, setConversations] = useState([]);
  const [activeChat, setActiveChat] = useState(null);
  const messaging = useMessaging(activeChat?.id, id, activeChat?.otherUserId);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [showNewChat, setShowNewChat] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [callState, setCallState] = useState(null);
  const [searchInChat, setSearchInChat] = useState("");
  const [showChatTools, setShowChatTools] = useState(false);
  const [typing, setTyping] = useState(false);
  const closeCall = useCallback(() => setCallState(null), []);

  const messagesEndRef = useRef(null);
  const profilesCache = useRef({});
  const typingChRef = useRef(null);
  const lastTypingSent = useRef(0);
  const incomingCallIdsRef = useRef(new Set());
  const listChannelRef = useRef(null);

  // ── Auth ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (propId) {
      setId(propId);
      return;
    }
    supabase.auth.getUser().then(({ data }) => {
      if (data?.user) setId(data.user.id);
    });
  }, [propId]);

  // ── Profiles cache ────────────────────────────────────────────────────────
  const fetchProfiles = useCallback(async (ids) => {
    const missing = [...new Set(ids.filter((x) => x && !profilesCache.current[x]))];
    if (missing.length === 0) return;
    const { data } = await supabase
      .from("profiles")
      .select("id, display_name, handle, avatar_url, flag")
      .in("id", missing);
    if (data) {
      data.forEach((p) => {
        profilesCache.current[p.id] = p;
      });
    }
  }, []);

  // ── Conversations ────────────────────────────────────────────────────────
  const fetchConversations = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const { data: rows, error } = await supabase
        .from("conversations")
        .select("id, user1_id, user2_id, created_at")
        .or(`user1_id.eq.${id},user2_id.eq.${id}`)
        .order("created_at", { ascending: false })
        .limit(60);

      if (error) throw error;
      const list = rows || [];
      if (list.length === 0) {
        setConversations([]);
        return;
      }

      const otherIds = list.map((c) => (c.user1_id === id ? c.user2_id : c.user1_id));
      await fetchProfiles(otherIds);

      const convIds = list.map((c) => c.id);
      const { data: lastMsgs } = await supabase
        .from("messages")
        .select("id, conversation_id, text, created_at, type, file_name, deleted_at, sender_id, recipient_id, read_at")
        .in("conversation_id", convIds)
        .order("created_at", { ascending: false });

      const lastByConv = {};
      const unreadCount = {};
      (lastMsgs || []).forEach((m) => {
        if (!lastByConv[m.conversation_id]) lastByConv[m.conversation_id] = m;
        if (m.recipient_id === id && !m.read_at) {
          unreadCount[m.conversation_id] = (unreadCount[m.conversation_id] || 0) + 1;
        }
      });

      const enriched = list.map((c) => {
        const otherId = c.user1_id === id ? c.user2_id : c.user1_id;
        const p = profilesCache.current[otherId] || { display_name: "Membre", flag: "🌍" };
        return {
          id: c.id,
          otherUserId: otherId,
          otherUserName: p.display_name || "Membre",
          otherUserAvatar: p.avatar_url,
          otherUserFlag: p.flag || "🌍",
          otherUserHandle: p.handle,
          lastMsg: lastByConv[c.id] || null,
          unread: unreadCount[c.id] || 0,
          created_at: c.created_at,
        };
      });

      enriched.sort((a, b) => {
        const ta = a.lastMsg?.created_at || a.created_at || "";
        const tb = b.lastMsg?.created_at || b.created_at || "";
        return tb.localeCompare(ta);
      });
      setConversations(enriched);
    } catch (e) {
      console.error("[MessagesTab] fetchConversations", e);
    } finally {
      setLoading(false);
    }
  }, [id, fetchProfiles]);

  useEffect(() => {
    if (!id) return;
    fetchConversations();

    const ch = supabase
      .channel(`conv-list:${id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        () => {
          clearTimeout(window.__baaroConvRefresh);
          window.__baaroConvRefresh = setTimeout(fetchConversations, 400);
        }
      )
      .subscribe();
    listChannelRef.current = ch;
    return () => {
      if (listChannelRef.current) supabase.removeChannel(listChannelRef.current);
    };
  }, [id, fetchConversations]);

  // ── Messages du chat actif ────────────────────────────────────────────────
  useEffect(() => {
    setMessages(messaging.messages || []);
  }, [messaging.messages]);

  useEffect(() => {
    if (!activeChat?.id) return;
    const channel = supabase
      .channel(`typing:${activeChat.id}`)
      .on("broadcast", { event: "typing" }, ({ payload }) => {
        if (payload?.user_id !== id) {
          setTyping(Boolean(payload?.typing));
          window.clearTimeout(window.__baaroTypingTimer);
          window.__baaroTypingTimer = window.setTimeout(() => setTyping(false), 2200);
        }
      })
      .subscribe();
    typingChRef.current = channel;
    return () => {
      typingChRef.current = null;
      supabase.removeChannel(channel);
      window.clearTimeout(window.__baaroTypingTimer);
    };
  }, [activeChat?.id, id]);

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, typing]);

  // ── Appels entrants ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    let channel;

    const showIncomingCall = async (call) => {
      if (
        !call?.id ||
        call.callee_id !== id ||
        call.status !== "ringing" ||
        incomingCallIdsRef.current.has(call.id)
      )
        return;

      incomingCallIdsRef.current.add(call.id);
      try {
        await fetchProfiles([call.caller_id]);
        const caller = profilesCache.current[call.caller_id] || {};
        const tokenRes = await getCallToken({
          roomName: call.daily_room_name,
          userName: caller.display_name || "Membre",
          isOwner: false,
        });

        if (cancelled) return;
        if (!tokenRes?.url || !tokenRes?.token) {
          throw new Error("Informations de connexion à l'appel manquantes.");
        }

        setCallState({
          mode: "incoming",
          callType: call.type === "video" ? "video" : "voice",
          callRecord: call,
          roomUrl: tokenRes.url,
          token: tokenRes.token,
          otherUser: {
            name: caller.display_name || "Membre",
            avatar: caller.avatar_url,
            flag: caller.flag || "🌍",
          },
        });
      } catch (error) {
        incomingCallIdsRef.current.delete(call.id);
        console.error("Appel entrant :", error);
      }
    };

    const listen = async () => {
      const { data, error } = await supabase
        .from("calls")
        .select("*")
        .eq("callee_id", id)
        .eq("status", "ringing")
        .order("created_at", { ascending: false })
        .limit(1);

      if (error) console.error("Lecture des appels :", error);
      if (data?.[0]) await showIncomingCall(data[0]);
      if (cancelled) return;

      channel = supabase
        .channel("incoming-calls:" + id)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "calls",
            filter: "callee_id=eq." + id,
          },
          ({ new: call }) => {
            showIncomingCall(call);
          }
        )
        .subscribe();
    };

    listen();
    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, [id, fetchProfiles]);

  // ── Ouvrir / créer conversation ───────────────────────────────────────────
  const openConversation = async (otherId, name, avatar, flag) => {
    if (!id || !otherId || otherId === id) return;
    const { data: existing } = await supabase
      .from("conversations")
      .select("id")
      .or(
        `and(user1_id.eq.${id},user2_id.eq.${otherId}),and(user1_id.eq.${otherId},user2_id.eq.${id})`
      )
      .limit(1);

    if (existing?.[0]) {
      setActiveChat({
        id: existing[0].id,
        otherUserId: otherId,
        otherUserName: name,
        otherUserAvatar: avatar,
        otherUserFlag: flag,
      });
      setShowNewChat(false);
      return;
    }
    const u1 = id < otherId ? id : otherId;
    const u2 = id < otherId ? otherId : id;
    const { data: nw, error } = await supabase
      .from("conversations")
      .insert({ user1_id: u1, user2_id: u2 })
      .select("id")
      .single();
    if (error) {
      alert(error.message || "Impossible de créer la conversation");
      return;
    }
    if (nw) {
      setActiveChat({
        id: nw.id,
        otherUserId: otherId,
        otherUserName: name,
        otherUserAvatar: avatar,
        otherUserFlag: flag,
      });
      setShowNewChat(false);
      fetchConversations();
    }
  };

  // ── Envoi texte & médias via ChatInput ────────────────────────────────────
  const handleSendText = async (text) => {
    if (!text || !activeChat || !id || sending) return;
    if (!isValidAuthUserId(id) || !isValidAuthUserId(activeChat.otherUserId)) {
      alert("Conversation invalide");
      return;
    }
    setSending(true);
    const result = await messaging.sendMessage(text, {
      clientMessageId: makeClientMessageId(),
    });
    setSending(false);
    if (!result?.ok) {
      alert(result?.error || "Impossible d'envoyer le message");
    }
  };

  const handleSendMedia = async (file) => {
    if (!file || !activeChat) return;
    setUploading(true);
    try {
      const up = await uploadChatFile(file, id);
      if (!isValidAuthUserId(id) || !isValidAuthUserId(activeChat.otherUserId)) return;
      await supabase.from("messages").insert({
        conversation_id: activeChat.id,
        sender_id: id,
        recipient_id: activeChat.otherUserId,
        text: up.fileName,
        type: mimeToMessageType(up.mime),
        media_url: up.url,
        media_mime: up.mime,
        media_size: up.size,
        file_name: up.fileName,
        client_message_id: makeClientMessageId(),
      });
    } catch (err) {
      alert(err.message || "Échec de l’envoi du fichier");
    } finally {
      setUploading(false);
    }
  };

  // ── Appels sortants ───────────────────────────────────────────────────────
  const startCall = async (type) => {
    if (!activeChat || !id) return;
    try {
      const roomRes = await createCallRoom({ userName: "Moi", mode: type });
      const roomName = roomRes.roomName || roomRes.daily_room_name;
      if (!roomName || !roomRes.url)
        throw new Error("Salle non créée : vérifie DAILY_API_KEY et DAILY_DOMAIN sur Vercel");
      const rec = await createCallRecord({
        conversation_id: activeChat.id,
        caller_id: id,
        callee_id: activeChat.otherUserId,
        type,
        dailyRoomName: roomName,
      });
      if (!rec?.id) throw new Error("Appel non enregistré (table calls ou RLS)");
      const tokenRes = await getCallToken({ roomName, userName: "Moi", isOwner: true });
      setCallState({
        mode: "outgoing",
        callType: type,
        callRecord: rec,
        roomUrl: roomRes.url,
        token: tokenRes.token,
        otherUser: {
          name: activeChat.otherUserName,
          avatar: activeChat.otherUserAvatar,
          flag: activeChat.otherUserFlag,
        },
      });
    } catch (e) {
      console.error(e);
      alert(e.message || "Impossible de démarrer l'appel");
    }
  };

  // ── Recherche nouveaux contacts ───────────────────────────────────────────
  useEffect(() => {
    if (!showNewChat) return;
    const q = searchQuery.trim();
    if (q.length < 2) {
      setSearchResults([]);
      return;
    }
    setSearchLoading(true);
    const t = setTimeout(async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, display_name, avatar_url, flag, handle, public_key")
        .ilike("display_name", "%" + q + "%")
        .neq("id", id)
        .limit(20);
      setSearchResults(data || []);
      setSearchLoading(false);
    }, 280);
    return () => clearTimeout(t);
  }, [searchQuery, showNewChat, id]);

  const Avatar = ({ src, flag, name, size = 44 }) => (
    <div
      className="relative flex-shrink-0 rounded-full overflow-hidden ring-2 ring-white/10"
      style={{ width: size, height: size, background: C.surface2 }}
    >
      {src ? (
        <img
          src={src}
          alt=""
          className="w-full h-full object-cover"
          onError={(e) => {
            e.target.style.display = "none";
            e.target.nextSibling.style.display = "flex";
          }}
        />
      ) : null}
      <div
        className="w-full h-full flex items-center justify-center text-lg"
        style={{ display: src ? "none" : "flex" }}
      >
        {flag || "🌍"}
      </div>
    </div>
  );

  // ── UI : Nouvelle conversation ────────────────────────────────────────────
  if (showNewChat) {
    return (
      <>
        {callState && (
          <ChatCallModal
            mode={callState.mode}
            callType={callState.callType}
            callRecord={callState.callRecord}
            roomUrl={callState.roomUrl}
            token={callState.token}
            otherUser={callState.otherUser}
            onClose={closeCall}
          />
        )}
        <div className="max-w-2xl mx-auto w-full px-4 pt-4 pb-28">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="text-xl font-bold tracking-tight" style={{ color: C.ivory }}>
                Nouvelle conversation
              </h2>
              <p className="text-xs mt-0.5" style={{ color: C.muted }}>
                Recherchez un membre BAARO
              </p>
            </div>
            <button
              onClick={() => setShowNewChat(false)}
              className="p-2.5 rounded-full transition hover:bg-white/10"
              style={{ color: C.muted }}
            >
              <X size={20} />
            </button>
          </div>

          <div className="relative mb-5">
            <Search
              size={16}
              className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none"
              style={{ color: C.muted }}
            />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Nom ou pseudo…"
              autoFocus
              className="w-full pl-11 pr-4 py-3.5 rounded-2xl border text-sm outline-none transition focus:ring-2"
              style={{
                background: C.surface,
                borderColor: C.borderGold,
                color: C.ivory,
                boxShadow: "0 0 0 1px rgba(217,174,82,0.08)",
              }}
            />
          </div>

          <div className="space-y-1.5">
            {searchLoading && (
              <div className="flex items-center justify-center py-10 gap-2" style={{ color: C.muted }}>
                <Loader2 size={18} className="animate-spin" />
                <span className="text-sm">Recherche…</span>
              </div>
            )}
            {!searchLoading && searchQuery.length >= 2 && searchResults.length === 0 && (
              <p className="text-center py-10 text-sm" style={{ color: C.muted }}>
                Aucun résultat
              </p>
            )}
            {searchResults.map((u) => (
              <button
                key={u.id}
                onClick={() => openConversation(u.id, u.display_name, u.avatar_url, u.flag)}
                className="w-full p-3.5 rounded-2xl border flex items-center gap-3.5 text-left transition hover:scale-[1.01] active:scale-[0.99]"
                style={{
                  background: C.surface,
                  borderColor: C.border,
                }}
              >
                <Avatar src={u.avatar_url} flag={u.flag} name={u.display_name} size={48} />
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm truncate" style={{ color: C.ivory }}>
                    {u.display_name}
                  </p>
                  {u.handle && (
                    <p className="text-xs truncate" style={{ color: C.muted }}>
                      @{u.handle}
                    </p>
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>
      </>
    );
  }

  // ── UI : Conversation active ──────────────────────────────────────────────
  if (activeChat) {
    const filtered = messages.filter(
      (m) =>
        !searchInChat ||
        String(m.plaintext || m.text || "")
          .toLowerCase()
          .includes(searchInChat.trim().toLowerCase())
    );

    return (
      <>
        {callState && (
          <ChatCallModal
            mode={callState.mode}
            callType={callState.callType}
            callRecord={callState.callRecord}
            roomUrl={callState.roomUrl}
            token={callState.token}
            otherUser={callState.otherUser}
            onClose={closeCall}
          />
        )}
        <div
          className="flex flex-col max-w-2xl mx-auto w-full"
          style={{ height: "calc(100dvh - 120px)" }}
        >
          {/* Header */}
          <div
            className="flex items-center gap-3 px-3 py-3 border-b backdrop-blur-md sticky top-0 z-20"
            style={{
              borderColor: C.border,
              background: `${C.bg}ee`,
            }}
          >
            <button
              onClick={() => {
                setActiveChat(null);
                setSearchInChat("");
                setShowChatTools(false);
                fetchConversations();
              }}
              className="p-2 rounded-full transition hover:bg-white/10"
              style={{ color: C.ivory }}
            >
              <ArrowLeft size={20} />
            </button>

            <button
              type="button"
              className="flex items-center gap-3 flex-1 min-w-0 text-left"
              onClick={() => onOpenProfile?.(activeChat.otherUserId)}
            >
              <Avatar
                src={activeChat.otherUserAvatar}
                flag={activeChat.otherUserFlag}
                name={activeChat.otherUserName}
                size={40}
              />
              <div className="min-w-0">
                <p className="font-bold text-sm truncate" style={{ color: C.ivory }}>
                  {activeChat.otherUserName}
                </p>
                {typing ? (
                  <p className="text-[11px] animate-pulse" style={{ color: C.teal }}>
                    écrit…
                  </p>
                ) : (
                  <p className="text-[11px]" style={{ color: C.muted }}>
                    En ligne · sécurisé 🔒
                  </p>
                )}
              </div>
            </button>

            <div className="flex items-center gap-0.5">
              <button
                onClick={() => startCall("voice")}
                className="p-2.5 rounded-full transition hover:bg-white/10"
                style={{ color: C.teal }}
                title="Appel vocal"
              >
                <Phone size={18} />
              </button>
              <button
                onClick={() => startCall("video")}
                className="p-2.5 rounded-full transition hover:bg-white/10"
                style={{ color: C.gold }}
                title="Appel vidéo"
              >
                <Video size={18} />
              </button>
              <button
                type="button"
                onClick={() => setShowChatTools((v) => !v)}
                className="p-2.5 rounded-full transition hover:bg-white/10"
                style={{ color: C.muted }}
              >
                <MoreHorizontal size={18} />
              </button>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-3 py-4 space-y-1 scroll-smooth">
            {messaging.loading && messages.length === 0 && (
              <div className="flex justify-center py-16" style={{ color: C.muted }}>
                <Loader2 size={24} className="animate-spin" />
              </div>
            )}

            {filtered.map((m) => {
              const isMe = m.sender_id === id;
              return (
                <MessageBubble
                  key={m.id}
                  message={m}
                  isMe={isMe}
                  onRetry={() => handleSendText(m.plaintext || m.text)}
                />
              );
            })}

            {typing && (
              <div className="flex items-center gap-2 px-2 py-1">
                <span className="text-xs italic" style={{ color: C.muted }}>écrit…</span>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Saisie avec ChatInput branché */}
          <ChatInput
            disabled={sending || uploading}
            placeholder="Écrire un message…"
            onSend={handleSendText}
            onSendMedia={handleSendMedia}
          />
        </div>
      </>
    );
  }

  // ── UI : Liste des conversations ──────────────────────────────────────────
  return (
    <>
      {callState && (
        <ChatCallModal
          mode={callState.mode}
          callType={callState.callType}
          callRecord={callState.callRecord}
          roomUrl={callState.roomUrl}
          token={callState.token}
          otherUser={callState.otherUser}
          onClose={closeCall}
        />
      )}
      <div
        className="max-w-2xl mx-auto w-full px-4 pt-4"
        style={{ paddingBottom: "calc(6.5rem + env(safe-area-inset-bottom))" }}
      >
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2
              className="text-2xl font-bold tracking-tight flex items-center gap-2.5"
              style={{ color: C.ivory }}
            >
              <span
                className="inline-flex items-center justify-center w-9 h-9 rounded-xl"
                style={{ background: "rgba(217,174,82,0.15)" }}
              >
                <MessageCircle size={20} style={{ color: C.gold }} />
              </span>
              Messages
            </h2>
            <p className="text-xs mt-1 ml-11" style={{ color: C.muted }}>
              Chiffré de bout en bout
            </p>
          </div>
          <button
            onClick={() => setShowNewChat(true)}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-full text-sm font-semibold transition active:scale-95"
            style={{
              background: `linear-gradient(135deg, ${C.gold}, #C49A3C)`,
              color: "#0B1220",
              boxShadow: "0 4px 16px rgba(217,174,82,0.3)",
            }}
          >
            <Plus size={16} />
            Nouveau
          </button>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3" style={{ color: C.muted }}>
            <Loader2 size={28} className="animate-spin" style={{ color: C.gold }} />
            <p className="text-sm">Chargement des conversations…</p>
          </div>
        ) : conversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
            <div
              className="w-20 h-20 rounded-3xl flex items-center justify-center mb-5"
              style={{ background: "rgba(217,174,82,0.12)" }}
            >
              <MessageCircle size={36} style={{ color: C.gold }} />
            </div>
            <h3 className="font-bold text-lg mb-1" style={{ color: C.ivory }}>
              Aucune conversation
            </h3>
            <p className="text-sm mb-6 max-w-xs" style={{ color: C.muted }}>
              Commencez une discussion privée et sécurisée avec un membre BAARO.
            </p>
            <button
              onClick={() => setShowNewChat(true)}
              className="px-5 py-2.5 rounded-full text-sm font-semibold"
              style={{
                background: `linear-gradient(135deg, ${C.gold}, #C49A3C)`,
                color: "#0B1220",
              }}
            >
              Démarrer une conversation
            </button>
          </div>
        ) : (
          <div className="space-y-1">
            {conversations.map((c) => (
              <button
                key={c.id}
                onClick={() => setActiveChat(c)}
                className="w-full p-3.5 rounded-2xl border text-left flex items-center gap-3.5 transition hover:scale-[1.01] active:scale-[0.99]"
                style={{
                  background: c.unread > 0 ? "rgba(217,174,82,0.06)" : C.surface,
                  borderColor: c.unread > 0 ? C.borderGold : C.border,
                }}
              >
                <div className="relative">
                  <Avatar
                    src={c.otherUserAvatar}
                    flag={c.otherUserFlag}
                    name={c.otherUserName}
                    size={52}
                  />
                  {c.unread > 0 && (
                    <span
                      className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold flex items-center justify-center"
                      style={{ background: C.gold, color: "#0B1220" }}
                    >
                      {c.unread > 9 ? "9+" : c.unread}
                    </span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p
                      className="font-semibold text-sm truncate"
                      style={{ color: C.ivory }}
                    >
                      {c.otherUserName}
                    </p>
                    <span className="text-[10px] flex-shrink-0" style={{ color: C.muted }}>
                      {formatRelativeTime(c.lastMsg?.created_at || c.created_at)}
                    </span>
                  </div>
                  <p
                    className="text-xs truncate mt-0.5"
                    style={{
                      color: c.unread > 0 ? C.ivory : C.muted,
                      fontWeight: c.unread > 0 ? 500 : 400,
                    }}
                  >
                    {lastMessagePreview(c.lastMsg)}
                  </p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
