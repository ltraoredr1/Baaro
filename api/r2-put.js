import {
  S3Client,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import crypto from "node:crypto";
import {
  applyCors,
  getAdminClient,
  requireUser,
  rateLimitAsync,
} from "./_shared.js";

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "4.5mb",
    },
  },
};

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID || "";
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME || "";
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID || "";
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY || "";
const R2_PUBLIC_URL = String(process.env.R2_PUBLIC_URL || "").replace(/\/$/, "");

const ALLOWED_FOLDERS = new Set([
  "posts", "videos", "stories", "profiles", "shop", "chat",
]);

function getR2Client() {
  return new S3Client({
    region: "auto",
    endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: R2_ACCESS_KEY_ID,
      secretAccessKey: R2_SECRET_ACCESS_KEY,
    },
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });
}

export default async function handler(req, res) {
  if (applyCors(req, res)) return;

  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Methode non autorisee" });
  }

  try {
    const limit = await rateLimitAsync(req, {
      key: "r2-put",
      max: 20,
      windowMs: 60_000,
    });
    if (!limit.ok) {
      return res.status(limit.status).json(limit.body);
    }

    if (!R2_ACCOUNT_ID || !R2_BUCKET_NAME || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_PUBLIC_URL) {
      throw new Error("Configuration R2 manquante sur Vercel");
    }

    const admin = getAdminClient();
    const user = await requireUser(req, admin);
    if (!user?.id) {
      const err = new Error("Utilisateur non authentifie");
      err.status = 401;
      throw err;
    }

    const body = req.body || {};
    const folder = String(body.folder || "posts").toLowerCase().replace(/[^a-z0-9_-]/g, "") || "posts";
    const contentType = String(body.contentType || "application/octet-stream").split(";")[0].trim().toLowerCase();
    const base64 = body.data;

    if (!ALLOWED_FOLDERS.has(folder)) {
      return res.status(400).json({ ok: false, error: "Dossier non autorise" });
    }

    if (!base64 || typeof base64 !== "string") {
      return res.status(400).json({ ok: false, error: "Donnees fichier manquantes" });
    }

    const buffer = Buffer.from(base64, "base64");
    if (buffer.length === 0 || buffer.length > 4 * 1024 * 1024) {
      return res.status(413).json({ ok: false, error: "Fichier trop grand (max 4 Mo)" });
    }

    const ext = contentType.includes("png") ? ".png"
      : contentType.includes("webp") ? ".webp"
      : contentType.includes("gif") ? ".gif"
      : contentType.includes("mp4") ? ".mp4"
      : ".jpg";

    const key = `\( {folder}/ \){user.id}/\( {Date.now()}- \){crypto.randomBytes(8).toString("hex")}${ext}`;

    const r2 = getR2Client();
    await r2.send(new PutObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    }));

    const publicUrl = `\( {R2_PUBLIC_URL}/ \){key.split("/").map(encodeURIComponent).join("/")}`;

    return res.status(200).json({
      ok: true,
      provider: "cloudflare-r2-proxy",
      publicUrl,
      url: publicUrl,
      key,
      contentType,
      size: buffer.length,
    });
  } catch (error) {
    console.error("[r2-put]", error);
    return res.status(Number(error?.status) || 500).json({
      ok: false,
      error: error?.message || "Upload R2 impossible",
    });
  }
}
