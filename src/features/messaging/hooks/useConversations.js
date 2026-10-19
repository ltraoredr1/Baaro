/**
 * src/features/messaging/hooks/useConversations.js
 * Liste des conversations + realtime
 */
import { useState, useEffect, useCallback } from "react";
import { supabase } from "../../../supabaseClient.js";

export function useConversations(currentUserId) {
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchConversations = useCallback(async () => {
    if (!currentUserId) return;
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("conversation_participants")
        .select(`
          conversation_id,
          last_read_at,
          conversations:conversation_id (
            id,
            created_at,
            updated_at,
            last_message_id,
            is_group,
            group_name
          )
        `)
        .eq("user_id", currentUserId)
        .order("conversations(updated_at)", { ascending: false });

      if (error) throw error;

      // Enrichir avec participants et dernier message
      const enriched = await Promise.all((data || []).map(async (cp) => {
        const conv = cp.conversations;
        if (!conv) return null;
        const { data: parts } = await supabase
          .from("conversation_participants")
          .select("user_id, profiles:user_id(display_name, avatar_url, flag)")
          .eq("conversation_id", conv.id)
          .neq("user_id", currentUserId);

        const { data: lastMsg } = await supabase
          .from("messages")
          .select("id, content, type, created_at, sender_id")
          .eq("id", conv.last_message_id || "")
          .maybeSingle();

        return {
          id: conv.id,
          ...conv,
          participants: parts || [],
          lastMessage: lastMsg || null,
          last_read_at: cp.last_read_at,
          unread: false // calculé côté UI
        };
      }));

      setConversations(enriched.filter(Boolean));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [currentUserId]);

  useEffect(() => {
    fetchConversations();
    // Realtime conversations
    const channel = supabase
      .channel(`conversations-${currentUserId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "conversation_participants", filter: `user_id=eq.${currentUserId}` }, fetchConversations)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchConversations, currentUserId]);

  return { conversations, loading, error, refresh: fetchConversations, setConversations };
}
