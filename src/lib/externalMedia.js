/**
 * Upload média vers R2 via /api/media
 * Version sans header Content-Type pour éviter le preflight CORS
 */

export async function uploadExternalMedia(file, folder = "posts") {
  const ext = file.name?.split(".").pop() || "bin";
  const size = file.size;
  const contentType = file.type || "application/octet-stream";
  const fileName = file.name || "upload";

  // 1. prepare
  const prepRes = await fetch("/api/media", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "prepare",
      folder,
      extension: ext,
      size,
      contentType,
      fileName,
    }),
  });

  const prep = await prepRes.json();
  if (!prep.ok) throw new Error(prep.error || "prepare failed");

  const { uploadUrl, path, publicUrl } = prep;

  // 2. PUT direct vers R2 - SANS header Content-Type
  const putRes = await fetch(uploadUrl, {
    method: "PUT",
    body: file,
  });

  if (!putRes.ok) {
    const txt = await putRes.text().catch(() => "");
    throw new Error(`PUT R2 failed ${putRes.status}: ${txt}`);
  }

  // 3. finalize
  const finRes = await fetch("/api/media", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "finalize",
      folder,
      path,
      publicUrl,
      size,
      contentType,
      fileName,
    }),
  });

  const fin = await finRes.json();
  if (!fin.ok) throw new Error(fin.error || "finalize failed");

  return fin.asset || { public_url: publicUrl, object_key: path };
}
