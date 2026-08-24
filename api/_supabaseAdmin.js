import { createClient } from "@supabase/supabase-js";

// Accepte VITE_SUPABASE_URL ou SUPABASE_URL (alignement create-payment legacy)
const SUPABASE_URL =
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export function getAdminClient() {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    throw new Error(
      "Configuration serveur incomplète : VITE_SUPABASE_URL (ou SUPABASE_URL) et SUPABASE_SERVICE_ROLE_KEY doivent être définies."
    );
  }
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * JWT Bearer uniquement — jamais de user_id client.
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
