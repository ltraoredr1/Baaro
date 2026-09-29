import { supabase } from "../supabaseClient.js";
import { getApiBase } from "../config.js";

function apiUrl() {
  const base =
    getApiBase?.() ?? "";

  return `${String(base).replace(/\/$/, "")}/api/media`;
}

async function getAccessToken() {
  const {
    data,
    error,
  } =
    await supabase.auth.getSession();

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
  const value =
    String(folder || "posts")
      .toLowerCase()
      .replace(
        /[^a-z0-9_-]/g,
        ""
      );

  return value || "posts";
}

async function readJsonResponse(response) {
  const text =
    await response
      .text()
      .catch(() => "");

  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text);
  } catch {
    return {
      raw: text.slice(0, 300),
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
   * demander à BAARO/Vercel une URL
   * d'upload signée.
   */
  let response;

  try {
    response =
      await fetch(apiUrl(), {
        method: "POST",

        headers: {
          "Content-Type":
            "application/json",

          Authorization:
            `Bearer ${token}`,
        },

        body: JSON.stringify({
          action: "upload",

          folder:
            safeFolder(folder),

          name:
            file.name,

          contentType:
            file.type ||
            "application/octet-stream",

          size:
            file.size,
        }),
      });
  } catch (error) {
    console.error(
      "[externalMedia] API média inaccessible:",
      error
    );

    throw new Error(
      "Impossible de joindre l’API média BAARO. Vérifiez le déploiement Vercel et CORS."
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
        `Préparation média impossible (${response.status})`
    );
  }

  /*
   * Étape 2 :
   * envoyer directement le fichier
   * au serveur média Telegram.
   *
   * Le fichier ne passe PAS par Vercel.
   */
  let upload;

  try {
    upload =
      await fetch(
        json.uploadUrl,
        {
          method: "PUT",

          headers: {
            "Content-Type":
              file.type ||
              "application/octet-stream",
          },

          body: file,
        }
      );
  } catch (error) {
    console.error(
      "[externalMedia] Upload externe inaccessible:",
      error
    );

    throw new Error(
      "Impossible de joindre le serveur média Telegram. Vérifiez son URL et son CORS."
    );
  }

  const result =
    await readJsonResponse(
      upload
    );

  if (
    !upload.ok ||
    !result.ok ||
    !result.publicUrl
  ) {
    throw new Error(
      result.error ||
        result.raw ||
        `Upload Telegram échoué (${upload.status})`
    );
  }

  return {
    url:
      result.publicUrl,

    path:
      result.fileId || "",

    mime:
      file.type ||
      "application/octet-stream",

    size:
      file.size,

    fileName:
      file.name,
  };
}
