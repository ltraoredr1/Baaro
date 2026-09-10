// src/lib/requireUser.js
import { supabase } from "../supabaseClient.js";

/**
 * Vérifie de manière robuste que l'utilisateur est authentifié.
 * Utilisé par les API frontend et les tests E2E.
 */
export async function requireUser() {
  try {
    const { data: { user, session }, error } = await supabase.auth.getUser();
    
    if (error || !user || !session) {
      return { 
        user: null, 
        session: null, 
        error: new Error("Utilisateur non authentifié ou session expirée") 
      };
    }
    
    return { user, session, error: null };
  } catch (err) {
    return { user: null, session: null, error: err };
  }
}
