require("dotenv").config();
const express = require("express");
const { Telegraf } = require("telegraf");

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHANNEL_ID = process.env.TELEGRAM_CHANNEL_ID;
const API_SECRET = process.env.TELEGRAM_API_SECRET;
const PORT = Number(process.env.PORT || 3000);
const MAX_SIZE = 50 * 1024 * 1024;

if (!TOKEN || !CHANNEL_ID || !API_SECRET) {
  throw new Error("TELEGRAM_BOT_TOKEN, TELEGRAM_CHANNEL_ID et TELEGRAM_API_SECRET sont requis.");
}

const bot = new Telegraf(TOKEN);
const app = express();
app.use(express.json({ limit: "1mb" }));

function cleanName(name) {
  return String(name || "file").replace(/[\\/:*?"<>|\x00-\x1f]/g, "_").slice(0, 180) || "file";
}

function authorized(req) {
  const secret = req.query?.secret || req.headers.authorization?.replace(/^Bearer\s+/i, "");
  return secret === API_SECRET;
}

app.get("/health", (_req, res) => res.json({ ok: true, provider: "telegram" }));

app.put("/api/upload", async (req, res) => {
  if (!authorized(req)) return res.status(401).json({ ok: false, error: "Non autorisé" });

  const filename = cleanName(req.query.filename);
  const folder = cleanName(req.query.folder || "posts");
  const userId = String(req.query.userId || "");
  const contentType = String(req.query.contentType || "application/octet-stream");
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
      if (tooLarge || total > MAX_SIZE) return res.status(413).json({ ok: false, error: "Fichier trop volumineux (max 50 Mo)" });
      if (!total) return res.status(400).json({ ok: false, error: "Fichier vide" });

      const buffer = Buffer.concat(chunks);
      const caption = [`BAARO_MEDIA`, `folder=${folder}`, `user=${userId}`, `name=${filename}`, `type=${contentType}`].join("\n");
      const message = await bot.telegram.sendDocument(CHANNEL_ID, { source: buffer, filename }, { caption });
      const fileId = message.document?.file_id;
      if (!fileId) throw new Error("Telegram n'a pas retourné de file_id");

      // Le file_id est la référence persistante utilisée par le bot.
      // Ne pas exposer le token du bot dans l'application cliente.
      return res.json({ ok: true, provider: "telegram", fileId, publicUrl: `telegram://${fileId}`, filename, contentType, size: total });
    } catch (error) {
      console.error("[telegram-upload]", error);
      return res.status(500).json({ ok: false, error: error.message || "Upload Telegram impossible" });
    }
  });
});

bot.start((ctx) => ctx.reply("BAARO Media Bot actif."));
bot.command("health", (ctx) => ctx.reply("BAARO Media Bot: OK"));
bot.catch((error) => console.error("[telegram-bot]", error));
bot.launch({ allowedUpdates: ["message", "channel_post"], dropPendingUpdates: true });

app.listen(PORT, () => console.log(`BAARO Telegram Media API listening on :${PORT}`));
process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
