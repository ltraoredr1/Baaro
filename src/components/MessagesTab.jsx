import { useMessaging } from "../hooks/useMessaging.js";
import { useState, useEffect, useRef, useCallback } from "react";
import { ArrowLeft, Send, MessageCircle, Plus, X, Search, Paperclip, Mic, Phone, Video, Smile, Reply, Star, Pin, MoreHorizontal, CheckCheck, Clock3 } from "lucide-react";
import { COLORS as THEME_COLORS } from "../theme.js";
import { supabase } from "../supabaseClient.js";
import { uploadChatFile, uploadVoiceBlob, mimeToMessageType, formatDuration, getBestAudioMime } from "../lib/chatMedia.js";
import { createCallRoom, getCallToken, createCallRecord } from "../lib/chatCalls.js"; // ✅ IMPORT MIS À JOUR
import { ChatCallModal } from "./ChatCallModal.jsx";
import { deserializePayload } from "../lib/crypto.js";
import { CHAT_REACTIONS, toggleMessageReaction, toggleMessageStar, markMessageRead, updateConversationSettings, makeClientMessageId } from "../lib/chatFeatures.js";

/** auth.users.id (UUID) uniquement */
function isValidAuthUserId(value) {
  if (!value || typeof value !== "string") return false;
  if (value.startsWith("@") || (value.includes("@") && value.includes("."))) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

const FALLBACK = {
  bg: "#0B1220",
  surface: "#111A2C",
  surface2: "rgba(255,255,255,0.06)",
  border: "rgba(255,255,255,0.08)",
  borderGold: "rgba(217,174,82,0.2)",
  ivory: "#F5F3EF",
  muted: "rgba(245,243,239,0.5)",
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
  const [newMessage, setNewMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [showNewChat, setShowNewChat] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [callState, setCallState] = useState(null);
  const [replyTo, setReplyTo] = useState(null);
  const [searchInChat, setSearchInChat] = useState("");
  const [showChatTools, setShowChatTools] = useState(false);
  const [typing, setTyping] = useState(false);
  const [reactionFor, setReactionFor] = useState(null);
  const [starred, setStarred] = useState(new Set());
  const [actionsFor, setActionsFor] = useState(null);
  const closeCall = useCallback(() => setCallState(null), []);

  const messagesEndRef = useRef(null);
  const profilesCache = useRef({});
  const fileInputRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const recordChunksRef = useRef([]);
  const recordTimerRef = useRef(null);
  const recordSecondsRef = useRef(0);
  const typingChRef = useRef(null);
  const lastTypingSent = useRef(0);
  const markedRef = useRef(new Set());

  useEffect(() => {
    if (propId) {
      setId(propId);
      return;
    }
    supabase.auth.getUser().then(({ data }) => {
      if (data && data.user) setId(data.user.id);
    });
  }, [propId]);

  const fetchProfiles = useCallback(async (ids) => {
    const missing = ids.filter((x) => x && !profilesCache.current[x]);
    if (missing.length === 0) return;
    const { data } = await supabase.from("profiles").select("id, display_name, handle, avatar_url, flag").in("id", missing);
    if (data) {
      data.forEach((p) => {
        profilesCache.current[p.id] = p;
      });
    }
  }, []);

  const fetchConversations = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const { data } = await supabase.from("conversations").select("id, user1_id, user2_id, created_at").or(`user1_id.eq.${id},user2_id.eq.${id}`).order("created_at", { ascending: false }).limit(50);
      const rows = data || [];
      const otherIds = rows.map((c) => (c.user1_id === id ? c.user2_id : c.user1_id));
      await fetchProfiles(otherIds);
      const enriched = [];
      for (const c of rows) {
        const otherId = c.user1_id === id ? c.user2_id : c.user1_id;
        const p = profilesCache.current[otherId] || { display_name: "Membre", flag: "🌍" };
        const { data: msgs } = await supabase.from("messages").select("text, created_at, type, file_name, deleted_at").eq("conversation_id", c.id).order("created_at", { ascending: false }).limit(1);
        enriched.push({
          id: c.id,
          otherUserId: otherId,
          otherUserName: p.display_name || "Membre",
          otherUserAvatar: p.avatar_url,
          otherUserFlag: p.flag || "🌍",
          lastMsg: msgs && msgs[0] ? msgs[0] : null,
          created_at: c.created_at,
        });
      }
      enriched.sort((a, b) => {
        const ta = a.lastMsg?.created_at || a.created_at || "";
        const tb = b.lastMsg?.created_at || b.created_at || "";
        return tb.localeCompare(ta);
      });
      setConversations(enriched);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [id, fetchProfiles]);

  useEffect(() => {
    if (!id) return;
    fetchConversations();
  }, [id, fetchConversations]);

  useEffect(() => {
    setMessages(messaging.messages || []);
    const incoming = (messaging.messages || []).filter((m) => m.recipient_id === id && !m.read_at);
    incoming.forEach((m) => { if (markedRef.current.has(m.id)) return; markedRef.current.add(m.id); markMessageRead(m.id); });
  }, [messaging.messages, id]);

  useEffect(() => {
    if (!activeChat?.id) return;
    const channel = supabase.channel(`typing:${activeChat.id}`)
      .on("broadcast", { event: "typing" }, ({ payload }) => {
        if (payload?.user_id !== id) {
          setTyping(Boolean(payload?.typing));
          window.clearTimeout(window.__baaroTypingTimer);
          window.__baaroTypingTimer = window.setTimeout(() => setTyping(false), 2200);
        }
      }).subscribe();
    typingChRef.current = channel;
    return () => { typingChRef.current = null; supabase.removeChannel(channel); window.clearTimeout(window.__baaroTypingTimer); };
  }, [activeChat?.id, id]);

  useEffect(() => {
    if (messagesEndRef.current) messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const openConversation = async (otherId, name, avatar, flag) => {
    if (!id || !otherId || otherId === id) return;
    const { data: existing } = await supabase.from("conversations").select("id").or(`and(user1_id.eq.${id},user2_id.eq.${otherId}),and(user1_id.eq.${otherId},user2_id.eq.${id})`).limit(1);
    if (existing && existing[0]) {
      setActiveChat({ id: existing[0].id, otherUserId: otherId, otherUserName: name, otherUserAvatar: avatar, otherUserFlag: flag });
      setShowNewChat(false);
      return;
    }
    const u1 = id < otherId ? id : otherId;
    const u2 = id < otherId ? otherId : id;
    const { data: nw } = await supabase.from("conversations").insert({ user1_id: u1, user2_id: u2 }).select("id").single();
    if (nw) {
      setActiveChat({ id: nw.id, otherUserId: otherId, otherUserName: name, otherUserAvatar: avatar, otherUserFlag: flag });
      setShowNewChat(false);
      fetchConversations();
    }
  };

  useEffect(() => {
    if (!id) return;
    let target = null;
    try {
      target = sessionStorage.getItem("baaro:open_chat_with");
      sessionStorage.removeItem("baaro:open_chat_with");
    } catch {}
    if (!target || !isValidAuthUserId(target)) return;
    (async () => {
      await fetchProfiles([target]);
      const pr = profilesCache.current[target] || {};
      openConversation(target, pr.display_name || "Membre", pr.avatar_url, pr.flag || "🌍");
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const handleSend = async (e) => {
    e.preventDefault();
    if (!newMessage.trim() || !activeChat || !id) return;
    const text = newMessage.trim();
    if (!isValidAuthUserId(id) || !isValidAuthUserId(activeChat.otherUserId)) { alert("Conversation invalide"); return; }
    setNewMessage("");
    const result = await messaging.sendMessage(text, { replyToId: replyTo?.id || null, clientMessageId: makeClientMessageId() });
    if (!result?.ok) { setNewMessage(text); alert(result?.error || "Impossible d'envoyer le message"); return; }
    setReplyTo(null);
  };

  const broadcastTyping = (value) => {
    const now = Date.now();
    if (!typingChRef.current || now - lastTypingSent.current < 1500) return;
    lastTypingSent.current = now;
    typingChRef.current.send({ type: "broadcast", event: "typing", payload: { user_id: id, typing: value } });
  };

  const handleFileSelect = async (e) => {
    const file = e.target.files ? e.target.files[0] : null;
    if (!file) return;
    if (e.target) e.target.value = "";
    setUploading(true);
    try {
      const up = await uploadChatFile(file, id);
      if (!isValidAuthUserId(id) || !isValidAuthUserId(activeChat.otherUserId)) return;
      const { error: insErr } = await supabase.from("messages").insert({ conversation_id: activeChat.id, sender_id: id, recipient_id: activeChat.otherUserId, text: up.fileName, type: mimeToMessageType(up.mime), media_url: up.url, media_mime: up.mime, media_size: up.size, file_name: up.fileName });
      if (insErr) throw insErr;
    } catch (err) {
      alert(err.message);
    } finally {
      setUploading(false);
    }
  };

  const handleReaction = async (messageId, reaction) => {
    try { await toggleMessageReaction(messageId, id, reaction); setReactionFor(null); } catch (e) { alert(e.message); }
  };

  const handleStar = async (messageId) => {
    try { const on = await toggleMessageStar(messageId, id); setStarred((prev) => { const n = new Set(prev); on ? n.add(messageId) : n.delete(messageId); return n; }); } catch (e) { alert(e.message); }
  };

  const setDisappearing = async (seconds) => {
    if (!activeChat?.id) return;
    try { await updateConversationSettings(activeChat.id, { disappearing_seconds: seconds }); setShowChatTools(false); } catch (e) { alert(e.message); }
  };

  const startRecording = async () => {
    if (mediaRecorderRef.current) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = getBestAudioMime();
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      recordChunksRef.current = [];
      recordSecondsRef.current = 0;
      rec.ondataavailable = (ev) => { if (ev.data.size > 0) recordChunksRef.current.push(ev.data); };
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        clearInterval(recordTimerRef.current);
        mediaRecorderRef.current = null;
        const seconds = recordSecondsRef.current;
        const blob = new Blob(recordChunksRef.current, { type: rec.mimeType || mime });
        if (blob.size < 500 || seconds < 1) { setRecording(false); setRecordSeconds(0); return; }
        setUploading(true);
        try {
          const up = await uploadVoiceBlob(blob, id, seconds);
          const { error } = await supabase.from("messages").insert({
            conversation_id: activeChat.id, sender_id: id, recipient_id: activeChat.otherUserId,
            text: "Vocal", type: "voice", media_url: up.url, media_mime: up.mime,
            media_size: up.size, media_duration: up.duration,
          });
          if (error) throw error;
        } catch (err) { alert(err.message); }
        finally { setUploading(false); setRecording(false); setRecordSeconds(0); }
      };
      mediaRecorderRef.current = rec;
      rec.start();
      setRecording(true);
      recordTimerRef.current = setInterval(() => {
        recordSecondsRef.current += 1;
        setRecordSeconds(recordSecondsRef.current);
      }, 1000);
    } catch { alert("Micro non autorisé"); }
  };

  const stopRecording = () => {
    const r = mediaRecorderRef.current;
    if (r && r.state !== "inactive") r.stop();
  };

  const startCall = async (type) => {
    if (!activeChat || !id) return;
    try {
      const roomRes = await createCallRoom({ userName: "Moi", mode: type });
      const roomName = roomRes.roomName || roomRes.daily_room_name;
      if (!roomName || !roomRes.url) throw new Error("Salle non créée : vérifie DAILY_API_KEY et DAILY_DOMAIN sur Vercel");
      const rec = await createCallRecord({ conversation_id: activeChat.id, caller_id: id, callee_id: activeChat.otherUserId, type, dailyRoomName: roomName });
      if (!rec?.id) throw new Error("Appel non enregistré (table calls ou RLS)");
      const tokenRes = await getCallToken({ roomName, userName: "Moi", isOwner: true });
      setCallState({
        mode: "outgoing", callType: type, callRecord: rec,
        roomUrl: roomRes.url, token: tokenRes.token,
        otherUser: { name: activeChat.otherUserName, avatar: activeChat.otherUserAvatar, flag: activeChat.otherUserFlag },
      });
    } catch (e) {
      console.error(e);
      alert(e.message || "Impossible de démarrer l'appel");
    }
  };

  useEffect(() => {
    if (!showNewChat) return;
    const q = searchQuery.trim();
    if (q.length < 2) { setSearchResults([]); return; }
    const t = setTimeout(async () => {
      const { data } = await supabase.from("profiles").select("id, display_name, avatar_url, flag").not("public_key", "is", null).ilike("display_name", "%" + q + "%").neq("id", id).limit(20);
      setSearchResults(data || []);
    }, 300);
    return () => clearTimeout(t);
  }, [searchQuery, showNewChat, id]);

  if (showNewChat) {
    return (
      <div className="max-w-2xl mx-auto w-full p-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold" style={{ color: C.ivory }}>Nouvelle conversation</h2>
          <button onClick={() => setShowNewChat(false)} className="p-2 rounded-full" style={{ color: C.muted }}><X size={20} /></button>
        </div>
        <div className="relative mb-4">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: C.muted }} />
          <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Nom" className="w-full pl-10 pr-4 py-3 rounded-xl border text-sm outline-none" style={{ background: C.surface2, borderColor: C.border, color: C.ivory }} />
        </div>
        <div className="space-y-2">
          {searchResults.map((u) => (
            <button key={u.id} onClick={() => openConversation(u.id, u.display_name, u.avatar_url, u.flag)} className="w-full p-3 rounded-xl border flex items-center gap-3 text-left" style={{ background: C.surface, borderColor: C.border }}>
              <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center">{u.flag || "🌍"}</div>
              <span style={{ color: C.ivory }}>{u.display_name}</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (activeChat) {
    return (
      <>
        {callState && <ChatCallModal mode={callState.mode} callType={callState.callType} callRecord={callState.callRecord} roomUrl={callState.roomUrl} token={callState.token} otherUser={callState.otherUser} onClose={closeCall} />}
        <div className="flex flex-col max-w-2xl mx-auto w-full" style={{ height: "calc(100dvh - 130px)" }}>
          <div className="flex items-center gap-2 p-3 border-b" style={{ borderColor: C.border }}>
            <button onClick={() => { setActiveChat(null); fetchConversations(); }} className="p-2 rounded-full" style={{ color: C.ivory }}><ArrowLeft size={20} /></button>
            <p className="font-bold text-sm" style={{ color: C.ivory }}>{activeChat.otherUserName}</p>
            <div className="ml-auto flex gap-1">
              <button onClick={() => startCall("voice")} className="p-2 rounded-full" style={{ color: C.teal }}><Phone size={18} /></button>
              <button type="button" onClick={() => setSearchInChat(searchInChat ? "" : " ")} className="p-2 rounded-full" style={{ color: C.muted }}><Search size={18} /></button>
              <button type="button" onClick={() => setShowChatTools(!showChatTools)} className="p-2 rounded-full" style={{ color: C.muted }}><MoreHorizontal size={18} /></button>
              <button onClick={() => startCall("video")} className="p-2 rounded-full" style={{ color: C.gold }}><Video size={18} /></button>
            </div>
          </div>
          {showChatTools && <div className="mx-3 mt-2 p-3 rounded-2xl border grid grid-cols-2 gap-2 text-xs" style={{background:C.surface,borderColor:C.border,color:C.ivory}}>
            <button type="button" onClick={()=>setDisappearing(86400)} className="p-2 rounded-xl border">⏳ 24 h</button>
            <button type="button" onClick={()=>setDisappearing(604800)} className="p-2 rounded-xl border">⏳ 7 jours</button>
            <button type="button" onClick={()=>setDisappearing(0)} className="p-2 rounded-xl border">♾️ Conserver</button>
            <button type="button" onClick={()=>setSearchInChat(" ")} className="p-2 rounded-xl border">🔎 Rechercher</button>
          </div>}
          <div className="flex-1 overflow-y-auto p-4 space-y-2">
            {searchInChat && <div className="sticky top-0 z-10 mb-2"><input autoFocus value={searchInChat} onChange={(e)=>setSearchInChat(e.target.value)} placeholder="Rechercher dans la conversation…" className="w-full px-3 py-2 rounded-xl border text-sm" style={{background:C.surface,borderColor:C.border,color:C.ivory}} /></div>}
            {messages.filter((m) => !searchInChat || String(m.plaintext || m.text || "").toLowerCase().includes(searchInChat.toLowerCase())).map((m) => {
              const isMe = m.sender_id === id;
              const body = m.plaintext ?? m.text;
              return (
                <div key={m.id} className={`flex ${isMe ? "justify-end" : "justify-start"}`}>
                  <div className="group relative max-w-[82%]">
                    {m.reply_to_id && <div className="text-[11px] px-2 py-1 mb-1 rounded-lg opacity-70" style={{background:C.surface2,color:C.muted}}>Réponse à un message</div>}
                    <div onClick={() => setActionsFor(actionsFor === m.id ? null : m.id)} className="px-3 py-2 rounded-2xl text-sm" style={{ background: isMe ? C.gold : C.surface2, color: isMe ? "#000" : C.ivory }}>
                      {m.type === "image" && m.media_url ? <img src={m.media_url} alt={m.file_name || "image"} className="rounded-xl max-h-72 max-w-full object-cover mb-1" loading="lazy" /> : null}
                      {m.type === "video" && m.media_url ? <video src={m.media_url} controls className="rounded-xl max-h-72 max-w-full mb-1" preload="metadata" /> : null}
                      {m.type === "voice" && m.media_url ? <audio src={m.media_url} controls className="max-w-full" /> : null}
                      <p className="break-words">{body}</p>
                      <div className="flex items-center justify-end gap-1 mt-1 opacity-60 text-[10px]">{m.encrypted && <span>🔒</span>}{isMe && <CheckCheck size={12}/>}</div>
                    </div>
                    <div className={`${actionsFor === m.id ? "flex" : "hidden"} absolute -top-8 right-0 gap-1 rounded-xl p-1 z-20`} style={{background:C.surface,border:`1px solid ${C.border}`}}>
                      <button type="button" onClick={()=>setReactionFor(reactionFor===m.id?null:m.id)} title="Réagir"><Smile size={14}/></button>
                      <button type="button" onClick={()=>setReplyTo(m)} title="Répondre"><Reply size={14}/></button>
                      <button type="button" onClick={()=>handleStar(m.id)} title="Favori"><Star size={14} fill={starred.has(m.id)?"currentColor":"none"}/></button>
                    </div>
                    {reactionFor===m.id && <div className="absolute -top-16 right-0 flex gap-1 p-2 rounded-2xl z-20" style={{background:C.surface,border:`1px solid ${C.border}`}}>{CHAT_REACTIONS.map(r=><button key={r} type="button" onClick={()=>handleReaction(m.id,r)} className="text-lg hover:scale-125 transition">{r}</button>)}</div>}
                  </div>
                </div>
              );
            })}
            {typing && <div className="text-xs px-2" style={{color:C.muted}}>Écrit…</div>}
            <div ref={messagesEndRef} />
          </div>
          <form onSubmit={handleSend} className="p-3 border-t flex gap-2 items-center flex-wrap" style={{ borderColor: C.border, background: C.bg, paddingBottom: "calc(5.5rem + env(safe-area-inset-bottom))" }}>
            {replyTo && <div className="w-full text-xs px-3 py-2 rounded-xl" style={{background:C.surface2,color:C.muted}}>Réponse à : {replyTo.plaintext || replyTo.text}<button type="button" onClick={()=>setReplyTo(null)} className="float-right">✕</button></div>}
            <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileSelect} />
            <button type="button" onClick={() => fileInputRef.current && fileInputRef.current.click()} className="p-2.5 rounded-xl border" style={{ borderColor: C.border, color: C.muted }}><Paperclip size={18} /></button>
            <button type="button" onClick={recording ? stopRecording : startRecording} className="p-2.5 rounded-xl border" style={{ borderColor: recording ? "#EF4444" : C.border, color: recording ? "#EF4444" : C.muted }}><Mic size={18} /></button>
            <input value={newMessage} onChange={(e) => { setNewMessage(e.target.value); broadcastTyping(true); }} placeholder="Message..." className="flex-1 px-4 py-3 rounded-xl border text-sm outline-none" style={{ background: C.surface2, borderColor: C.border, color: C.ivory }} />
            <button type="submit" className="p-3 rounded-xl" style={{ background: C.gold, color: "#000" }}><Send size={18} /></button>
          </form>
        </div>
      </>
    );
  }

  return (
    <div className="max-w-2xl mx-auto w-full p-4" style={{ paddingBottom: "calc(6rem + env(safe-area-inset-bottom))" }}>
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-xl font-bold flex items-center gap-2" style={{ color: C.ivory }}><MessageCircle size={24} style={{ color: C.gold }} />Messages</h2>
        <button onClick={() => setShowNewChat(true)} className="px-3 py-2 rounded-full text-sm font-bold" style={{ background: "rgba(217,174,82,0.2)", color: C.gold }}><Plus size={16} className="inline mr-1" />Nouveau</button>
      </div>
      {loading ? <p className="text-center py-10 text-sm" style={{ color: C.muted }}>Chargement...</p> : conversations.length === 0 ? <p className="text-center py-10 text-sm" style={{ color: C.muted }}>Aucune conversation</p> : conversations.map((c) => (
        <button key={c.id} onClick={() => setActiveChat(c)} className="w-full p-3 rounded-2xl border text-left flex items-center gap-3 mb-2" style={{ background: C.surface, borderColor: C.border }}>
          <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center">{c.otherUserFlag}</div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm truncate" style={{ color: C.ivory }}>{c.otherUserName}</p>
            <p className="text-xs truncate" style={{ color: C.muted }}>{!c.lastMsg ? "Nouvelle conversation" : c.lastMsg.type === "voice" ? "🎤 Vocal" : c.lastMsg.type === "image" ? "📷 Photo" : c.lastMsg.type === "video" ? "🎬 Vidéo" : deserializePayload(c.lastMsg.text) ? "🔒 Message chiffré" : c.lastMsg.text}</p>
          </div>
        </button>
      ))}
    </div>
  );
}
