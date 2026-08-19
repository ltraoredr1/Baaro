import { supabase } from "../supabaseClient";
import { API_BASE } from "../config.js"; // vérifie que ce fichier existe et exporte API_BASE

export async function earnPoints(actionKey, detail = "", referenceId = null) {
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token) {
      return { ok: false, error: "Non authentifié" };
    }

    const res = await fetch(`${API_BASE}/api/wallet`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        action: "earn",
        actionKey,
        detail,
        referenceId,
      }),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      return { ok: false, error: data.error || "Erreur serveur" };
    }

    return {
      ok: true,
      balance: data.balance,
      transaction: data.transaction,
    };
  } catch (err) {
    console.error("earnPoints error:", err);
    return { ok: false, error: "Impossible de joindre le serveur" };
  }
}
