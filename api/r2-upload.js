import {
  S3Client,
  PutObjectCommand,
} from "@aws-sdk/client-s3";

import {
  getSignedUrl,
} from "@aws-sdk/s3-request-presigner";

import crypto from "node:crypto";

import {
  applyCors,
  getAdminClient,
  requireUser,
  rateLimitAsync,
} from "./_shared.js";

/* ==========================================================
 * CLOUDFLARE R2
 * ========================================================== */

const R2_ACCOUNT_ID =
  process.env.R2_ACCOUNT_ID || "";

const R2_BUCKET_NAME =
  process.env.R2_BUCKET_NAME || "";

const R2_ACCESS_KEY_ID =
  process.env.R2_ACCESS_KEY_ID || "";

const R2_SECRET_ACCESS_KEY =
  process.env.R2_SECRET_ACCESS_KEY || "";

const R2_PUBLIC_URL =
  String(
    process.env.R2_PUBLIC_URL || ""
  ).replace(/\/$/, "");

/* ==========================================================
 * LIMITES
 * ========================================================== */

const MAX_SIZE =
  50 * 1024 * 1024;

const ALLOWED_FOLDERS =
  new Set([
    "posts",
    "videos",
    "stories",
    "profiles",
    "shop",
    "chat",
  ]);

/*
 * Types autorisés.
 *
 * BAARO utilise actuellement principalement
 * les images et vidéos.
 */
function isAllowedContentType(
  contentType
) {
  const type =
    String(contentType || "")
      .toLowerCase()
      .split(";")[0]
      .trim();

  return (
    type.startsWith("image/") ||
    type.startsWith("video/") ||
    type.startsWith("audio/") ||
    type === "application/pdf"
  );
}

/* ==========================================================
 * UTILITAIRES
 * ========================================================== */

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

function safeName(name) {
  const value =
    String(name || "file")
      .replace(
        /[\\/:*?"<>|\x00-\x1f]/g,
        "_"
      )
      .trim()
      .slice(0, 180);

  return value || "file";
}

function randomId() {
  return crypto
    .randomBytes(16)
    .toString("hex");
}

/*
 * Garde uniquement l'extension du fichier.
 *
 * Exemple :
 * photo.jpg
 * → .jpg
 */
function getExtension(name) {
  const clean =
    safeName(name);

  const match =
    clean.match(
      /\.([a-zA-Z0-9]{1,10})$/
    );

  if (!match) {
    return "";
  }

  return `.${match[1].toLowerCase()}`;
}

/*
 * Création d'une clé unique dans R2.
 *
 * Exemple :
 *
 * posts/
 *   UUID_UTILISATEUR/
 *     1759140000000-a8f...jpg
 */
function createObjectKey({
  userId,
  folder,
  name,
}) {
  const extension =
    getExtension(name);

  return [
    folder,
    userId,
    `${Date.now()}-${randomId()}${extension}`,
  ].join("/");
}

function encodeObjectKey(key) {
  return key
    .split("/")
    .map((part) =>
      encodeURIComponent(part)
    )
    .join("/");
}

function createPublicUrl(key) {
  if (!R2_PUBLIC_URL) {
    return "";
  }

  return `${R2_PUBLIC_URL}/${encodeObjectKey(key)}`;
}

/* ==========================================================
 * CLIENT R2
 * ========================================================== */

function getR2Client() {
  if (
    !R2_ACCOUNT_ID ||
    !R2_ACCESS_KEY_ID ||
    !R2_SECRET_ACCESS_KEY
  ) {
    throw new Error(
      "Configuration Cloudflare R2 incomplète"
    );
  }

  return new S3Client({
    region: "auto",

    endpoint:
      `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,

    credentials: {
      accessKeyId:
        R2_ACCESS_KEY_ID,

      secretAccessKey:
        R2_SECRET_ACCESS_KEY,
    },
  });
}

/* ==========================================================
 * HANDLER VERCEL
 * ========================================================== */

export default async function handler(
  req,
  res
) {
  /*
   * CORS partagé BAARO.
   */
  if (applyCors(req, res)) {
    return;
  }

  /*
   * Cette route prépare uniquement
   * les uploads.
   */
  if (req.method !== "POST") {
    return res.status(405).json({
      ok: false,
      error:
        "Méthode non autorisée",
    });
  }

  try {
    /* ======================================================
     * RATE LIMIT
     * ====================================================== */

    const limit =
      await rateLimitAsync(req, {
        key: "r2-media",
        max: 30,
        windowMs: 60_000,
      });

    if (!limit.ok) {
      Object.entries(
        limit.headers || {}
      ).forEach(
        ([key, value]) => {
          res.setHeader(
            key,
            value
          );
        }
      );

      return res
        .status(limit.status)
        .json(limit.body);
    }

    /* ======================================================
     * CONFIGURATION
     * ====================================================== */

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

    if (!R2_PUBLIC_URL) {
      throw new Error(
        "R2_PUBLIC_URL manquante"
      );
    }

    /* ======================================================
     * AUTHENTIFICATION SUPABASE
     * ====================================================== */

    const admin =
      getAdminClient();

    const user =
      await requireUser(
        req,
        admin
      );

    /* ======================================================
     * DONNÉES
     * ====================================================== */

    const body =
      req.body || {};

    const folder =
      safeFolder(
        body.folder
      );

    const name =
      safeName(
        body.name
      );

    const contentType =
      String(
        body.contentType ||
          "application/octet-stream"
      )
        .toLowerCase()
        .split(";")[0]
        .trim();

    const size =
      Number(
        body.size || 0
      );

    /* ======================================================
     * VALIDATION DOSSIER
     * ====================================================== */

    if (
      !ALLOWED_FOLDERS.has(
        folder
      )
    ) {
      return res.status(400).json({
        ok: false,
        error:
          "Dossier média non autorisé",
      });
    }

    /* ======================================================
     * VALIDATION TAILLE
     * ====================================================== */

    if (
      !Number.isFinite(size) ||
      size <= 0
    ) {
      return res.status(400).json({
        ok: false,
        error:
          "Taille de fichier invalide",
      });
    }

    if (
      size > MAX_SIZE
    ) {
      return res.status(413).json({
        ok: false,
        error:
          "Fichier trop volumineux (max 50 Mo)",
      });
    }

    /* ======================================================
     * VALIDATION TYPE
     * ====================================================== */

    if (
      !isAllowedContentType(
        contentType
      )
    ) {
      return res.status(400).json({
        ok: false,
        error:
          "Type de fichier non autorisé",
      });
    }

    /* ======================================================
     * CLÉ R2
     * ====================================================== */

    /*
     * IMPORTANT :
     *
     * On n'utilise PAS body.userId pour construire
     * le chemin.
     *
     * On utilise l'utilisateur réellement authentifié
     * par Supabase.
     */
    const key =
      createObjectKey({
        userId:
          user.id,
        folder,
        name,
      });

    /* ======================================================
     * CLIENT R2
     * ====================================================== */

    const r2 =
      getR2Client();

    /* ======================================================
     * COMMANDE PUT
     * ====================================================== */

    const command =
      new PutObjectCommand({
        Bucket:
          R2_BUCKET_NAME,

        Key:
          key,

        ContentType:
          contentType,
      });

    /* ======================================================
     * URL PRÉSIGNÉE
     * ====================================================== */

    /*
     * 5 minutes.
     *
     * Le navigateur devra utiliser cette URL
     * avec :
     *
     * PUT
     * Content-Type: même type MIME
     * Body: fichier
     */
    const uploadUrl =
      await getSignedUrl(
        r2,
        command,
        {
          expiresIn: 300,
        }
      );

    /* ======================================================
     * URL PUBLIQUE
     * ====================================================== */

    const publicUrl =
      createPublicUrl(
        key
      );

    if (!publicUrl) {
      throw new Error(
        "Impossible de construire l'URL publique R2"
      );
    }

    /* ======================================================
     * RÉPONSE
     * ====================================================== */

    return res.status(200).json({
      ok: true,

      provider:
        "cloudflare-r2",

      uploadUrl,

      publicUrl,

      key,

      bucket:
        R2_BUCKET_NAME,

      contentType,

      size,

      expiresIn:
        300,
    });
  } catch (error) {
    console.error(
      "[r2-upload]",
      error
    );

    return res
      .status(
        error?.status || 500
      )
      .json({
        ok: false,

        error:
          error?.message ||
          "Préparation R2 impossible",
      });
  }
}
