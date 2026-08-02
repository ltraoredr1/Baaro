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
        return res.status(room.status).json({ error: `Erreur création room Daily: ${err}` });
      }

      const roomData = await room.json();

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

      // Génère un code court et l'enregistre en base, lié à la room Daily
      const supabase = getSupabaseAdmin();
      const code = await generateUniqueInviteCode(supabase);

      const { error: insertError } = await supabase.from('debate_rooms').insert({
        daily_room_name: roomData.name,
        invite_code: code,
        host_id: hostId || null,
        debate_id: debateId || null,
        status: 'live',
      });

      if (insertError) {
        // La room Daily existe déjà même si l'enregistrement échoue :
        // on la supprime pour ne pas laisser de room orpheline facturée.
        await fetch(`${DAILY_API_URL}/rooms/${roomData.name}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${DAILY_API_KEY}` },
        }).catch(() => {});
        throw insertError;
      }

      return res.status(200).json({
        roomUrl: roomData.url,
        roomName: roomData.name,
        token: tokenData.token,
        inviteCode: code,
        hlsEnabled: !!streamingEndpoints,
      });
    }

    // 2. Résoudre un code d'invitation en nom de room Daily (avant de rejoindre)
    if (action === 'resolve-code') {
      if (!inviteCode) {
        return res.status(400).json({ error: "Code d'invitation requis" });
      }

      const supabase = getSupabaseAdmin();
      const { data, error } = await supabase
        .from('debate_rooms')
        .select('daily_room_name, status')
        .eq('invite_code', inviteCode.trim().toUpperCase())
        .maybeSingle();

      if (error) throw error;
      if (!data || data.status !== 'live') {
        return res.status(404).json({ error: 'Code invalide ou débat terminé' });
      }

      return res.status(200).json({ roomName: data.daily_room_name });
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
            start_video_off: true,
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

      const supabase = getSupabaseAdmin();
      await supabase.from('debate_rooms').update({ status: 'ended' }).eq('daily_room_name', roomName);

      return res.status(200).json({ success: true });
    }

    return res.status(400).json({ error: 'Action inconnue' });
  } catch (error) {
    console.error('Erreur Daily API:', error);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
                                      }
