/**
 * Signalement de contenu.
 * reporter_id = auth.users.id (résolu côté SQL / RPC via auth.uid()).
 */
import { supabase } from "../supabaseClient.js";

export async function reportContent({ targetType, targetId, reason, details = "" }) {
  if (!targetType || !targetId || !reason?.trim()) {
    throw new Error("Informations de signalement incomplètes.");
  }
  const { data, error } = await supabase.rpc("enqueue_content_report", {
    p_target_type: targetType,
    p_target_id: targetId,
    p_reason: reason.trim(),
    p_details: (details || "").trim(),
  });
  if (error) throw error;
  return data;
}
