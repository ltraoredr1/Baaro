require("dotenv").config();

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

/*
 * Origines autorisées à appeler l'API média.
 *
 * Production :
 *   https://baaro-xi.vercel.app
 *
 * Développement :
 *   localhost:5173
 *   localhost:3000
 */
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
    .map((value) => value.trim())
    .filter(Boolean)
);

/* =========================================================
   VÉRIFICATION DE LA CONFIGURATION
   ========================================================= */

if (!TOKEN || !CHANNEL_ID || !API_SECRET || !PUBLIC_BASE_URL) {
  throw new Error(
    [
      "Configuration Telegram incomplète.",
      "",
      "Variables obligatoires :",
      "TELEGRAM_BOT_TOKEN",
      "TELEGRAM_CHANNEL_ID",
      "TELEGRAM_API_SECRET",
      "PUBLIC_BASE_URL",
    ].join("\n")
  );
}

/* =========================================================
   TELEGRAM + EXPRESS
   ========================================================= */

const bot = new Telegraf(TOKEN);
const app = express();

app.disable("x-powered-by");

/* =========================================================
   CORS
   ========================================================= */

function applyCors(req, res) {
  const origin = req.headers.origin;

  /*
   * Si le navigateur envoie une Origin, elle doit être
   * explicitement autorisée.
   */
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
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
  }

  /*
   * Réponse au preflight CORS.
   *
   * BAARO utilise PUT pour envoyer les médias.
   * Le navigateur peut donc envoyer OPTIONS avant PUT.
   */
  if (req.method === "OPTIONS") {
    if (!origin || ALLOWED_ORIGINS.has(origin)) {
      return true;
    }

    res.status(403).json({
      ok: false,
      error: "Origin non autorisée",
    });

    return true;
  }

  return false;
}

app.use((req, res, next) => {
  if (applyCors(req, res)) {
    if (req.method === "OPTIONS" && res.statusCode === 200) {
      return res.status(204).end();
    }

    return;
  }

  next();
});

/* =========================================================
   BODY JSON
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
      .replace(/[\\/:*?"<>|\x00-\x1f]/g, "_")
      .slice(0, 180) || "file"
  );
}

function base64url(value) {
  return Buffer.from(value).toString("base64url");
}

/* =========================================================
   VÉRIFICATION DES TOKENS
   ========================================================= */

function verifyToken(token) {
  const [body, signature] = String(token || "").split(".");

  if (!body || !signature) {
    throw new Error("Jeton invalide");
  }

  const expected = crypto
    .createHmac("sha256", API_SECRET)
    .update(body)
    .digest("base64url");

  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);

  if (
    signatureBuffer.length !== expectedBuffer.length ||
    !crypto.timingSafeEqual(
      signatureBuffer,
      expectedBuffer
    )
  ) {
    throw new Error("Signature invalide");
  }

  let payload;

  try {
    payload = JSON.parse(
      Buffer.from(body, "base64url").toString("utf8")
    );
  } catch {
    throw new Error("Jeton malformé");
  }

  if (
    !payload.exp ||
    Number(payload.exp) < Math.floor(Date.now() / 1000)
  ) {
    throw new Error("Jeton expiré");
  }

  return payload;
}

/* =========================================================
   TOKEN PUBLIC POUR LES MÉDIAS
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

    filename: cleanName(filename),

    contentType:
      contentType ||
      "application/octet-stream",
  };

  const body = base64url(
    JSON.stringify(payload)
  );

  const signature = crypto
    .createHmac("sha256", API_SECRET)
    .update(body)
    .digest("base64url");

  return `${body}.${signature}`;
}

/* =========================================================
   HEALTH CHECK
   ========================================================= */

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    uptime: process.uptime(),
    files: 0,
  });
});

/* =========================================================
   UPLOAD MÉDIA
   ========================================================= */

app.put("/api/upload", async (req, res) => {
  try {
    /*
     * Vérification du token généré par Vercel.
     */
    const payload = verifyToken(
      req.query?.token
    );

    /*
     * Taille attendue signée par Vercel.
     */
    const expectedSize = Number(
      payload.size || 0
    );

    const chunks = [];

    let total = 0;
    let tooLarge = false;

    /*
     * Réception du fichier en streaming.
     */
    req.on("data", (chunk) => {
      total += chunk.length;

      if (total <= MAX_SIZE) {
        chunks.push(chunk);
      } else {
        tooLarge = true;
      }
    });

    req.on("end", async () => {
      try {
        /*
         * Vérification taille maximale.
         */
        if (
          tooLarge ||
          total > MAX_SIZE
        ) {
          return res.status(413).json({
            ok: false,
            error:
              "Fichier trop volumineux (max 50 Mo)",
          });
        }

        /*
         * Vérification de la taille signée.
         */
        if (
          expectedSize &&
          total !== expectedSize
        ) {
          return res.status(400).json({
            ok: false,
            error:
              "Taille du fichier différente de celle signée",
          });
        }

        /*
         * Fichier vide.
         */
        if (!total) {
          return res.status(400).json({
            ok: false,
            error: "Fichier vide",
          });
        }

        const filename = cleanName(
          payload.filename
        );

        const buffer = Buffer.concat(chunks);

        /*
         * Informations stockées dans le message Telegram.
         */
        const caption = [
          "BAARO_MEDIA",
          `folder=${payload.folder || "posts"}`,
          `user=${payload.userId || ""}`,
          `name=${filename}`,
          `type=${
            payload.contentType ||
            "application/octet-stream"
          }`,
        ].join("\n");

        /*
         * Envoi vers le canal Telegram.
         */
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

        const fileId =
          message.document?.file_id;

        if (!fileId) {
          throw new Error(
            "Telegram n'a pas retourné de file_id"
          );
        }

        /*
         * Création d'une URL publique signée.
         */
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

        return res.json({
          ok: true,
          provider: "telegram",
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
          "[telegram-upload]",
          error
        );

        return res.status(500).json({
          ok: false,
          error:
            error?.message ||
            "Upload Telegram impossible",
        });
      }
    });

    req.on("error", (error) => {
      console.error(
        "[telegram-upload-request]",
        error
      );

      if (!res.headersSent) {
        res.status(500).json({
          ok: false,
          error:
            "Erreur pendant la réception du fichier",
        });
      }
    });
  } catch (error) {
    console.error(
      "[telegram-upload-token]",
      error
    );

    return res.status(401).json({
      ok: false,
      error:
        error?.message ||
        "Jeton upload invalide",
    });
  }
});

/* =========================================================
   SERVIR UN MÉDIA DEPUIS TELEGRAM
   ========================================================= */

app.get("/api/file", async (req, res) => {
  try {
    const payload = verifyToken(
      req.query?.token
    );

    /*
     * Récupération du chemin du fichier
     * auprès de Telegram.
     */
    const file =
      await bot.telegram.getFile(
        payload.fileId
      );

    if (!file?.file_path) {
      throw new Error(
        "Fichier Telegram introuvable"
      );
    }

    const telegramUrl =
      `https://api.telegram.org/file/bot${TOKEN}/${file.file_path}`;

    /*
     * Support du téléchargement partiel.
     * Important pour les vidéos.
     */
    const headers = {};

    if (req.headers.range) {
      headers.Range =
        req.headers.range;
    }

    const upstream = await fetch(
      telegramUrl,
      {
        headers,
      }
    );

    if (!upstream.ok) {
      return res
        .status(upstream.status)
        .send(
          "Média Telegram indisponible"
        );
    }

    /*
     * Code HTTP :
     * 200 pour fichier complet
     * 206 pour Range / vidéo
     */
    res.status(upstream.status);

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

    /*
     * Transmission du flux Telegram
     * vers le navigateur.
     */
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
        } = await reader.read();

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

    return res.end();
  } catch (error) {
    console.error(
      "[telegram-file]",
      error
    );

    return res
      .status(404)
      .send(
        "Média Telegram introuvable"
      );
  }
});

/* =========================================================
   ROUTE RACINE
   ========================================================= */

app.get("/", (_req, res) => {
  res.json({
    ok: true,
    service: "BAARO Telegram Media API",
    status: "online",
  });
});

/* =========================================================
   BOT TELEGRAM
   ========================================================= */

bot.start((ctx) => {
  ctx.reply(
    "BAARO Media Bot actif."
  );
});

bot.command("health", (ctx) => {
  ctx.reply(
    "BAARO Media Bot: OK"
  );
});

bot.catch((error) => {
  console.error(
    "[telegram-bot]",
    error
  );
});

/* =========================================================
   DÉMARRAGE DU BOT
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
    console.log(
      "BAARO Telegram Bot LANCÉ"
    );
    console.log(
      "API média Telegram prête."
    );
  })
  .catch((error) => {
    console.error(
      "Erreur démarrage Telegram :",
      error
    );
    process.exit(1);
  });

/* =========================================================
   DÉMARRAGE EXPRESS
   ========================================================= */

const server = app.listen(
  PORT,
  () => {
    console.log(
      `BAARO Telegram Media API listening on :${PORT}`
    );

    console.log(
      `Public URL: ${PUBLIC_BASE_URL}`
    );

    console.log(
      `CORS autorisé pour: ${[
        ...ALLOWED_ORIGINS,
      ].join(", ")}`
    );
  }
);

/* =========================================================
   ARRÊT PROPRE
   ========================================================= */

async function shutdown(
  signal
) {
  console.log(
    `\nArrêt demandé (${signal})...`
  );

  try {
    await bot.stop(signal);
  } catch (error) {
    console.error(
      "Erreur arrêt bot:",
      error
    );
  }

  server.close(() => {
    console.log(
      "Serveur HTTP arrêté."
    );

    process.exit(0);
  });

  /*
   * Sécurité : ne pas rester bloqué
   * indéfiniment pendant l'arrêt.
   */
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
