import { supabase } from "../supabaseClient.js";
import { getApiBase } from "../config.js";

/* ==========================================================
 * API URL
 * ========================================================== */

function apiUrl() {
  const base = getApiBase?.() ?? "";
  const cleanBase = String(base).replace(/\/+$/, "");

  return `${cleanBase}/api/r2-upload`;
}

/* ==========================================================
 * AUTH
 * ========================================================== */

async function getAccessToken() {
  const { data, error } =
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

/* ==========================================================
 * FOLDER
 * ========================================================== */

function cleanFolder(folder) {
  const value = String(
    folder || "posts"
  )
    .trim()
    .replace(/^\/+|\/+$/g, "");

  if (!value) {
    return "posts";
  }

  if (
    value.includes("..") ||
    value.includes("\\") ||
    value.startsWith(".")
  ) {
    throw new Error(
      "Dossier média invalide."
    );
  }

  return value;
}

/* ==========================================================
 * CONTENT TYPE
 * ========================================================== */

function getContentType(file) {
  const type = String(
    file?.type || ""
  )
    .split(";")[0]
    .trim()
    .toLowerCase();

  if (type) {
    return type;
  }

  const name =
    String(
      file?.name || ""
    ).toLowerCase();

  if (
    name.endsWith(".jpg") ||
    name.endsWith(".jpeg")
  ) {
    return "image/jpeg";
  }

  if (
    name.endsWith(".png")
  ) {
    return "image/png";
  }

  if (
    name.endsWith(".webp")
  ) {
    return "image/webp";
  }

  if (
    name.endsWith(".gif")
  ) {
    return "image/gif";
  }

  if (
    name.endsWith(".avif")
  ) {
    return "image/avif";
  }

  if (
    name.endsWith(".mp4")
  ) {
    return "video/mp4";
  }

  if (
    name.endsWith(".webm")
  ) {
    return "video/webm";
  }

  if (
    name.endsWith(".mov")
  ) {
    return "video/quicktime";
  }

  if (
    name.endsWith(".ogg")
  ) {
    return "audio/ogg";
  }

  if (
    name.endsWith(".mp3")
  ) {
    return "audio/mpeg";
  }

  if (
    name.endsWith(".wav")
  ) {
    return "audio/wav";
  }

  return "application/octet-stream";
}

/* ==========================================================
 * API RESPONSE
 * ========================================================== */

async function readApiResponse(
  response
) {
  const text =
    await response.text();

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

/* ==========================================================
 * R2 ERROR
 * ========================================================== */

function getR2UploadError(
  status,
  detail
) {
  const cleanDetail =
    String(detail || "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 500);

  if (status === 400) {
    return (
      "Upload R2 refusé (400). " +
      "Le Content-Type envoyé ne correspond probablement pas à la signature."
    );
  }

  if (status === 401) {
    return (
      "Upload R2 non authentifié (401)."
    );
  }

  if (status === 403) {
    return (
      "Upload R2 refusé (403). " +
      "Vérifie la signature de l'URL, le Content-Type et le CORS du bucket R2." +
      (cleanDetail
        ? ` Détail : ${cleanDetail}`
        : "")
    );
  }

  if (status === 404) {
    return (
      "URL R2 introuvable (404). " +
      "L'URL présignée ou le bucket R2 est incorrect."
    );
  }

  if (status === 413) {
    return (
      "Fichier trop volumineux pour R2."
    );
  }

  if (status >= 500) {
    return (
      `Cloudflare R2 a renvoyé une erreur ${status}.`
    );
  }

  return (
    `Échec de l'upload R2 (${status})${
      cleanDetail
        ? ` : ${cleanDetail}`
        : "."
    }`
  );
}

/* ==========================================================
 * UPLOAD EXTERNAL MEDIA
 * ========================================================== */

export async function uploadExternalMedia(
  file,
  {
    folder = "posts",
    userId,
    maxBytes =
      50 * 1024 * 1024,
  } = {}
) {
  /* --------------------------------------------------------
   * FILE VALIDATION
   * -------------------------------------------------------- */

  if (!file) {
    throw new Error(
      "Fichier manquant."
    );
  }

  if (!userId) {
    throw new Error(
      "Utilisateur non identifié."
    );
  }

  if (
    !Number.isFinite(
      file.size
    ) ||
    file.size <= 0
  ) {
    throw new Error(
      "Fichier vide ou invalide."
    );
  }

  if (
    file.size > maxBytes
  ) {
    const maxMb =
      Math.round(
        maxBytes /
          (1024 * 1024)
      );

    throw new Error(
      `Fichier trop lourd. Taille maximale : ${maxMb} Mo.`
    );
  }

  /* --------------------------------------------------------
   * CONTENT TYPE
   * -------------------------------------------------------- */

  const contentType =
    getContentType(file);

  if (
    !contentType ||
    contentType ===
      "application/octet-stream"
  ) {
    throw new Error(
      "Type de fichier non reconnu."
    );
  }

  const cleanFolderName =
    cleanFolder(folder);

  /* --------------------------------------------------------
   * SESSION
   * -------------------------------------------------------- */

  const token =
    await getAccessToken();

  /* ========================================================
   * STEP 1
   * Demande d'une URL présignée à Vercel
   * ======================================================== */

  let response;

  try {
    response =
      await fetch(
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
              cleanFolderName,

            name:
              file.name ||
              "file",

            contentType,

            size:
              file.size,

            userId,
          }),
        }
      );
  } catch (error) {
    console.error(
      "[BAARO][R2] API request failed:",
      error
    );

    console.error(
      "[BAARO][R2] API URL:",
      apiUrl()
    );

    console.error(
      "[BAARO][R2] Browser origin:",
      typeof window !==
        "undefined"
        ? window.location.origin
        : "unknown"
    );

    throw new Error(
      `Serveur média BAARO inaccessible : ${
        error?.message ||
        "Erreur réseau."
      }`
    );
  }

  /* --------------------------------------------------------
   * READ VERCEL RESPONSE
   * -------------------------------------------------------- */

  const json =
    await readApiResponse(
      response
    );

  console.log(
    "[BAARO][R2] API status:",
    response.status
  );

  console.log(
    "[BAARO][R2] API response:",
    json
  );

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

  /* ========================================================
   * SIGNED CONTENT TYPE
   * ======================================================== */

  const signedContentType =
    String(
      json.contentType ||
        contentType
    )
      .split(";")[0]
      .trim()
      .toLowerCase();

  /* ========================================================
   * STEP 2
   * Upload direct navigateur → R2
   * ======================================================== */

  let uploadResponse;

  try {
    console.log(
      "[BAARO][R2] Starting direct upload..."
    );

    console.log(
      "[BAARO][R2] Content-Type:",
      signedContentType
    );

    console.log(
      "[BAARO][R2] File size:",
      file.size
    );

    console.log(
      "[BAARO][R2] Origin:",
      typeof window !==
        "undefined"
        ? window.location.origin
        : "unknown"
    );

    uploadResponse =
      await fetch(
        json.uploadUrl,
        {
          method: "PUT",

          mode: "cors",

          headers: {
            "Content-Type":
              signedContentType,
          },

          body: file,
        }
      );
  } catch (error) {
    console.error(
      "[BAARO][R2] PUT failed:",
      error
    );

    console.error(
      "[BAARO][R2] uploadUrl:",
      json.uploadUrl
    );

    console.error(
      "[BAARO][R2] contentType:",
      signedContentType
    );

    console.error(
      "[BAARO][R2] origin:",
      typeof window !==
        "undefined"
        ? window.location.origin
        : "unknown"
    );

    throw new Error(
      `Échec upload R2 : ${
        error?.message ||
        "Le navigateur a bloqué la connexion. Vérifie le CORS R2."
      }`
    );
  }

  /* ========================================================
   * R2 RESPONSE
   * ======================================================== */

  console.log(
    "[BAARO][R2] Upload status:",
    uploadResponse.status
  );

  if (
    !uploadResponse.ok
  ) {
    let detail = "";

    try {
      detail =
        await uploadResponse.text();
    } catch {
      detail = "";
    }

    console.error(
      "[BAARO][R2] Upload error:",
      {
        status:
          uploadResponse.status,

        detail,

        contentType:
          signedContentType,

        origin:
          typeof window !==
          "undefined"
            ? window.location.origin
            : "unknown",
      }
    );

    throw new Error(
      getR2UploadError(
        uploadResponse.status,
        detail
      )
    );
  }

  /* ========================================================
   * PUBLIC URL
   * ======================================================== */

  if (!json.publicUrl) {
    throw new Error(
      "Upload R2 réussi, mais aucune URL publique n'a été retournée par le serveur."
    );
  }

  /* ========================================================
   * SUCCESS
   * ======================================================== */

  console.log(
    "[BAARO][R2] Upload successful:",
    {
      key: json.key,
      publicUrl:
        json.publicUrl,
    }
  );

  return {
    url:
      json.publicUrl,

    path:
      json.key || "",

    key:
      json.key || "",

    mime:
      signedContentType,

    size:
      file.size,

    fileName:
      file.name ||
      "file",
  };
}

/* ==========================================================
 * COMPATIBILITY ALIAS
 * ========================================================== */

export const uploadMedia =
  uploadExternalMedia;
