// src/hooks/useDebates.js
import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "../supabaseClient.js";
import { API_BASE } from "../config.js";

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
    try {
      // 1 seule requête au lieu de 2 - utilise tes 4 FK propres
      const { data, error } = await supabase
      .from("debate_rooms")
      .select("*, debate_participants!inner(user_id, left_at)")
      .eq("debate_participants.user_id", userId)
      .is("debate_participants.left_at", null)
      .order("created_at", { ascending: false })
      .limit(50);

      if (error) throw error;
      setRooms(data || []);
    } catch (err) {
      console.error("loadRooms:", err.message);
      setRooms([]);
    } finally {
      setLoadingRooms(false);
    }
  }, [userId]);

  useEffect(() => { loadRooms(); }, [loadRooms]);

  const createRoom = useCallback(async ({ title, topic, mode, maxParticipants, aiEnabled }) => {
    if (!userId) return { ok: false, reason: "Non authentifié" };
    try {
      const { data: room, error } = await supabase
      .from("debate_rooms")
      .insert({
          host_id: userId, // = profiles.id
          title: title?.trim(),
          topic: topic?.trim(),
          mode,
          max_participants: maxParticipants,
          ai_enabled: aiEnabled,
        })
      .select()
      .single();
      if (error) throw error;

      await supabase.from("debate_participants").insert({ room_id: room.id, user_id: userId });
      await loadRooms();
      return { ok: true, room };
    } catch (e) {
      return { ok: false, reason: e.message };
    }
  }, [userId, loadRooms]);

  const joinByCode = useCallback(async (code) => {
    if (!code?.trim()) return { ok: false, reason: "Code requis" };
    try {
      const { data: room, error } = await supabase.rpc("join_debate_by_code", { p_code: code.trim().toUpperCase() });
      if (error) throw error;
      await loadRooms();
      return { ok: true, room };
    } catch (e) {
      return { ok: false, reason: e.message?.replace(/^.*?:\s*/, "") || "Impossible de rejoindre" };
    }
  }, [loadRooms]);

  const leaveRoom = useCallback(async (roomId) => {
    if (!userId ||!roomId) return;
    await supabase.from("debate_participants").update({ left_at: new Date().toISOString() }).eq("room_id", roomId).eq("user_id", userId);
    await loadRooms();
  }, [userId, loadRooms]);

  const endRoom = useCallback(async (roomId) => {
    if (!roomId) return;
    await supabase.from("debate_rooms").update({ status: "ended", ended_at: new Date().toISOString() }).eq("id", roomId);
  }, []);

  return { rooms, loadingRooms, createRoom, joinByCode, leaveRoom, endRoom, refreshRooms: loadRooms };
}

export function useRoomChat(roomId, userId) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [aiThinking, setAiThinking] = useState(false);
  const [inputText, setInputText] = useState("");
  const messagesRef = useRef(messages);
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

    const channel = supabase.channel(`debate-messages:${roomId}`)
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "debate_messages", filter: `room_id=eq.${roomId}` },
        (payload) => setMessages((prev) => prev.some((m) => m.id === payload.new.id)? prev : [...prev, payload.new])
      ).subscribe();

    return () => { cancelled = true; supabase.removeChannel(channel); };
  }, [roomId]);

  const sendText = useCallback(async (text) => {
    const content = (text || inputText).trim();
    if (!content ||!roomId ||!userId) return;
    setInputText("");
    await supabase.from("debate_messages").insert({ room_id: roomId, sender_id: userId, sender_type: "user", text: content });
  }, [roomId, userId, inputText]);

  const askAI = useCallback(async (topic) => {
    if (!roomId) return;
    setAiThinking(true);
    try {
      const recent = messagesRef.current.slice(-20).map((m) => `${m.sender_type === "ai"? "IA" : m.sender_id === userId? "Moi" : "Participant"}: ${m.text}`).join("\n");
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${API_BASE}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token || ""}` },
        body: JSON.stringify({
          max_tokens: 600,
          system: `Tu es un participant IA neutre dans BAARO${topic? ` sur « ${topic} »` : ""}. 4-8 phrases max, nuancé, respectueux, en français.`,
          messages: [{ role: "user", content: recent || "Le débat commence." }],
        }),
      });
      if (!res.ok) throw new Error("IA error");
      const data = await res.json();
      const reply = (data.content||[]).find((b) => b.type === "text")?.text || "Pas de réponse.";
      await supabase.from("debate_messages").insert({ room_id: roomId, sender_id: null, sender_type: "ai", text: reply });
    } catch (err) {
      await supabase.from("debate_messages").insert({ room_id: roomId, sender_id: null, sender_type: "system", text: "IA indisponible." });
    } finally {
      setAiThinking(false);
    }
  }, [roomId, userId]);

  return { messages, loading, sendText, askAI, aiThinking, inputText, setInputText };
}
