import { supabase } from "../supabaseClient.js";
import { getApiBase } from "../config.js";

/**
 * Construit l'URL de l'API R2.
 *
 * Sur Vercel :
 *   /api/r2-upload
 *
 * Si getApiBase() retourne une URL complète :
 *   https://mon-site.vercel.app/api/r2-upload
 */
function apiUrl() {
  const base = getApiBase?.() ?? "";
  const cleanBase = String(base).replace(/\/+$/, "");

  return `${cleanBase}/api/r2-upload`;
}

/**
 * Récupère le token Supabase de l'utilisateur connecté.
 */
async function getAccessToken() {
  const { data, error } = await supabase.auth.getSession();

  if (error) {
    throw error;
  }

  const token = data?.session?.access_token;

  if (!token) {
    throw new Error("Session expirée. Reconnecte-toi.");
  }

  return token;
}

/**
 * Nettoie et valide le dossier R2.
 */
function cleanFolder(folder) {
  const value = String(folder || "posts")
    .trim()
    .replace(/^\/+|\/+$/g, "");

  if (!value) {
    return "posts";
  }

  // Empêche les chemins dangereux.
  if (
    value.includes("..") ||
    value.includes("\\") ||
    value.startsWith(".")
  ) {
    throw new Error("Dossier média invalide.");
  }

  return value;
}

/**
 * Détermine le Content-Type réel à envoyer à R2.
 */
function getContentType(file) {
  const type = String(file?.type || "")
    .split(";")[0]
    .trim()
    .toLowerCase();

  if (type) {
    return type;
  }

  const name = String(file?.name || "").toLowerCase();

  if (name.endsWith(".jpg") || name.endsWith(".jpeg")) {
    return "image/jpeg";
  }

  if (name.endsWith(".png")) {
    return "image/png";
  }

  if (name.endsWith(".webp")) {
    return "image/webp";
  }

  if (name.endsWith(".gif")) {
    return "image/gif";
  }

  if (name.endsWith(".mp4")) {
    return "video/mp4";
  }

  if (name.endsWith(".webm")) {
    return "video/webm";
  }

  if (name.endsWith(".mov")) {
    return "video/quicktime";
  }

  if (name.endsWith(".mp3")) {
    return "audio/mpeg";
  }

  if (name.endsWith(".wav")) {
    return "audio/wav";
  }

  if (name.endsWith(".ogg")) {
    return "audio/ogg";
  }

  return "application/octet-stream";
}

/**
 * Lit proprement la réponse d'une API,
 * même lorsque Vercel renvoie du texte au lieu du JSON.
 */
async function readApiResponse(response) {
  const text = await response.text();

  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text);
  } catch {
    return {
      raw: text,
    };
  }
}

/**
 * Upload d'un fichier vers Cloudflare R2.
 *
 * Fonctionnement :
 *
 * 1. Le navigateur demande à Vercel une URL R2 signée.
 * 2. Vercel vérifie l'utilisateur.
 * 3. Vercel génère l'URL PUT temporaire.
 * 4. Le navigateur envoie directement le fichier à R2.
 *
 * Les identifiants R2 ne sont donc jamais exposés au navigateur.
 */
export async function uploadExternalMedia(
  file,
  {
    folder = "posts",
    userId,
    maxBytes = 50 * 1024 * 1024,
  } = {}
) {
  if (!file) {
    throw new Error("Fichier manquant.");
  }

  if (!userId) {
    throw new Error("Utilisateur non identifié.");
  }

  if (!Number.isFinite(file.size) || file.size <= 0) {
    throw new Error("Fichier vide ou invalide.");
  }

  if (file.size > maxBytes) {
    const maxMb = Math.round(maxBytes / (1024 * 1024));

    throw new Error(
      `Fichier trop lourd. Taille maximale : ${maxMb} Mo.`
    );
  }

  const contentType = getContentType(file);

  if (
    !contentType ||
    contentType === "application/octet-stream"
  ) {
    throw new Error(
      "Type de fichier non reconnu."
    );
  }

  const cleanFolderName = cleanFolder(file ? folder : "posts");

  const token = await getAccessToken();

  /**
   * Étape 1 :
   * demander à Vercel de générer l'URL signée R2.
   */
  let response;

  try {
    response = await fetch(apiUrl(), {
      method: "POST",

      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },

      body: JSON.stringify({
        folder: cleanFolderName,
        name: file.name || "file",
        contentType,
        size: file.size,
        userId,
      }),
    });
  } catch (error) {
    throw new Error(
      `Serveur média BAARO inaccessible : ${
        error?.message || "Erreur réseau."
      }`
    );
  }

  const json = await readApiResponse(response);

  if (!response.ok) {
    throw new Error(
      json?.error ||
        json?.message ||
        json?.raw ||
        `Erreur API média (${response.status}).`
    );
  }

  if (!json?.ok) {
    throw new Error(
      json?.error ||
        json?.message ||
        "Impossible de préparer l'upload R2."
    );
  }

  if (!json?.uploadUrl) {
    throw new Error(
      "Le serveur n'a pas fourni d'URL d'upload R2."
    );
  }

  /**
   * Le Content-Type utilisé ici DOIT être identique
   * à celui utilisé lors de la génération de l'URL signée.
   */
  const signedContentType = String(
    json.contentType || contentType
  )
    .split(";")[0]
    .trim()
    .toLowerCase();

  /**
   * Étape 2 :
   * upload direct navigateur → Cloudflare R2.
   */
  let uploadResponse;

  try {
    uploadResponse = await fetch(json.uploadUrl, {
      method: "PUT",

      headers: {
        "Content-Type": signedContentType,
      },

      body: file,
    });
  } catch (error) {
    throw new Error(
      `Connexion Cloudflare R2 impossible : ${
        error?.message ||
        "Erreur réseau ou configuration CORS."
      }`
    );
  }

  /**
   * Une URL signée peut être valide mais refusée par R2
   * si le Content-Type ou la signature ne correspondent pas,
   * ou si le CORS du bucket bloque le navigateur.
   */
  if (!uploadResponse.ok) {
    let detail = "";

    try {
      detail = await uploadResponse.text();
    } catch {
      // Rien à faire.
    }

    if (uploadResponse.status === 403) {
      throw new Error(
        "Upload R2 refusé (403). Vérifie la signature, le Content-Type et le CORS du bucket R2."
      );
    }

    if (uploadResponse.status === 400) {
      throw new Error(
        "Upload R2 invalide (400). Le Content-Type envoyé ne correspond probablement pas à celui signé."
      );
    }

    if (uploadResponse.status === 413) {
      throw new Error(
        "Fichier trop volumineux pour R2."
      );
    }

    throw new Error(
      `Échec de l'upload R2 (${uploadResponse.status})${
        detail ? ` : ${detail.slice(0, 300)}` : "."
      }`
    );
  }

  /**
   * L'API doit nous retourner l'URL publique finale
   * qui sera enregistrée dans Supabase.
   */
  if (!json.publicUrl) {
    throw new Error(
      "Upload R2 réussi, mais aucune URL publique n'a été retournée par le serveur."
    );
  }

  return {
    url: json.publicUrl,
    path: json.key || "",
    key: json.key || "",
    mime: signedContentType,
    size: file.size,
    fileName: file.name || "file",
  };
}

/**
 * Alias pratique pour les anciens appels éventuels.
 */
export const uploadMedia = uploadExternalMedia;
