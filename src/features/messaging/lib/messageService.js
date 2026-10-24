/**
 * src/features/messaging/lib/messageService.js
 * Isolation Supabase queries - pas de logique UI
 *
 * Schéma réel de la base (vérifié) :
 *  - conversations : id, user1_id, user2_id, created_at   (PAS de updated_at)
 *  - messages      : id, conversation_id, sender_id, recipient_id, text, type, read_at, ...
 *  - la table conversation_participants n'existe pas : elle n'est plus utilisée ici.
 *
 * Cause de « Impossible de charger les conversations » : l'ancienne requête triait
 * par conversations.updated_at, une colonne absente, ce qui faisait échouer toute la liste.
 */
import { supabase } from "../../../supabaseClient.js";

const CONVERSATION_LIMIT = 100;
const one = (v) => (Array.isArray(v) ? v[0] || null : v || null);

export const messageService = {
  async getRecentMessages(conversationId, limit = 150) {
    const { data, error } = await supabase
      .from("messages")
      .select("*, sender:sender_id(display_name, flag, avatar_url)")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data || []).reverse();
  },

  /**
   * Conversations de l'utilisateur, avec :
   *  - participants : [{ user_id, profiles }] contenant l'INTERLOCUTEUR (format attendu par MessagesTab)
   *  - last_message : dernier message (objet ou null)
   *  - unread : true si le dernier message vient de l'autre et n'a pas de read_at
   */
  async getConversations(userId) {
    if (!userId) return [];

    // 1) conversations où je suis user1 ou user2 (tri sur created_at, qui existe)
    const { data: convs, error } = await supabase
      .from("conversations")
      .select("*")
      .or(`user1_id.eq.${userId},user2_id.eq.${userId}`)
      .order("created_at", { ascending: false })
      .limit(CONVERSATION_LIMIT);
    if (error) throw error;

    const list = convs || [];
    if (!list.length) return [];

    // 2) derniers messages, résolus séparément
    const lastMessageByConversation = new Map();
    const { data: recentMessages, error: recentErr } = await supabase
      .from("messages")
      .select("*")
      .in("conversation_id", list.map((c) => c.id))
      .order("created_at", { ascending: false })
      .limit(CONVERSATION_LIMIT * 3);
    if (recentErr) console.warn("[messageService] derniers messages:", recentErr.message);
    for (const msg of recentMessages || []) {
      if (!lastMessageByConversation.has(msg.conversation_id)) {
        lastMessageByConversation.set(msg.conversation_id, msg);
      }
    }

    const otherIdOf = (c) =>
      [c.user1_id, c.user2_id].filter(Boolean).find((u) => u !== userId) || null;

    // 3) profils des interlocuteurs en une seule requête
    const otherIds = [...new Set(list.map(otherIdOf).filter(Boolean))];
    const profileById = new Map();
    if (otherIds.length) {
      const { data: profs, error: profErr } = await supabase
        .from("profiles")
        .select("id, display_name, avatar_url, flag")
        .in("id", otherIds);
      if (profErr) console.warn("[messageService] profils:", profErr.message);
      (profs || []).forEach((p) => profileById.set(p.id, p));
    }

    const result = list.map((c) => {
      const otherId = otherIdOf(c);
      const lm = lastMessageByConversation.get(c.id) || one(c.last_message);
      const unread = !!lm && lm.sender_id !== userId && !lm.read_at && !lm.deleted_at;
      return {
        ...c,
        last_message: lm,
        participants: otherId ? [{ user_id: otherId, profiles: profileById.get(otherId) || {} }] : [],
        unread,
      };
    });

    // Tri : conversation avec le message le plus récent en premier
    const stamp = (c) => new Date(c.last_message?.created_at || c.created_at || 0).getTime();
    return result.sort((a, b) => stamp(b) - stamp(a));
  },

  /** Marque comme lus les messages reçus de la conversation (colonne messages.read_at) */
  async markAsRead(conversationId, userId) {
    if (!conversationId || !userId) return;
    const { error } = await supabase
      .from("messages")
      .update({ read_at: new Date().toISOString() })
      .eq("conversation_id", conversationId)
      .eq("recipient_id", userId)
      .is("read_at", null);
    if (error) console.warn("[messageService] markAsRead:", error.message);
  },

  /** Déclenche la notification serveur après insertion réussie du message. */
  async notifyNewMessage(messageId) {
    if (!messageId) return { ok: false };
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData?.session?.access_token;
    if (!token) return { ok: false, error: "Session absente" };
    const base =
      (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_BASE_URL) ||
      (typeof window !== "undefined" && window.location?.origin) ||
      "";
    const response = await fetch(`${base.replace(/\/$/, "")}/api/social`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ action: "message_sent", message_id: messageId }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "Notification du message impossible");
    return payload;
  },
};

export const callsService = {
  async getCalls(userId) {
    const { data, error } = await supabase
      .from("calls")
      .select("*")
      .or(`caller_id.eq.${userId},callee_id.eq.${userId}`)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) console.warn("[callsService] getCalls:", error.message);
    return data || [];
  },
};
