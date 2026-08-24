// api/gifts.js - Envoi cadeaux avec débit points sécurisé

import { createClient } from '@supabase/supabase-js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const auth = req.headers.authorization?.replace('Bearer ','')
  if(!auth) return res.status(401).json({ error: 'No auth' })

  const supabaseUser = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY, { global: { headers: { Authorization: `Bearer ${auth}` } } })
  const { data: { user } } = await supabaseUser.auth.getUser()
  if(!user) return res.status(401).json({ error: 'Invalid session' })

  const supabaseAdmin = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
  const { debateId, receiverId, giftId, amount = 1 } = req.body

  // Récupérer cadeau
  const { data: gift } = await supabaseAdmin.from('gifts_catalog').select('*').eq('id', giftId).single()
  if(!gift) return res.status(404).json({ error: 'Cadeau introuvable' })

  const totalCost = gift.price_points * amount

  // Vérifier solde et débiter (logique sécurisée comme ton wallet)
  const { data: wallet } = await supabaseAdmin.from('wallets').select('points').eq('user_id', user.id).single()
  if(!wallet || wallet.points < totalCost) return res.status(400).json({ error: `Solde insuffisant : ${totalCost} points requis` })

  // Débiter
  await supabaseAdmin.from('wallets').update({ points: wallet.points - totalCost }).eq('user_id', user.id)
  await supabaseAdmin.from('transactions').insert({ user_id: user.id, type: 'spend', amount: -totalCost, reason: `gift_${gift.name}`, reference_id: debateId })

  // Créditer le receiver (host ou co-host) en valeur BARO
  const { data: receiverWallet } = await supabaseAdmin.from('wallets').select('points').eq('user_id', receiverId).single()
  if(receiverWallet) {
    const earn = Math.floor(gift.value_baro * amount * 100) // conversion
    await supabaseAdmin.from('wallets').update({ points: receiverWallet.points + earn }).eq('user_id', receiverId)
  }

  // Logger envoi
  const { data: sent } = await supabaseAdmin.from('gifts_sent').insert({
    debate_id: debateId,
    sender_id: user.id,
    receiver_id: receiverId,
    gift_id: giftId,
    amount,
    total_points: totalCost
  }).select().single()

  return res.json({ success: true, sent, remaining_points: wallet.points - totalCost })
}
