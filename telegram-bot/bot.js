const { Telegraf } = require('telegraf');
const express = require('express');
require('dotenv').config();

<<<<<<< HEAD
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHANNEL_ID = process.env.TELEGRAM_CHANNEL_ID;

if (!BOT_TOKEN || !CHANNEL_ID) {
  console.error('❌ ERREUR: Variables manquantes dans .env');
  process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN);
=======
const crypto = require("node:crypto");
const express = require("express");
const { Telegraf } = require("telegraf");

/* =========================================================
   CONFIGURATION
   ========================================================= */

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHANNEL_ID = process.env.TELEGRAM_CHANNEL_ID;
const API_SECRET = process.env.TELEGRAM_API_SECRET;

const PUBLIC_BASE_URL = String(
  process.env.PUBLIC_BASE_URL || ""
).replace(/\/$/, "");

const PORT = Number(process.env.PORT || 3000);

const MAX_SIZE = 50 * 1024 * 1024;

/* =========================================================
   ORIGINES CORS AUTORISÉES
   ========================================================= */

const ALLOWED_ORIGINS = new Set(
  (
    process.env.ALLOWED_ORIGINS ||
    [
      "https://baaro-xi.vercel.app",
      "http://localhost:5173",
      "http://localhost:3000",
      "http://127.0.0.1:5173",
      "http://127.0.0.1:3000",
    ].join(",")
  )
    .split(",")
    .map((value) => value.trim().replace(/\/$/, ""))
    .filter(Boolean)
);

/* =========================================================
   VÉRIFICATION ENV
   ========================================================= */

if (!TOKEN) {
  throw new Error(
    "TELEGRAM_BOT_TOKEN est manquant."
  );
}

if (!CHANNEL_ID) {
  throw new Error(
    "TELEGRAM_CHANNEL_ID est manquant."
  );
}

if (!API_SECRET) {
  throw new Error(
    "TELEGRAM_API_SECRET est manquant."
  );
}

if (!PUBLIC_BASE_URL) {
  throw new Error(
    "PUBLIC_BASE_URL est manquant."
  );
}

/* =========================================================
   INITIALISATION
   ========================================================= */

const bot = new Telegraf(TOKEN);
>>>>>>> f034ceea0f0f2f1c9189e479a5b112dc35008a92
const app = express();
app.use(express.json());

<<<<<<< HEAD
const fileRegistry = new Map();

bot.start((ctx) => {
  ctx.reply(
    `👋 Bienvenue sur BAARO Media Storage!\n\n` +
    `📎 Envoyez des fichiers à stocker de manière sécurisée\n\n` +
    `Commandes:\n` +
    `/help - Aide\n` +
    `/storage - Espace utilisé\n` +
    `/stats - Statistiques\n\n` +
    `🔐 Chiffrement E2E!`
=======
app.disable("x-powered-by");

/* =========================================================
   CORS + LOGS DE DIAGNOSTIC
   ========================================================= */

function applyCors(req, res) {
  const origin = req.headers.origin || "";

  const normalizedOrigin = String(origin)
    .trim()
    .replace(/\/$/, "");

  const allowed =
    !normalizedOrigin ||
    ALLOWED_ORIGINS.has(normalizedOrigin);

  console.log("");
  console.log("========== BAARO REQUEST ==========");
  console.log("METHOD :", req.method);
  console.log("PATH   :", req.path);
  console.log("ORIGIN :", normalizedOrigin || "(aucune)");
  console.log("ALLOWED:", allowed);
  console.log("===================================");

  if (
    normalizedOrigin &&
    ALLOWED_ORIGINS.has(normalizedOrigin)
  ) {
    res.setHeader(
      "Access-Control-Allow-Origin",
      normalizedOrigin
    );

    res.setHeader("Vary", "Origin");

    res.setHeader(
      "Access-Control-Allow-Methods",
      "GET, PUT, OPTIONS"
    );

    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization"
    );

    res.setHeader(
      "Access-Control-Expose-Headers",
      "Content-Length, Content-Range, Accept-Ranges"
    );

    res.setHeader(
      "Access-Control-Max-Age",
      "86400"
    );

    console.log(
      "[CORS] Origin autorisée:",
      normalizedOrigin
    );
  } else if (normalizedOrigin) {
    console.log(
      "[CORS] Origin NON autorisée:",
      normalizedOrigin
    );

    console.log(
      "[CORS] Origins autorisées:",
      [...ALLOWED_ORIGINS]
    );
  }

  /*
   * Preflight envoyé par le navigateur
   * avant PUT /api/upload.
   */
  if (req.method === "OPTIONS") {
    console.log("[CORS] OPTIONS reçu");

    if (allowed) {
      console.log(
        "[CORS] OPTIONS autorisé -> 204"
      );

      res.status(204).end();
      return true;
    }

    console.log(
      "[CORS] OPTIONS REFUSÉ -> 403"
    );

    res.status(403).json({
      ok: false,
      error: "Origin non autorisée",
    });

    return true;
  }

  return false;
}

/* =========================================================
   MIDDLEWARE CORS
   ========================================================= */

app.use((req, res, next) => {
  const handled = applyCors(req, res);

  if (handled) {
    return;
  }

  next();
});

/* =========================================================
   JSON
   ========================================================= */

app.use(
  express.json({
    limit: "1mb",
  })
);

/* =========================================================
   OUTILS
   ========================================================= */

function cleanName(name) {
  return (
    String(name || "file")
      .replace(
        /[\\/:*?"<>|\x00-\x1f]/g,
        "_"
      )
      .slice(0, 180) || "file"
>>>>>>> f034ceea0f0f2f1c9189e479a5b112dc35008a92
  );
});

<<<<<<< HEAD
bot.command('help', (ctx) => {
  ctx.reply(
    `📚 Aide BAARO Bot\n\n` +
    `1️⃣ Envoyez un fichier (image, vidéo, doc)\n` +
    `2️⃣ Le bot le stocke en sécurité\n` +
    `3️⃣ Recevez une URL public\n\n` +
    `Chiffré E2E - Bot ne voit pas le contenu`
=======
function base64url(value) {
  return Buffer.from(value).toString(
    "base64url"
  );
}

/* =========================================================
   VÉRIFICATION TOKEN
   ========================================================= */

function verifyToken(token) {
  console.log(
    "[TOKEN] Vérification du token..."
  );

  const [body, signature] =
    String(token || "").split(".");

  if (!body || !signature) {
    throw new Error(
      "Jeton invalide"
    );
  }

  const expected = crypto
    .createHmac(
      "sha256",
      API_SECRET
    )
    .update(body)
    .digest("base64url");

  const signatureBuffer =
    Buffer.from(signature);

  const expectedBuffer =
    Buffer.from(expected);

  if (
    signatureBuffer.length !==
      expectedBuffer.length ||
    !crypto.timingSafeEqual(
      signatureBuffer,
      expectedBuffer
    )
  ) {
    console.log(
      "[TOKEN] Signature invalide"
    );

    throw new Error(
      "Signature invalide"
    );
  }

  let payload;

  try {
    payload = JSON.parse(
      Buffer.from(
        body,
        "base64url"
      ).toString("utf8")
    );
  } catch (error) {
    console.error(
      "[TOKEN] JSON invalide:",
      error
    );

    throw new Error(
      "Jeton malformé"
    );
  }

  if (
    !payload.exp ||
    Number(payload.exp) <
      Math.floor(Date.now() / 1000)
  ) {
    console.log(
      "[TOKEN] Token expiré"
    );

    throw new Error(
      "Jeton expiré"
    );
  }

  console.log(
    "[TOKEN] Token valide"
>>>>>>> f034ceea0f0f2f1c9189e479a5b112dc35008a92
  );
});

<<<<<<< HEAD
bot.command('storage', (ctx) => {
  const totalSize = Array.from(fileRegistry.values()).reduce(
    (sum, file) => sum + (file.size || 0), 0
  );
  const sizeInMB = (totalSize / (1024 * 1024)).toFixed(2);
  ctx.reply(`📊 Espace utilisé: ${sizeInMB} MB\nFichiers: ${fileRegistry.size}`);
});
=======
  console.log(
    "[TOKEN] userId:",
    payload.userId || "(absent)"
  );

  console.log(
    "[TOKEN] filename:",
    payload.filename || "(absent)"
  );

  console.log(
    "[TOKEN] contentType:",
    payload.contentType || "(absent)"
  );

  console.log(
    "[TOKEN] size:",
    payload.size || "(absent)"
  );
>>>>>>> f034ceea0f0f2f1c9189e479a5b112dc35008a92

bot.command('stats', (ctx) => {
  const files = Array.from(fileRegistry.values());
  const count = files.length;
  const totalSize = files.reduce((sum, f) => sum + (f.size || 0), 0);
  const avgSize = count > 0 ? (totalSize / count / 1024).toFixed(1) : 0;
  ctx.reply(
    `📈 Statistiques:\n\n` +
    `Total fichiers: ${count}\n` +
    `Taille moyenne: ${avgSize} KB\n` +
    `Espace total: ${(totalSize / (1024 * 1024)).toFixed(2)} MB`
  );
});

<<<<<<< HEAD
bot.on('document', async (ctx) => {
  try {
    const file = ctx.message.document;
    const fileId = file.file_unique_id;
    const fileName = file.file_name || `file-${fileId.slice(0, 8)}`;
    const fileSize = file.file_size;

    console.log(`📥 Upload: ${fileName} (${(fileSize / 1024).toFixed(1)} KB)`);

    const fileLink = await ctx.telegram.getFileLink(file.file_id);
    const response = await fetch(fileLink.href);
    const buffer = await response.buffer();

    const messageInChannel = await ctx.telegram.sendDocument(
      CHANNEL_ID,
      { source: buffer, filename: fileName },
      {
        caption: JSON.stringify({
          name: fileName,
          uploadedAt: new Date().toISOString(),
          size: fileSize,
          encrypted: true,
        }),
      }
    );

    const messageId = messageInChannel.message_id;
    const channelNum = Math.abs(CHANNEL_ID).toString().slice(3);
    const publicUrl = `https://t.me/c/${channelNum}/${messageId}`;

    fileRegistry.set(fileId, {
      name: fileName,
      uploadedAt: new Date().toISOString(),
      size: fileSize,
      messageId: messageId,
      url: publicUrl,
    });

    ctx.reply(
      `✅ Fichier uploadé!\n\n` +
      `📎 ${fileName}\n` +
      `📏 ${(fileSize / 1024).toFixed(1)} KB\n\n` +
      `🔗 URL: <code>${publicUrl}</code>`,
      { parse_mode: 'HTML' }
    );

    console.log(`✅ Stocké: ${publicUrl}`);
  } catch (error) {
    console.error('❌ Erreur:', error);
    ctx.reply('❌ Erreur upload. Réessayez.');
  }
});

app.get('/api/files', (req, res) => {
  const files = Array.from(fileRegistry.values());
  res.json({ success: true, files, count: files.length });
});

app.get('/api/stats', (req, res) => {
  const totalSize = Array.from(fileRegistry.values()).reduce(
    (sum, f) => sum + (f.size || 0), 0
  );
  res.json({
    success: true,
    totalFiles: fileRegistry.size,
    totalSizeMB: (totalSize / (1024 * 1024)).toFixed(2),
  });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime(), files: fileRegistry.size });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`📡 API sur http://localhost:${PORT}`);
});

bot.launch({
  allowedUpdates: ['message', 'callback_query'],
  dropPendingUpdates: true,
});

console.log('\n✅ BAARO Telegram Bot LANCÉ');
console.log(`🤖 Bot: @Lassinedrbot`);
console.log(`📦 Channel: ${CHANNEL_ID}`);
console.log(`🚀 Prêt!\n`);

process.once('SIGINT', () => {
  console.log('\n👋 Bot arrêté');
  bot.stop('SIGINT');
});

process.once('SIGTERM', () => {
  console.log('\n👋 Bot arrêté');
  bot.stop('SIGTERM');
});
=======
/* =========================================================
   TOKEN MÉDIA PUBLIC
   ========================================================= */

function signMediaToken(
  fileId,
  filename,
  contentType
) {
  const payload = {
    v: 1,

    exp:
      Math.floor(Date.now() / 1000) +
      30 * 24 * 60 * 60,

    fileId,

    filename: cleanName(
      filename
    ),

    contentType:
      contentType ||
      "application/octet-stream",
  };

  const body = base64url(
    JSON.stringify(payload)
  );

  const signature = crypto
    .createHmac(
      "sha256",
      API_SECRET
    )
    .update(body)
    .digest("base64url");

  return `${body}.${signature}`;
}

/* =========================================================
   HEALTH
   ========================================================= */

app.get("/health", (_req, res) => {
  console.log(
    "[HEALTH] OK"
  );

  res.json({
    status: "ok",
    uptime: process.uptime(),
    files: 0,
  });
});

/* =========================================================
   ROUTE RACINE
   ========================================================= */

app.get("/", (_req, res) => {
  console.log(
    "[ROOT] API Telegram accessible"
  );

  res.json({
    ok: true,
    service:
      "BAARO Telegram Media API",
    status: "online",
  });
});

/* =========================================================
   UPLOAD
   ========================================================= */

app.put(
  "/api/upload",
  async (req, res) => {
    console.log("");
    console.log(
      "========== UPLOAD BAARO =========="
    );

    try {
      console.log(
        "[UPLOAD] Début de l'upload"
      );

      console.log(
        "[UPLOAD] Content-Type:",
        req.headers["content-type"]
      );

      console.log(
        "[UPLOAD] Content-Length:",
        req.headers["content-length"] ||
          "(absent)"
      );

      console.log(
        "[UPLOAD] URL:",
        req.originalUrl
      );

      /* -------------------------------------
         TOKEN
      ------------------------------------- */

      const payload =
        verifyToken(
          req.query?.token
        );

      /* -------------------------------------
         TAILLE ATTENDUE
      ------------------------------------- */

      const expectedSize =
        Number(
          payload.size || 0
        );

      console.log(
        "[UPLOAD] Taille attendue:",
        expectedSize
      );

      const chunks = [];

      let total = 0;
      let tooLarge = false;

      /* -------------------------------------
         RÉCEPTION DU FICHIER
      ------------------------------------- */

      req.on("data", (chunk) => {
        total += chunk.length;

        console.log(
          "[UPLOAD] Données reçues:",
          total,
          "octets"
        );

        if (
          total <= MAX_SIZE
        ) {
          chunks.push(chunk);
        } else {
          tooLarge = true;
        }
      });

      req.on("end", async () => {
        console.log(
          "[UPLOAD] Réception terminée"
        );

        console.log(
          "[UPLOAD] Taille réelle:",
          total
        );

        try {
          /* ---------------------------------
             LIMITE
          --------------------------------- */

          if (
            tooLarge ||
            total > MAX_SIZE
          ) {
            console.log(
              "[UPLOAD] Fichier trop volumineux"
            );

            return res
              .status(413)
              .json({
                ok: false,
                error:
                  "Fichier trop volumineux (max 50 Mo)",
              });
          }

          /* ---------------------------------
             VÉRIFICATION TAILLE
          --------------------------------- */

          if (
            expectedSize &&
            total !== expectedSize
          ) {
            console.log(
              "[UPLOAD] ERREUR taille"
            );

            console.log(
              "Attendue:",
              expectedSize
            );

            console.log(
              "Reçue:",
              total
            );

            return res
              .status(400)
              .json({
                ok: false,
                error:
                  "Taille du fichier différente de celle signée",
              });
          }

          /* ---------------------------------
             FICHIER VIDE
          --------------------------------- */

          if (!total) {
            console.log(
              "[UPLOAD] Fichier vide"
            );

            return res
              .status(400)
              .json({
                ok: false,
                error:
                  "Fichier vide",
              });
          }

          /* ---------------------------------
             FICHIER
          --------------------------------- */

          const filename =
            cleanName(
              payload.filename
            );

          const buffer =
            Buffer.concat(
              chunks
            );

          console.log(
            "[UPLOAD] Nom:",
            filename
          );

          console.log(
            "[UPLOAD] Taille buffer:",
            buffer.length
          );

          /* ---------------------------------
             CAPTION TELEGRAM
          --------------------------------- */

          const caption = [
            "BAARO_MEDIA",
            `folder=${
              payload.folder ||
              "posts"
            }`,
            `user=${
              payload.userId ||
              ""
            }`,
            `name=${filename}`,
            `type=${
              payload.contentType ||
              "application/octet-stream"
            }`,
          ].join("\n");

          console.log(
            "[TELEGRAM] Envoi vers Telegram..."
          );

          console.log(
            "[TELEGRAM] Channel:",
            CHANNEL_ID
          );

          /* ---------------------------------
             TELEGRAM
          --------------------------------- */

          const message =
            await bot.telegram.sendDocument(
              CHANNEL_ID,
              {
                source: buffer,
                filename,
              },
              {
                caption,
              }
            );

          console.log(
            "[TELEGRAM] Message envoyé"
          );

          const fileId =
            message.document?.file_id;

          if (!fileId) {
            throw new Error(
              "Telegram n'a pas retourné de file_id"
            );
          }

          console.log(
            "[TELEGRAM] file_id reçu"
          );

          /* ---------------------------------
             URL PUBLIQUE
          --------------------------------- */

          const mediaToken =
            signMediaToken(
              fileId,
              filename,
              payload.contentType
            );

          const publicUrl =
            `${PUBLIC_BASE_URL}/api/file?token=${encodeURIComponent(
              mediaToken
            )}`;

          console.log(
            "[UPLOAD] Upload terminé avec succès"
          );

          console.log(
            "[UPLOAD] Public URL générée"
          );

          console.log(
            "=================================="
          );

          return res.json({
            ok: true,
            provider:
              "telegram",
            fileId,
            publicUrl,
            filename,
            contentType:
              payload.contentType ||
              "application/octet-stream",
            size: total,
          });
        } catch (error) {
          console.error(
            "[UPLOAD] ERREUR:",
            error
          );

          console.log(
            "=================================="
          );

          return res
            .status(500)
            .json({
              ok: false,
              error:
                error?.message ||
                "Upload Telegram impossible",
            });
        }
      });

      req.on(
        "error",
        (error) => {
          console.error(
            "[UPLOAD REQUEST ERROR]",
            error
          );

          if (
            !res.headersSent
          ) {
            res
              .status(500)
              .json({
                ok: false,
                error:
                  "Erreur pendant la réception du fichier",
              });
          }
        }
      );
    } catch (error) {
      console.error(
        "[UPLOAD TOKEN ERROR]",
        error
      );

      console.log(
        "=================================="
      );

      return res
        .status(401)
        .json({
          ok: false,
          error:
            error?.message ||
            "Jeton upload invalide",
        });
    }
  }
);

/* =========================================================
   SERVIR LES FICHIERS
   ========================================================= */

app.get(
  "/api/file",
  async (req, res) => {
    console.log("");
    console.log(
      "========== FILE REQUEST =========="
    );

    try {
      const payload =
        verifyToken(
          req.query?.token
        );

      console.log(
        "[FILE] fileId:",
        payload.fileId
      );

      const file =
        await bot.telegram.getFile(
          payload.fileId
        );

      if (!file?.file_path) {
        throw new Error(
          "Fichier Telegram introuvable"
        );
      }

      console.log(
        "[FILE] Telegram path:",
        file.file_path
      );

      const telegramUrl =
        `https://api.telegram.org/file/bot${TOKEN}/${file.file_path}`;

      const headers = {};

      if (
        req.headers.range
      ) {
        headers.Range =
          req.headers.range;

        console.log(
          "[FILE] Range:",
          req.headers.range
        );
      }

      console.log(
        "[FILE] Téléchargement depuis Telegram..."
      );

      const upstream =
        await fetch(
          telegramUrl,
          {
            headers,
          }
        );

      console.log(
        "[FILE] Telegram status:",
        upstream.status
      );

      if (!upstream.ok) {
        return res
          .status(upstream.status)
          .send(
            "Média Telegram indisponible"
          );
      }

      res.status(
        upstream.status
      );

      res.setHeader(
        "Content-Type",
        payload.contentType ||
          "application/octet-stream"
      );

      res.setHeader(
        "Cache-Control",
        "public, max-age=2592000, immutable"
      );

      res.setHeader(
        "Accept-Ranges",
        "bytes"
      );

      const contentLength =
        upstream.headers.get(
          "content-length"
        );

      const contentRange =
        upstream.headers.get(
          "content-range"
        );

      if (contentLength) {
        res.setHeader(
          "Content-Length",
          contentLength
        );
      }

      if (contentRange) {
        res.setHeader(
          "Content-Range",
          contentRange
        );
      }

      const reader =
        upstream.body?.getReader();

      if (!reader) {
        return res.end();
      }

      try {
        while (true) {
          const {
            done,
            value,
          } =
            await reader.read();

          if (done) {
            break;
          }

          res.write(
            Buffer.from(value)
          );
        }
      } finally {
        reader.releaseLock();
      }

      console.log(
        "[FILE] Média envoyé avec succès"
      );

      return res.end();
    } catch (error) {
      console.error(
        "[FILE] ERREUR:",
        error
      );

      return res
        .status(404)
        .send(
          "Média Telegram introuvable"
        );
    }
  }
);

/* =========================================================
   BOT TELEGRAM
   ========================================================= */

bot.start((ctx) => {
  console.log(
    "[BOT] /start reçu"
  );

  ctx.reply(
    "BAARO Media Bot actif."
  );
});

bot.command(
  "health",
  (ctx) => {
    console.log(
      "[BOT] /health reçu"
    );

    ctx.reply(
      "BAARO Media Bot: OK"
    );
  }
);

bot.catch((error) => {
  console.error(
    "[TELEGRAM BOT ERROR]",
    error
  );
});

/* =========================================================
   DÉMARRAGE TELEGRAM
   ========================================================= */

bot
  .launch({
    allowedUpdates: [
      "message",
      "channel_post",
    ],
    dropPendingUpdates: true,
  })
  .then(() => {
    console.log("");
    console.log(
      "======================================"
    );
    console.log(
      "BAARO Telegram Bot LANCÉ"
    );
    console.log(
      "Bot Telegram: actif"
    );
    console.log(
      "Channel:",
      CHANNEL_ID
    );
    console.log(
      "======================================"
    );
  })
  .catch((error) => {
    console.error(
      "Erreur démarrage Telegram:",
      error
    );

    process.exit(1);
  });

/* =========================================================
   DÉMARRAGE EXPRESS
   ========================================================= */

const server =
  app.listen(
    PORT,
    () => {
      console.log("");
      console.log(
        "======================================"
      );
      console.log(
        "BAARO Telegram Media API"
      );
      console.log(
        `API sur http://localhost:${PORT}`
      );
      console.log(
        "PUBLIC_BASE_URL:",
        PUBLIC_BASE_URL
      );
      console.log(
        "CORS:",
        [...ALLOWED_ORIGINS].join(
          ", "
        )
      );
      console.log(
        "======================================"
      );
      console.log("");
    }
  );

/* =========================================================
   ARRÊT PROPRE
   ========================================================= */

async function shutdown(
  signal
) {
  console.log(
    `Arrêt demandé (${signal})...`
  );

  try {
    await bot.stop(signal);
  } catch (error) {
    console.error(
      "Erreur arrêt Telegram:",
      error
    );
  }

  server.close(() => {
    console.log(
      "Serveur HTTP arrêté."
    );

    process.exit(0);
  });

  setTimeout(() => {
    process.exit(0);
  }, 5000).unref();
}

process.once(
  "SIGINT",
  () => shutdown("SIGINT")
);

process.once(
  "SIGTERM",
  () => shutdown("SIGTERM")
);
>>>>>>> f034ceea0f0f2f1c9189e479a5b112dc35008a92
