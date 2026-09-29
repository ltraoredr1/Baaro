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

/* =========================================================
   CLOUDFLARE R2 CONFIGURATION
   ========================================================= */

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

/*
 * Limite serveur :
 * 50 Mo par fichier.
 */
const MAX_SIZE =
  50 * 1024 * 1024;

/*
 * Dossiers R2 autorisés.
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
 * Types de fichiers autorisés.
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

/* =========================================================
   HELPERS
   ========================================================= */

function normalizeContentType(
  value
) {
  const type = String(
    value ||
      "application/octet-stream"
  )
    .toLowerCase()
    .split(";")[0]
    .trim();

  return type;
}

function safeFolder(folder) {
  const value =
    String(
      folder || "posts"
    )
      .toLowerCase()
      .replace(
        /[^a-z0-9_-]/g,
        ""
      );

  return (
    value || "posts"
  );
}

function safeName(name) {
  const value =
    String(
      name || "file"
    )
      .replace(
        /[\\/:*?"<>|\x00-\x1f]/g,
        "_"
      )
      .trim()
      .slice(0, 180);

  return (
    value || "file"
  );
}

function getExtension(name) {
  const cleanName =
    safeName(name);

  const match =
    cleanName.match(
      /\.([a-zA-Z0-9]{1,10})$/
    );

  if (!match) {
    return "";
  }

  return (
    "." +
    match[1].toLowerCase()
  );
}

function randomId() {
  return crypto
    .randomBytes(16)
    .toString("hex");
}

/* =========================================================
   R2 OBJECT KEY
   ========================================================= */

/*
 * Exemple :
 *
 * posts/
 *   user-uuid/
 *     1759150000000-a8f3...jpg
 *
 * L'ID utilisateur provient exclusivement
 * de la session Supabase vérifiée.
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

/* =========================================================
   URL PUBLIQUE R2
   ========================================================= */

function encodeObjectKey(
  key
) {
  return key
    .split("/")
    .map((part) =>
      encodeURIComponent(part)
    )
    .join("/");
}

function createPublicUrl(
  key
) {
  if (!R2_PUBLIC_URL) {
    return "";
  }

  return (
    `${R2_PUBLIC_URL}/${encodeObjectKey(
      key
    )}`
  );
}

/* =========================================================
   R2 CLIENT
   ========================================================= */

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

/* =========================================================
   HTTP HANDLER
   ========================================================= */

export default async function handler(
  req,
  res
) {
  /*
   * CORS.
   */
  if (
    applyCors(
      req,
      res
    )
  ) {
    return;
  }

  /*
   * Cette route prépare uniquement
   * une URL PUT présignée.
   */
  if (
    req.method !== "POST"
  ) {
    return res
      .status(405)
      .json({
        ok: false,
        error:
          "Méthode non autorisée",
      });
  }

  try {
    /* =====================================================
       RATE LIMIT
       ===================================================== */

    const limit =
      await rateLimitAsync(
        req,
        {
          key: "r2-media",
          max: 30,
          windowMs: 60_000,
        }
      );

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

    /* =====================================================
       CONFIGURATION
       ===================================================== */

    if (
      !R2_ACCOUNT_ID ||
      !R2_BUCKET_NAME ||
      !R2_ACCESS_KEY_ID ||
      !R2_SECRET_ACCESS_KEY
    ) {
      throw new Error(
        "Configuration Cloudflare R2 manquante. Vérifie R2_ACCOUNT_ID, R2_BUCKET_NAME, R2_ACCESS_KEY_ID et R2_SECRET_ACCESS_KEY dans Vercel."
      );
    }

    if (!R2_PUBLIC_URL) {
      throw new Error(
        "R2_PUBLIC_URL manquante dans Vercel."
      );
    }

    /* =====================================================
       AUTHENTIFICATION SUPABASE
       ===================================================== */

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

    /* =====================================================
       BODY
       ===================================================== */

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

    /* =====================================================
       VALIDATION DOSSIER
       ===================================================== */

    if (
      !ALLOWED_FOLDERS.has(
        folder
      )
    ) {
      return res
        .status(400)
        .json({
          ok: false,
          error:
            "Dossier média non autorisé",
        });
    }

    /* =====================================================
       VALIDATION TAILLE
       ===================================================== */

    if (
      !Number.isFinite(
        size
      ) ||
      size <= 0
    ) {
      return res
        .status(400)
        .json({
          ok: false,
          error:
            "Taille de fichier invalide",
        });
    }

    if (
      size > MAX_SIZE
    ) {
      return res
        .status(413)
        .json({
          ok: false,
          error:
            "Fichier trop volumineux (max 50 Mo)",
        });
    }

    /* =====================================================
       VALIDATION TYPE MIME
       ===================================================== */

    if (
      !ALLOWED_TYPES.has(
        contentType
      )
    ) {
      return res
        .status(400)
        .json({
          ok: false,
          error:
            `Type de fichier non autorisé: ${contentType}`,
        });
    }

    /* =====================================================
       CRÉATION DE LA CLÉ R2
       ===================================================== */

    const key =
      createObjectKey({
        userId:
          user.id,

        folder,

        name,
      });

    /* =====================================================
       CLIENT R2
       ===================================================== */

    const r2 =
      getR2Client();

    /* =====================================================
       COMMANDE PUT
       ===================================================== */

    const command =
      new PutObjectCommand({
        Bucket:
          R2_BUCKET_NAME,

        Key:
          key,

        ContentType:
          contentType,
      });

    /* =====================================================
       URL PRÉSIGNÉE
       ===================================================== */

    /*
     * 15 minutes.
     *
     * Le fichier n'est PAS envoyé à Vercel.
     * Le navigateur envoie directement
     * le fichier vers Cloudflare R2.
     */

    const expiresIn =
      900;

    const uploadUrl =
      await getSignedUrl(
        r2,
        command,
        {
          expiresIn,
        }
      );

    /* =====================================================
       URL PUBLIQUE
       ===================================================== */

    const publicUrl =
      createPublicUrl(
        key
      );

    if (!publicUrl) {
      throw new Error(
        "Impossible de construire l'URL publique R2"
      );
    }

    /* =====================================================
       RÉPONSE
       ===================================================== */

    return res
      .status(200)
      .json({
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
          "Préparation R2 impossible",
      });
  }
}
