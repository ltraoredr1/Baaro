import { supabase } from "../supabaseClient.js";
import { getApiBase } from "../config.js";

function apiUrl(path) {
  const base = getApiBase?.() ?? "";
<<<<<<< HEAD
  return `\( {String(base).replace(/\/ \)/, "")}${path}`;
}

async function getAccessToken() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  const token = data?.session?.access_token;
  if (!token) {
    throw new Error("Session expiree. Reconnecte-toi.");
  }
=======

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

>>>>>>> f034ceea0f0f2f1c9189e479a5b112dc35008a92
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

<<<<<<< HEAD
function getFileContentType(file) {
  return String(file?.type || "application/octet-stream")
=======
async function readResponseBody(response) {
  const text = await response
    .text()
    .catch(() => "");

  if (!text) {
    return "";
  }

  return text;
}

async function readJsonResponse(response) {
  const text = await readResponseBody(response);

  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text);
  } catch {
    return {
      raw: text.slice(0, 1000),
    };
  }
}

function getFileContentType(file) {
  return String(
    file?.type ||
      "application/octet-stream"
  )
>>>>>>> f034ceea0f0f2f1c9189e479a5b112dc35008a92
    .toLowerCase()
    .split(";")[0]
    .trim();
}

<<<<<<< HEAD
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      const base64 = result.includes(",") ? result.split(",")[1] : result;
      resolve(base64);
    };
    reader.onerror = () => reject(new Error("Lecture fichier impossible"));
    reader.readAsDataURL(file);
  });
}

=======
>>>>>>> f034ceea0f0f2f1c9189e479a5b112dc35008a92
export async function uploadExternalMedia(
  file,
  {
    folder = "posts",
    userId,
    maxBytes = 50 * 1024 * 1024,
  } = {}
) {
<<<<<<< HEAD
  if (!file) throw new Error("Fichier manquant");
  if (!userId) throw new Error("Utilisateur non connecte");
  if (!Number.isFinite(file.size) || file.size <= 0) {
    throw new Error("Taille de fichier invalide");
  }
  if (file.size > maxBytes) {
    throw new Error(`Fichier trop volumineux (max ${Math.round(maxBytes / 1024 / 1024)} Mo)`);
  }

  const token = await getAccessToken();
  const contentType = getFileContentType(file);
  const cleanFolder = safeFolder(folder);

  // Fichiers <= 4 Mo : proxy Vercel (pas de CORS R2)
  if (file.size <= 4 * 1024 * 1024) {
    const data = await fileToBase64(file);

    let response;
    try {
      response = await fetch(apiUrl("/api/r2-put"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          folder: cleanFolder,
          contentType,
          data,
          name: file.name || "file",
        }),
      });
    } catch (error) {
      throw new Error(
        `API media BAARO inaccessible: ${error?.message || "Erreur reseau"}`
      );
    }

    const json = await response.json().catch(() => ({}));

    if (!response.ok || !json.ok || !(json.publicUrl || json.url)) {
      throw new Error(
        json.error || `Upload R2 impossible (${response.status})`
      );
    }

    return {
      url: json.publicUrl || json.url,
      path: json.key || "",
      mime: contentType,
      size: file.size,
      fileName: file.name,
    };
  }

  // Fichiers > 4 Mo : URL presignee (ancien flux)
  let response;
  try {
    response = await fetch(apiUrl("/api/r2-upload"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        folder: cleanFolder,
        name: file.name || "file",
        contentType,
        size: file.size,
        userId,
      }),
    });
  } catch (error) {
    throw new Error(
      `API media BAARO inaccessible: ${error?.message || "Erreur reseau"}`
    );
  }
=======
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

  if (!Number.isFinite(file.size)) {
    throw new Error(
      "Taille de fichier invalide"
    );
  }

  if (file.size <= 0) {
    throw new Error(
      "Le fichier est vide"
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

  const contentType =
    getFileContentType(file);
>>>>>>> f034ceea0f0f2f1c9189e479a5b112dc35008a92

  const cleanFolder =
    safeFolder(folder);

  /*
   * --------------------------------------------------
   * ÉTAPE 1
   * Demander à Vercel une URL présignée R2.
   * --------------------------------------------------
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
            cleanFolder,

          name:
            file.name || "file",

          contentType,

          size:
            file.size,

          userId,
        }),
      }
    );
  } catch (error) {
    console.error(
      "[externalMedia] Impossible de joindre Vercel:",
      error
    );

    throw new Error(
<<<<<<< HEAD
      json.error || `Preparation R2 impossible (${response.status})`
    );
  }

  const signedContentType = String(json.contentType || contentType)
    .toLowerCase()
    .split(";")[0]
    .trim();

  let upload;
  try {
    upload = await fetch(json.uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": signedContentType },
      body: file,
    });
  } catch (error) {
    throw new Error(
      `Connexion Cloudflare R2 impossible: ${error?.message || "Erreur reseau ou CORS"}`
    );
  }

  if (!upload.ok) {
    throw new Error(`Upload Cloudflare R2 echoue (${upload.status})`);
  }

  if (!json.publicUrl) {
    throw new Error("Upload R2 reussi mais aucune URL publique");
  }

  return {
    url: json.publicUrl,
    path: json.key || "",
    mime: signedContentType,
    size: file.size,
    fileName: file.name,
=======
      `API média BAARO inaccessible: ${
        error?.message ||
        "Erreur réseau"
      }`
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
    console.error(
      "[externalMedia] Erreur API R2:",
      {
        status: response.status,
        response: json,
      }
    );

    throw new Error(
      json.error ||
        json.raw ||
        `Préparation R2 impossible (${response.status})`
    );
  }

  /*
   * Le Content-Type utilisé lors du PUT doit
   * correspondre à celui utilisé pour générer
   * l'URL présignée.
   */
  const signedContentType =
    String(
      json.contentType ||
        contentType
    )
      .toLowerCase()
      .split(";")[0]
      .trim();

  /*
   * --------------------------------------------------
   * ÉTAPE 2
   * Upload direct navigateur → Cloudflare R2.
   * --------------------------------------------------
   */

  let upload;

  try {
    upload = await fetch(
      json.uploadUrl,
      {
        method: "PUT",

        headers: {
          "Content-Type":
            signedContentType,
        },

        body: file,
      }
    );
  } catch (error) {
    /*
     * IMPORTANT :
     * On ne masque plus l'erreur réelle derrière
     * "Vérifiez le CORS".
     */
    console.error(
      "[externalMedia] Erreur réseau R2:",
      error
    );

    throw new Error(
      `Connexion Cloudflare R2 impossible: ${
        error?.message ||
        "Erreur réseau ou CORS"
      }`
    );
  }

  /*
   * --------------------------------------------------
   * ÉTAPE 3
   * Vérifier la réponse réelle de R2.
   * --------------------------------------------------
   */

  if (!upload.ok) {
    const errorBody =
      await readResponseBody(upload);

    console.error(
      "[externalMedia] Réponse R2:",
      {
        status:
          upload.status,

        statusText:
          upload.statusText,

        body:
          errorBody,

        url:
          json.uploadUrl,
      }
    );

    if (upload.status === 403) {
      throw new Error(
        `Cloudflare R2 a refusé l'upload (403). Réponse R2: ${
          errorBody ||
          "AccessDenied / SignatureDoesNotMatch"
        }`
      );
    }

    if (upload.status === 400) {
      throw new Error(
        `Cloudflare R2 a rejeté la requête (400): ${
          errorBody ||
          "Requête invalide"
        }`
      );
    }

    if (upload.status === 404) {
      throw new Error(
        `Cloudflare R2 introuvable (404): ${
          errorBody ||
          "Bucket ou objet introuvable"
        }`
      );
    }

    if (upload.status === 413) {
      throw new Error(
        "Cloudflare R2 a refusé le fichier car il est trop volumineux."
      );
    }

    throw new Error(
      `Upload Cloudflare R2 échoué (${upload.status} ${
        upload.statusText || ""
      }): ${
        errorBody ||
        "Réponse vide"
      }`
    );
  }

  /*
   * --------------------------------------------------
   * ÉTAPE 4
   * Vérifier l'URL publique.
   * --------------------------------------------------
   */

  if (!json.publicUrl) {
    throw new Error(
      "Upload R2 réussi mais aucune URL publique n'a été retournée."
    );
  }

  console.log(
    "[externalMedia] Upload R2 réussi:",
    {
      url:
        json.publicUrl,

      key:
        json.key,

      contentType:
        signedContentType,

      size:
        file.size,
    }
  );

  return {
    url:
      json.publicUrl,

    path:
      json.key || "",

    mime:
      signedContentType,

    size:
      file.size,

    fileName:
      file.name,
>>>>>>> f034ceea0f0f2f1c9189e479a5b112dc35008a92
  };
}
