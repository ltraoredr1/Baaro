/**
 * src/features/messaging/hooks/useConversations.js
 * Utilise messageService pour alimenter l'UI
 */
import { useState, useEffect, useCallback, useRef } from "react";
import { messageService } from "../lib/messageService.js";

export function useConversations(currentUserId) {
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const requestRef = useRef(0);

  // fetchConversations({ silent: true }) : rafraîchit sans remettre le spinner
  const fetchConversations = useCallback(
    async ({ silent = false } = {}) => {
      if (!currentUserId) {
        setLoading(false);
        return;
      }
      // Seule la réponse de la dernière requête est appliquée (évite qu'une vieille réponse écrase une récente)
      const request = ++requestRef.current;
      try {
        if (!silent) setLoading(true);
        setError(null);
        const data = await messageService.getConversations(currentUserId);
        if (request === requestRef.current) setConversations(data || []);
      } catch (e) {
        if (request === requestRef.current) setError(e?.message || "Erreur de chargement");
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [currentUserId]
  );

  useEffect(() => {
    fetchConversations();
    return () => {
      requestRef.current++; // ignore les réponses arrivant après démontage / changement d'utilisateur
    };
  }, [fetchConversations]);

  return { conversations, loading, error, refresh: fetchConversations, setConversations };
}
