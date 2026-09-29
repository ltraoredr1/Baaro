import { supabase } from "../supabaseClient.js";
import { getApiBase } from "../config.js";

function apiUrl() {
  const base = getApiBase?.() ?? "";

  return `${String(base).replace(/\/$/, "")}/api/r2-upload`;
}

async function getAccessToken() {
  const {
    data,
    error,
  } = await supabase.auth.getSession();

  if (error) {
    throw error;
  }

  const token =
    data?.session?.access_token;

  if (!token) {
    throw new Error(
      "Session expirée. Reconnecte-toi."
    );
  }

  return token;
}

function safeFolder(folder) {
  const value = String(
    folder || "posts"
  )
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "");

  return value || "posts";
}

async function readJsonResponse(response) {
  const text = await response
    .text()
    .catch(() => "");

  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text);
  } catch {
    return {
      raw: text.slice(0, 500),
    };
  }
}

export async function uploadExternalMedia(
  file,
  {
    folder = "posts",
    userId,
    maxBytes = 50 * 1024 * 1024,
  } = {}
) {
  if (!file) {
    throw new Error(
      "Fichier manquant"
    );
  }

  if (!userId) {
    throw new Error(
      "Utilisateur non connecté"
    );
  }

  if (file.size > maxBytes) {
    throw new Error(
      `Fichier trop volumineux (max ${Math.round(
        maxBytes / 1024 / 1024
      )} Mo)`
    );
  }

  const token =
    await getAccessToken();

  /*
   * Étape 1 :
   * demander à Vercel une URL présignée R2.
   */
  let response;

  try {
    response = await fetch(
      apiUrl(),
      {
        method: "POST",

        headers: {
          "Content-Type":
            "application/json",

          Authorization:
            `Bearer ${token}`,
        },

        body: JSON.stringify({
          folder:
            safeFolder(folder),

          name:
            file.name,

          contentType:
            file.type ||
            "application/octet-stream",

          size:
            file.size,

          userId,
        }),
      }
    );
  } catch (error) {
    console.error(
      "[externalMedia] API R2 inaccessible:",
      error
    );

    throw new Error(
      "Impossible de joindre l’API R2 BAARO. Vérifie le déploiement Vercel."
    );
  }

  const json =
    await readJsonResponse(
      response
    );

  if (
    !response.ok ||
    !json.ok ||
    !json.uploadUrl
  ) {
    throw new Error(
      json.error ||
      json.raw ||
      `Préparation R2 impossible (${response.status})`
    );
  }

  /*
   * Le serveur a signé l'URL avec ce Content-Type.
   * Nous devons utiliser exactement la même valeur.
   */
  const contentType =
    json.contentType ||
    file.type ||
    "application/octet-stream";

  /*
   * Étape 2 :
   * upload DIRECT du navigateur vers R2.
   */
  let upload;

  try {
    upload = await fetch(
      json.uploadUrl,
      {
        method: "PUT",

        headers: {
          "Content-Type":
            contentType,
        },

        body: file,
      }
    );
  } catch (error) {
    console.error(
      "[externalMedia] Upload R2 inaccessible:",
      error
    );

    throw new Error(
      "Impossible d’envoyer le fichier vers Cloudflare R2. Vérifie la configuration CORS du bucket."
    );
  }

  /*
   * Récupération du corps d'erreur
   * pour éviter de masquer un éventuel 403.
   */
  if (!upload.ok) {
    const text =
      await upload.text()
        .catch(() => "");

    console.error(
      "[externalMedia] R2 HTTP error:",
      upload.status,
      text
    );

    if (upload.status === 403) {
      throw new Error(
        "Cloudflare R2 a refusé l’upload (403). Vérifie le CORS du bucket et le Content-Type signé."
      );
    }

    if (upload.status === 404) {
      throw new Error(
        "Bucket Cloudflare R2 introuvable ou URL présignée invalide."
      );
    }

    throw new Error(
      text ||
      `Upload Cloudflare R2 échoué (${upload.status})`
    );
  }

  /*
   * L'URL publique a été générée
   * par notre API Vercel.
   */
  if (!json.publicUrl) {
    throw new Error(
      "Upload R2 réussi mais aucune URL publique n’a été retournée."
    );
  }

  return {
    url:
      json.publicUrl,

    path:
      json.key || "",

    mime:
      contentType,

    size:
      file.size,

    fileName:
      file.name,
  };
}
