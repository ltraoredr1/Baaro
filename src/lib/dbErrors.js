/**
 * Transforme les erreurs Supabase / Postgres en messages clairs (FR).
 */
export function getDbErrorMessage(error) {
  if (!error) return "Erreur inconnue";

  const code = error.code || error.error_code || "";
  const msg = (error.message || "").toLowerCase();
  const details = (error.details || "").toLowerCase();

  // Auth
  if (code === "PGRST301" || msg.includes("jwt") || msg.includes("not authenticated")) {
    return "Session expirée. Rechargez la page ou reconnectez-vous.";
  }

  // RLS (Row Level Security)
  if (
    code === "42501" ||
    msg.includes("row-level security") ||
    msg.includes("new row violates") ||
    msg.includes("policy")
  ) {
    return "Action non autorisée (sécurité). Vérifiez que vous êtes bien connecté.";
  }

  // Contrainte unique (doublon)
  if (code === "23505" || msg.includes("duplicate") || msg.includes("unique")) {
    if (msg.includes("follows") || details.includes("follows")) {
      return "Vous suivez déjà ce membre.";
    }
    if (msg.includes("post_likes") || details.includes("post_likes")) {
      return "Vous avez déjà aimé cette publication.";
    }
    return "Cet élément existe déjà.";
  }

  // Clé étrangère
  if (code === "23503" || msg.includes("foreign key")) {
    return "Référence invalide (élément introuvable ou supprimé).";
  }

  // Not null
  if (code === "23502" || msg.includes("null value")) {
    return "Champ obligatoire manquant.";
  }

  // Check constraint (ex: self-follow)
  if (code === "23514" || msg.includes("check constraint") || msg.includes("impossible de se suivre")) {
    return "Action impossible (règle métier).";
  }

  // Table / colonne absente
  if (code === "42P01" || msg.includes("does not exist")) {
    return "Table ou colonne manquante. Vérifiez le schéma Supabase.";
  }

  // Timeout / réseau
  if (
    msg.includes("fetch") ||
    msg.includes("network") ||
    msg.includes("failed to fetch") ||
    code === "PGRST000"
  ) {
    return "Problème de connexion. Vérifiez votre réseau.";
  }

  // Message Postgres brut parfois utile
  if (error.message && error.message.length < 120) {
    return error.message;
  }

  return "Erreur base de données. Réessayez.";
}

/**
 * Log technique (console) + message utilisateur.
 */
export function handleDbError(error, showToast, fallback = "Erreur") {
  console.error("[DB]", error?.code, error?.message, error);
  const message = getDbErrorMessage(error) || fallback;
  if (typeof showToast === "function") {
    showToast(message, "error");
  }
  return message;
}
