// api/create-room.js - Crée une room Daily.co sécurisée (host_id depuis token)

import { createClient } from '@supabase/supabase-js'

function requireUser(req) {
  const auth = req.headers.authorization?.replace('Bearer ', '')
  if (!auth) throw new Error('No auth')
  const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${auth}` } }
  })
  return supabase.auth.getUser().then(r => {
    if (!r.data.user) throw new Error('Invalid user')
    return r.data.user
  })
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  try {
    const user = await requireUser(req)
    const { title, maxCoHosts = 3 } = req.body

    // 1. Créer room Daily.co via API
    const dailyRes = await fetch('https://api.daily.co/v1/rooms', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.DAILY_API_KEY}` // à mettre dans Vercel env
      },
      body: JSON.stringify({
        name: `baaro-${Date.now()}-${user.id.slice(0,6)}`,
        privacy: 'private',
        properties: {
          enable_chat: false, // on utilise Supabase chat
          enable_screenshare: true,
          max_participants: 100,
          exp: Math.floor(Date.now()/1000) + 3600*3 // 3h
        }
      })
    })
    const dailyRoom = await dailyRes.json()
    if (!dailyRes.ok) throw new Error(dailyRoom.error || 'Daily error')

    // 2. Générer token host Daily avec permissions owner
    const tokenRes = await fetch('https://api.daily.co/v1/meeting-tokens', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.DAILY_API_KEY}`
      },
      body: JSON.stringify({
        properties: {
          room_name: dailyRoom.name,
          user_id: user.id,
          is_owner: true,
          enable_screenshare: true
        }
      })
    })
    const tokenData = await tokenRes.json()

    // 3. Créer debate dans Supabase avec host_id = user.id (sécurisé, vient du token)
    const supabaseAdmin = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
    const code = Math.random().toString(36).substring(2,10).toUpperCase()
    const { data: debate } = await supabaseAdmin.from('debates').insert({
      title,
      host_id: user.id, // SECURISE : vient du token, pas du client
      invite_code: code,
      daily_room_name: dailyRoom.name,
      max_co_hosts: maxCoHosts,
      is_live: true
    }).select().single()

    await supabaseAdmin.from('debate_participants').insert({
      debate_id: debate.id,
      user_id: user.id,
      role: 'host'
    })

    return res.json({
      debate,
      dailyRoomName: dailyRoom.name,
      dailyRoomUrl: dailyRoom.url,
      token: tokenData.token,
      inviteCode: code
    })
  } catch (e) {
    console.error(e)
    return res.status(400).json({ error: e.message })
  }
}
