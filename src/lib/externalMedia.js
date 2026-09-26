import { supabase } from "../supabaseClient.js";
import { getApiBase } from "../config.js";

function apiUrl() {
  const base = getApiBase?.() ?? "";
  return `${String(base).replace(/\/$/, "")}/api/media`;
}

async function getAccessToken() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  const token = data?.session?.access_token;
  if (!token) throw new Error("Session expirée. Reconnecte-toi.");
  return token;
}

function safeFolder(folder) {
  const value = String(folder || "posts")
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "");
  return value || "posts";
}

export async function uploadExternalMedia(
  file,
  { folder = "posts", userId, maxBytes = 500 * 1024 * 1024 } = {}
) {
  if (!file) throw new Error("Fichier manquant");
  if (!userId) throw new Error("Utilisateur non connecté");
  if (file.size > maxBytes) {
    throw new Error(
      `Fichier trop volumineux (max ${Math.round(maxBytes / 1024 / 1024)} Mo)`
    );
  }

  const token = await getAccessToken();

  const response = await fetch(apiUrl(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      action: "presign",
      folder: safeFolder(folder),
      name: file.name,
      contentType: file.type || "application/octet-stream",
      size: file.size,
    }),
  });

  const json = await response.json().catch(() => ({}));

  if (!response.ok || !json.ok || !json.uploadUrl || !json.publicUrl) {
    throw new Error(
      json.error || `Préparation média impossible (${response.status})`
    );
  }

  const upload = await fetch(json.uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": file.type || "application/octet-stream",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
    body: file,
  });

  if (!upload.ok) {
    const detail = await upload.text().catch(() => "");
    throw new Error(
      `Upload média échoué (${upload.status})${detail ? `: ${detail.slice(0, 160)}` : ""}`
    );
  }

  return {
    url: json.publicUrl,
    path: json.key,
    mime: file.type || "application/octet-stream",
    size: file.size,
    fileName: file.name,
  };
}
