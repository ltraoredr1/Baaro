/**
 * BAARO MessagesTab — Version refactorisée & branchée sur messageService, ChatInput & MessageBubble
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
import { messageService } from "../lib/messageService.js";

/** Validation UUID auth.users.id */
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
  const payload = deserializePayload(msg.text || msg.content);
  if (payload) return "🔒 Message chiffré";
  return (msg.text || msg.content || "").slice(0, 80) || "…";
}

const FALLBACK = {
  bg: "#0B1220",
  surface: "#111A2C",
  surface2: "rgba(255,255,255,0.06)",
  border: "rgba(255,255,255,0.08)",
  borderGold: "rgba(217,174,82,0.28)",
  ivory: "#F5F3EF",
  muted: "rgba(245,243,239,0.55)",
  gold: "#D9AE52",
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
  const [typing, setTyping] = useState(false);
  const closeCall = useCallback(() => setCallState(null), []);

  const messagesEndRef = useRef(null);
  const profilesCache = useRef({});
  const typingChRef = useRef(null);
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

  // ── Conversations via messageService ──────────────────────────────────────
  const fetchConversations = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const rawConversations = await messageService.getConversations(id);

      // Normalisation des conversations reçues du service
      const enriched = (rawConversations || []).map((c) => {
        const otherParticipant = c.participants?.find((p) => p.user_id !== id) || {};
        const profile = otherParticipant.profiles || {};
        return {
          id: c.id,
          otherUserId: otherParticipant.user_id,
          otherUserName: profile.display_name || "Membre",
          otherUserAvatar: profile.avatar_url,
          otherUserFlag: profile.flag || "🌍",
          lastMsg: c.last_message || null,
          unread: c.unread || false,
          created_at: c.created_at,
        };
      });

      setConversations(enriched);
    } catch (e) {
      console.error("[MessagesTab] fetchConversations error:", e);
    } finally {
      setLoading(false);
    }
  }, [id]);

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

  // ── Chargement des messages du chat actif ────────────────────────────────
  useEffect(() => {
    setMessages(messaging.messages || []);
    if (activeChat?.id && id) {
      messageService.markAsRead(activeChat.id, id);
    }
  }, [messaging.messages, activeChat?.id, id]);

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, typing]);

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

  // ── Recherche contacts ───────────────────────────────────────────────────
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
        <img src={src} alt="" className="w-full h-full object-cover" />
      ) : (
        <div className="w-full h-full flex items-center justify-center text-lg">
          {flag || "🌍"}
        </div>
      )}
    </div>
  );

  // ── UI : Nouvelle conversation ────────────────────────────────────────────
  if (showNewChat) {
    return (
      <div className="max-w-2xl mx-auto w-full px-4 pt-4 pb-28">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-xl font-bold tracking-tight" style={{ color: C.ivory }}>
              Nouvelle conversation
            </h2>
          </div>
          <button onClick={() => setShowNewChat(false)} className="p-2.5 rounded-full hover:bg-white/10">
            <X size={20} style={{ color: C.muted }} />
          </button>
        </div>

        <div className="relative mb-5">
          <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2" style={{ color: C.muted }} />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Nom ou pseudo…"
            autoFocus
            className="w-full pl-11 pr-4 py-3.5 rounded-2xl border text-sm outline-none"
            style={{ background: C.surface, borderColor: C.borderGold, color: C.ivory }}
          />
        </div>

        <div className="space-y-1.5">
          {searchLoading && (
            <div className="flex justify-center py-10 gap-2" style={{ color: C.muted }}>
              <Loader2 size={18} className="animate-spin" />
              <span className="text-sm">Recherche…</span>
            </div>
          )}
          {searchResults.map((u) => (
            <button
              key={u.id}
              onClick={() => {
                setActiveChat({
                  id: null,
                  otherUserId: u.id,
                  otherUserName: u.display_name,
                  otherUserAvatar: u.avatar_url,
                  otherUserFlag: u.flag,
                });
                setShowNewChat(false);
              }}
              className="w-full p-3.5 rounded-2xl border flex items-center gap-3.5 text-left"
              style={{ background: C.surface, borderColor: C.border }}
            >
              <Avatar src={u.avatar_url} flag={u.flag} name={u.display_name} size={48} />
              <div>
                <p className="font-semibold text-sm" style={{ color: C.ivory }}>{u.display_name}</p>
                {u.handle && <p className="text-xs" style={{ color: C.muted }}>@{u.handle}</p>}
              </div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  // ── UI : Chat actif ───────────────────────────────────────────────────────
  if (activeChat) {
    const filtered = messages.filter(
      (m) =>
        !searchInChat ||
        String(m.plaintext || m.text || m.content || "")
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
        <div className="flex flex-col max-w-2xl mx-auto w-full" style={{ height: "calc(100dvh - 120px)" }}>
          {/* Header */}
          <div className="flex items-center gap-3 px-3 py-3 border-b sticky top-0 z-20" style={{ borderColor: C.border, background: C.bg }}>
            <button onClick={() => { setActiveChat(null); fetchConversations(); }} className="p-2 rounded-full hover:bg-white/10">
              <ArrowLeft size={20} style={{ color: C.ivory }} />
            </button>

            <button type="button" className="flex items-center gap-3 flex-1 text-left" onClick={() => onOpenProfile?.(activeChat.otherUserId)}>
              <Avatar src={activeChat.otherUserAvatar} flag={activeChat.otherUserFlag} name={activeChat.otherUserName} size={40} />
              <div>
                <p className="font-bold text-sm" style={{ color: C.ivory }}>{activeChat.otherUserName}</p>
                <p className="text-[11px]" style={{ color: C.muted }}>Sécurisé 🔒</p>
              </div>
            </button>

            <div className="flex items-center gap-0.5">
              <button onClick={() => startCall("voice")} className="p-2.5 rounded-full hover:bg-white/10" style={{ color: C.teal }}>
                <Phone size={18} />
              </button>
              <button onClick={() => startCall("video")} className="p-2.5 rounded-full hover:bg-white/10" style={{ color: C.gold }}>
                <Video size={18} />
              </button>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
            {messaging.loading && messages.length === 0 && (
              <div className="flex justify-center py-16" style={{ color: C.muted }}>
                <Loader2 size={24} className="animate-spin" />
              </div>
            )}

            {filtered.map((m) => (
              <MessageBubble
                key={m.id}
                message={m}
                isMe={m.sender_id === id}
                onRetry={() => handleSendText(m.plaintext || m.text || m.content)}
              />
            ))}
            <div ref={messagesEndRef} />
          </div>

          {/* Saisie avec ChatInput */}
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
    <div className="max-w-2xl mx-auto w-full px-4 pt-4 pb-28">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold flex items-center gap-2.5" style={{ color: C.ivory }}>
          <MessageCircle size={20} style={{ color: C.gold }} /> Messages
        </h2>
        <button
          onClick={() => setShowNewChat(true)}
          className="flex items-center gap-1.5 px-4 py-2.5 rounded-full text-sm font-semibold"
          style={{ background: `linear-gradient(135deg, ${C.gold}, #C49A3C)`, color: "#0B1220" }}
        >
          <Plus size={16} /> Nouveau
        </button>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3" style={{ color: C.muted }}>
          <Loader2 size={28} className="animate-spin" style={{ color: C.gold }} />
          <p className="text-sm">Chargement…</p>
        </div>
      ) : conversations.length === 0 ? (
        <div className="text-center py-20">
          <p className="text-sm" style={{ color: C.muted }}>Aucune conversation</p>
        </div>
      ) : (
        <div className="space-y-1">
          {conversations.map((c) => (
            <button
              key={c.id}
              onClick={() => setActiveChat(c)}
              className="w-full p-3.5 rounded-2xl border text-left flex items-center gap-3.5 transition hover:scale-[1.01]"
              style={{ background: C.surface, borderColor: C.border }}
            >
              <Avatar src={c.otherUserAvatar} flag={c.otherUserFlag} name={c.otherUserName} size={52} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <p className="font-semibold text-sm truncate" style={{ color: C.ivory }}>{c.otherUserName}</p>
                  <span className="text-[10px]" style={{ color: C.muted }}>
                    {formatRelativeTime(c.lastMsg?.created_at || c.created_at)}
                  </span>
                </div>
                <p className="text-xs truncate mt-0.5" style={{ color: C.muted }}>
                  {lastMessagePreview(c.lastMsg)}
                </p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
