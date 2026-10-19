/**
 * src/features/messaging/hooks/useConversations.js
 * Liste des conversations 1-à-1 + realtime (Aligné avec MessagesTab)
 */
import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "../../../supabaseClient.js";

export function useConversations(currentUserId) {
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const profilesCache = useRef({});

  const fetchProfiles = useCallback(async (ids) => {
    const missing = [...new Set(ids.filter((x) => x && !profilesCache.current[x]))];
    if (missing.length === 0) return;
    const { data } = await supabase
      .from("profiles")
      .select("id, display_name, handle, avatar_url, flag")
      .in("id", missing);
    if (data) {
      data.forEach((p) => {
        profilesCache.current[p.id] = p;
      });
    }
  }, []);

  const fetchConversations = useCallback(async () => {
    if (!currentUserId) return;
    setLoading(true);
    setError(null);
    try {
      // 1. Récupérer les conversations
      const { data: rows, error: convErr } = await supabase
        .from("conversations")
        .select("id, user1_id, user2_id, created_at")
        .or(`user1_id.eq.${currentUserId},user2_id.eq.${currentUserId}`)
        .order("created_at", { ascending: false })
        .limit(60);

      if (convErr) throw convErr;
      const list = rows || [];
      if (list.length === 0) {
        setConversations([]);
        return;
      }

      // 2. Charger les profils des destinataires
      const otherIds = list.map((c) => (c.user1_id === currentUserId ? c.user2_id : c.user1_id));
      await fetchProfiles(otherIds);

      // 3. Charger le dernier message et les non-lus
      const convIds = list.map((c) => c.id);
      const { data: lastMsgs } = await supabase
        .from("messages")
        .select("id, conversation_id, text, created_at, type, file_name, deleted_at, sender_id, recipient_id, read_at")
        .in("conversation_id", convIds)
        .order("created_at", { ascending: false });

      const lastByConv = {};
      const unreadCount = {};
      (lastMsgs || []).forEach((m) => {
        if (!lastByConv[m.conversation_id]) lastByConv[m.conversation_id] = m;
        if (m.recipient_id === currentUserId && !m.read_at) {
          unreadCount[m.conversation_id] = (unreadCount[m.conversation_id] || 0) + 1;
        }
      });

      const enriched = list.map((c) => {
        const otherId = c.user1_id === currentUserId ? c.user2_id : c.user1_id;
        const p = profilesCache.current[otherId] || { display_name: "Membre", flag: "🌍" };
        return {
          id: c.id,
          otherUserId: otherId,
          otherUserName: p.display_name || "Membre",
          otherUserAvatar: p.avatar_url,
          otherUserFlag: p.flag || "🌍",
          otherUserHandle: p.handle,
          lastMsg: lastByConv[c.id] || null,
          unread: unreadCount[c.id] || 0,
          created_at: c.created_at,
        };
      });

      enriched.sort((a, b) => {
        const ta = a.lastMsg?.created_at || a.created_at || "";
        const tb = b.lastMsg?.created_at || b.created_at || "";
        return tb.localeCompare(ta);
      });

      setConversations(enriched);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [currentUserId, fetchProfiles]);

  useEffect(() => {
    if (!currentUserId) return;
    fetchConversations();

    // Écoute Realtime sur l'arrivée de nouveaux messages
    const channel = supabase
      .channel(`conv-list:${currentUserId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        () => {
          clearTimeout(window.__baaroConvRefresh);
          window.__baaroConvRefresh = setTimeout(fetchConversations, 400);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchConversations, currentUserId]);

  return { conversations, loading, error, refresh: fetchConversations, setConversations };
}
