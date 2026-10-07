import { supabase } from "../supabaseClient.js";

export const CHAT_REACTIONS = ["❤️", "😂", "😮", "😢", "😡", "👍", "👎", "🔥", "🙏", "🎉"];

export async function toggleMessageReaction(messageId, user_id, reaction) {
  if (!messageId || !user_id || !CHAT_REACTIONS.includes(reaction)) throw new Error("Réaction invalide");
  const { data: existing, error: readError } = await supabase
    .from("message_reactions").select("id,reaction").eq("message_id", messageId).eq("user_id", user_id).maybeSingle();
  if (readError) throw readError;
  if (existing?.reaction === reaction) {
    const { error } = await supabase.from("message_reactions").delete().eq("id", existing.id);
    if (error) throw error;
    return null;
  }
  const { data, error } = await supabase.from("message_reactions").upsert(
    { message_id: messageId, user_id: user_id, reaction }, { onConflict: "message_id,user_id" }
  ).select().single();
  if (error) throw error;
  return data;
}

export async function toggleMessageStar(messageId, user_id) {
  const { data: existing } = await supabase.from("message_stars").select("message_id").eq("message_id", messageId).eq("user_id", user_id).maybeSingle();
  if (existing) {
    const { error } = await supabase.from("message_stars").delete().eq("message_id", messageId).eq("user_id", user_id);
    if (error) throw error;
    return false;
  }
  const { error } = await supabase.from("message_stars").insert({ message_id: messageId, user_id: user_id });
  if (error) throw error;
  return true;
}

export async function markMessageRead(messageId) {
  if (!messageId) return;
  const { error } = await supabase.rpc("touch_message_read", { p_message_id: messageId });
  if (error) console.warn("markMessageRead:", error.message);
}

export async function updateConversationSettings(conversation_id, patch) {
  const { data, error } = await supabase.from("conversation_settings").upsert({ conversation_id: conversation_id, ...patch }, { onConflict: "conversation_id" }).select().single();
  if (error) throw error;
  return data;
}

export function makeClientMessageId() {
  if (crypto?.randomUUID) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export async function toggleMessagePin(messageId, user_id) {
  const { data: existing } = await supabase.from("message_pins").select("message_id").eq("message_id", messageId).maybeSingle();
  if (existing) {
    const { error } = await supabase.from("message_pins").delete().eq("message_id", messageId);
    if (error) throw error;
    return false;
  }
  const { error } = await supabase.from("message_pins").insert({ message_id: messageId, pinned_by: user_id });
  if (error) throw error;
  return true;
}

export async function queueChatAI(conversation_id, user_id, action, targetLanguage = null) {
  const { data, error } = await supabase.from("chat_ai_jobs").insert({ conversation_id: conversation_id, requested_by: user_id, action, target_language: targetLanguage }).select().single();
  if (error) throw error;
  return data;
}
