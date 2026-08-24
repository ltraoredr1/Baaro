// api/live-roles.js - Promouvoir / rétrograder co-hôtes (host seulement)

import { createClient } from '@supabase/supabase-js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const auth = req.headers.authorization?.replace('Bearer ','')
  if(!auth) return res.status(401).json({ error: 'No auth' })

  const supabaseUser = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY, { global: { headers: { Authorization: `Bearer ${auth}` } } })
  const { data: { user } } = await supabaseUser.auth.getUser()
  if(!user) return res.status(401).json({ error: 'Invalid session' })

  const supabaseAdmin = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
  const { action, roomId, dailyRoomName, targetUserId, role } = req.body

  // Vérifier que requester est host du debate
  const { data: debate } = await supabaseAdmin.from('debates').select('host_id, max_co_hosts').eq('id', roomId).single()
  if(!debate) return res.status(404).json({ error: 'Live not found' })
  if(debate.host_id !== user.id) return res.status(403).json({ error: 'Seul le host peut gérer les rôles' })

  if(action === 'promote') {
    // Vérifier limite co-hosts
    const { count } = await supabaseAdmin.from('debate_participants').select('*', { count: 'exact', head: true }).eq('debate_id', roomId).eq('role', 'co_host')
    if(count >= debate.max_co_hosts) return res.status(400).json({ error: `Max ${debate.max_co_hosts} co-hôtes` })

    await supabaseAdmin.from('debate_participants').upsert({ debate_id: roomId, user_id: targetUserId, role: 'co_host' })

    // Générer token Daily co_host avec permissions
    let token = null
    if(process.env.DAILY_API_KEY && dailyRoomName) {
      const tokenRes = await fetch('https://api.daily.co/v1/meeting-tokens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.DAILY_API_KEY}` },
        body: JSON.stringify({ properties: { room_name: dailyRoomName, user_id: targetUserId, is_owner: false, enable_screenshare: true } })
      })
      const t = await tokenRes.json()
      token = t.token
    }

    return res.json({ success: true, role: 'co_host', token })
  }

  if(action === 'demote') {
    await supabaseAdmin.from('debate_participants').update({ role: 'viewer' }).eq('debate_id', roomId).eq('user_id', targetUserId)
    return res.json({ success: true, role: 'viewer' })
  }

  return res.status(400).json({ error: 'Invalid action' })
}
