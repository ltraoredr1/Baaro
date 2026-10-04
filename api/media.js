import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { applyCors, getAdminClient, requireUser, rateLimit } from "./_shared.js";
import crypto from "node:crypto";

const MAX_BYTES = 500 * 1024 * 1024;
const FOLDERS = new Set(["profiles", "posts", "videos", "chat", "shop", "misc"]);

function getR2() {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucket = process.env.R2_BUCKET_NAME || "baaro-media";
  if (!accountId || !accessKeyId || !secretAccessKey) throw new Error("R2 non configuré");
  return {
    bucket,
    publicBase: String(process.env.R2_PUBLIC_BASE_URL || "").replace(/\/+$/, ""),
    client: new S3Client({
      region: "auto",
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId, secretAccessKey },
    }),
  };
}

function safeExt(value) {
  const ext = String(value || "bin").toLowerCase().replace(/[^a-z0-9]/g, "");
  return ext.slice(0, 10) || "bin";
}

export default async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Méthode non autorisée" });

  const limiter = rateLimit(req, { key: "media-prepare", max: 30, windowMs: 60_000 });
  if (!limiter.ok) return res.status(limiter.status).json(limiter.body);

  let admin;
  try { admin = getAdminClient(); } catch { return res.status(500).json({ ok: false, error: "Configuration serveur indisponible" }); }

  let user;
  try { user = await requireUser(req, admin); }
  catch (e) { return res.status(e.status || 401).json({ ok: false, error: e.message || "Non authentifié" }); }

  const body = req.body || {};
  if (!["prepare", "finalize"].includes(body.action)) {
    return res.status(400).json({ ok: false, error: "Action invalide" });
  }

  if (body.action === "finalize") {
    const objectKey = String(body.path || "").replace(/^\/+/, "");
    const publicUrl = String(body.publicUrl || "");
    const folder = String(body.folder || objectKey.split("/")[0] || "misc");
    const size = Number(body.size);
    const mime = String(body.contentType || "application/octet-stream").slice(0, 150);
    const fileName = String(body.fileName || "upload").slice(0, 255);
    if (!FOLDERS.has(folder) || !objectKey.startsWith(`${folder}/${user.id}/`) || !Number.isSafeInteger(size) || size <= 0 || size > MAX_BYTES) {
      return res.status(400).json({ ok: false, error: "Métadonnées média invalides" });
    }
    try {
      const r2 = getR2();
      if (!r2.publicBase) throw new Error("R2_PUBLIC_BASE_URL manquante");
      const expectedUrl = `${r2.publicBase}/${objectKey}`;
      if (publicUrl !== expectedUrl) return res.status(400).json({ ok: false, error: "URL média invalide" });
      const { data, error } = await admin.from("media_assets").upsert({
        owner_id: user.id, provider: "cloudflare-r2", bucket: r2.bucket, folder, object_key: objectKey,
        public_url: expectedUrl, mime_type: mime, byte_size: size, original_name: fileName, status: "ready", updated_at: new Date().toISOString()
      }, { onConflict: "bucket,object_key" }).select("id,owner_id,provider,bucket,folder,object_key,public_url,mime_type,byte_size,original_name,status,created_at,updated_at").single();
      if (error) throw error;
      return res.status(200).json({ ok: true, asset: data });
    } catch (e) {
      console.error("[media:finalize]", e);
      return res.status(500).json({ ok: false, error: "Impossible d'enregistrer les métadonnées média" });
    }
  }

  const folder = String(body.folder || "misc");
  const size = Number(body.size);
  if (!FOLDERS.has(folder) || !Number.isSafeInteger(size) || size <= 0 || size > MAX_BYTES) {
    return res.status(400).json({ ok: false, error: "Paramètres média invalides" });
  }

  try {
    const r2 = getR2();
    if (!r2.publicBase) throw new Error("R2_PUBLIC_BASE_URL manquante");
    const ext = safeExt(body.extension);
    const key = `${folder}/${user.id}/${crypto.randomUUID()}.${ext}`;
    const command = new PutObjectCommand({
      Bucket: r2.bucket,
      Key: key,
      ContentType: String(body.contentType || "application/octet-stream").slice(0, 150),
      Metadata: { "baaro-user-id": user.id },
    });
    const uploadUrl = await getSignedUrl(r2.client, command, { expiresIn: 900 });
    return res.status(200).json({
      ok: true,
      uploadUrl,
      path: key,
      publicUrl: `${r2.publicBase}/${key}`,
    });
  } catch (e) {
    console.error("[media]", e);
    return res.status(500).json({ ok: false, error: "Service média indisponible" });
  }
}
