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
 * CLOUDFLARE R2 CONFIGURATION
 * ========================================================== */

const R2_ACCOUNT_ID =
  process.env.R2_ACCOUNT_ID || "";

const R2_BUCKET_NAME =
  process.env.R2_BUCKET_NAME || "";

const R2_ACCESS_KEY_ID =
  process.env.R2_ACCESS_KEY_ID || "";

const R2_SECRET_ACCESS_KEY =
  process.env.R2_SECRET_ACCESS_KEY || "";

const R2_PUBLIC_URL = String(
  process.env.R2_PUBLIC_URL || ""
).replace(/\/+$/, "");

/* ==========================================================
 * LIMITES
 * ========================================================== */

const MAX_SIZE =
  50 * 1024 * 1024;

/*
 * Dossiers autorisés dans R2.
 */
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
 * Types MIME autorisés.
 */
const ALLOWED_TYPES =
  new Set([
    // Images
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",
    "image/avif",

    // Vidéos
    "video/mp4",
    "video/webm",
    "video/quicktime",
    "video/ogg",

    // Audio
    "audio/mpeg",
    "audio/mp4",
    "audio/ogg",
    "audio/wav",
    "audio/webm",

    // Documents
    "application/pdf",
  ]);

/* ==========================================================
 * HELPERS
 * ========================================================== */

/**
 * Normalise un Content-Type.
 *
 * Exemple :
 *   image/jpeg; charset=utf-8
 *
 * devient :
 *   image/jpeg
 */
function normalizeContentType(value) {
  return String(
    value || "application/octet-stream"
  )
    .toLowerCase()
    .split(";")[0]
    .trim();
}

/**
 * Nettoie le nom du dossier.
 */
function safeFolder(folder) {
  const value = String(
    folder || "posts"
  )
    .trim()
    .toLowerCase();

  /*
   * On n'autorise que les dossiers explicitement
   * déclarés dans ALLOWED_FOLDERS.
   */
  return value;
}

/**
 * Nettoie le nom du fichier.
 *
 * On ne conserve jamais les chemins envoyés
 * par le navigateur.
 */
function safeName(name) {
  const value = String(
    name || "file"
  )
    .replace(
      /[\\/:*?"<>|\x00-\x1f]/g,
      "_"
    )
    .trim()
    .slice(0, 180);

  return value || "file";
}

/**
 * Récupère l'extension du fichier.
 */
function getExtension(name) {
  const safe = safeName(name);

  const match =
    safe.match(
      /\.([a-zA-Z0-9]{1,10})$/
    );

  return match
    ? `.${match[1].toLowerCase()}`
    : "";
}

/**
 * Génère un identifiant aléatoire.
 */
function randomId() {
  return crypto
    .randomBytes(16)
    .toString("hex");
}

/**
 * Génère la clé R2 finale.
 *
 * Exemple :
 *
 * posts/
 *   USER_UUID/
 *     1759141234567-a8c....jpg
 */
function createObjectKey({
  userId,
  folder,
  name,
}) {
  const timestamp =
    Date.now();

  const id =
    randomId();

  const extension =
    getExtension(name);

  return [
    folder,
    userId,
    `${timestamp}-${id}${extension}`,
  ].join("/");
}

/**
 * Encode chaque segment de la clé R2.
 *
 * On ne fait surtout pas encodeURIComponent()
 * sur toute la clé, sinon les "/" seraient encodés.
 */
function encodeObjectKey(key) {
  return String(key)
    .split("/")
    .map((part) =>
      encodeURIComponent(part)
    )
    .join("/");
}

/**
 * Construit l'URL publique R2.
 */
function createPublicUrl(key) {
  if (!R2_PUBLIC_URL) {
    return "";
  }

  return `${R2_PUBLIC_URL}/${encodeObjectKey(
    key
  )}`;
}

/**
 * Vérifie que la configuration R2 est complète.
 */
function validateR2Config() {
  if (
    !R2_ACCOUNT_ID ||
    !R2_BUCKET_NAME ||
    !R2_ACCESS_KEY_ID ||
    !R2_SECRET_ACCESS_KEY
  ) {
    const error =
      new Error(
        "Configuration Cloudflare R2 incomplète. Vérifie R2_ACCOUNT_ID, R2_BUCKET_NAME, R2_ACCESS_KEY_ID et R2_SECRET_ACCESS_KEY dans Vercel."
      );

    error.status = 500;

    throw error;
  }

  if (!R2_PUBLIC_URL) {
    const error =
      new Error(
        "R2_PUBLIC_URL manquante dans Vercel."
      );

    error.status = 500;

    throw error;
  }
}

/**
 * Client S3 compatible Cloudflare R2.
 */
function getR2Client() {
  validateR2Config();

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

    forcePathStyle: false,

    requestChecksumCalculation:
      "WHEN_REQUIRED",

    responseChecksumValidation:
      "WHEN_REQUIRED",
  });
}

/* ==========================================================
 * API HANDLER
 * ========================================================== */

export default async function handler(
  req,
  res
) {
  /*
   * CORS Vercel/API.
   *
   * Important :
   * ceci concerne la communication navigateur
   * → Vercel.
   *
   * Le CORS du bucket R2 doit également être configuré
   * pour le PUT navigateur → R2.
   */
  if (applyCors(req, res)) {
    return;
  }

  /* --------------------------------------------------------
   * METHOD
   * -------------------------------------------------------- */

  if (req.method !== "POST") {
    res.setHeader(
      "Allow",
      "POST, OPTIONS"
    );

    return res.status(405).json({
      ok: false,
      error:
        "Méthode non autorisée",
    });
  }

  try {
    /* ------------------------------------------------------
     * RATE LIMIT
     * ------------------------------------------------------ */

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
        .status(
          limit.status
        )
        .json(
          limit.body
        );
    }

    /* ------------------------------------------------------
     * R2 CONFIG
     * ------------------------------------------------------ */

    validateR2Config();

    /* ------------------------------------------------------
     * AUTHENTIFICATION SUPABASE
     * ------------------------------------------------------ */

    const admin =
      getAdminClient();

    const user =
      await requireUser(
        req,
        admin
      );

    if (!user?.id) {
      const error =
        new Error(
          "Utilisateur non authentifié"
        );

      error.status = 401;

      throw error;
    }

    /* ------------------------------------------------------
     * BODY
     * ------------------------------------------------------ */

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
      normalizeContentType(
        body.contentType
      );

    const size =
      Number(
        body.size || 0
      );

    /*
     * IMPORTANT :
     *
     * On utilise TOUJOURS user.id provenant
     * de Supabase.
     *
     * On ne fait pas confiance à body.userId.
     */
    const userId =
      user.id;

    /* ------------------------------------------------------
     * VALIDATION DOSSIER
     * ------------------------------------------------------ */

    if (
      !ALLOWED_FOLDERS.has(
        folder
      )
    ) {
      return res.status(400).json({
        ok: false,
        error:
          "Dossier média non autorisé.",
      });
    }

    /* ------------------------------------------------------
     * VALIDATION TAILLE
     * ------------------------------------------------------ */

    if (
      !Number.isFinite(size) ||
      size <= 0
    ) {
      return res.status(400).json({
        ok: false,
        error:
          "Taille de fichier invalide.",
      });
    }

    if (
      size > MAX_SIZE
    ) {
      return res.status(413).json({
        ok: false,
        error:
          "Fichier trop volumineux (maximum 50 Mo).",
      });
    }

    /* ------------------------------------------------------
     * VALIDATION TYPE
     * ------------------------------------------------------ */

    if (
      !ALLOWED_TYPES.has(
        contentType
      )
    ) {
      return res.status(400).json({
        ok: false,
        error:
          `Type de fichier non autorisé : ${contentType}`,
      });
    }

    /* ------------------------------------------------------
     * OBJECT KEY
     * ------------------------------------------------------ */

    const key =
      createObjectKey({
        userId,
        folder,
        name,
      });

    /* ------------------------------------------------------
     * R2 CLIENT
     * ------------------------------------------------------ */

    const r2 =
      getR2Client();

    /* ------------------------------------------------------
     * SIGNED PUT COMMAND
     * ------------------------------------------------------ */

    const command =
      new PutObjectCommand({
        Bucket:
          R2_BUCKET_NAME,

        Key:
          key,

        ContentType:
          contentType,
      });

    /*
     * URL valable 15 minutes.
     */
    const expiresIn =
      15 * 60;

    /*
     * Le Content-Type est signé.
     *
     * Le navigateur devra donc envoyer
     * exactement le même Content-Type.
     */
    const uploadUrl =
      await getSignedUrl(
        r2,
        command,
        {
          expiresIn,

          signableHeaders:
            new Set([
              "content-type",
            ]),
        }
      );

    /* ------------------------------------------------------
     * PUBLIC URL
     * ------------------------------------------------------ */

    const publicUrl =
      createPublicUrl(
        key
      );

    if (!publicUrl) {
      const error =
        new Error(
          "Impossible de construire l'URL publique R2."
        );

      error.status = 500;

      throw error;
    }

    /* ------------------------------------------------------
     * RESPONSE
     * ------------------------------------------------------ */

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

      expiresIn,
    });
  } catch (error) {
    console.error(
      "[r2-upload] Erreur:",
      error
    );

    const status =
      Number(
        error?.status
      ) || 500;

    return res
      .status(status)
      .json({
        ok: false,

        error:
          error?.message ||
          "Préparation R2 impossible.",
      });
  }
}
