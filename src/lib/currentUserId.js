/**
 * Canonical BAARO identity helpers.
 *
 * Règle d'or :
 *   auth.users.id  ===  profiles.id  ===  wallets.id  ===  crypto_holdings.id
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
export function assertUserId(userId, currentUserId) {
  if (!userId || !currentUserId || String(userId) !== String(currentUserId)) {
    throw new Error("Identifiant utilisateur invalide");
  }
  return currentUserId;
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
