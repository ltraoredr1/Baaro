import { supabase } from "../supabaseClient.js";
import { API_BASE } from "../config.js";

/**
 * Point d'entrée unique vers /api/social (web + application native).
 * L'URL de base vient de src/config.js (API_BASE), comme pour /api/referral.
 */

/**
 * Appel authentifié (JWT Supabase) vers /api/social.
 * Retourne null si l'utilisateur n'est pas connecté ; lève une erreur réseau.
 * @returns {Promise<null | {status:number, ok:boolean, body:object|null}>}
 */
export async function callSocial(action, payload = {}) {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) return null;

  const response = await fetch(`${API_BASE}/api/social`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ action, ...payload }),
  });

  let body = null;
  try {
    body = await response.json();
  } catch {
    /* réponse non JSON */
  }
  return { status: response.status, ok: response.ok && body?.ok !== false, body };
}

/**
 * Demande au serveur (/api/social) de notifier la personne concernée.
 * Ne lève jamais d'erreur : une notification ratée ne doit pas annuler l'action.
 *   contentType : "post" | "video" | "user"
 *   interactionType : like | comment | share | repost | friend_request | friend_accepted
 *   targetId : id du contenu, ou id de l'autre personne pour contentType "user"
 */
function newIdempotencyKey() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (character) => {
    const random = Math.floor(Math.random() * 16);
    const value = character === "x" ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

export async function notifyInteraction({
  contentType,
  interactionType,
  targetId,
  commentId,
  idempotencyKey,
}) {
  if (!contentType || !interactionType || !targetId) return;
  try {
    const requestKey =
      idempotencyKey || (interactionType === "share" ? newIdempotencyKey() : undefined);
    const result = await callSocial("notify_interaction", {
      content_type: contentType,
      interaction_type: interactionType,
      target_id: targetId,
      ...(commentId ? { comment_id: commentId } : {}),
      ...(requestKey ? { idempotency_key: requestKey } : {}),
    });
    if (result && !result.ok) {
      console.warn(
        "[notify]",
        interactionType,
        result.body?.error || result.status
      );
    }
  } catch (error) {
    console.warn("[notify]", error?.message || error);
  }
}
