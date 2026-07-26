import { createClient } from "@supabase/supabase-js";

// La clé de service (SUPABASE_SERVICE_ROLE_KEY) ignore les règles RLS : elle
// ne doit JAMAIS être préfixée VITE_, jamais envoyée au navigateur, et
// n'exister que dans les variables d'environnement du serveur (Vercel).
const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export function getAdminClient() {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    throw new Error(
      "Configuration serveur incomplète : VITE_SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY doivent être définies dans les variables d'environnement Vercel."
    );
  }
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * Vérifie le jeton envoyé par le client (Authorization: Bearer <token>) et
 * renvoie l'utilisateur authentifié correspondant. On ne fait JAMAIS
 * confiance à un user_id fourni tel quel dans le corps de la requête —
 * c'est justement ce genre de raccourci qui permettait de modifier le
 * portefeuille de n'importe qui.
 */
export async function requireUser(req, admin) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) {
    const err = new Error("Authentification manquante");
    err.status = 401;
    throw err;
  }
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data?.user) {
    const err = new Error("Session invalide ou expirée");
    err.status = 401;
    throw err;
  }
  return data.user;
}
