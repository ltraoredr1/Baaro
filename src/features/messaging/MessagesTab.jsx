import { useMessaging } from "../hooks/useMessaging.js";
import { useState, useEffect, useRef, useCallback } from "react";
import { ArrowLeft, Send, MessageCircle, Plus, X, Search, Paperclip, Mic, Phone, Video } from "lucide-react";
import { COLORS as THEME_COLORS } from "../theme.js";
import { supabase } from "../supabaseClient.js";
import { uploadChatFile, uploadVoiceBlob, mimeToMessageType, formatDuration, getBestAudioMime } from "../lib/chatMedia.js";
import { createCallRoom, getCallToken, createCallRecord } from "../lib/chatCalls.js"; // ✅ IMPORT MIS À JOUR
import { ChatCallModal } from "./ChatCallModal.jsx";

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

  const messagesEndRef = useRef(null);
  const profilesCache = useRef({});
  const fileInputRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const recordChunksRef = useRef([]);
  const recordTimerRef = useRef(null);

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
    if (!activeChat || !activeChat.id) return;
    const load = async () => {
      const { data } = await supabase.from("messages").select("*").eq("conversation_id", activeChat.id).order("created_at", { ascending: true }).limit(200);
      if (data) setMessages(data);
    };
    load();
    const ch = supabase.channel("room_" + activeChat.id).on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: "conversation_id=eq." + activeChat.id }, (pl) => {
      setMessages((prev) => [...prev, pl.new]);
    }).subscribe();
    return () => supabase.removeChannel(ch);
  }, [activeChat]);

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

  const handleSend = async (e) => {
    e.preventDefault();
    if (!newMessage.trim() || !activeChat || !id) return;
    const text = newMessage.trim();
    setNewMessage("");
    if (!isValidAuthUserId(id) || !isValidAuthUserId(activeChat.otherUserId)) return;
    await supabase.from("messages").insert({ conversation_id: activeChat.id, sender_id: id, recipient_id: activeChat.otherUserId, text: text, type: "text" });
  };

  const handleFileSelect = async (e) => {
    const file = e.target.files ? e.target.files[0] : null;
    if (!file) return;
    if (e.target) e.target.value = "";
    setUploading(true);
    try {
      const up = await uploadChatFile(file, id);
      if (!isValidAuthUserId(id) || !isValidAuthUserId(activeChat.otherUserId)) return;
      await supabase.from("messages").insert({ conversation_id: activeChat.id, sender_id: id, recipient_id: activeChat.otherUserId, text: up.fileName, type: mimeToMessageType(up.mime), media_url: up.url, media_mime: up.mime, media_size: up.size, file_name: up.fileName });
    } catch (err) {
      alert(err.message);
    } finally {
      setUploading(false);
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = getBestAudioMime();
      const rec = new MediaRecorder(stream, { mimeType: mime });
      recordChunksRef.current = [];
      rec.ondataavailable = (ev) => { if (ev.data.size > 0) recordChunksRef.current.push(ev.data); };
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        if (recordTimerRef.current) clearInterval(recordTimerRef.current);
        const blob = new Blob(recordChunksRef.current, { type: mime });
        if (blob.size < 500) { setRecording(false); return; }
        setUploading(true);
        try {
          const up = await uploadVoiceBlob(blob, id, recordSeconds);
          if (!isValidAuthUserId(id) || !isValidAuthUserId(activeChat.otherUserId)) return;
          await supabase.from("messages").insert({ conversation_id: activeChat.id, sender_id: id, recipient_id: activeChat.otherUserId, text: "Vocal", type: "voice", media_url: up.url, media_mime: up.mime, media_size: up.size, media_duration: up.duration });
        } catch (err) {
          alert(err.message);
        } finally {
          setUploading(false);
          setRecording(false);
          setRecordSeconds(0);
        }
      };
      mediaRecorderRef.current = rec;
      rec.start();
      setRecording(true);
      recordTimerRef.current = setInterval(() => setRecordSeconds((s) => s + 1), 1000);
    } catch {
      alert("Micro non autorisé");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && recording) mediaRecorderRef.current.stop();
  };

  // ✅ FONCTION startCall CORRIGÉE ET COMPLÈTE
  const startCall = async (type) => {
    if (!activeChat || !id) return;
    try {
      // 1. Créer la room
      const roomRes = await createCallRoom({ 
        userName: activeChat.otherUserName, 
        mode: type 
      });
      
      const roomName = roomRes.roomName || roomRes.daily_room_name;
      
      // 2. Obtenir le token (C'était l'étape manquante !)
      const tokenRes = await getCallToken({ 
        roomName: roomName, 
        userName: "Moi", 
        isOwner: true 
      });

      // 3. Enregistrer en BDD (non-bloquant)
      let rec = null;
      try {
        rec = await createCallRecord({ 
          conversationId: activeChat.id, 
          callerId: id, 
          calleeId: activeChat.otherUserId, 
          type: type, 
          dailyRoomName: roomName 
        });
      } catch (err) {
        console.warn("Échec de l'enregistrement de l'appel en BDD, mais on continue:", err);
        rec = { id: null };
      }
      
      // 4. Lancer l'interface d'appel avec le token valide
      setCallState({ 
        mode: "outgoing", 
        callType: type, 
        callRecord: rec, 
        roomUrl: roomRes.url, 
        token: tokenRes.token, // ✅ Le token est maintenant bien défini
        otherUser: { 
          name: activeChat.otherUserName, 
          avatar: activeChat.otherUserAvatar, 
          flag: activeChat.otherUserFlag 
        } 
      });
    } catch (e) {
      console.error("🔴 ERREUR DÉTAILLÉE DE L'APPEL :", e);
      alert(e.message || "Impossible de démarrer l'appel");
    }
  };

  useEffect(() => {
    if (!showNewChat) return;
    const q = searchQuery.trim();
    if (q.length < 2) { setSearchResults([]); return; }
    const t = setTimeout(async () => {
      const { data } = await supabase.from("profiles").select("id, display_name, avatar_url, flag").ilike("display_name", "%" + q + "%").neq("id", id).limit(20);
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
        {callState && <ChatCallModal mode={callState.mode} callType={callState.callType} callRecord={callState.callRecord} roomUrl={callState.roomUrl} token={callState.token} otherUser={callState.otherUser} onClose={() => setCallState(null)} />}
        <div className="flex flex-col max-w-2xl mx-auto w-full" style={{ height: "calc(100dvh - 130px)" }}>
          <div className="flex items-center gap-2 p-3 border-b" style={{ borderColor: C.border }}>
            <button onClick={() => { setActiveChat(null); fetchConversations(); }} className="p-2 rounded-full" style={{ color: C.ivory }}><ArrowLeft size={20} /></button>
            <p className="font-bold text-sm" style={{ color: C.ivory }}>{activeChat.otherUserName}</p>
            <div className="ml-auto flex gap-1">
              <button onClick={() => startCall("voice")} className="p-2 rounded-full" style={{ color: C.teal }}><Phone size={18} /></button>
              <button onClick={() => startCall("video")} className="p-2 rounded-full" style={{ color: C.gold }}><Video size={18} /></button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-2">
            {messages.map((m) => {
              const isMe = m.sender_id === id;
              return (
                <div key={m.id} className={`flex ${isMe ? "justify-end" : "justify-start"}`}>
                  <div className="max-w-[80%] px-3 py-2 rounded-2xl text-sm" style={{ background: isMe ? C.gold : C.surface2, color: isMe ? "#000" : C.ivory }}>
                    <p className="break-words">{m.text}</p>
                  </div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>
          <form onSubmit={handleSend} className="p-3 border-t flex gap-2 items-center" style={{ borderColor: C.border, background: C.bg, paddingBottom: "calc(5.5rem + env(safe-area-inset-bottom))" }}>
            <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileSelect} />
            <button type="button" onClick={() => fileInputRef.current && fileInputRef.current.click()} className="p-2.5 rounded-xl border" style={{ borderColor: C.border, color: C.muted }}><Paperclip size={18} /></button>
            <button type="button" onMouseDown={startRecording} onMouseUp={stopRecording} onTouchStart={startRecording} onTouchEnd={stopRecording} className="p-2.5 rounded-xl border" style={{ borderColor: recording ? "#EF4444" : C.border, color: recording ? "#EF4444" : C.muted }}><Mic size={18} /></button>
            <input value={newMessage} onChange={(e) => setNewMessage(e.target.value)} placeholder="Message..." className="flex-1 px-4 py-3 rounded-xl border text-sm outline-none" style={{ background: C.surface2, borderColor: C.border, color: C.ivory }} />
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
            <p className="text-xs truncate" style={{ color: C.muted }}>{c.lastMsg ? c.lastMsg.text : "Nouvelle conversation"}</p>
          </div>
        </button>
      ))}
    </div>
  );
}
