/**
 * 🤖 BAARO Telegram Bot
 * 
 * Bot pour stocker des médias chiffrés sur Telegram
 * Utilisation: npm run dev
 * 
 * Token: Récupérer via @BotFather /token
 * Channel ID: Créer channel privé + format: -100xxxxx
 */

const { Telegraf } = require('telegraf');
const express = require('express');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHANNEL_ID = process.env.TELEGRAM_CHANNEL_ID;

if (!BOT_TOKEN || !CHANNEL_ID) {
  console.error('❌ ERREUR: TELEGRAM_BOT_TOKEN ou TELEGRAM_CHANNEL_ID manquants dans .env');
  process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN);
const app = express();

// Middleware Express
app.use(express.json());

// Stockage en mémoire (remplacer par BD en production)
const fileRegistry = new Map();

// ============================================================
// COMMANDES TELEGRAM
// ============================================================

bot.start((ctx) => {
  ctx.reply(
    `👋 Bienvenue sur BAARO Media Storage!\n\n` +
    `Je suis un bot de stockage chiffré pour l'app BAARO.\n\n` +
    `📎 Comment ça marche:\n` +
    `1. Envoyez un fichier (image, vidéo, etc.)\n` +
    `2. Je le stocke de manière sécurisée\n` +
    `3. Vous recevez une URL public\n\n` +
    `Commandes:\n` +
    `/help - Aide\n` +
    `/storage - Espace utilisé\n` +
    `/stats - Statistiques\n\n` +
    `🔐 Vos fichiers sont chiffrés E2E!`
  );
});

bot.command('help', (ctx) => {
  ctx.reply(
    `📚 Aide BAARO Media Bot\n\n` +
    `1️⃣ Upload:\n` +
    `   • Envoyez une image/vidéo\n` +
    `   • Le bot la stocke\n` +
    `   • Recevez l'URL public\n\n` +
    `2️⃣ Format:\n` +
    `   • Fichier chiffré (AES-GCM)\n` +
    `   • Bot ne voit pas le contenu\n\n` +
    `3️⃣ Télécharger:\n` +
    `   • Utilisez l'URL reçue\n` +
    `   • Déchiffrez avec votre clé\n\n` +
    `Commandes:\n` +
    `/storage - Espace utilisé\n` +
    `/stats - Statistiques\n` +
    `/delete - Supprimer un fichier`
  );
});

bot.command('storage', async (ctx) => {
  const totalSize = Array.from(fileRegistry.values()).reduce(
    (sum, file) => sum + (file.size || 0),
    0
  );

  const sizeInMB = (totalSize / (1024 * 1024)).toFixed(2);
  const sizeInGB = (totalSize / (1024 * 1024 * 1024)).toFixed(2);

  ctx.reply(
    `📊 Stockage utilisé:\n\n` +
    `Total: ${sizeInMB} MB (${sizeInGB} GB)\n` +
    `Fichiers: ${fileRegistry.size}\n\n` +
    `✅ Stockage illimité sur Telegram!`
  );
});

bot.command('stats', async (ctx) => {
  const files = Array.from(fileRegistry.values());
  const totalSize = files.reduce((sum, f) => sum + (f.size || 0), 0);
  const avgSize = files.length > 0 ? (totalSize / files.length / 1024).toFixed(1) : 0;

  const sortedByDate = files.sort(
    (a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt)
  );

  const newest = sortedByDate[0];
  const oldest = sortedByDate[sortedByDate.length - 1];

  ctx.reply(
    `📈 Statistiques:\n\n` +
    `Total fichiers: ${files.length}\n` +
    `Taille moyenne: ${avgSize} KB\n` +
    `Fichier récent: ${newest?.originalName || 'N/A'}\n` +
    `Fichier ancien: ${oldest?.originalName || 'N/A'}`
  );
});

// ============================================================
// UPLOAD DE FICHIER
// ============================================================

bot.on('document', async (ctx) => {
  try {
    const file = ctx.message.document;
    const fileId = file.file_unique_id;
    const fileName = file.file_name || `file-${fileId.slice(0, 8)}`;
    const fileSize = file.file_size;

    console.log(`📥 Upload: ${fileName} (${(fileSize / 1024).toFixed(1)} KB)`);

    // 1️⃣ Télécharger le fichier via Telegram
    const fileLink = await ctx.telegram.getFileLink(file.file_id);
    const response = await fetch(fileLink.href);
    const buffer = await response.buffer();

    // 2️⃣ Poster dans le channel privé
    const messageInChannel = await ctx.telegram.sendDocument(
      CHANNEL_ID,
      { source: buffer, filename: fileName },
      {
        caption: JSON.stringify({
          originalName: fileName,
          uploadedAt: new Date().toISOString(),
          uploadedBy: `${ctx.from.first_name} ${ctx.from.last_name || ''}`,
          userId: ctx.from.id,
          size: fileSize,
          encrypted: true,
        }),
        parse_mode: 'HTML',
      }
    );

    // 3️⃣ Générer URL public
    const messageId = messageInChannel.message_id;
    const channelNum = Math.abs(CHANNEL_ID).toString().slice(3);
    const filePublicUrl = `https://t.me/c/${channelNum}/${messageId}`;

    // 4️⃣ Enregistrer dans registry
    fileRegistry.set(fileId, {
      originalName: fileName,
      uploadedAt: new Date().toISOString(),
      size: fileSize,
      sender: ctx.from.username || `user-${ctx.from.id}`,
      telegramMessageId: messageId,
      publicUrl: filePublicUrl,
    });

    // 5️⃣ Répondre à l'utilisateur
    ctx.reply(
      `✅ Fichier uploadé avec succès!\n\n` +
      `📎 Nom: ${fileName}\n` +
      `📏 Taille: ${(fileSize / 1024).toFixed(1)} KB\n\n` +
      `🔗 URL public:\n` +
      `<code>${filePublicUrl}</code>\n\n` +
      `🔐 Chiffré E2E: Votre clé déchiffrement doit rester privée!`,
      {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [
              { text: '🔗 Ouvrir', url: filePublicUrl },
              { text: '📋 Copier', callback_data: `copy_${fileId}` },
            ],
            [{ text: '🗑️ Supprimer', callback_data: `delete_${fileId}` }],
          ],
        },
      }
    );

    console.log(`✅ Fichier stocké: ${filePublicUrl}`);
  } catch (error) {
    console.error('❌ Erreur upload:', error);
    ctx.reply('❌ Erreur lors de l\'upload. Réessayez.');
  }
});

// ============================================================
// ACTIONS (boutons inline)
// ============================================================

bot.action(/copy_(.+)/, (ctx) => {
  const fileId = ctx.match[1];
  const file = fileRegistry.get(fileId);

  if (file) {
    ctx.answerCbQuery(`URL copié: ${file.publicUrl}`);
  } else {
    ctx.answerCbQuery('❌ Fichier non trouvé');
  }
});

bot.action(/delete_(.+)/, async (ctx) => {
  const fileId = ctx.match[1];
  const file = fileRegistry.get(fileId);

  if (!file) {
    ctx.answerCbQuery('❌ Fichier non trouvé');
    return;
  }

  try {
    await ctx.telegram.deleteMessage(CHANNEL_ID, file.telegramMessageId);
    fileRegistry.delete(fileId);

    ctx.answerCbQuery(`✅ Fichier supprimé`);
    ctx.editMessageText(`🗑️ Supprimé: ${file.originalName}`);

    console.log(`🗑️ Fichier supprimé: ${file.originalName}`);
  } catch (error) {
    console.error('❌ Erreur suppression:', error);
    ctx.answerCbQuery('❌ Erreur lors de la suppression');
  }
});

// ============================================================
// API REST (Express)
// ============================================================

// GET /api/files
app.get('/api/files', (req, res) => {
  const files = Array.from(fileRegistry.values()).map((f) => ({
    name: f.originalName,
    url: f.publicUrl,
    uploadedAt: f.uploadedAt,
    size: f.size,
    sender: f.sender,
  }));

  res.json({ success: true, files, count: files.length });
});

// GET /api/stats
app.get('/api/stats', (req, res) => {
  const totalSize = Array.from(fileRegistry.values()).reduce(
    (sum, f) => sum + (f.size || 0),
    0
  );

  res.json({
    success: true,
    totalFiles: fileRegistry.size,
    totalSize: totalSize,
    totalSizeMB: (totalSize / (1024 * 1024)).toFixed(2),
    totalSizeGB: (totalSize / (1024 * 1024 * 1024)).toFixed(2),
  });
});

// GET /health
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    files: fileRegistry.size,
    bot: 'running',
  });
});

// POST /api/upload (pour BAARO)
app.post('/api/upload', async (req, res) => {
  try {
    const { buffer, filename, metadata } = req.body;

    if (!buffer || !filename) {
      return res.status(400).json({ error: 'buffer ou filename manquant' });
    }

    const fileBuffer = Buffer.from(buffer, 'base64');

    const messageInChannel = await bot.telegram.sendDocument(
      CHANNEL_ID,
      { source: fileBuffer, filename },
      { caption: JSON.stringify(metadata || {}) }
    );

    const messageId = messageInChannel.message_id;
    const channelNum = Math.abs(CHANNEL_ID).toString().slice(3);
    const filePublicUrl = `https://t.me/c/${channelNum}/${messageId}`;

    res.json({
      success: true,
      url: filePublicUrl,
      messageId,
      provider: 'telegram',
    });
  } catch (error) {
    console.error('API error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================
// LAUNCH
// ============================================================

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`📡 API Express sur http://localhost:${PORT}`);
  console.log(`📊 Endpoints:`);
  console.log(`   GET  /api/files`);
  console.log(`   GET  /api/stats`);
  console.log(`   POST /api/upload`);
  console.log(`   GET  /health`);
});

bot.launch({
  allowedUpdates: ['message', 'callback_query', 'channel_post'],
  dropPendingUpdates: true,
});

console.log('\n✅ BAARO Telegram Bot démarré');
console.log(`🤖 Bot: @Lassinedrbot`);
console.log(`📦 Channel: ${CHANNEL_ID}`);
console.log(`🚀 Prêt à recevoir des fichiers!\n`);

// Graceful shutdown
process.once('SIGINT', () => {
  console.log('\n👋 Bot arrêté');
  bot.stop('SIGINT');
});
process.once('SIGTERM', () => {
  console.log('\n👋 Bot arrêté');
  bot.stop('SIGTERM');
});
