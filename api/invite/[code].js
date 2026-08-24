// api/invite/[code].js - Route pour rejoindre via lien baaro.app/invite/XXXXXX
// À mettre dans api/invite/[code].js pour Vercel

import { createClient } from '@supabase/supabase-js'

export default async function handler(req, res) {
  const { code } = req.query
  const auth = req.headers.authorization?.replace('Bearer ','')
  if(!auth) return res.status(401).json({ error: 'Non authentifié' })

  const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
  const supabaseAuth = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY, { global: { headers: { Authorization: `Bearer ${auth}` } } })
  const { data: { user } } = await supabaseAuth.auth.getUser()
  if(!user) return res.status(401).json({ error: 'Session invalide' })

  const { data: invite } = await supabase.from('group_invites').select('*').eq('code', code.toUpperCase()).single()
  if(!invite) return res.status(404).json({ error: 'Code invalide' })
  if(invite.expires_at && new Date(invite.expires_at) < new Date()) return res.status(410).json({ error: 'Lien expiré' })
  if(invite.max_uses>0 && invite.uses >= invite.max_uses) return res.status(410).json({ error: 'Lien épuisé' })

  // Idempotence : si déjà membre, on renvoie le group_id
  const { data: existing } = await supabase.from('group_members').select('group_id').eq('group_id', invite.group_id).eq('user_id', user.id).single()
  if(!existing) {
    await supabase.from('group_members').insert({ group_id: invite.group_id, user_id: user.id, role: 'member' })
    await supabase.from('group_invites').update({ uses: invite.uses+1 }).eq('id', invite.id)
    
    // Récompense communautaire sécurisée côté serveur (comme ta migration 015)
    try {
      await supabase.from('community_rewards_log').insert({ user_id: user.id, action: 'join_group', reference_id: invite.group_id, points: 3 })
      // Appeler ta logique wallet existante : créditer 3 points via api/wallet
      await fetch(`${process.env.VITE_API_BASE_URL || 'http://localhost:5173'}/api/wallet`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}` },
        body: JSON.stringify({ user_id: user.id, type: 'earn', amount: 3, reason: 'join_group', reference_id: invite.group_id })
      }).catch(()=>{})
    } catch(e) {}
  }

  return res.json({ group_id: invite.group_id })
}
