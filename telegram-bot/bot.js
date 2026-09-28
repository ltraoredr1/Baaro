require("dotenv").config();

const crypto = require("node:crypto");
const express = require("express");
const { Telegraf } = require("telegraf");

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHANNEL_ID = process.env.TELEGRAM_CHANNEL_ID;
const API_SECRET = process.env.TELEGRAM_API_SECRET;
const PUBLIC_BASE_URL = String(process.env.PUBLIC_BASE_URL || "").replace(/\/$/, "");
const PORT = Number(process.env.PORT || 3000);

const MAX_SIZE = 50 * 1024 * 1024;

if (!TOKEN || !CHANNEL_ID || !API_SECRET || !PUBLIC_BASE_URL) {
  throw new Error(
    "TELEGRAM_BOT_TOKEN, TELEGRAM_CHANNEL_ID, TELEGRAM_API_SECRET et PUBLIC_BASE_URL sont requis."
  );
}

const bot = new Telegraf(TOKEN);
const app = express();

app.use(express.json({ limit: "1mb" }));

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

function verifyToken(token) {
  const [body, signature] = String(token || "").split(".");

  if (!body || !signature) {
    throw new Error("Jeton invalide");
  }

  const expected = crypto
    .createHmac("sha256", API_SECRET)
    .update(body)
    .digest("base64url");

  if (
    signature.length !== expected.length ||
    !crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expected)
    )
  ) {
    throw new Error("Signature invalide");
  }

  const payload = JSON.parse(
    Buffer.from(body, "base64url").toString("utf8")
  );

  if (!payload.exp || Number(payload.exp) < Math.floor(Date.now() / 1000)) {
    throw new Error("Jeton expiré");
  }

  return payload;
}

function signMediaToken(fileId, filename, contentType) {
  const payload = {
    v: 1,
    exp: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
    fileId,
    filename: cleanName(filename),
    contentType: contentType || "application/octet-stream",
  };

  const body = base64url(JSON.stringify(payload));
  const signature = crypto
    .createHmac("sha256", API_SECRET)
    .update(body)
    .digest("base64url");

  return `${body}.${signature}`;
}

app.get("/health", (_req, res) =>
  res.json({ ok: true, provider: "telegram" })
);

app.put("/api/upload", async (req, res) => {
  try {
    const payload = verifyToken(req.query?.token);

    const expectedSize = Number(payload.size || 0);
    const chunks = [];
    let total = 0;
    let tooLarge = false;

    req.on("data", (chunk) => {
      total += chunk.length;
      if (total <= MAX_SIZE) chunks.push(chunk);
      else tooLarge = true;
    });

    req.on("end", async () => {
      try {
        if (tooLarge || total > MAX_SIZE) {
          return res
            .status(413)
            .json({ ok: false, error: "Fichier trop volumineux (max 50 Mo)" });
        }

        if (expectedSize && total !== expectedSize) {
          return res.status(400).json({
            ok: false,
            error: "Taille du fichier différente de celle signée",
          });
        }

        if (!total) {
          return res
            .status(400)
            .json({ ok: false, error: "Fichier vide" });
        }

        const filename = cleanName(payload.filename);
        const buffer = Buffer.concat(chunks);

        const caption = [
          "BAARO_MEDIA",
          `folder=${payload.folder || "posts"}`,
          `user=${payload.userId || ""}`,
          `name=${filename}`,
          `type=${payload.contentType || "application/octet-stream"}`,
        ].join("\n");

        const message = await bot.telegram.sendDocument(
          CHANNEL_ID,
          { source: buffer, filename },
          { caption }
        );

        const fileId = message.document?.file_id;
        if (!fileId) {
          throw new Error("Telegram n'a pas retourné de file_id");
        }

        const mediaToken = signMediaToken(
          fileId,
          filename,
          payload.contentType
        );

        const publicUrl =
          `${PUBLIC_BASE_URL}/api/file?token=${encodeURIComponent(mediaToken)}`;

        return res.json({
          ok: true,
          provider: "telegram",
          fileId,
          publicUrl,
          filename,
          contentType: payload.contentType,
          size: total,
        });
      } catch (error) {
        console.error("[telegram-upload]", error);
        return res.status(500).json({
          ok: false,
          error: error.message || "Upload Telegram impossible",
        });
      }
    });
  } catch (error) {
    return res.status(401).json({
      ok: false,
      error: error.message || "Jeton upload invalide",
    });
  }
});

app.get("/api/file", async (req, res) => {
  try {
    const payload = verifyToken(req.query?.token);
    const file = await bot.telegram.getFile(payload.fileId);

    if (!file?.file_path) {
      throw new Error("Fichier Telegram introuvable");
    }

    const telegramUrl =
      `https://api.telegram.org/file/bot${TOKEN}/${file.file_path}`;

    const headers = {};
    if (req.headers.range) headers.Range = req.headers.range;

    const upstream = await fetch(telegramUrl, { headers });

    if (!upstream.ok) {
      return res
        .status(upstream.status)
        .send("Média Telegram indisponible");
    }

    res.status(upstream.status);
    res.setHeader(
      "Content-Type",
      payload.contentType || "application/octet-stream"
    );
    res.setHeader(
      "Cache-Control",
      "public, max-age=2592000, immutable"
    );

    const contentLength = upstream.headers.get("content-length");
    const contentRange = upstream.headers.get("content-range");
    if (contentLength) res.setHeader("Content-Length", contentLength);
    if (contentRange) res.setHeader("Content-Range", contentRange);
    res.setHeader("Accept-Ranges", "bytes");

    const reader = upstream.body?.getReader();
    if (!reader) return res.end();

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(Buffer.from(value));
      }
    } finally {
      reader.releaseLock();
    }

    return res.end();
  } catch (error) {
    console.error("[telegram-file]", error);
    return res
      .status(404)
      .send("Média Telegram introuvable");
  }
});

bot.start((ctx) => ctx.reply("BAARO Media Bot actif."));
bot.command("health", (ctx) => ctx.reply("BAARO Media Bot: OK"));
bot.catch((error) => console.error("[telegram-bot]", error));

bot.launch({
  allowedUpdates: ["message", "channel_post"],
  dropPendingUpdates: true,
});

app.listen(PORT, () =>
  console.log(`BAARO Telegram Media API listening on :${PORT}`)
);

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
