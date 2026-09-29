import crypto from "node:crypto";
import {
  applyCors,
  getAdminClient,
  requireUser,
  rateLimitAsync,
} from "./_shared.js";

const R2_ACCOUNT_ID =
  process.env.R2_ACCOUNT_ID || "";

const R2_BUCKET_NAME =
  process.env.R2_BUCKET_NAME || "baaro-media";

const R2_ACCESS_KEY_ID =
  process.env.R2_ACCESS_KEY_ID || "";

const R2_SECRET_ACCESS_KEY =
  process.env.R2_SECRET_ACCESS_KEY || "";

const R2_PUBLIC_URL =
  String(process.env.R2_PUBLIC_URL || "")
    .replace(/\/$/, "");

const MAX_SIZE = 50 * 1024 * 1024;

const ALLOWED_FOLDERS = new Set([
  "posts",
  "videos",
  "stories",
  "profiles",
  "shop",
  "chat",
]);

function safeFolder(folder) {
  const value = String(folder || "posts")
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "");

  return value || "posts";
}

function safeName(name) {
  return (
    String(name || "file")
      .replace(
        /[\\/:*?"<>|\x00-\x1f]/g,
        "_"
      )
      .slice(0, 180) || "file"
  );
}

function randomId() {
  return crypto.randomBytes(16).toString("hex");
}

/*
 * Création d'une clé R2 unique.
 *
 * Exemple :
 * posts/user-uuid/abc123-image.jpg
 */
function createObjectKey({
  userId,
  folder,
  name,
}) {
  const extension =
    name.includes(".")
      ? "." + name.split(".").pop()
      : "";

  const cleanExtension =
    extension
      .toLowerCase()
      .replace(/[^a-z0-9.]/g, "")
      .slice(0, 10);

  return [
    folder,
    userId,
    `${Date.now()}-${randomId()}${cleanExtension}`,
  ].join("/");
}

/*
 * Encode correctement une clé pour l'URL.
 */
function encodeObjectKey(key) {
  return key
    .split("/")
    .map((part) =>
      encodeURIComponent(part)
    )
    .join("/");
}

/*
 * AWS Signature Version 4
 *
 * Cloudflare R2 est compatible
 * avec l'API S3.
 */

function hmac(key, data) {
  return crypto
    .createHmac("sha256", key)
    .update(data)
    .digest();
}

function sha256(data) {
  return crypto
    .createHash("sha256")
    .update(data)
    .digest("hex");
}

function getSigningKey(
  secret,
  dateStamp,
  region,
  service
) {
  const kDate = hmac(
    Buffer.from("AWS4" + secret),
    dateStamp
  );

  const kRegion = hmac(
    kDate,
    region
  );

  const kService = hmac(
    kRegion,
    service
  );

  return hmac(
    kService,
    "aws4_request"
  );
}

function encodeRfc3986(value) {
  return encodeURIComponent(value)
    .replace(/[!'()*]/g, (char) =>
      `%${char
        .charCodeAt(0)
        .toString(16)
        .toUpperCase()}`
    );
}

function createPresignedPutUrl({
  key,
  contentType,
  expiresIn = 300,
}) {
  const region = "auto";
  const service = "s3";

  const host =
    `${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;

  const encodedKey =
    encodeObjectKey(key);

  const now = new Date();

  const amzDate =
    now.toISOString()
      .replace(/[:-]|\.\d{3}/g, "");

  const dateStamp =
    amzDate.slice(0, 8);

  const credential =
    `${R2_ACCESS_KEY_ID}/${dateStamp}/${region}/${service}/aws4_request`;

  const query = new URLSearchParams();

  query.set(
    "X-Amz-Algorithm",
    "AWS4-HMAC-SHA256"
  );

  query.set(
    "X-Amz-Credential",
    credential
  );

  query.set(
    "X-Amz-Date",
    amzDate
  );

  query.set(
    "X-Amz-Expires",
    String(expiresIn)
  );

  query.set(
    "X-Amz-SignedHeaders",
    "content-type;host"
  );

  const sortedQuery =
    Array.from(query.entries())
      .sort(([a], [b]) =>
        a.localeCompare(b)
      )
      .map(
        ([key, value]) =>
          `${encodeRfc3986(key)}=${encodeRfc3986(value)}`
      )
      .join("&");

  const canonicalUri =
    "/" +
    encodedKey;

  const canonicalHeaders =
    `content-type:${contentType}\n` +
    `host:${host}\n`;

  const signedHeaders =
    "content-type;host";

  const payloadHash =
    "UNSIGNED-PAYLOAD";

  const canonicalRequest = [
    "PUT",
    canonicalUri,
    sortedQuery,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");

  const credentialScope =
    `${dateStamp}/${region}/${service}/aws4_request`;

  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    sha256(canonicalRequest),
  ].join("\n");

  const signingKey =
    getSigningKey(
      R2_SECRET_ACCESS_KEY,
      dateStamp,
      region,
      service
    );

  const signature =
    crypto
      .createHmac(
        "sha256",
        signingKey
      )
      .update(stringToSign)
      .digest("hex");

  return (
    `https://${host}${canonicalUri}` +
    `?${sortedQuery}` +
    `&X-Amz-Signature=${signature}`
  );
}

function createPublicUrl(key) {
  if (!R2_PUBLIC_URL) {
    return "";
  }

  return (
    `${R2_PUBLIC_URL}/${encodeObjectKey(key)}`
  );
}

export default async function handler(
  req,
  res
) {
  if (applyCors(req, res)) {
    return;
  }

  if (req.method !== "POST") {
    return res.status(405).json({
      ok: false,
      error: "Méthode non autorisée",
    });
  }

  try {
    const limit =
      await rateLimitAsync(req, {
        key: "r2-media",
        max: 30,
        windowMs: 60000,
      });

    if (!limit.ok) {
      Object.entries(
        limit.headers || {}
      ).forEach(([key, value]) => {
        res.setHeader(key, value);
      });

      return res
        .status(limit.status)
        .json(limit.body);
    }

    /*
     * Vérification de configuration.
     */
    if (
      !R2_ACCOUNT_ID ||
      !R2_BUCKET_NAME ||
      !R2_ACCESS_KEY_ID ||
      !R2_SECRET_ACCESS_KEY
    ) {
      throw new Error(
        "Configuration Cloudflare R2 manquante"
      );
    }

    /*
     * Vérification utilisateur Supabase.
     */
    const user =
      await requireUser(
        req,
        getAdminClient()
      );

    const body =
      req.body || {};

    const size =
      Number(body.size || 0);

    const contentType =
      String(
        body.contentType ||
          "application/octet-stream"
      ).trim();

    const folder =
      safeFolder(body.folder);

    const name =
      safeName(body.name);

    if (
      !ALLOWED_FOLDERS.has(folder)
    ) {
      return res.status(400).json({
        ok: false,
        error:
          "Dossier média non autorisé",
      });
    }

    if (
      !Number.isFinite(size) ||
      size <= 0 ||
      size > MAX_SIZE
    ) {
      return res.status(413).json({
        ok: false,
        error:
          "Fichier trop volumineux (max 50 Mo)",
      });
    }

    /*
     * Vérification supplémentaire :
     * le userId utilisé dans le chemin
     * vient toujours de Supabase.
     */
    const key =
      createObjectKey({
        userId: user.id,
        folder,
        name,
      });

    /*
     * URL signée valable 5 minutes.
     */
    const uploadUrl =
      createPresignedPutUrl({
        key,
        contentType,
        expiresIn: 300,
      });

    /*
     * URL utilisée ensuite par BAARO
     * pour afficher l'image/vidéo.
     */
    const publicUrl =
      createPublicUrl(key);

    if (!publicUrl) {
      return res.status(500).json({
        ok: false,
        error:
          "R2_PUBLIC_URL n'est pas configurée. Configurez le domaine public de votre stockage R2.",
      });
    }

    return res.status(200).json({
      ok: true,
      provider: "cloudflare-r2",

      uploadUrl,

      publicUrl,

      key,

      bucket:
        R2_BUCKET_NAME,

      expiresIn: 300,

      contentType,

      size,
    });
  } catch (error) {
    console.error(
      "[r2-upload]",
      error
    );

    return res
      .status(error?.status || 500)
      .json({
        ok: false,
        error:
          error?.message ||
          "Préparation R2 impossible",
      });
  }
}
