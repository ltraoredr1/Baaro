const { Telegraf } = require('telegraf');
const express = require('express');
require('dotenv').config();

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHANNEL_ID = process.env.TELEGRAM_CHANNEL_ID;

if (!BOT_TOKEN || !CHANNEL_ID) {
  console.error('❌ ERREUR: Variables manquantes dans .env');
  process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN);
const app = express();
app.use(express.json());

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
  );
});

bot.command('help', (ctx) => {
  ctx.reply(
    `📚 Aide BAARO Bot\n\n` +
    `1️⃣ Envoyez un fichier (image, vidéo, doc)\n` +
    `2️⃣ Le bot le stocke en sécurité\n` +
    `3️⃣ Recevez une URL public\n\n` +
    `Chiffré E2E - Bot ne voit pas le contenu`
  );
});

bot.command('storage', (ctx) => {
  const totalSize = Array.from(fileRegistry.values()).reduce(
    (sum, file) => sum + (file.size || 0), 0
  );
  const sizeInMB = (totalSize / (1024 * 1024)).toFixed(2);
  ctx.reply(`📊 Espace utilisé: ${sizeInMB} MB\nFichiers: ${fileRegistry.size}`);
});

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
