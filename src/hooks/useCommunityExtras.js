import { supabase } from '../supabaseClient'

// Génère un code invitation style Discord
function genCode(len=6) {
  const chars='ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let c=''
  for(let i=0;i<len;i++) c+=chars[Math.floor(Math.random()*chars.length)]
  return c
}

export function useCommunityExtras(userId) {
  
  // Créer un lien d'invitation
  const createInviteLink = async (groupId, { maxUses=0, expiresInHours=24 } = {}) => {
    const code = genCode()
    const expires_at = new Date(Date.now() + expiresInHours*3600*1000).toISOString()
    const { data } = await supabase.from('group_invites').insert({
      group_id: groupId, code, created_by: userId, max_uses: maxUses, expires_at
    }).select().single()
    // Récompense BARO : +10 points création groupe déjà faite, +5 pour partage lien
    await logReward('create_invite', code, 5)
    return data // code à partager : baaro.app/invite/X7K9P2
  }

  // Rejoindre via code
  const joinViaCode = async (code) => {
    const { data: invite } = await supabase.from('group_invites').select('*, groups(name)').eq('code', code.toUpperCase()).single()
    if(!invite) throw new Error('Code invalide')
    if(invite.expires_at && new Date(invite.expires_at) < new Date()) throw new Error('Lien expiré')
    if(invite.max_uses>0 && invite.uses >= invite.max_uses) throw new Error('Lien épuisé')
    
    // Ajouter membre
    await supabase.from('group_members').insert({ group_id: invite.group_id, user_id: userId, role: 'member' }).then(r=>{
      if(r.error && !r.error.message.includes('duplicate')) throw r.error
    })
    // Incrémenter uses
    await supabase.from('group_invites').update({ uses: invite.uses+1 }).eq('id', invite.id)
    // Notif au owner
    await supabase.from('community_notifications').insert({
      user_id: invite.created_by, type: 'group_join', title: `Nouveau membre dans ${invite.groups.name}`, body: `Quelqu'un a rejoint via ton lien ${code}`, group_id: invite.group_id
    })
    await logReward('join_group', invite.group_id, 3)
    return invite.group_id
  }

  // Envoyer notif à tous les membres d'un canal
  const notifyChannel = async (channelId, groupId, title, body) => {
    const { data: members } = await supabase.from('group_members').select('user_id').eq('group_id', groupId)
    if(!members) return
    const notifs = members.filter(m=>m.user_id!==userId).map(m=>({
      user_id: m.user_id, type: 'new_channel', title, body, group_id: groupId, channel_id: channelId
    }))
    if(notifs.length) await supabase.from('community_notifications').insert(notifs)
  }

  // Système de points BAARO pour communauté
  const logReward = async (action, reference_id, points) => {
    try {
      await supabase.from('community_rewards_log').insert({ user_id: userId, action, reference_id, points })
      // Appeler ton api/wallet.js serveur pour créditer vraiment (sécurisé)
      await fetch('/api/wallet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}` },
        body: JSON.stringify({ type: 'community_reward', action, reference_id, points })
      })
    } catch(e) {
      // ignore duplicate (idempotence)
    }
  }

  return { createInviteLink, joinViaCode, notifyChannel, logReward }
}

// Hook notifications
import { useEffect, useState } from 'react'
export function useCommunityNotifications(userId) {
  const [notifications, setNotifications] = useState([])
  const [unreadCount, setUnreadCount] = useState(0)

  useEffect(()=>{
    if(!userId) return
    supabase.from('community_notifications').select('*').eq('user_id', userId).order('created_at', {ascending:false}).limit(50).then(({data})=>{
      setNotifications(data||[])
      setUnreadCount(data?.filter(n=>!n.is_read).length||0)
    })
    const ch = supabase.channel(`notifs-${userId}`).on('postgres_changes', {event:'INSERT', schema:'public', table:'community_notifications', filter:`user_id=eq.${userId}`}, payload=>{
      setNotifications(prev=>[payload.new, ...prev])
      setUnreadCount(c=>c+1)
      // Optionnel: vibration / son
      if('vibrate' in navigator) navigator.vibrate(100)
    }).subscribe()
    return ()=>supabase.removeChannel(ch)
  },[userId])

  const markAllRead = async () => {
    await supabase.from('community_notifications').update({is_read:true}).eq('user_id', userId).eq('is_read', false)
    setUnreadCount(0)
  }

  return { notifications, unreadCount, markAllRead }
}
