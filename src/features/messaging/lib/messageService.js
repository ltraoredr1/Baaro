/**
 * src/features/messaging/services/messageService.js
 * Isolation Supabase queries - pas de logique UI
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
    const { data, error } = await supabase
      .from("conversations")
      .select("*, participants:conversation_participants!inner(user_id, profiles(display_name, avatar_url)), last_message:messages!conversations_last_message_id_fkey(*)")
      .eq("conversation_participants.user_id", userId)
      .order("updated_at", { ascending: false });
    if (error) throw error;
    return data || [];
  },

  async markAsRead(conversationId, userId) {
    await supabase.from("conversation_participants").update({ last_read_at: new Date().toISOString() }).eq("conversation_id", conversationId).eq("user_id", userId);
  }
};

export const callsService = {
  async getCalls(userId) {
    const { data } = await supabase.from("calls").select("*").or(`caller_id.eq.${userId},callee_id.eq.${userId}`).order("created_at", { ascending: false }).limit(50);
    return data || [];
  }
};
