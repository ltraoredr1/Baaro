/**
 * src/features/messaging/services/messageService.js
 * Isolation Supabase queries - pas de logique UI
 *
 * Utilise uniquement les tables conversations (user1_id/user2_id), profiles et messages.
 */
import { supabase } from "../../../supabaseClient.js";

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

  async getConversations(userId) {
    const { data: convs, error } = await supabase
      .from("conversations")
      .select("*")
      .or(`user1_id.eq.${userId},user2_id.eq.${userId}`);
    if (error) throw error;
    if (!convs?.length) return [];

    const otherOf = (c) => (c.user1_id === userId ? c.user2_id : c.user1_id);
    const otherIds = [...new Set(convs.map(otherOf).filter(Boolean))];

    const { data: profs, error: pErr } = await supabase
      .from("profiles")
      .select("id, display_name, avatar_url, flag")
      .in("id", otherIds);
    if (pErr) console.warn("[messageService] profils:", pErr);
    const profById = new Map((profs || []).map((p) => [p.id, p]));

    const lastMsgs = await Promise.all(
      convs.map(async (c) => {
        const { data } = await supabase
          .from("messages")
          .select("*")
          .eq("conversation_id", c.id)
          .order("created_at", { ascending: false })
          .limit(1);
        return data?.[0] || null;
      })
    );

    return convs
      .map((c, i) => {
        const lm = lastMsgs[i];
        const otherId = otherOf(c);
        return {
          ...c,
          participants: [{ user_id: otherId, profiles: profById.get(otherId) || {} }],
          last_message: lm,
          unread: !!lm && lm.recipient_id === userId && !lm.read_at && !lm.deleted_at,
        };
      })
      .sort(
        (a, b) =>
          new Date(b.last_message?.created_at || b.created_at) -
          new Date(a.last_message?.created_at || a.created_at)
      );
  },

  async markAsRead(conversationId, userId) {
    const { error } = await supabase
      .from("messages")
      .update({ read_at: new Date().toISOString() })
      .eq("conversation_id", conversationId)
      .eq("recipient_id", userId)
      .is("read_at", null);
    if (error) console.warn("[messageService] markAsRead:", error);
  },
};

export const callsService = {
  async getCalls(userId) {
    const { data } = await supabase
      .from("calls")
      .select("*")
      .or(`caller_id.eq.${userId},callee_id.eq.${userId}`)
      .order("created_at", { ascending: false })
      .limit(50);
    return data || [];
  },
};
