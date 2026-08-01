// api/create-room.js
// Fonction serverless Vercel : crée une room Daily.co pour un live BAARO
// et retourne un token d'accès au client. La clé API Daily reste secrète,
// jamais exposée au navigateur (même principe que api/wallet.js).

const DAILY_API_URL = 'https://api.daily.co/v1';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Méthode non autorisée' });
  }

  const DAILY_API_KEY = process.env.DAILY_API_KEY;
  if (!DAILY_API_KEY) {
    return res.status(500).json({ error: 'DAILY_API_KEY manquante côté serveur' });
  }

  const { action, roomName, userName, isHost, enableHLS } = req.body || {};

  try {
    // 1. Créer une nouvelle room (appelé par l'hôte au démarrage du live)
    if (action === 'create-room') {
      // Mode HLS (façon TikTok) : nécessite un bucket S3-compatible déjà
      // configuré (variables DAILY_S3_*). Désactivé par défaut : le mode
      // WebRTC classique suffit pour vos lives actuels (< ~20 spectateurs)
      // et ne coûte rien en plus de votre plan Daily.
      const streamingEndpoints =
        enableHLS && process.env.DAILY_S3_BUCKET
          ? [
              {
                name: 'baaro-hls',
                type: 'hls',
                hls_config: {
                  s3_key_template: 'baaro/{room_name}/{epoch}',
                  s3_bucket_name: process.env.DAILY_S3_BUCKET,
                  s3_region: process.env.DAILY_S3_REGION,
                  s3_access_key: process.env.DAILY_S3_ACCESS_KEY,
                  s3_secret_key: process.env.DAILY_S3_SECRET_KEY,
                  save_hls_recording: false, // ne garde que les derniers segments, pas d'archive
                },
              },
            ]
          : undefined;

      const room = await fetch(`${DAILY_API_URL}/rooms`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${DAILY_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          privacy: 'private', // accès uniquement via token
          properties: {
            exp: Math.floor(Date.now() / 1000) + 60 * 60 * 4, // expire après 4h
            enable_chat: false, // votre chat reste sur Supabase Realtime
            enable_screenshare: false,
            max_participants: 200,
            enable_recording: false,
            ...(streamingEndpoints ? { streaming_endpoints: streamingEndpoints } : {}),
          },
        }),
      });

      if (!room.ok) {
        const err = await room.text();
        return res.status(room.status).json({ error: `Erreur création room Daily: ${err}` });
      }

      const roomData = await room.json();

      // 2. Générer un token pour l'hôte (droits de diffusion + admin streaming si HLS actif)
      const token = await fetch(`${DAILY_API_URL}/meeting-tokens`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${DAILY_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          properties: {
            room_name: roomData.name,
            user_name: userName || 'Hôte',
            is_owner: true,
            start_video_off: false,
            start_audio_off: false,
            ...(streamingEndpoints ? { permissions: { canAdmin: ['streaming'] } } : {}),
          },
        }),
      });

      const tokenData = await token.json();

      return res.status(200).json({
        roomUrl: roomData.url,
        roomName: roomData.name,
        token: tokenData.token,
        hlsEnabled: !!streamingEndpoints,
      });
    }

    // 3. Générer un token pour un spectateur qui rejoint une room existante
    if (action === 'join-room') {
      if (!roomName) {
        return res.status(400).json({ error: 'roomName requis' });
      }

      const token = await fetch(`${DAILY_API_URL}/meeting-tokens`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${DAILY_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          properties: {
            room_name: roomName,
            user_name: userName || 'Spectateur',
            is_owner: !!isHost,
            start_video_off: true, // spectateur : caméra/micro coupés par défaut
            start_audio_off: true,
          },
        }),
      });

      if (!token.ok) {
        const err = await token.text();
        return res.status(token.status).json({ error: `Erreur token Daily: ${err}` });
      }

      const tokenData = await token.json();

      return res.status(200).json({
        roomUrl: `https://${process.env.DAILY_DOMAIN || 'your-domain'}.daily.co/${roomName}`,
        token: tokenData.token,
      });
    }

    // 4. Terminer une room (appelé quand l'hôte quitte le live)
    if (action === 'delete-room') {
      if (!roomName) {
        return res.status(400).json({ error: 'roomName requis' });
      }

      await fetch(`${DAILY_API_URL}/rooms/${roomName}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${DAILY_API_KEY}` },
      });

      return res.status(200).json({ success: true });
    }

    return res.status(400).json({ error: 'Action inconnue' });
  } catch (error) {
    console.error('Erreur Daily API:', error);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
}
