import { supabase } from "../supabaseClient.js";

/**
 * Demande au serveur (/api/social) de notifier l'auteur / la personne concernée.
 * Ne lève jamais d'erreur : une notification ratée ne doit pas annuler l'action.
 *   contentType : "post" | "video" | "user"
 *   interactionType : like | comment | share | repost | follow | friend_request | friend_accepted
 *   targetId : id du contenu, ou id de la personne pour contentType "user"
 */
export async function notifyInteraction({ contentType, interactionType, targetId }) {
  if (!contentType || !interactionType || !targetId) return;
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.access_token) return;

    const response = await fetch("/api/social", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        action: "notify_interaction",
        content_type: contentType,
        interaction_type: interactionType,
        target_id: targetId,
      }),
    });
    if (!response.ok) {
      const result = await response.json().catch(() => ({}));
      console.warn("[notify]", interactionType, result.error || response.status);
    }
  } catch (error) {
    console.warn("[notify]", error?.message || error);
  }
}
