/**
 * src/features/messaging/hooks/useConversations.js
 * Utilise messageService pour alimenter l'UI
 */
import { useState, useEffect, useCallback } from "react";
import { messageService } from "../services/messageService.js";

export function useConversations(currentUserId) {
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchConversations = useCallback(async () => {
    if (!currentUserId) return;
    try {
      setLoading(true);
      setError(null);
      const data = await messageService.getConversations(currentUserId);
      setConversations(data || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [currentUserId]);

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  return { conversations, loading, error, refresh: fetchConversations, setConversations };
}
