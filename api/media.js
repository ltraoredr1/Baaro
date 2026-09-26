import crypto from "node:crypto";
import { applyCors, getAdminClient, requireUser, rateLimitAsync } from "./_shared.js";

const ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const BUCKET = process.env.R2_BUCKET || "baaro-media";
const PUBLIC_URL = String(process.env.R2_PUBLIC_URL || "").replace(/\/$/, "");
const MAX_SIZE = 500 * 1024 * 1024;

const ALLOWED_PREFIXES = new Set([
  "posts", "videos", "stories", "profiles", "shop", "chat",
]);

function awsEncode(value) {
  return encodeURIComponent(String(value))
    .replace(/[!'()*]/g, (c) =>
      "%" + c.charCodeAt(0).toString(16).toUpperCase()
    );
}

function encodePath(path) {
  return String(path).split("/").map(awsEncode).join("/");
}

function hmac(key, value) {
  return crypto.createHmac("sha256", key).update(value).digest();
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function signingKey(secret, date) {
  return hmac(
    hmac(
      hmac(
        hmac("AWS4" + secret, date),
        "auto"
      ),
      "s3"
    ),
    "aws4_request"
  );
}

function presignPut({ key, contentType, expiresIn = 900 }) {
  if (!ACCOUNT_ID || !ACCESS_KEY_ID || !SECRET_ACCESS_KEY) {
    throw new Error("Configuration R2 manquante");
  }

  const host = `${ACCOUNT_ID}.r2.cloudflarestorage.com`;
  const now = new Date();
  const amzDate = now.toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
  const date = amzDate.slice(0, 8);
  const credential = `${ACCESS_KEY_ID}/${date}/auto/s3/aws4_request`;
  const canonicalUri = `/${awsEncode(BUCKET)}/${encodePath(key)}`;

  const params = new URLSearchParams();
  params.set("X-Amz-Algorithm", "AWS4-HMAC-SHA256");
  params.set("X-Amz-Credential", credential);
  params.set("X-Amz-Date", amzDate);
  params.set("X-Amz-Expires", String(Math.min(900, Math.max(1, expiresIn))));
  params.set("X-Amz-SignedHeaders", "cache-control;content-type;host");

  const canonicalQuery = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${awsEncode(k)}=${awsEncode(v)}`)
    .join("&");

  const canonicalRequest = [
    "PUT",
    canonicalUri,
    canonicalQuery,
    `cache-control:public, max-age=31536000, immutable\ncontent-type:${contentType}\nhost:${host}\n`,
    "cache-control;content-type;host",
    "UNSIGNED-PAYLOAD",
  ].join("\n");

  const scope = `${date}/auto/s3/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    scope,
    sha256(canonicalRequest),
  ].join("\n");

  const signature = crypto
    .createHmac("sha256", signingKey(SECRET_ACCESS_KEY, date))
    .update(stringToSign)
    .digest("hex");

  params.set("X-Amz-Signature", signature);
  return `https://${host}${canonicalUri}?${params.toString()}`;
}

function publicUrl(key) {
  if (!PUBLIC_URL) throw new Error("R2_PUBLIC_URL manquante");
  return `${PUBLIC_URL}/${encodePath(key)}`;
}

function safeExt(name, contentType) {
  const fromName = String(name || "")
    .split(".")
    .pop()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

  if (fromName) return fromName.slice(0, 10);

  const map = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
    "video/mp4": "mp4",
    "video/webm": "webm",
    "audio/webm": "webm",
    "audio/mp4": "m4a",
    "audio/mpeg": "mp3",
    "application/pdf": "pdf",
  };

  return map[contentType] || "bin";
}

function safeSegment(value, fallback) {
  const v = String(value || fallback)
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "");
  return v || fallback;
}

export default async function handler(req, res) {
  if (applyCors(req, res)) return;

  if (req.method !== "POST") {
    return res.status(405).json({
      ok: false,
      error: "Méthode non autorisée",
    });
  }

  const limit = await rateLimitAsync(req, {
    key: "media-presign",
    max: 60,
    windowMs: 60_000,
  });

  if (!limit.ok) {
    Object.entries(limit.headers || {}).forEach(([k, v]) =>
      res.setHeader(k, v)
    );
    return res.status(limit.status).json(limit.body);
  }

  try {
    const admin = getAdminClient();
    const user = await requireUser(req, admin);
    const body = req.body || {};

    if (body.action !== "presign") {
      return res.status(400).json({
        ok: false,
        error: "Action invalide",
      });
    }

    const size = Number(body.size || 0);
    const contentType = String(body.contentType || "").trim().toLowerCase();

    if (!Number.isFinite(size) || size <= 0 || size > MAX_SIZE) {
      return res.status(413).json({
        ok: false,
        error: "Fichier trop volumineux (max 500 Mo)",
      });
    }

    if (!contentType || !contentType.includes("/")) {
      return res.status(400).json({
        ok: false,
        error: "Content-Type invalide",
      });
    }

    const prefix = safeSegment(body.folder, "posts");

    if (!ALLOWED_PREFIXES.has(prefix)) {
      return res.status(400).json({
        ok: false,
        error: "Dossier média non autorisé",
      });
    }

    const ext = safeExt(body.name, contentType);
    const key = `${prefix}/${user.id}/${crypto.randomUUID()}.${ext}`;
    const uploadUrl = presignPut({ key, contentType });

    return res.status(200).json({
      ok: true,
      key,
      uploadUrl,
      publicUrl: publicUrl(key),
      expiresIn: 900,
    });
  } catch (error) {
    console.error("[media] presign error", error);
    return res.status(error.status || 500).json({
      ok: false,
      error: error.message || "Préparation de l'upload impossible",
    });
  }
}
