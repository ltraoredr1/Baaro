const { Telegraf } = require("telegraf");
const express = require("express");
require("dotenv").config();

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHANNEL_ID = process.env.TELEGRAM_CHANNEL_ID;
const API_SECRET = process.env.TELEGRAM_API_SECRET;
const PORT = Number(process.env.PORT || 3000);

if (!BOT_TOKEN || !CHANNEL_ID || !API_SECRET) {
  console.error("TELEGRAM_BOT_TOKEN, TELEGRAM_CHANNEL_ID ou TELEGRAM_API_SECRET manquant.");
  process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN);
const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "60mb" }));

// Telegram est le stockage média. Cette Map ne contient que des métadonnées
// temporaires pour les commandes du bot; elle est vidée au redémarrage.
const fileRegistry = new Map();

function channelUrl(messageId) {
  const raw = String(CHANNEL_ID);
  const channelNum = raw.startsWith("-100") ? raw.slice(4) : raw.replace("-", "");
  return `https://t.me/c/${channelNum}/${messageId}`;
}

function authorized(req) {
  return (req.get("authorization") || "") === `Bearer ${API_SECRET}`;
}

function caption(metadata = {}) {
  return JSON.stringify({
    ...metadata,
    storedBy: "baaro-telegram-bot",
    storedAt: new Date().toISOString()
  }).slice(0, 1000);
}

bot.start((ctx) => ctx.reply(
  "👋 BAARO Media Bot\n\n" +
  "📦 Telegram sert de stockage des médias.\n" +
  "🔐 Pour du vrai E2E, BAARO doit chiffrer le fichier avant l'envoi.\n\n" +
  "/help — aide\n/storage — statistiques"
));

bot.command("help", (ctx) => ctx.reply(
  "📚 Envoyez un document pour le stocker dans le canal Telegram BAARO.\n\n" +
  "Telegram reçoit uniquement le fichier transmis par BAARO."
));

bot.command("storage", (ctx) => {
  let total = 0;
  for (const f of fileRegistry.values()) total += f.size || 0;
  return ctx.reply(
    `📊 Fichiers suivis depuis le démarrage: ${fileRegistry.size}\n` +
    `Taille suivie: ${(total / 1024 / 1024).toFixed(2)} MB\n` +
    `📦 Stockage média: Telegram`
  );
});

bot.on("document", async (ctx) => {
  try {
    const doc = ctx.message.document;
    const name = doc.file_name || `file-${doc.file_unique_id}`;
    const size = Number(doc.file_size || 0);

    const link = await ctx.telegram.getFileLink(doc.file_id);
    const response = await fetch(link.href);
    if (!response.ok) throw new Error(`Telegram HTTP ${response.status}`);

    const buffer = Buffer.from(await response.arrayBuffer());

    const stored = await ctx.telegram.sendDocument(
      CHANNEL_ID,
      { source: buffer, filename: name },
      { caption: caption({
        originalName: name,
        size,
        uploadedByTelegramUser: ctx.from?.id || null
      }) }
    );

    const url = channelUrl(stored.message_id);
    fileRegistry.set(doc.file_unique_id, {
      originalName: name,
      size,
      uploadedAt: new Date().toISOString(),
      telegramMessageId: stored.message_id,
      publicUrl: url
    });

    await ctx.reply(
      `✅ Fichier stocké dans Telegram.\n\n📎 ${name}\n📏 ${(size / 1024).toFixed(1)} KB\n\n🔗 ${url}`
    );
  } catch (error) {
    console.error("Erreur upload Telegram:", error);
    await ctx.reply("❌ Impossible de stocker le fichier.");
  }
});

app.get("/health", (_req, res) => {
  res.json({ ok: true, status: "running", provider: "telegram", mediaStorage: "telegram" });
});

app.get("/api/stats", (req, res) => {
  if (!authorized(req)) return res.status(401).json({ error: "Unauthorized" });

  let total = 0;
  for (const f of fileRegistry.values()) total += f.size || 0;

  res.json({ success: true, provider: "telegram", totalFiles: fileRegistry.size, totalSize: total });
});

app.post("/api/upload", async (req, res) => {
  if (!authorized(req)) return res.status(401).json({ error: "Unauthorized" });

  try {
    const { buffer, filename, metadata } = req.body || {};

    if (typeof buffer !== "string" || !buffer) {
      return res.status(400).json({ error: "buffer base64 manquant" });
    }
    if (typeof filename !== "string" || !filename.trim()) {
      return res.status(400).json({ error: "filename manquant" });
    }

    const decoded = Buffer.from(buffer, "base64");
    const MAX_BYTES = 40 * 1024 * 1024;

    if (!decoded.length || decoded.length > MAX_BYTES) {
      return res.status(413).json({ error: "Fichier trop volumineux (max 40 MB)" });
    }

    const safeName = filename.replace(/[\/\\:*?"<>|]/g, "_").slice(0, 180);

    const stored = await bot.telegram.sendDocument(
      CHANNEL_ID,
      { source: decoded, filename: safeName },
      { caption: caption(metadata) }
    );

    res.json({
      success: true,
      provider: "telegram",
      url: channelUrl(stored.message_id),
      messageId: stored.message_id,
      size: decoded.length
    });
  } catch (error) {
    console.error("API upload error:", error);
    res.status(500).json({ error: "Telegram upload failed" });
  }
});

app.listen(PORT, () => console.log(`BAARO Telegram API listening on port ${PORT}`));

bot.launch({
  allowedUpdates: ["message", "callback_query"],
  dropPendingUpdates: true
}).then(() => console.log("BAARO Telegram bot started"));

function shutdown(signal) {
  bot.stop(signal);
  process.exit(0);
}
process.once("SIGINT", () => shutdown("SIGINT"));
process.once("SIGTERM", () => shutdown("SIGTERM"));
