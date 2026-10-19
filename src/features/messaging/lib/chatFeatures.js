import { supabase } from "../supabaseClient.js";

export const CHAT_REACTIONS = ["❤️", "😂", "😮", "😢", "😡", "👍", "👎", "🔥", "🙏", "🎉"];

export async function toggleMessageReaction(messageId, user_id, reaction) {
  if (!messageId || !user_id || !CHAT_REACTIONS.includes(reaction)) throw new Error("Réaction invalide");

  const { data: existing, error: readError } = await supabase
    .from("message_reactions")
    .select("id,emoji")
    .eq("message_id", messageId)
    .eq("user_id", user_id)
    .maybeSingle();
  if (readError) throw readError;

  if (existing?.emoji === reaction) {
    const { error } = await supabase.from("message_reactions").delete()
      .eq("id", existing.id).eq("user_id", user_id);
    if (error) throw error;
    return null;
  }

  if (existing) {
    const { data, error } = await supabase.from("message_reactions")
      .update({ emoji: reaction }).eq("id", existing.id)
      .eq("user_id", user_id).select().single();
    if (error) throw error;
    return data;
  }

  const { data: message, error: messageError } = await supabase
    .from("messages").select("conversation_id").eq("id", messageId).single();
  if (messageError) throw messageError;

  const { data, error } = await supabase.from("message_reactions").insert({
    message_id: messageId,
    conversation_id: message.conversation_id,
    user_id,
    emoji: reaction,
  }).select().single();
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
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export async function toggleMessagePin(messageId, user_id) {
  if (!messageId || !user_id) throw new Error("Message ou utilisateur invalide");

  const { data: existing, error: readError } = await supabase
    .from("message_pins").select("message_id,pinned_by")
    .eq("message_id", messageId).maybeSingle();
  if (readError) throw readError;

  if (existing) {
    if (existing.pinned_by !== user_id) {
      throw new Error("Ce message est déjà épinglé par un autre utilisateur");
    }
    const { error } = await supabase.from("message_pins").delete()
      .eq("message_id", messageId).eq("pinned_by", user_id);
    if (error) throw error;
    return false;
  }

  const { error } = await supabase.from("message_pins")
    .insert({ message_id: messageId, pinned_by: user_id });
  if (error) throw error;
  return true;
}

export async function queueChatAI(conversation_id, user_id, action, targetLanguage = null) {
  const { data, error } = await supabase.from("chat_ai_jobs").insert({ conversation_id: conversation_id, requested_by: user_id, action, target_language: targetLanguage }).select().single();
  if (error) throw error;
  return data;
}
