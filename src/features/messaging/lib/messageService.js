/**
 * src/features/messaging/lib/messageService.js
 * Isolation Supabase queries - pas de logique UI
 *
 * Correctif principal : l'ancienne requête `participants:conversation_participants!inner(...)` combinée à
 * `.eq("conversation_participants.user_id", userId)` ne renvoyait QUE la ligne de l'utilisateur connecté dans
 * `participants`. L'interface ne trouvait donc jamais l'interlocuteur (nom « Membre », otherUserId vide),
 * ce qui empêchait d'écrire ou d'appeler depuis la liste. L'interlocuteur est maintenant résolu à part.
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
   *  - unread : true si le dernier message vient de l'autre et est postérieur à ma dernière lecture
   */
  async getConversations(userId) {
    if (!userId) return [];

    // 1) mes participations (donne aussi ma dernière lecture)
    const { data: mineRows, error: mineErr } = await supabase
      .from("conversation_participants")
      .select("conversation_id, last_read_at")
      .eq("user_id", userId);
    if (mineErr) console.warn("[messageService] participations:", mineErr.message);
    const mine = mineRows || [];
    const lastReadByConv = new Map(mine.map((r) => [r.conversation_id, r.last_read_at]));

    // 2) conversations : via user1/user2 (créées par openConversation) OU via une participation
    let filter = `user1_id.eq.${userId},user2_id.eq.${userId}`;
    const ids = mine.map((r) => r.conversation_id).slice(0, CONVERSATION_LIMIT);
    if (ids.length) filter += `,id.in.(${ids.join(",")})`;

    const { data: convs, error } = await supabase
      .from("conversations")
      .select("*, last_message:messages!conversations_last_message_id_fkey(*)")
      .or(filter)
      .order("updated_at", { ascending: false })
      .limit(CONVERSATION_LIMIT);
    if (error) throw error;

    const list = convs || [];
    if (!list.length) return [];

    // 3) tous les participants de ces conversations (repli si user1/user2 sont vides)
    const { data: partRows, error: partErr } = await supabase
      .from("conversation_participants")
      .select("conversation_id, user_id")
      .in("conversation_id", list.map((c) => c.id));
    if (partErr) console.warn("[messageService] participants:", partErr.message);
    const parts = partRows || [];

    const otherIdOf = (c) =>
      [c.user1_id, c.user2_id].filter(Boolean).find((u) => u !== userId) ||
      parts.find((p) => p.conversation_id === c.id && p.user_id !== userId)?.user_id ||
      null;

    // 4) profils des interlocuteurs en une seule requête
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

    return list.map((c) => {
      const otherId = otherIdOf(c);
      const lm = one(c.last_message);
      const hasRow = lastReadByConv.has(c.id);
      const lastRead = lastReadByConv.get(c.id);
      const unread =
        !!lm &&
        lm.sender_id !== userId &&
        hasRow &&
        (!lastRead || new Date(lm.created_at) > new Date(lastRead));
      return {
        ...c,
        last_message: lm,
        participants: otherId ? [{ user_id: otherId, profiles: profileById.get(otherId) || {} }] : [],
        unread,
      };
    });
  },

  /** Marque la conversation comme lue (met à jour ma ligne, ou la crée si elle n'existe pas) */
  async markAsRead(conversationId, userId) {
    if (!conversationId || !userId) return;
    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from("conversation_participants")
      .update({ last_read_at: now })
      .eq("conversation_id", conversationId)
      .eq("user_id", userId)
      .select("user_id");
    if (error) {
      console.warn("[messageService] markAsRead:", error.message);
      return;
    }
    if (!data || data.length === 0) {
      const { error: insErr } = await supabase
        .from("conversation_participants")
        .insert({ conversation_id: conversationId, user_id: userId, last_read_at: now });
      if (insErr) console.warn("[messageService] markAsRead (création):", insErr.message);
    }
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
