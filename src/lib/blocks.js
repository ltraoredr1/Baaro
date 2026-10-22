/**
 * BAARO — blocage d'utilisateurs (table public.user_blocks, voir baaro_privacy_tools.sql)
 * À importer depuis les menus de profil / de message pour proposer « Bloquer ».
 */
import { supabase } from "../supabaseClient.js";

async function currentUserId() {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.user?.id || null;
}

export async function blockUser(blockedId) {
  const me = await currentUserId();
  if (!me) return { ok: false, error: "Non authentifié" };
  if (!blockedId || blockedId === me) {
    return { ok: false, error: "Utilisateur invalide" };
  }

  const { error } = await supabase
    .from("user_blocks")
    .upsert(
      { blocker_id: me, blocked_id: blockedId },
      { onConflict: "blocker_id,blocked_id", ignoreDuplicates: true },
    );

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function unblockUser(blockedId) {
  const me = await currentUserId();
  if (!me) return { ok: false, error: "Non authentifié" };

  const { error } = await supabase
    .from("user_blocks")
    .delete()
    .eq("blocker_id", me)
    .eq("blocked_id", blockedId);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function isUserBlocked(otherId) {
  const me = await currentUserId();
  if (!me || !otherId) return false;

  const { data, error } = await supabase.rpc("is_blocked", {
    a: me,
    b: otherId,
  });

  return !error && data === true;
}
