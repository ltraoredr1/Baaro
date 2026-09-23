import { useState, useEffect, useMemo, useCallback, useRef, memo } from "react";
import { ArrowLeft, Hash, Users, MessageSquare, Send, Copy, Check, FileText } from "lucide-react";
import { COLORS } from "../theme.js";
import { supabase } from "../supabaseClient.js";

const API_BASE = import.meta.env.VITE_API_BASE || import.meta.env.VITE_API_URL || "";

const ChatMessage = memo(function ChatMessage({ msg, currentId }) {
  const isMe = msg.sender_id === currentId;
  const isAI = msg.sender_type === "ai";
  return (
    <div className={`flex gap-2 ${isMe? "flex-row-reverse" : "flex-row"}`}>
      <div className={`max-w-[75%] px-4 py-2.5 rounded-2xl text-sm ${isMe? "rounded-tr-sm" : "rounded-tl-sm"}`} style={{ background: isMe? COLORS.gold : isAI? "rgba(167,139,250,0.15)" : COLORS.surface2, color: isMe? "#000" : COLORS.ivory, border: isAI? "1px solid rgba(167,139,250,0.4)" : undefined }}>
        {!isMe && <p className="text-[10px] font-bold mb-1" style={{ color: isAI? "#a78bfa" : COLORS.gold }}>{isAI? "✨ IA BAARO" : (msg.profile?.display_name || `Membre ${msg.sender_id?.slice(0,4)}`)}</p>}
        <p className="break-words">{msg.text}</p>
        {msg.media_url && <a href={msg.media_url} target="_blank" rel="noreferrer" className="text-xs underline mt-1 block">{msg.media_name || "Fichier"}</a>}
        <p className={`text-[10px] mt-1.5 ${isMe? "text-black/60" : "text-gray-400"}`}>{new Date(msg.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</p>
      </div>
    </div>
  );
});

export function DebateRoom({ inviteCode, onBack }) {
  const [userId, setUserId] = useState(null);
  const [room, setRoom] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [codeCopied, setCodeCopied] = useState(false);
  const [sending, setSending] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);

  const messagesEndRef = useRef(null);
  const chatRef = useRef(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(()=>{ scrollToBottom(); }, [messages, scrollToBottom]);

  useEffect(()=>{
    let mounted = true;
    let msgChannel = null;

    const init = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user?.id) throw new Error("Non connecté. Reconnecte-toi.");
        if (mounted) setUserId(session.user.id);

        const code = String(inviteCode || "").trim().toLowerCase();

        // 1. Cherche la room - SANS RPC, direct select pour éviter Failed to fetch
        const { data: roomData, error: roomErr } = await supabase
        .from("debate_rooms")
        .select("*")
        .or(`invite_code.ilike.${code},id.eq.${code}`)
        .in("status", ["active","paused"])
        .maybeSingle();

        if (roomErr ||!roomData) throw new Error("Salle introuvable : " + code);
        if (mounted) setRoom(roomData);

        // 2. S'assure qu'on est participant
        await supabase.from("debate_participants").upsert(
          { room_id: roomData.id, user_id: session.user.id, role: roomData.host_id === session.user.id? "host" : "member", left_at: null },
          { onConflict: "room_id,user_id" }
        );

        // 3. Charge messages
        const { data: msgs } = await supabase.from("debate_messages").select("*").eq("room_id", roomData.id).order("created_at", {ascending:true}).limit(200);
        if (mounted) setMessages(msgs || []);

        // 4. Realtime messages
        msgChannel = supabase.channel(`room:${roomData.id}`)
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "debate_messages", filter: `room_id=eq.${roomData.id}` },
           (payload) => setMessages(prev => prev.some(m=>m.id===payload.new.id)? prev : [...prev, payload.new])
         ).subscribe();

      } catch (e) {
        if (mounted) setError(e.message);
      } finally {
        if (mounted) setLoading(false);
      }
    };
    init();
    return ()=>{ if(msgChannel) supabase.removeChannel(msgChannel); };
  }, [inviteCode]);

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!newMessage.trim() ||!room ||!userId || sending) return;
    const text = newMessage.trim().slice(0,1000);
    setNewMessage(""); setSending(true);
    try {
      const { error } = await supabase.from("debate_messages").insert({ room_id: room.id, sender_id: userId, sender_type: "user", text });
      if (error) throw error;
      scrollToBottom();
    } catch (err) {
      setNewMessage(text);
      console.error(err.message);
    } finally { setSending(false); }
  };

  const handleAskAI = async () => {
    if (!room || aiLoading) return;
    setAiLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const recent = messages.slice(-12).map(m=>m.text).join("\n");
      const res = await fetch(`${API_BASE}/api/chat`, {
        method: "POST",
        headers: { "Content-Type":"application/json", Authorization:`Bearer ${session?.access_token||""}` },
        body: JSON.stringify({ system:`IA BAARO débat ${room.topic}. 5 phrases max FR.`, messages:[{role:"user", content: recent||"Donne un angle."}], max_tokens:400 })
      });
      const data = await res.json();
      const reply = data.content?.find(b=>b.type==="text")?.text || data.reply || "Pas de réponse IA.";
      await supabase.from("debate_messages").insert({ room_id: room.id, sender_type:"ai", text: reply });
    } catch(e){ console.error(e); }
    finally{ setAiLoading(false); }
  };

  if (error) return <div className="flex flex-col items-center justify-center h-full p-6" style={{background:COLORS.surface}}><p className="text-red-400 font-bold mb-4">{error}</p><button onClick={onBack} className="px-6 py-3 rounded-xl font-bold" style={{background:COLORS.gold}}>Retour</button></div>;
  if (loading) return <div className="flex items-center justify-center h-full" style={{background:COLORS.surface}}><div className="animate-spin w-8 h-8 border-4 border-yellow-500 border-t-transparent rounded-full"/></div>;

  return (
    <div className="flex flex-col h-full" style={{ background: COLORS.surface }}>
      <div className="flex items-center gap-3 p-4 border-b" style={{ borderColor: COLORS.border }}>
        <button onClick={onBack} className="p-2 rounded-full hover:bg-white/10" style={{ color: COLORS.ivory }}><ArrowLeft size={20} /></button>
        <div className="flex-1 min-w-0">
          <h2 className="font-bold text-sm truncate" style={{ color: COLORS.ivory }}>{room?.title} <span className="text-[10px] px-2 py-0.5 rounded-full ml-2 bg-green-500/20 text-green-400">{room?.status}</span></h2>
          <div className="text-xs flex items-center gap-1 mt-0.5" style={{ color: COLORS.muted }}>
            <Hash size={12} /> {room?.topic}
            <button onClick={()=>{ navigator.clipboard.writeText(room.invite_code); setCodeCopied(true); setTimeout(()=>setCodeCopied(false),2000); }} className="ml-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-lg border text-[11px] font-bold" style={{ borderColor: codeCopied?COLORS.teal:COLORS.border, color: codeCopied?COLORS.teal:COLORS.gold }}>
              {codeCopied? <><Check size={12}/> Copié</> : <><Copy size={12}/> {room.invite_code}</>}
            </button>
          </div>
        </div>
        <button onClick={handleAskAI} disabled={aiLoading} className="p-2 rounded-xl text-xs font-bold" style={{background: aiLoading?"gray":COLORS.surface2, color: COLORS.gold}}>{aiLoading?"...":"✨ IA"}</button>
      </div>

      <div ref={chatRef} className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length===0? <div className="text-center py-10" style={{color:COLORS.muted}}><MessageSquare size={40} className="mx-auto mb-2 opacity-50"/><p className="text-sm">Lance la discussion!</p></div> : messages.map(m=><ChatMessage key={m.id} msg={m} currentId={userId} />)}
        <div ref={messagesEndRef} />
      </div>

      <form onSubmit={handleSendMessage} className="p-4 border-t flex gap-2" style={{ borderColor: COLORS.border }}>
        <input value={newMessage} onChange={e=>setNewMessage(e.target.value)} placeholder="Ton message..." className="flex-1 px-4 py-3 rounded-xl border text-sm outline-none" style={{ background: COLORS.surface2, borderColor: COLORS.border, color: COLORS.ivory }} />
        <button type="submit" disabled={!newMessage.trim()||sending} className="p-3 rounded-xl disabled:opacity-50" style={{ background: COLORS.gold, color:"#000" }}><Send size={18} /></button>
      </form>
    </div>
  );
}
