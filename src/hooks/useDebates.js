import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "../supabaseClient.js";
import { API_BASE } from "../config.js";
import DailyIframe from "@daily-co/daily-js";

const canSend = (() => { let last = 0; return () => { const now = Date.now(); if (now - last < 700) return false; last = now; return true; }; })();

export function useDebates(userId) {
  const [rooms, setRooms] = useState([]);
  const [loadingRooms, setLoadingRooms] = useState(true);

  const loadRooms = useCallback(async () => {
    if (!userId) { setRooms([]); setLoadingRooms(false); return; }
    setLoadingRooms(true);
    try {
      const { data: parts } = await supabase.from("debate_participants").select("room_id").eq("user_id", userId).is("left_at", null);
      if (!parts?.length) { setRooms([]); return; }
      const ids = parts.map(p => p.room_id);
      const { data: roomsData } = await supabase.from("debate_rooms").select("*").in("id", ids).order("created_at", { ascending: false });
      setRooms(roomsData || []);
    } catch (err) { console.error(err); setRooms([]); }
    finally { setLoadingRooms(false); }
  }, [userId]);

  useEffect(() => { loadRooms(); if (!userId) return;
    const ch = supabase.channel(`debate-rooms:${userId}`).on("postgres_changes", { event: "*", schema: "public", table: "debate_participants", filter: `user_id=eq.${userId}` }, loadRooms).subscribe();
    return () => supabase.removeChannel(ch);
  }, [loadRooms, userId]);

  const createRoom = useCallback(async ({ title, topic, mode, maxParticipants, aiEnabled }) => {
    if (!userId) return { ok: false, reason: "Non authentifié" };
    try {
      const code = Math.random().toString(36).substring(2,8).toUpperCase();
      const { data: room, error: e1 } = await supabase.from("debate_rooms").insert({
        title: (title||'Débat').slice(0,120), topic: (topic||'').slice(0,300),
        mode: mode||'text', max_participants: Math.min(Math.max(maxParticipants||8,2),100),
        ai_enabled:!!aiEnabled, host_id: userId, invite_code: code, status: 'active'
      }).select().single();
      if (e1) throw e1;
      const { error: e2 } = await supabase.from("debate_participants").insert({ room_id: room.id, user_id: userId, role: 'host' });
      if (e2) throw e2;
      await loadRooms(); return { ok: true, room };
    } catch (e) { return { ok: false, reason: e.message }; }
  }, [userId, loadRooms]);

  const joinByCode = useCallback(async (code) => {
    const c = code?.trim().toUpperCase(); if (!c) return { ok: false, reason: "Code requis" };
    try {
      const { data: room, error } = await supabase.from("debate_rooms").select("*").eq("invite_code", c).eq("status","active").single();
      if (error ||!room) throw new Error("Code invalide");
      await supabase.from("debate_participants").upsert({ room_id: room.id, user_id: userId, role: 'member', left_at: null }, { onConflict: 'room_id,user_id' });
      await loadRooms(); return { ok: true, room };
    } catch (e) { return { ok: false, reason: e.message }; }
  }, [userId, loadRooms]);

  const leaveRoom = useCallback(async (roomId) => {
    await supabase.from("debate_participants").update({ left_at: new Date().toISOString() }).eq("room_id", roomId).eq("user_id", userId);
    setRooms(r => r.filter(x => x.id!== roomId));
  }, [userId]);

  const endRoom = useCallback(async (roomId) => {
    await supabase.from("debate_rooms").update({ status: 'ended' }).eq("id", roomId).eq("host_id", userId);
    setRooms(r => r.filter(x => x.id!== roomId));
  }, [userId]);

  return { rooms, loadingRooms, createRoom, joinByCode, leaveRoom, endRoom, refreshRooms: loadRooms };
}

export function useRoomChat(roomId, userId) {
  const [messages, setMessages] = useState([]); const [loading, setLoading] = useState(true);
  const [aiThinking, setAiThinking] = useState(false); const [inputText, setInputText] = useState("");
  const messagesRef = useRef([]); useEffect(()=>{messagesRef.current=messages},[messages]);
  useEffect(()=>{ if(!roomId) return; (async()=>{ setLoading(true); const { data } = await supabase.from("debate_messages").select("*").eq("room_id", roomId).order("created_at",{ascending:true}).limit(300); setMessages(data||[]); setLoading(false); })();
    const ch = supabase.channel(`debate-messages:${roomId}`).on("postgres_changes",{event:"INSERT",schema:"public",table:"debate_messages",filter:`room_id=eq.${roomId}`}, p=>setMessages(prev=>prev.some(m=>m.id===p.new.id)?prev:[...prev,p.new])).subscribe();
    return ()=>supabase.removeChannel(ch);
  },[roomId]);
  const sendText = useCallback(async (text) => {
    const content = (text??inputText).trim().slice(0,1000); if(!content||!roomId||!userId||!canSend()) return; setInputText("");
    const tmpId=`tmp_${Date.now()}`; setMessages(p=>[...p,{id:tmpId,room_id:roomId,sender_id:userId,sender_type:"user",text:content,created_at:new Date().toISOString()}]);
    const { error } = await supabase.from("debate_messages").insert({ room_id: roomId, sender_id: userId, sender_type:"user", text: content });
    if(error) setMessages(p=>p.filter(m=>m.id!==tmpId));
  },[roomId,userId,inputText]);
  const askAI = useCallback(async (topic) => {
    if(!roomId||aiThinking) return; setAiThinking(true);
    try {
      const recent = messagesRef.current.slice(-16).map(m=>`${m.sender_type==="ai"?"IA":m.sender_id===userId?"Moi":"Autre"}: ${m.text}`).join("\n");
      const { data:{session} } = await supabase.auth.getSession();
      const res = await fetch(`${API_BASE}/api/chat`,{ method:"POST", headers:{ "Content-Type":"application/json", Authorization:`Bearer ${session?.access_token||""}` }, body: JSON.stringify({ system:`IA neutre BAARO débat ${topic||""}. 4-8 phrases max.`, messages:[{role:"user",content:recent||"Débat commence."}], max_tokens:600 }) });
      const data = await res.json(); const reply = (data.content||[]).find(b=>b.type==="text")?.text || data.reply || "Pas de réponse.";
      await supabase.from("debate_messages").insert({ room_id: roomId, sender_type:"ai", text: reply });
    } finally { setAiThinking(false); }
  },[roomId,userId,aiThinking]);
  return { messages, loading, sendText, askAI, aiThinking, inputText, setInputText };
}

export function useDebateLive(room, userId, isHost) {
  const callRef = useRef(null); const [camOn,setCamOn]=useState(room?.mode!=="audio"); const [micOn,setMicOn]=useState(true); const [joined,setJoined]=useState(false); const [error,setError]=useState(null);
  const joinLive = useCallback(async (containerEl) => {
    if(!room?.id||!userId||!containerEl) return; try {
      setError(null);
      try { const s=await navigator.mediaDevices.getUserMedia({video:room.mode!=="audio",audio:true}); s.getTracks().forEach(t=>t.stop()); } catch{}
      const { data:{session} } = await supabase.auth.getSession();
      const res = await fetch(`${API_BASE}/api/live/token`,{ method:"POST", headers:{ "Content-Type":"application/json", Authorization:`Bearer ${session?.access_token||""}` }, body: JSON.stringify({ liveId: room.invite_code||room.id, userId, isOwner:!!isHost }) });
      const { token } = await res.json(); if(!token) throw new Error("No Daily token");
      const call = DailyIframe.createFrame(containerEl,{ iframeStyle:{width:"100%",height:"100%",border:"0",borderRadius:"16px"}, showLeaveButton:false, showFullscreenButton:true }); callRef.current=call;
      await call.join({ url:`https://${import.meta.env.VITE_DAILY_DOMAIN}.daily.co/${room.invite_code||room.id}`, token, videoSource: room.mode==="audio"?false:true });
      await call.setLocalVideo(room.mode!=="audio"?camOn:false); await call.setLocalAudio(micOn); setJoined(true);
    } catch(e){ setError(e.message); }
  },[room,userId,isHost,camOn,micOn]);
  const toggleCam = useCallback(()=>{ setCamOn(p=>{ callRef.current?.setLocalVideo(!p); return!p; }); },[]);
  const toggleMic = useCallback(()=>{ setMicOn(p=>{ callRef.current?.setLocalAudio(!p); return!p; }); },[]);
  const leaveLive = useCallback(async()=>{ try{ await callRef.current?.leave(); await callRef.current?.destroy(); } finally{ callRef.current=null; setJoined(false); } },[]);
  useEffect(()=>()=>{callRef.current?.destroy()},[]);
  return { joinLive, leaveLive, toggleCam, toggleMic, camOn, micOn, joined, error, callRef };
}
