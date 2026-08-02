// api/create-room.js
// Fonction serverless Vercel : crée une room Daily.co pour un live BAARO,
// génère un code d'invitation court, et retourne un token d'accès au
// client. La clé API Daily et la clé service_role Supabase restent
// secrètes, jamais exposées au navigateur (même principe que api/wallet.js).
//
// Installation requise : npm install @supabase/supabase-js
// Variables d'env requises côté Vercel : DAILY_API_KEY, SUPABASE_URL,
// SUPABASE_SERVICE_ROLE_KEY (vérifiez les noms exacts déjà utilisés dans
// api/wallet.js pour rester cohérent).

import { createClient } from '@supabase/supabase-js';

const DAILY_API_URL = 'https://api.daily.co/v1';
// Sans O/0 ni I/1 : évite la confusion à l'oral/à l'écrit quand quelqu'un
// dicte ou recopie le code.
const INVITE_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function generateInviteCode(length = 6) {
  let code = '';
  for (let i = 0; i < length; i++) {
    code += INVITE_CODE_CHARS[Math.floor(Math.random() * INVITE_CODE_CHARS.length)];
  }
  return code;
}

function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY manquantes côté serveur');
  }
  return createClient(url, serviceKey, { auth: { persistSession: false } });
}

async function generateUniqueInviteCode(supabase) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateInviteCode();
    const { data, error } = await supabase
      .from('debate_rooms')
      .select('id')
      .eq('invite_code', code)
      .maybeSingle();
    if (error) throw error;
    if (!data) return code;
  }
  throw new Error("Impossible de générer un code d'invitation unique, réessayez");
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Méthode non autorisée' });
  }

  const DAILY_API_KEY = process.env.DAILY_API_KEY;
  if (!DAILY_API_KEY) {
    return res.status(500).json({ error: 'DAILY_API_KEY manquante côté serveur' });
  }

  const { action, roomName, userName, isHost, enableHLS, hostId, debateId, inviteCode } =
    req.body || {};

  try {
    // 1. Créer une nouvelle room + générer son code d'invitation
    if (action === 'create-room') {
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
                  save_hls_recording: false,
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
          privacy: 'private',
          properties: {
            exp: Math.floor(Date.now() / 1000) + 60 * 60 * 4,
            enable_chat: false,
            enable_screenshare: false,
            max_participants: 200,
            enable_recording: false,
            ...(streamingEndpoints ? { streaming_endpoints: streamingEndpoints } : {}),
          },
        }),
      });

      if (!room.ok) {
        const err = await room.text();
        return res.status(room.status).json({ er
