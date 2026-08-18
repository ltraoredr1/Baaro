import { supabase } from "../supabaseClient";
import { API_BASE } from "../config.js";

async function callReferral(action, payload = {}) {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) {
    return { ok: false, error: "Non authentifié" };
  }

  try {
    const res = await fetch(`${API_BASE}/api/referral`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ action, ...payload }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, error: data.error || "Erreur serveur" };
    }
    return { ok: true, ...data };
  } catch {
    return { ok: false, error: "Impossible de joindre le serveur" };
  }
}

/** Récupère mon code + lien + stats */
export function getMyReferralCode() {
  return callReferral("my-code");
}

/** Applique un code de parrainage (filleul) */
export function applyReferralCode(code) {
  return callReferral("apply", { code });
}

/** Lit ?ref=XXX dans l'URL et le stocke pour plus tard */
export function captureRefFromUrl() {
  try {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get("ref");
    if (ref && ref.length >= 6) {
      sessionStorage.setItem("baaro:pending_ref", ref.trim().toUpperCase());
      return ref.trim().toUpperCase();
    }
  } catch {
    /* ignore */
  }
  return null;
}

export function getPendingRef() {
  try {
    return sessionStorage.getItem("baaro:pending_ref");
  } catch {
    return null;
  }
}

export function clearPendingRef() {
  try {
    sessionStorage.removeItem("baaro:pending_ref");
  } catch {
    /* ignore */
  }
}
