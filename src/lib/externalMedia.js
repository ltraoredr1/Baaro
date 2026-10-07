import { supabase } from "../supabaseClient.js";
import { API_BASE } from "../config.js";

const MAX_DEFAULT = 100 * 1024 * 1024;

function apiUrl(path) {
  const base = API_BASE || "";
  return `${base}${path}`;
}

function extFromFile(file) {
  const name = String(file?.name || "");
  const match = name.match(/\.([a-z0-9]{1,10})$/i);
  if (match) return match[1].toLowerCase();
  const mime = String(file?.type || "");
  const map = {
    "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp",
    "image/gif": "gif", "video/mp4": "mp4", "video/webm": "webm",
    "video/quicktime": "mov", "audio/webm": "webm", "audio/ogg": "ogg",
    "audio/mpeg": "mp3", "audio/mp4": "m4a", "application/pdf": "pdf"
  };
  return map[mime] || "bin";
}

// fetch qui dit à quelle étape ça casse (une erreur réseau/CORS ne donne sinon que « Failed to fetch »)
async function stepFetch(step, url, init, hint) {
  try {
    return await fetch(url, init);
  } catch (err) {
    const reason = err?.message || "réseau";
    throw new Error(`${step} : connexion impossible (${reason}).${hint ? " " + hint : ""}`);
  }
}

export async function uploadExternalMedia(file, {
  folder = "misc",
  user_id,
  maxBytes = MAX_DEFAULT,
} = {}) {
  if (!file) throw new Error("Fichier manquant");
  if (!user_id) throw new Error("Utilisateur non authentifié");
  if (!Number.isFinite(file.size) || file.size <= 0) throw new Error("Fichier invalide");
  if (file.size > maxBytes) throw new Error(`Fichier trop volumineux (max ${Math.ceil(maxBytes / 1024 / 1024)} Mo)`);

  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) throw new Error("Session expirée");

  const safeFolder = String(folder).replace(/[^a-zA-Z0-9/_-]/g, "").replace(/^\/+|\/+$/g, "") || "misc";
  const ext = extFromFile(file);

  // 1) Préparation : l'API BAARO renvoie une URL d'envoi signée vers R2
  const prepare = await stepFetch(
    "Préparation (API /api/media)",
    apiUrl("/api/media"),
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        action: "prepare",
        folder: safeFolder,
        extension: ext,
        contentType: file.type || "application/octet-stream",
        size: file.size,
        fileName: file.name || "upload",
      }),
    },
    "Vérifie VITE_API_BASE_URL et ALLOWED_ORIGINS sur Vercel."
  );

  const prepared = await prepare.json().catch(() => ({}));
  if (!prepare.ok || !prepared?.ok || !prepared?.uploadUrl) {
    throw new Error(
      `Préparation refusée (${prepare.status}) : ` +
        (prepared?.error || "impossible de préparer l'upload média")
    );
  }

  // 2) Envoi direct du fichier vers R2
  const upload = await stepFetch(
    "Envoi vers R2",
    prepared.uploadUrl,
    {
      method: "PUT",
      headers: {
        "Content-Type": file.type || "application/octet-stream",
      },
      body: file,
    },
    "Probablement le CORS du bucket R2 (autoriser PUT depuis le site) ou un blocage réseau."
  );
  if (!upload.ok) {
    let detail = "";
    try {
      detail = (await upload.text()).replace(/\s+/g, " ").slice(0, 160);
    } catch {
      /* ignore */
    }
    throw new Error(`Envoi vers R2 refusé (${upload.status})${detail ? " : " + detail : ""}`);
  }

  // 3) Finalisation : l'API enregistre les métadonnées du média
  const finalize = await stepFetch(
    "Finalisation (API /api/media)",
    apiUrl("/api/media"),
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        action: "finalize",
        folder: safeFolder,
        path: prepared.path,
        publicUrl: prepared.publicUrl,
        contentType: file.type || "application/octet-stream",
        size: file.size,
        fileName: file.name || "upload",
      }),
    }
  );
  const finalized = await finalize.json().catch(() => ({}));
  if (!finalize.ok || !finalized?.ok) {
    throw new Error(
      `Finalisation refusée (${finalize.status}) : ` +
        (finalized?.error || "impossible d'enregistrer les métadonnées du média")
    );
  }

  return {
    url: prepared.publicUrl,
    path: prepared.path,
    provider: "cloudflare-r2",
    mime: file.type || "application/octet-stream",
    size: file.size,
    fileName: file.name || "upload",
  };
}
