/**
 * Canonical BAARO identity helpers.
 *
 * Règle d'or :
 *   auth.users.id  ===  profiles.id
 *
 * Jamais email, handle, téléphone ou un ID généré côté client
 * comme clé d'identité relationnelle.
 *
 * L'implémentation de getCurrentUserId vit dans supabaseClient.js
 * (évite les imports circulaires). Ce module ajoute les helpers
 * et ré-exporte pour un import unique côté features.
 */
export { getCurrentUserId } from "../supabaseClient.js";

/**
 * Vérifie qu'un ID fourni est bien l'utilisateur courant.
 */
export function assert_user_id(user_id, current_user_id) {
  if (!user_id || !current_user_id || String(user_id) !== String(current_user_id)) {
    throw new Error("Identifiant utilisateur invalide");
  }
  return current_user_id;
}

/**
 * Valide qu'une chaîne ressemble à un UUID auth.users.id
 * (et n'est pas un email / handle).
 */
export function isValidAuthUserId(value) {
  if (!value || typeof value !== "string") return false;
  // rejette email / handle
  if (value.startsWith("@") || (value.includes("@") && value.includes("."))) return false;
  // UUID v4 approximatif
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}
