import { supabase } from "@/supabaseClient.js";
import { notifyInteraction } from "@/lib/notifyInteraction.js";

/**
 * Gère la républication d'une publication (Repost).
 * La notification (liste dans l'appli + push) est créée par /api/social :
 * le destinataire est déterminé côté serveur, `authorId` n'est plus utilisé
 * pour écrire dans la table notifications (paramètre conservé pour ne pas
 * casser les appels existants).
 */
export async function toggleRepost({ postId, userId, wasReposted }) {
  if (!userId) throw new Error("Utilisateur non connecté");

  if (wasReposted) {
    const { error } = await supabase
      .from("post_reposts")
      .delete()
      .eq("post_id", postId)
      .eq("user_id", userId);

    if (error) throw error;
    return { action: "unreposted" };
  }

  const { error } = await supabase
    .from("post_reposts")
    .insert({ post_id: postId, user_id: userId });

  if (error) throw error;

  // Sans await bloquant : une notification ratée n'annule jamais le repost.
  notifyInteraction({
    contentType: "post",
    interactionType: "repost",
    targetId: postId,
  });

  return { action: "reposted" };
}

/**
 * Gère la réaction 'J'aime' sur une publication.
 */
export async function toggleLike({ postId, userId, wasLiked }) {
  if (!userId) throw new Error("Utilisateur non connecté");

  if (wasLiked) {
    const { error } = await supabase
      .from("post_likes")
      .delete()
      .eq("post_id", postId)
      .eq("user_id", userId);

    if (error) throw error;
    return { action: "unliked" };
  }

  const { error } = await supabase
    .from("post_likes")
    .insert({ post_id: postId, user_id: userId });

  if (error) throw error;

  // Le serveur vérifie que le like existe bien avant de notifier.
  notifyInteraction({
    contentType: "post",
    interactionType: "like",
    targetId: postId,
  });

  return { action: "liked" };
}
