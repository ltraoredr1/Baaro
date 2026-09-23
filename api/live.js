import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "../supabaseClient.js";
import { API_BASE } from "../config.js";
import DailyIframe from "@daily-co/daily-js";

const canSend = (() => {
  let last = 0;
  return () => {
    const now = Date.now();
    if (now - last < 700) return false;
    last = now;
    return true;
  };
})();

export function useDebates(userId) {
  const [rooms, setRooms] = useState([]);
  const [loadingRooms, setLoadingRooms] = useState(true);

  const loadRooms = useCallback(async () => {
    if (!userId) {
      setRooms([]);
      setLoadingRooms(false);
      return;
    }
    setLoadingRooms(true);
    const { data, error } = await supabase
    .from("debate_rooms")
    .select(`*, debate_participants!inner(user_id, left_at, role)`)
    .eq("debate_participants.user_id", userId)
    .is("debate_participants.left_at", null)
    .order("created_at", { ascending: false })
    .limit(50);
    if (error) console.error("loadRooms", error.message);
    setRooms(data || []);
    setLoadingRooms(false);
  }, [userId]);

  useEffect(() => {
    loadRooms();
    if (!userId) return;
    const ch = supabase
    .channel(`debate-rooms:${userId}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "debate_participants", filter: `user_id=eq.${userId}` }, loadRooms)
    .on("postgres_changes", { event: "*", schema: "public", table: "debate_rooms" }, loadRooms)
    .subscribe();
    return () => supabase.removeChannel(ch);
  }, [loadRooms, userId]);

  const createRoom = useCallback(async ({ title, topic, mode, maxParticipants, aiEnabled }) => {
    if (!userId) return { ok: false, reason: "Non authentifié" };
    try {
      const { data, error } = await supabase.rpc("create_debate_room_secure", {
        p_title: title?.trim().slice(0, 120),
        p_topic: topic?.trim().slice(0, 300),
        p_mode: mode || "text",
        p_max_participants: Math.min(Math.max(maxParticipants || 8, 2), 100),
        p_ai_enabled:!!aiEnabled,
      });
      if (error) throw error;
      await loadRooms();
      return { ok: true, room: data };
    } catch (e) {
      return { ok: false, reason: e.message };
    }
  }, [userId, loadRooms]);

  const joinByCode = useCallback(async (code) => {
    const c = code?.trim().toUpperCase();
    if (!c) return { ok: false, reason: "Code requis" };
    try {
      const { data, error } = await supabase.rpc("join_debate_by_code", { p_code: c });
      if (error) throw error;
      await loadRooms();
      return { ok: true, room: data };
    } catch (e) {
      return { ok: false, reason: e.message.replace(/^.*?:\s*/, "") };
    }
  }, [loadRooms]);

  const leaveRoom = useCallback(async (roomId) => {
    if (!userId ||!roomId) return;
    await supabase.from("debate_participants").update({ left_at: new Date().toISOString() }).eq("room_id", roomId).eq("user_id", userId).is("left_at", null);
    setRooms(r => r.filter(x => x.id!== roomId));
  }, [userId]);

  const endRoom = useCallback(async (roomId) => {
    if (!roomId ||!userId) return;
    await supabase.rpc("end_debate_room", { p_room_id: roomId });
    setRooms(r => r.filter(x => x.id!== roomId));
  }, [userId]);

  return { rooms, loadingRooms, createRoom, joinByCode, leaveRoom, endRoom, refreshRooms: loadRooms };
}

export function useRoomChat(roomId, userId) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [aiThinking, setAiThinking] = useState(false);
  const [inputText, setInputText] = useState("");
  const messagesRef = useRef([]);
  useEffect(() => { messagesRef.current = messages; }, [messages]);

  useEffect(() => {
    if (!roomId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data } = await supabase.from("debate_messages").select("*").eq("room_id", roomId).order("created_at", { ascending: true }).limit(300);
      if (!cancelled) {
        setMessages(data || []);
        setLoading(false);
      }
    })();
    const ch = supabase.channel(`debate-messages:${roomId}`)
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "debate_messages", filter: `room_id=eq.${roomId}` },
        (payload) => setMessages(prev => prev.some(m => m.id === payload.new.id)? prev : [...prev, payload.new])
      ).subscribe();
    return () => { cancelled = true; supabase.removeChannel(ch); };
  }, [roomId]);

  const sendText = useCallback(async (text) => {
    const content = (text?? inputText).trim().slice(0, 1000);
    if (!content ||!roomId ||!userId ||!canSend()) return;
    setInputText("");
    const tmpId = `tmp_${Date.now()}`;
    setMessages(p => [...p, { id: tmpId, room_id: roomId, sender_id: userId, sender_type: "user", text: content, created_at: new Date().toISOString(), _optimistic: true }]);
    const { error } = await supabase.from("debate_messages").insert({ room_id: roomId, sender_id: userId, sender_type: "user", text: content });
    if (error) setMessages(p => p.filter(m => m.id!== tmpId));
  }, [roomId, userId, inputText]);

  const askAI = useCallback(async (topic) => {
    if (!roomId || aiThinking) return;
    setAiThinking(true);
    try {
      const recent = messagesRef.current.slice(-16).map(m => `${m.sender_type === "ai"? "IA" : m.sender_id === userId? "Moi" : "Autre"}: ${m.text}`).join("\n");
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${API_BASE}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token || ""}` },
        body: JSON.stringify({ system: `IA neutre BAARO débat ${topic || ""}. 4-8 phrases max, nuancé, FR.`, messages: [{ role: "user", content: recent || "Débat commence." }], max_tokens: 600 }),
      });
      const data = await res.json();
      const reply = (data.content || []).find(b => b.type === "text")?.text || data.reply || "Pas de réponse.";
      if (!data.inserted) await supabase.from("debate_messages").insert({ room_id: roomId, sender_id: null, sender_type: "ai", text: reply });
    } catch {
      await supabase.from("debate_messages").insert({ room_id: roomId, sender_id: null, sender_type: "system", text: "IA indisponible." });
    } finally { setAiThinking(false); }
  }, [roomId, userId, aiThinking]);

  return { messages, loading, sendText, askAI, aiThinking, inputText, setInputText };
}

export function useDebateLive(room, userId, isHost) {
  const callRef = useRef(null);
  const [camOn, setCamOn] = useState(room?.mode!== "audio");
  const [micOn, setMicOn] = useState(true);
  const [joined, setJoined] = useState(false);
  const [error, setError] = useState(null);

  const joinLive = useCallback(async (containerEl) => {
    if (!room?.id ||!userId ||!containerEl) return;
    try {
      setError(null);
      // Permission AVANT Daily - fix Android Capacitor
      try {
        const s = await navigator.mediaDevices.getUserMedia({
          video: room.mode!== "audio"? { facingMode: "user" } : false,
          audio: true
        });
        s.getTracks().forEach(t => t.stop());
      } catch {}

      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${API_BASE}/api/live/token`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token || ""}` },
        body: JSON.stringify({ liveId: room.invite_code || room.id, userId, isOwner:!!isHost }),
      });
      const { token } = await res.json();
      if (!token) throw new Error("No Daily token");

      const call = DailyIframe.createFrame(containerEl, {
        iframeStyle: { width: "100%", height: "100%", border: "0", borderRadius: "16px" },
        showLeaveButton: false,
        showFullscreenButton: true,
      });
      callRef.current = call;

      await call.join({
        url: `https://${import.meta.env.VITE_DAILY_DOMAIN}.daily.co/${room.invite_code || room.id}`,
        token,
        videoSource: room.mode === "audio"? false : true,
      });

      await call.setLocalVideo(room.mode!== "audio"? camOn : false);
      await call.setLocalAudio(micOn);
      setJoined(true);
    } catch (e) {
      setError(e.message);
      console.error("joinLive", e);
    }
  }, [room, userId, isHost]); // eslint-disable-line

  const toggleCam = useCallback(async () => {
    setCamOn(prev => {
      const next =!prev;
      callRef.current?.setLocalVideo(next);
      return next;
    });
  }, []);

  const toggleMic = useCallback(async () => {
    setMicOn(prev => {
      const next =!prev;
      callRef.current?.setLocalAudio(next);
      return next;
    });
  }, []);

  const leaveLive = useCallback(async () => {
    try {
      await callRef.current?.leave();
      await callRef.current?.destroy();
    } finally {
      callRef.current = null;
      setJoined(false);
    }
  }, []);

  // Cleanup auto si changement de room
  useEffect(() => {
    return () => { callRef.current?.destroy(); };
  }, []);

  return { joinLive, leaveLive, toggleCam, toggleMic, camOn, micOn, joined, error, callRef };
}
