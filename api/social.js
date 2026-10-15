import { supabase } from "@/supabaseClient.js";

/**
 * Gère la républication d'une publication (Repost) et envoie une notification.
 */
export async function toggleRepost({ postId, userId, authorId, wasReposted }) {
  if (!userId) throw new Error("Utilisateur non connecté");

  if (wasReposted) {
    // Annuler le repost
    const { error } = await supabase
      .from("post_reposts")
      .delete()
      .eq("post_id", postId)
      .eq("user_id", userId);

    if (error) throw error;
    return { action: "unreposted" };
  } else {
    // Ajouter le repost
    const { error } = await supabase
      .from("post_reposts")
      .insert({ post_id: postId, user_id: userId });

    if (error) throw error;

    // Envoi de la notification au destinataire (authorId)
    if (authorId && authorId !== userId) {
      try {
        await supabase.from("notifications").insert({
          user_id: authorId,
          actor_id: userId,
          type: "repost",
          source_id: postId,
          message: "a républié votre publication.",
        });
      } catch (notifError) {
        console.warn("Erreur d'envoi de la notification :", notifError);
      }
    }

    return { action: "reposted" };
  }
}

/**
 * Gère la réaction 'J'aime' sur une publication.
 */
export async function toggleLike({ postId, userId, authorId, wasLiked }) {
  if (!userId) throw new Error("Utilisateur non connecté");

  if (wasLiked) {
    const { error } = await supabase
      .from("post_likes")
      .delete()
      .eq("post_id", postId)
      .eq("user_id", userId);

    if (error) throw error;
    return { action: "unliked" };
  } else {
    const { error } = await supabase
      .from("post_likes")
      .insert({ post_id: postId, user_id: userId });

    if (error) throw error;

    // Notification pour le 'Like'
    if (authorId && authorId !== userId) {
      try {
        await supabase.from("notifications").insert({
          user_id: authorId,
          actor_id: userId,
          type: "like",
          source_id: postId,
          message: "a aimé votre publication.",
        });
      } catch (notifError) {
        console.warn("Erreur d'envoi de la notification :", notifError);
      }
    }

    return { action: "liked" };
  }
}
