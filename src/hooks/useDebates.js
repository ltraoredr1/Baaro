import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "../supabaseClient.js";
import { API_BASE } from "../config.js";

// Gère : la liste des salons de débat auxquels je participe, la création
// d'un salon, le fait de rejoindre par code, le chat de groupe en direct,
// et la génération d'une réponse de l'IA de débat.
export function useDebates(userId) {
  const [rooms, setRooms] = useState([]);
  const [loadingRooms, setLoadingRooms] = useState(true);

  const loadRooms = useCallback(async () => {
    if (!userId) return;
    setLoadingRooms(true);
    const { data: memberships } = await supabase.from("debate_participants").select("room_id").eq("user_id", userId).is("left_at", null);
    const roomIds = (memberships || []).map((m) => m.room_id);
    if (roomIds.length === 0) {
      setRooms([]);
      setLoadingRooms(false);
      return;
    }
    const { data } = await supabase
      .from("debate_rooms")
      .select("*")
      .in("id", roomIds)
      .order("created_at", { ascending: false });
    setRooms(data || []);
    setLoadingRooms(false);
  }, [userId]);

  useEffect(() => {
    loadRooms();
  }, [loadRooms]);

  const createRoom = useCallback(
    async ({ title, topic, mode, maxParticipants, aiEnabled }) => {
      const { data: room, error } = await supabase
        .from("debate_rooms")
        .insert({ host_id: userId, title, topic, mode, max_participants: maxParticipants, ai_enabled: aiEnabled })
        .select()
        .single();
      if (error) return { ok: false, reason: error.message };
      await supabase.from("debate_participants").insert({ room_id: room.id, user_id: userId });
      await loadRooms();
      return { ok: true, room };
    },
    [userId, loadRooms]
  );

  // Passe par une fonction serveur (RPC "security definer") plutôt que
  // par un select direct sur debate_rooms : la table est désormais
  // restreinte en lecture aux hôtes/participant·es (voir
  // supabase-fix-debates-security.sql), donc quelqu'un qui n'a pas
  // encore rejoint ne peut pas la lire directement. Seule la fonction,
  // elle-même protégée par le code, peut vérifier et faire rejoindre.
  const joinByCode = useCallback(
    async (code) => {
      const { data: room, error } = await supabase.rpc("join_debate_by_code", { p_code: code.trim() });
      if (error) return { ok: false, reason: error.message?.replace(/^.*?:\s*/, "") || "Impossible de rejoindre ce live." };
      await loadRooms();
      return { ok: true, room };
    },
    [loadRooms]
  );

  const leaveRoom = useCallback(
    async (roomId) => {
      await supabase.from("debate_participants").update({ left_at: new Date().toISOString() }).eq("room_id", roomId).eq("user_id", userId);
      await loadRooms();
    },
    [userId, loadRooms]
  );

  const endRoom = useCallback(async (roomId) => {
    await supabase.from("debate_rooms").update({ status: "ended", ended_at: new Date().toISOString() }).eq("id", roomId);
  }, []);

  // Chat de groupe en direct pour un salon donné.
  const useRoomChat = (roomId) => {
    const [messages, setMessages] = useState([]);
    const [loading, setLoading] = useState(true);
    const [aiThinking, setAiThinking] = useState(false);

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

      const channel = supabase
        .channel(`debate-messages:${roomId}`)
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "debate_messages", filter: `room_id=eq.${roomId}` }, (payload) => {
          setMessages((prev) => (prev.some((m) => m.id === payload.new.id) ? prev : [...prev, payload.new]));
        })
        .subscribe();

      return () => {
        cancelled = true;
        supabase.removeChannel(channel);
      };
    }, [roomId]);

    const sendText = useCallback(
      async (text) => {
        if (!text.trim()) return;
        await supabase.from("debate_messages").insert({ room_id: roomId, sender_id: userId, sender_type: "user", text: text.trim() });
      },
      [roomId]
    );

    // Fait intervenir l'IA dans le débat : elle lit les derniers échanges
    // et publie sa contribution comme un message du salon, visible de tous.
    const askAI = useCallback(
      async (topic) => {
        setAiThinking(true);
        try {
          const recent = messages.slice(-20).map((m) => `${m.sender_type === "ai" ? "IA" : m.sender_id === userId ? "Moi" : "Participant"}: ${m.text}`).join("\n");
          const response = await fetch(`${API_BASE}/api/chat`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              max_tokens: 600,
              system: `Tu es un participant IA neutre invité dans un débat de groupe BAARO${topic ? ` sur le thème « ${topic} »` : ""}. Apporte un point de vue argumenté, nuancé et respectueux, en 4 à 8 phrases maximum. Si des positions opposées existent, présente-les équitablement plutôt que d'imposer un avis. Réponds en français.`,
              messages: [{ role: "user", content: recent || "Le débat commence. Lance une première réflexion sur le sujet." }],
            }),
          });
          const data = await response.json();
          const textBlock = (data.content || []).find((b) => b.type === "text");
          const reply = textBlock ? textBlock.text : "Je n'ai pas pu générer de réponse, réessayez.";
          await supabase.from("debate_messages").insert({ room_id: roomId, sender_id: null, sender_type: "ai", text: reply });
        } catch {
          await supabase.from("debate_messages").insert({ room_id: roomId, sender_id: null, sender_type: "system", text: "L'IA n'a pas pu répondre (erreur réseau)." });
        } finally {
          setAiThinking(false);
        }
      },
      [roomId, messages]
    );

    return { messages, loading, sendText, askAI, aiThinking };
  };

  return { rooms, loadingRooms, createRoom, joinByCode, leaveRoom, endRoom, refreshRooms: loadRooms, useRoomChat };
}
