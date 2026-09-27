# BAARO Telegram Bot

Telegram est le stockage des médias. Aucun média n'est stocké sur Supabase.

Variables :
- TELEGRAM_BOT_TOKEN
- TELEGRAM_CHANNEL_ID
- TELEGRAM_API_SECRET
- NODE_ENV
- PORT

TELEGRAM_API_SECRET protège /api/upload.

Important : ce bot ne chiffre pas les fichiers. Pour du vrai E2E,
BAARO doit chiffrer le fichier côté client avant /api/upload.

Le processus utilise bot.launch() et doit tourner sur un environnement
Node persistant ou être adapté en webhook; ne pas le considérer comme
une simple fonction Vercel serverless.
