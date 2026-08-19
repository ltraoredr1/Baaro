// src/hooks/useDebates.js
import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "../supabaseClient.js";
import { API_BASE } from "../config.js";

/**
 * Hook principal pour gérer les salons et la liste des débats
 */
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
      // 1. Récupérer les participations actives
      const { data: memberships, error: memError } = await supabase
        .from("debate_participants")
        .select("room_id")
        .eq("user_id", userId)
        .is("left_at", null);

      if (memError) throw memError;

      const roomIds = (memberships || []).map((m) => m.room_id);

      if (roomIds.length === 0) {
        setRooms([]);
        setLoadingRooms(false);
        return;
      }

      // 2. Charger les détails des salons correspondants
      const { data, error: roomError } = await supabase
        .from("debate_rooms")
        .select("*")
        .in("id", roomIds)
        .order("created_at", { ascending: false });

      if (roomError) throw roomError;

      setRooms(data || []);
    } catch (err) {
      console.error("Erreur lors du chargement des salons:", err);
    } finally {
      setLoadingRooms(false);
    }
  }, [userId]);

  useEffect(() => {
    loadRooms();
  }, [loadRooms]);

  const createRoom = useCallback(
    async ({ title, topic, mode, maxParticipants, aiEnabled }) => {
      if (!userId) return { ok: false, reason: "Utilisateur non authentifié" };

      const { data: room, error } = await supabase
        .from("debate_rooms")
        .insert({
          host_id: userId,
          title,
          topic,
          mode,
          max_participants: maxParticipants,
          ai_enabled: aiEnabled,
        })
        .select()
        .single();

      if (error) return { ok: false, reason: error.message };

      // Inscription automatique de l'hôte comme participant actif
      const { error: partError } = await supabase
        .from("debate_participants")
        .insert({ room_id: room.id, user_id: userId });

      if (partError) {
        console.error("Erreur d'inscription de l'hôte:", partError);
      }

      await loadRooms();
      return { ok: true, room };
    },
    [userId, loadRooms]
  );

  const joinByCode = useCallback(
    async (code) => {
      if (!code) return { ok: false, reason: "Code d'invitation requis." };

      const { data: room, error } = await supabase.rpc("join_debate_by_code", {
        p_code: code.trim(),
      });

      if (error) {
        return {
          ok: false,
          reason: error.message?.replace(/^.*?:\s*/, "") || "Impossible de rejoindre ce live.",
        };
      }

      await loadRooms();
      return { ok: true, room };
    },
    [loadRooms]
  );

  const leaveRoom = useCallback(
    async (roomId) => {
      if (!userId || !roomId) return;
      await supabase
        .from("debate_participants")
        .update({ left_at: new Date().toISOString() })
        .eq("room_id", roomId)
        .eq("user_id", userId);

      await loadRooms();
    },
    [userId, loadRooms]
  );

  const endRoom = useCallback(async (roomId) => {
    if (!roomId) return;
    await supabase
      .from("debate_rooms")
      .update({ status: "ended", ended_at: new Date().toISOString() })
      .eq("id", roomId);
  }, []);

  return {
    rooms,
    loadingRooms,
    createRoom,
    joinByCode,
    leaveRoom,
    endRoom,
    refreshRooms: loadRooms,
  };
}

/**
 * Hook indépendant pour la gestion du Chat en temps réel et des interventions de l'IA
 */
export function useRoomChat(roomId, userId) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [aiThinking, setAiThinking] = useState(false);
  const [inputText, setInputText] = useState("");

  // Référence pour garder la liste des messages à jour sans déclencher de re-renders inutiles
  const messagesRef = useRef(messages);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    if (!roomId) return;

    let cancelled = false;

    async function fetchInitialMessages() {
      setLoading(true);
      const { data, error } = await supabase
        .from("debate_messages")
        .select("*")
        .eq("room_id", roomId)
        .order("created_at", { ascending: true })
        .limit(300);

      if (!cancelled) {
        if (!error && data) {
          setMessages(data);
        }
        setLoading(false);
      }
    }

    fetchInitialMessages();

    // Ecoute Realtime via Supabase WebSockets
    const channel = supabase
      .channel(`debate-messages:${roomId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "debate_messages",
          filter: `room_id=eq.${roomId}`,
        },
        (payload) => {
          setMessages((prev) =>
            prev.some((m) => m.id === payload.new.id) ? prev : [...prev, payload.new]
          );
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [roomId]);

  const sendText = useCallback(
    async (text) => {
      const content = text || inputText;
      if (!content.trim() || !roomId || !userId) return;

      setInputText("");
      const { error } = await supabase.from("debate_messages").insert({
        room_id: roomId,
        sender_id: userId,
        sender_type: "user",
        text: content.trim(),
      });

      if (error) {
        console.error("Erreur d'envoi du message:", error);
      }
    },
    [roomId, userId, inputText]
  );

  const askAI = useCallback(
    async (topic) => {
      if (!roomId) return;

      setAiThinking(true);
      try {
        const recent = messagesRef.current
          .slice(-20)
          .map(
            (m) =>
              `${m.sender_type === "ai" ? "IA" : m.sender_id === userId ? "Moi" : "Participant"}: ${m.text}`
          )
          .join("\n");

        const response = await fetch(`${API_BASE}/api/chat`, {
          method: "POST",
          headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token || ""}`,
        },
          body: JSON.stringify({
            max_tokens: 600,
            system: `Tu es un participant IA neutre invité dans un débat de groupe BAARO${
              topic ? ` sur le thème « ${topic} »` : ""
            }. Apporte un point de vue argumenté, nuancé et respectueux, en 4 à 8 phrases maximum. Si des positions opposées existent, présente-les équitablement plutôt que d'imposer un avis. Réponds en français.`,
            messages: [
              {
                role: "user",
                content:
                  recent ||
                  "Le débat commence. Lance une première réflexion sur le sujet.",
              },
            ],
          }),
        });

        if (!response.ok) throw new Error("Erreur serveur IA");

        const data = await response.json();
        const textBlock = (data.content || []).find((b) => b.type === "text");
        const reply = textBlock
          ? textBlock.text
          : "Je n'ai pas pu générer de réponse, réessayez.";

        await supabase.from("debate_messages").insert({
          room_id: roomId,
          sender_id: null,
          sender_type: "ai",
          text: reply,
        });
      } catch (err) {
        console.error("Erreur IA:", err);
        await supabase.from("debate_messages").insert({
          room_id: roomId,
          sender_id: null,
          sender_type: "system",
          text: "L'IA n'a pas pu répondre (erreur réseau).",
        });
      } finally {
        setAiThinking(false);
      }
    },
    [roomId, userId]
  );

  return {
    messages,
    loading,
    sendText,
    askAI,
    aiThinking,
    inputText,
    setInputText,
  };
}
