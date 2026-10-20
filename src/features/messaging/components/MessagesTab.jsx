/**
 * BAARO MessagesTab — messagerie (texte E2E, médias, vocal via Cloudflare R2, appels)
 */
import { useMessaging } from "../hooks/useMessaging.js";
import { useCryptoKeys } from "../hooks/useCryptoKeys.js";
import { useMessageExtras } from "../hooks/useMessageExtras.js";
import { Fragment, useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo } from "react";
import {
  ArrowLeft, MessageCircle, Plus, X, Search,
  Phone, Video, Loader2, ChevronDown, Pin
} from "lucide-react";
import { COLORS as THEME_COLORS } from "../../../theme.js";
import { supabase } from "../../../supabaseClient.js";
import { uploadChatFile, uploadVoiceBlob, mimeToMessageType } from "../../../lib/chatMedia.js";
import { createCallRoom, getCallToken, createCallRecord, notifyCalleeOfIncomingCall } from "../lib/chatCalls.js";
import { ChatCallModal } from "./ChatCallModal.jsx";
import { deserializePayload, decryptMessage } from "../lib/crypto.js";
import { makeClientMessageId, markMessageRead } from "../lib/chatFeatures.js";
import { ChatInput, MAX_FILE_MB } from "./ChatInput.jsx";
import { MessageBubble, messagePreviewText } from "./MessageBubble.jsx";
import { messageService } from "../lib/messageService.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidAuthUserId(value) {
  if (!value || typeof value !== "string") return false;
  if (value.startsWith("@") || (value.includes("@") && value.includes("."))) return false;
  return UUID_RE.test(value);
}

function formatRelativeTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const diff = Math.floor((Date.now() - d.getTime()) / 1000);
  if (diff < 60) return "À l’instant";
  if (diff < 3600) return `${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} h`;
  if (diff < 604800) return `${Math.floor(diff / 86400)} j`;
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

function dayKey(iso) {
  return iso ? new Date(iso).toDateString() : "";
}

function dayLabel(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Aujourd’hui";
  if (d.toDateString() === yesterday.toDateString()) return "Hier";
  return d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
}

// `plain` : texte déjà déchiffré du dernier message (sinon on affiche « Message chiffré »)
function lastMessagePreview(msg, myId, plain) {
  if (!msg) return "Nouvelle conversation";
  const prefix = msg.sender_id && msg.sender_id === myId ? "Vous : " : "";
  if (msg.deleted_at) return "Message supprimé";
  if (msg.type === "voice") return `${prefix}🎤 Message vocal`;
  if (msg.type === "image") return `${prefix}📷 Photo`;
  if (msg.type === "video") return `${prefix}🎬 Vidéo`;
  if (msg.type === "file") return `${prefix}📎 ${msg.file_name || "Fichier"}`;
  if (plain) return prefix + plain;
  const raw = msg.text || msg.content;
  let encrypted = false;
  try {
    encrypted = !!deserializePayload(raw);
  } catch {
    encrypted = false;
  }
  if (encrypted) return `${prefix}🔒 Message chiffré`;
  return prefix + ((raw || "").slice(0, 80) || "…");
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

// Défini hors du composant : sinon il est recréé (et remonté) à chaque rendu → clignotement des avatars
function Avatar({ src, flag, size = 44, bg }) {
  return (
    <div
      className="relative flex-shrink-0 rounded-full overflow-hidden ring-2 ring-white/10"
      style={{ width: size, height: size, background: bg }}
    >
      {src ? (
        <img src={src} alt="" className="w-full h-full object-cover" />
      ) : (
        <div className="w-full h-full flex items-center justify-center text-lg">{flag || "🌍"}</div>
      )}
    </div>
  );
}

const msgKey = (m) => m?.client_message_id || m?.id || null;

export function MessagesTab({ id: propId, onOpenProfile }) {
  const C = useMemo(() => ({ ...FALLBACK, ...(THEME_COLORS || {}) }), []);
  const [id, setId] = useState(propId || null);
  const [authChecking, setAuthChecking] = useState(!propId);
  const [myName, setMyName] = useState("");
  const [conversations, setConversations] = useState([]);
  const [activeChat, setActiveChat] = useState(null);
  const messaging = useMessaging(activeChat?.id, id, activeChat?.otherUserId);
  const messages = messaging.messages || [];
  const extras = useMessageExtras(activeChat?.id, id, messages);
  const { privateKey } = useCryptoKeys(id);
  const [previews, setPreviews] = useState({}); // id du dernier message -> texte déchiffré
  const previewsRef = useRef({});
  const readMarkedRef = useRef(new Set());
  const [visTick, setVisTick] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showNewChat, setShowNewChat] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [listFilter, setListFilter] = useState("");
  const [uploading, setUploading] = useState(false);
  const [callState, setCallState] = useState(null);
  const [callStarting, setCallStarting] = useState(false);
  const [toast, setToast] = useState(null);
  const [atBottom, setAtBottom] = useState(true);
  const [replyTo, setReplyTo] = useState(null);

  const closeCall = useCallback(() => setCallState(null), []);
  const messagesEndRef = useRef(null);
  const scrollRef = useRef(null);
  const refreshTimerRef = useRef(null);
  const toastTimerRef = useRef(null);
  const prevLastKeyRef = useRef(null);
  const prependRef = useRef(null);

  // Notification légère (remplace alert(), qui bloque l'interface)
  const notify = useCallback((message) => {
    setToast(message);
    clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), 4000);
  }, []);

  useEffect(() => () => {
    clearTimeout(toastTimerRef.current);
    clearTimeout(refreshTimerRef.current);
  }, []);

  useEffect(() => {
    if (propId) {
      setId(propId);
      setAuthChecking(false);
      return;
    }
    let alive = true;
    supabase.auth
      .getUser()
      .then(({ data }) => {
        if (alive && data?.user) setId(data.user.id);
      })
      .catch((e) => console.error("[MessagesTab] getUser error:", e))
      .finally(() => alive && setAuthChecking(false));
    return () => {
      alive = false;
    };
  }, [propId]);

  // Nom affiché dans les appels (au lieu du "Moi" codé en dur)
  useEffect(() => {
    if (!id) return;
    let alive = true;
    supabase
      .from("profiles")
      .select("display_name")
      .eq("id", id)
      .maybeSingle()
      .then(({ data }) => {
        if (alive && data?.display_name) setMyName(data.display_name);
      });
    return () => {
      alive = false;
    };
  }, [id]);

  const fetchConversations = useCallback(
    async (silent = false) => {
      if (!id) return;
      if (!silent) setLoading(true); // pas de spinner sur les rafraîchissements temps réel
      try {
        const rawConversations = await messageService.getConversations(id);
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
        if (!silent) notify("Impossible de charger les conversations.");
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [id, notify]
  );

  // Liste des conversations + temps réel sur les messages REÇUS (filtre serveur)
  useEffect(() => {
    if (!id) return;
    fetchConversations();
    const ch = supabase
      .channel(`conv-list:${id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `recipient_id=eq.${id}` },
        () => {
          clearTimeout(refreshTimerRef.current);
          refreshTimerRef.current = setTimeout(() => fetchConversations(true), 400);
        }
      )
      .subscribe();
    return () => {
      clearTimeout(refreshTimerRef.current);
      supabase.removeChannel(ch);
    };
  }, [id, fetchConversations]);

  // Changer de conversation efface la réponse en cours
  useEffect(() => {
    setReplyTo(null);
  }, [activeChat?.id]);

  // Aperçus de la liste : les derniers messages texte sont chiffrés, on les déchiffre (une seule fois par message)
  useEffect(() => {
    if (!privateKey || !id) return;
    let cancelled = false;
    (async () => {
      const found = {};
      for (const c of conversations) {
        const lm = c.lastMsg;
        if (!lm || lm.deleted_at || (lm.type && lm.type !== "text")) continue;
        if (previewsRef.current[lm.id]) continue;
        let payload = null;
        try {
          payload = deserializePayload(lm.text);
        } catch {
          payload = null;
        }
        if (!payload) continue;
        const plain = await decryptMessage(payload, privateKey, id).catch(() => null);
        if (plain) found[lm.id] = plain.slice(0, 80);
      }
      if (cancelled || !Object.keys(found).length) return;
      previewsRef.current = { ...previewsRef.current, ...found };
      setPreviews(previewsRef.current);
    })();
    return () => {
      cancelled = true;
    };
  }, [conversations, privateKey, id]);

  // Accusés de lecture réels : on signale chaque message reçu (une seule fois) quand l'onglet est visible
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") setVisTick((n) => n + 1);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  useEffect(() => {
    if (!activeChat?.id || !id) return;
    if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
    const toMark = messages
      .filter(
        (m) =>
          m.id &&
          !String(m.id).startsWith("tmp-") &&
          m.sender_id !== id &&
          !m.read_at &&
          !m.deleted_at &&
          !readMarkedRef.current.has(m.id)
      )
      .slice(-30);
    if (!toMark.length) return;
    toMark.forEach((m) => readMarkedRef.current.add(m.id));
    Promise.all(toMark.map((m) => markMessageRead(m.id))).catch(() => {});
  }, [messages, activeChat?.id, id, visTick]);

  // Marquer comme lu seulement quand le dernier message vient de l'autre (et non à chaque rendu)
  const lastMsg = messages[messages.length - 1];
  const lastMsgId = lastMsg?.id;
  const lastMsgFromOther = !!lastMsg && lastMsg.sender_id !== id;
  useEffect(() => {
    if (!activeChat?.id || !id || !lastMsgId || !lastMsgFromOther) return;
    Promise.resolve(messageService.markAsRead(activeChat.id, id)).catch((e) =>
      console.warn("[MessagesTab] markAsRead error:", e)
    );
    setConversations((prev) => prev.map((c) => (c.id === activeChat.id ? { ...c, unread: false } : c)));
  }, [activeChat?.id, id, lastMsgId, lastMsgFromOther]);

  // Défilement : on ne descend que si le DERNIER message a changé (pas quand on charge l'historique)
  useEffect(() => {
    prevLastKeyRef.current = null;
    setAtBottom(true);
  }, [activeChat?.id]);

  useEffect(() => {
    const key = msgKey(lastMsg);
    const prevKey = prevLastKeyRef.current;
    prevLastKeyRef.current = key;
    if (!key || key === prevKey || !messagesEndRef.current) return;
    if (prevKey === null) {
      messagesEndRef.current.scrollIntoView({ behavior: "auto" }); // ouverture : saut direct
    } else if (atBottom || lastMsg?.sender_id === id) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages]);

  // Après chargement de messages plus anciens : garder la position de lecture
  useLayoutEffect(() => {
    const pending = prependRef.current;
    const el = scrollRef.current;
    if (!pending || !el) return;
    if (msgKey(messages[0]) !== pending.firstKey) {
      el.scrollTop += el.scrollHeight - pending.height;
      prependRef.current = null;
    }
  }, [messages]);

  const handleScroll = (e) => {
    const el = e.currentTarget;
    setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 80);
  };

  const handleLoadOlder = async () => {
    const el = scrollRef.current;
    if (el) prependRef.current = { height: el.scrollHeight, firstKey: msgKey(messages[0]) };
    const added = await messaging.loadOlder();
    if (!added) prependRef.current = null;
  };

  const openChatWith = (convId, otherId, name, avatar, flag) => {
    setActiveChat({
      id: convId,
      otherUserId: otherId,
      otherUserName: name,
      otherUserAvatar: avatar,
      otherUserFlag: flag,
    });
    setShowNewChat(false);
  };

  const openConversation = async (otherId, name, avatar, flag) => {
    if (!id || !otherId || otherId === id) return;
    try {
      const { data: existing, error: selErr } = await supabase
        .from("conversations")
        .select("id")
        .or(`and(user1_id.eq.${id},user2_id.eq.${otherId}),and(user1_id.eq.${otherId},user2_id.eq.${id})`)
        .limit(1);

      if (selErr) throw selErr;

      if (existing?.[0]) {
        openChatWith(existing[0].id, otherId, name, avatar, flag);
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
        notify(error.message || "Impossible de créer la conversation");
        return;
      }

      if (nw) {
        openChatWith(nw.id, otherId, name, avatar, flag);
        fetchConversations(true);
      }
    } catch (e) {
      console.error("openConversation error:", e);
      notify(e?.message || "Impossible d'ouvrir la conversation");
    }
  };

  // Envoi texte OPTIMISTE : le message s'affiche aussitôt ; en cas d'échec il reste visible avec "réessayer"
  const handleSendText = async (text, options = {}) => {
    if (!text || !activeChat || !id) return;
    if (!isValidAuthUserId(id) || !isValidAuthUserId(activeChat.otherUserId)) {
      notify("Conversation invalide");
      return;
    }
    const isRetry = "replyToId" in options;
    const replyToId = isRetry ? options.replyToId : replyTo?.id || null;
    if (!isRetry) setReplyTo(null);
    try {
      const result = await messaging.sendMessage(text, {
        clientMessageId: options.clientMessageId || makeClientMessageId(),
        replyToId,
      });
      if (!result?.ok) notify(result?.error || "Impossible d'envoyer le message");
      else fetchConversations(true);
    } catch (e) {
      notify(e?.message || "Impossible d'envoyer le message");
    }
  };

  const handleRetry = (msg) =>
    handleSendText(msg.plaintext, {
      clientMessageId: msg.client_message_id,
      replyToId: msg.reply_to_id || null,
    });

  const handleDelete = async (msg) => {
    if (!window.confirm("Supprimer ce message pour tous ?")) return;
    const res = await messaging.deleteMessage(msg.id);
    if (!res?.ok) notify(res?.error || "Suppression impossible");
    else fetchConversations(true);
  };

  // Insertion d'un message média/vocal dans la base (l'erreur Supabase est propagée)
  const insertMediaMessage = async (fields, replyToId) => {
    const { error } = await supabase.from("messages").insert({
      conversation_id: activeChat.id,
      sender_id: id,
      recipient_id: activeChat.otherUserId,
      client_message_id: makeClientMessageId(),
      reply_to_id: replyToId || null,
      ...fields,
    });
    if (error) throw error;
  };

  const handleSendMedia = async (file) => {
    if (!file || !activeChat || !id) return;
    // Validation AVANT l'upload (avant : le fichier était envoyé puis jeté silencieusement)
    if (!isValidAuthUserId(id) || !isValidAuthUserId(activeChat.otherUserId)) {
      notify("Conversation invalide");
      return;
    }
    if (file.size > MAX_FILE_MB * 1024 * 1024) {
      notify(`Fichier trop volumineux (max ${MAX_FILE_MB} Mo).`);
      return;
    }
    const replyToId = replyTo?.id || null;
    setUploading(true);
    try {
      const up = await uploadChatFile(file, id);
      await insertMediaMessage(
        {
          text: up.fileName,
          type: mimeToMessageType(up.mime),
          media_url: up.url,
          media_mime: up.mime,
          media_size: up.size,
          file_name: up.fileName,
        },
        replyToId
      );
      setReplyTo(null);
      fetchConversations(true);
    } catch (err) {
      console.error("[MessagesTab] handleSendMedia error:", err);
      notify(err?.message || "Échec de l’envoi du fichier");
    } finally {
      setUploading(false);
    }
  };

  // Appelé par ChatInput avec (blob, durée en secondes)
  const handleSendVoice = async (audioBlob, duration) => {
    if (!audioBlob || !activeChat || !id) return;
    if (!isValidAuthUserId(id) || !isValidAuthUserId(activeChat.otherUserId)) {
      notify("Conversation invalide");
      return;
    }
    const replyToId = replyTo?.id || null;
    setUploading(true);
    try {
      const up = await uploadVoiceBlob(audioBlob, id, duration);
      await insertMediaMessage(
        {
          text: "Message vocal",
          type: "voice",
          media_url: up.url,
          media_mime: up.mime,
          media_size: up.size,
          file_name: up.fileName,
          media_duration: up.duration ?? duration,
        },
        replyToId
      );
      setReplyTo(null);
      fetchConversations(true);
    } catch (err) {
      console.error("[MessagesTab] handleSendVoice error:", err);
      notify(err?.message || "Échec de l’envoi du message vocal");
    } finally {
      setUploading(false);
    }
  };

  const startCall = async (type) => {
    if (!activeChat || !id || callStarting) return;
    const userName = myName || "Membre";
    setCallStarting(true);
    if (!isValidAuthUserId(activeChat.otherUserId)) {
      notify("Interlocuteur introuvable : impossible d'appeler.");
      setCallStarting(false);
      return;
    }
    try {
      // callee_id + conversation_id sont indispensables côté serveur (insertion de l'appel, règles RLS)
      const roomRes = await createCallRoom({
        userName,
        mode: type,
        callee_id: activeChat.otherUserId,
        conversation_id: activeChat.id,
      });
      const roomName = roomRes.roomName || roomRes.daily_room_name;
      if (!roomName || !roomRes.url) throw new Error("Salle non créée");
      const rec = await createCallRecord({
        conversation_id: activeChat.id,
        caller_id: id,
        callee_id: activeChat.otherUserId,
        type,
        dailyRoomName: roomName,
        caller_name: userName,
      });
      if (!rec?.id) throw new Error("Appel non enregistré");
      // L'identifiant réel de la ligne `calls` est renvoyé par le serveur s'il l'expose ; sinon on garde le nom de salle
      const callId = roomRes.call_id ?? roomRes.callId ?? roomRes.call?.id ?? rec.id;
      const tokenRes = await getCallToken({ roomName, userName, isOwner: true });
      // Prévient le correspondant (sonnerie / notification). Non bloquant : l'appel démarre même si ça échoue.
      notifyCalleeOfIncomingCall({
        callee_id: activeChat.otherUserId,
        caller_id: id,
        call_id: callId,
        call_type: type,
        daily_room_name: roomName,
        caller_name: userName,
      }).then((r) => {
        if (r && r.ok === false) console.warn("[MessagesTab] notification d'appel:", r.error);
      });
      setCallState({
        mode: "outgoing",
        callType: type,
        callRecord: { ...rec, id: callId },
        roomUrl: roomRes.url,
        token: tokenRes.token,
        otherUser: {
          name: activeChat.otherUserName,
          avatar: activeChat.otherUserAvatar,
          flag: activeChat.otherUserFlag,
        },
      });
    } catch (e) {
      notify(e?.message || "Impossible de démarrer l'appel");
    } finally {
      setCallStarting(false);
    }
  };

  // Recherche d'un membre (nouvelle conversation) — avec garde contre les réponses périmées
  useEffect(() => {
    if (!showNewChat) return;
    const q = searchQuery.trim();
    if (q.length < 2) {
      setSearchResults([]);
      setSearchLoading(false);
      return;
    }
    let cancelled = false;
    setSearchLoading(true);
    const t = setTimeout(async () => {
      // On retire % _ et la virgule pour ne pas casser le filtre ni créer de jokers
      const safe = q.replace(/[%_,]/g, " ");
      const { data, error } = await supabase
        .from("profiles")
        .select("id, display_name, avatar_url, flag, handle, public_key")
        .or(`display_name.ilike.%${safe}%,handle.ilike.%${safe}%`)
        .neq("id", id)
        .limit(20);
      if (cancelled) return;
      if (error) notify("Recherche impossible pour le moment.");
      setSearchResults(data || []);
      setSearchLoading(false);
    }, 280);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [searchQuery, showNewChat, id, notify]);

  const filteredConversations = useMemo(() => {
    const q = listFilter.trim().toLowerCase();
    if (!q) return conversations;
    return conversations.filter((c) => (c.otherUserName || "").toLowerCase().includes(q));
  }, [conversations, listFilter]);

  // Pour afficher la citation d'une réponse : retrouver le message d'origine parmi ceux chargés
  const messageById = useMemo(() => {
    const map = new Map();
    for (const m of messages) if (m.id) map.set(m.id, m);
    return map;
  }, [messages]);

  const quoteFor = (m) => {
    if (!m.reply_to_id) return null;
    const target = messageById.get(m.reply_to_id);
    if (!target) return null;
    return {
      name: target.sender_id === id ? "Vous" : activeChat?.otherUserName || "Membre",
      text: messagePreviewText(target),
    };
  };

  const handleReact = async (m, emoji) => {
    const res = await extras.toggleReaction(m.id, emoji);
    if (!res?.ok) notify(res?.error || "Réaction impossible");
  };

  const handleStar = async (m) => {
    const res = await extras.toggleStar(m.id);
    if (!res?.ok) notify(res?.error || "Favori impossible");
    else notify(res.starred ? "Ajouté aux favoris" : "Retiré des favoris");
  };

  const handlePin = async (m) => {
    const res = await extras.togglePin(m.id);
    if (!res?.ok) notify(res?.error || "Épinglage impossible");
    else notify(res.pinned ? "Message épinglé" : "Message désépinglé");
  };

  // Bandeau « message épinglé » : le plus récent parmi les messages chargés
  const pinnedMessages = useMemo(
    () => messages.filter((m) => m.id && extras.pins.has(m.id) && !m.deleted_at),
    [messages, extras.pins]
  );
  const lastPinned = pinnedMessages[pinnedMessages.length - 1] || null;
  const jumpToMessage = (mid) =>
    document.getElementById(`msg-${mid}`)?.scrollIntoView({ behavior: "smooth", block: "center" });

  const replyBar = replyTo
    ? {
        name: replyTo.sender_id === id ? "vous-même" : activeChat?.otherUserName || "Membre",
        text: messagePreviewText(replyTo),
      }
    : null;

  const toastEl = toast ? (
    <div
      role="alert"
      className="fixed top-3 left-1/2 -translate-x-1/2 z-[90] max-w-[90vw] px-4 py-2.5 rounded-xl text-sm shadow-lg border"
      style={{ background: C.surface, borderColor: C.borderGold, color: C.ivory }}
    >
      {toast}
    </div>
  ) : null;

  if (authChecking) {
    return (
      <div className="flex flex-col items-center justify-center py-32 gap-3" style={{ color: C.muted }}>
        <Loader2 size={28} className="animate-spin" style={{ color: C.gold }} />
        <p className="text-sm">Vérification de la session…</p>
      </div>
    );
  }

  if (!id) {
    return (
      <div className="text-center py-24 px-6">
        <p className="text-sm" style={{ color: C.muted }}>Connectez-vous pour accéder à vos messages.</p>
      </div>
    );
  }

  if (showNewChat) {
    return (
      <div className="max-w-2xl mx-auto w-full px-4 pt-4 pb-28">
        {toastEl}
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-xl font-bold tracking-tight" style={{ color: C.ivory }}>
            Nouvelle conversation
          </h2>
          <button
            onClick={() => setShowNewChat(false)}
            className="p-2.5 rounded-full hover:bg-white/10"
            aria-label="Fermer"
          >
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
          {!searchLoading && searchQuery.trim().length >= 2 && searchResults.length === 0 && (
            <p className="text-center text-sm py-10" style={{ color: C.muted }}>Aucun membre trouvé</p>
          )}
          {searchResults.map((u) => (
            <button
              key={u.id}
              onClick={() => openConversation(u.id, u.display_name, u.avatar_url, u.flag)}
              className="w-full p-3.5 rounded-2xl border flex items-center gap-3.5 text-left"
              style={{ background: C.surface, borderColor: C.border }}
            >
              <Avatar src={u.avatar_url} flag={u.flag} size={48} bg={C.surface2} />
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

  if (activeChat) {
    return (
      <>
        {toastEl}
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
          <div
            className="flex items-center gap-3 px-3 py-3 border-b sticky top-0 z-20"
            style={{ borderColor: C.border, background: C.bg }}
          >
            <button
              onClick={() => {
                setActiveChat(null);
                fetchConversations(true);
              }}
              className="p-2 rounded-full hover:bg-white/10"
              aria-label="Retour"
            >
              <ArrowLeft size={20} style={{ color: C.ivory }} />
            </button>

            <button
              type="button"
              className="flex items-center gap-3 flex-1 text-left min-w-0"
              onClick={() => onOpenProfile?.(activeChat.otherUserId)}
            >
              <Avatar src={activeChat.otherUserAvatar} flag={activeChat.otherUserFlag} size={40} bg={C.surface2} />
              <div className="min-w-0">
                <p className="font-bold text-sm truncate" style={{ color: C.ivory }}>{activeChat.otherUserName}</p>
                <p className="text-[11px]" style={{ color: messaging.otherTyping ? C.teal : C.muted }}>
                  {messaging.otherTyping ? "écrit…" : "Sécurisé 🔒"}
                </p>
              </div>
            </button>

            <div className="flex items-center gap-0.5">
              <button
                onClick={() => startCall("voice")}
                disabled={callStarting}
                className="p-2.5 rounded-full hover:bg-white/10 disabled:opacity-40"
                style={{ color: C.teal }}
                aria-label="Appel vocal"
              >
                <Phone size={18} />
              </button>
              <button
                onClick={() => startCall("video")}
                disabled={callStarting}
                className="p-2.5 rounded-full hover:bg-white/10 disabled:opacity-40"
                style={{ color: C.gold }}
                aria-label="Appel vidéo"
              >
                <Video size={18} />
              </button>
            </div>
          </div>

          {messaging.keysError && (
            <div
              role="status"
              className="px-4 py-2 text-xs border-b"
              style={{ background: "rgba(239,68,68,0.1)", borderColor: C.border, color: "#fca5a5" }}
            >
              Messagerie sécurisée indisponible : {messaging.keysError}
            </div>
          )}

          {lastPinned && (
            <button
              type="button"
              onClick={() => jumpToMessage(lastPinned.id)}
              className="flex items-center gap-2 px-4 py-2 text-xs text-left border-b w-full"
              style={{ background: C.surface, borderColor: C.border, color: C.ivory }}
            >
              <Pin size={14} style={{ color: C.gold }} className="flex-shrink-0" />
              <span className="truncate flex-1">{messagePreviewText(lastPinned)}</span>
              {pinnedMessages.length > 1 && (
                <span style={{ color: C.muted }}>+{pinnedMessages.length - 1}</span>
              )}
            </button>
          )}

          <div className="relative flex-1 min-h-0">
            <div ref={scrollRef} onScroll={handleScroll} className="h-full overflow-y-auto px-3 py-4 space-y-1">
              {messaging.hasMore && (
                <div className="flex justify-center pb-2">
                  <button
                    type="button"
                    onClick={handleLoadOlder}
                    disabled={messaging.loadingOlder}
                    className="flex items-center gap-2 text-xs px-4 py-2 rounded-full border disabled:opacity-60"
                    style={{ borderColor: C.borderGold, color: C.gold, background: C.surface }}
                  >
                    {messaging.loadingOlder && <Loader2 size={14} className="animate-spin" />}
                    Messages précédents
                  </button>
                </div>
              )}

              {messaging.loading && messages.length === 0 && (
                <div className="flex justify-center py-16" style={{ color: C.muted }}>
                  <Loader2 size={24} className="animate-spin" />
                </div>
              )}

              {messaging.loadError && messages.length === 0 && (
                <p className="text-center text-sm py-16" style={{ color: C.muted }}>
                  Impossible de charger les messages ({messaging.loadError})
                </p>
              )}

              {!messaging.loading && !messaging.loadError && !messaging.keysError && messages.length === 0 && (
                <p className="text-center text-sm py-16" style={{ color: C.muted }}>
                  Dites bonjour à {activeChat.otherUserName} 👋
                </p>
              )}

              {messages.map((m, i) => {
                const prev = messages[i - 1];
                const showDay = !prev || dayKey(prev.created_at) !== dayKey(m.created_at);
                return (
                  <Fragment key={msgKey(m) || i}>
                    {showDay && (
                      <div className="flex justify-center py-2">
                        <span
                          className="text-[11px] px-3 py-1 rounded-full capitalize"
                          style={{ background: C.surface2, color: C.muted }}
                        >
                          {dayLabel(m.created_at)}
                        </span>
                      </div>
                    )}
                    <MessageBubble
                      message={m}
                      isMe={m.sender_id === id}
                      domId={m.id ? `msg-${m.id}` : undefined}
                      reply={quoteFor(m)}
                      reactions={extras.reactionsByMessage.get(m.id) || []}
                      starred={extras.starred.has(m.id)}
                      pinned={extras.pins.has(m.id)}
                      onRetry={handleRetry}
                      onReply={setReplyTo}
                      onDelete={handleDelete}
                      onReact={handleReact}
                      onStar={handleStar}
                      onPin={handlePin}
                    />
                  </Fragment>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            {!atBottom && messages.length > 0 && (
              <button
                type="button"
                onClick={() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })}
                className="absolute bottom-3 right-4 p-2.5 rounded-full shadow-lg border"
                style={{ background: C.surface, borderColor: C.borderGold, color: C.gold }}
                aria-label="Aller au dernier message"
              >
                <ChevronDown size={18} />
              </button>
            )}
          </div>

          {uploading && (
            <div className="flex items-center gap-2 px-4 py-1.5 text-xs" style={{ color: C.muted }}>
              <Loader2 size={14} className="animate-spin" style={{ color: C.gold }} />
              Envoi en cours…
            </div>
          )}

          <ChatInput
            disabled={uploading}
            placeholder="Écrire un message…"
            onSend={handleSendText}
            onSendMedia={handleSendMedia}
            onSendVoice={handleSendVoice}
            onTyping={messaging.notifyTyping}
            onError={notify}
            replyTo={replyBar}
            onCancelReply={() => setReplyTo(null)}
          />
        </div>
      </>
    );
  }

  return (
    <div className="max-w-2xl mx-auto w-full px-4 pt-4 pb-28">
      {toastEl}
      <div className="flex items-center justify-between mb-4">
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

      {conversations.length > 4 && (
        <div className="relative mb-4">
          <Search size={15} className="absolute left-4 top-1/2 -translate-y-1/2" style={{ color: C.muted }} />
          <input
            value={listFilter}
            onChange={(e) => setListFilter(e.target.value)}
            placeholder="Rechercher une conversation…"
            className="w-full pl-10 pr-4 py-2.5 rounded-2xl border text-sm outline-none"
            style={{ background: C.surface, borderColor: C.border, color: C.ivory }}
          />
        </div>
      )}

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3" style={{ color: C.muted }}>
          <Loader2 size={28} className="animate-spin" style={{ color: C.gold }} />
          <p className="text-sm">Chargement des conversations…</p>
        </div>
      ) : conversations.length === 0 ? (
        <div className="text-center py-20">
          <p className="text-sm" style={{ color: C.muted }}>Aucune conversation</p>
        </div>
      ) : filteredConversations.length === 0 ? (
        <div className="text-center py-20">
          <p className="text-sm" style={{ color: C.muted }}>Aucun résultat</p>
        </div>
      ) : (
        <div className="space-y-1">
          {filteredConversations.map((c) => (
            <button
              key={c.id}
              onClick={() => setActiveChat(c)}
              className="w-full p-3.5 rounded-2xl border text-left flex items-center gap-3.5 transition hover:scale-[1.01]"
              style={{ background: C.surface, borderColor: c.unread ? C.borderGold : C.border }}
            >
              <Avatar src={c.otherUserAvatar} flag={c.otherUserFlag} size={52} bg={C.surface2} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <p
                    className={`text-sm truncate ${c.unread ? "font-bold" : "font-semibold"}`}
                    style={{ color: C.ivory }}
                  >
                    {c.otherUserName}
                  </p>
                  <span className="text-[10px] flex-shrink-0" style={{ color: c.unread ? C.gold : C.muted }}>
                    {formatRelativeTime(c.lastMsg?.created_at || c.created_at)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2 mt-0.5">
                  <p
                    className="text-xs truncate"
                    style={{ color: c.unread ? C.ivory : C.muted, fontWeight: c.unread ? 600 : 400 }}
                  >
                    {lastMessagePreview(c.lastMsg, id, previews[c.lastMsg?.id])}
                  </p>
                  {c.unread && (
                    <span
                      className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                      style={{ background: C.gold }}
                      aria-label="Non lu"
                    />
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
