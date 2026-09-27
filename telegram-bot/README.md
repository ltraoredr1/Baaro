# BAARO — Telegram Media Storage

Stockage média Telegram uniquement pour ce correctif.

Variables du bot:

```env
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHANNEL_ID=-1001154448519
TELEGRAM_API_SECRET=
PORT=3000
NODE_ENV=production
```

Côté BAARO:

```env
TELEGRAM_MEDIA_API_URL=https://DOMAINE-DU-BOT
TELEGRAM_API_SECRET=la_meme_valeur_que_le_bot
```

Le bot est un processus Node persistant avec `bot.launch()`. Ne pas le traiter comme une simple fonction Vercel serverless sans adaptation webhook.
