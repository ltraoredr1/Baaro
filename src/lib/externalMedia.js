import { supabase } from "../supabaseClient.js";
import { getApiBase } from "../config.js";

function apiUrl(path) {
  const base = getApiBase?.() ?? "";
  return `\( {String(base).replace(/\/ \)/, "")}${path}`;
}

async function getAccessToken() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  const token = data?.session?.access_token;
  if (!token) {
    throw new Error("Session expiree. Reconnecte-toi.");
  }
  return token;
}

function safeFolder(folder) {
  const value = String(folder || "posts")
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "");
  return value || "posts";
}

function getFileContentType(file) {
  return String(file?.type || "application/octet-stream")
    .toLowerCase()
    .split(";")[0]
    .trim();
}

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

export async function uploadExternalMedia(
  file,
  {
    folder = "posts",
    userId,
    maxBytes = 50 * 1024 * 1024,
  } = {}
) {
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

  const json = await response.json().catch(() => ({}));

  if (!response.ok || !json.ok || !json.uploadUrl) {
    throw new Error(
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
  };
}
