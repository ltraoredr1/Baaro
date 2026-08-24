// src/lib/liveRoles.js - Gestion rôles live multi-hôtes

import { supabase } from '../supabaseClient'

function authHeaders() {
  return supabase.auth.getSession().then(({ data }) => ({
    Authorization: `Bearer ${data.session?.access_token}`,
    'Content-Type': 'application/json'
  }))
}

// Promouvoir un viewer en co-host (host seulement)
export async function promoteToCoHost({ roomId, dailyRoomName, targetUserId }) {
  const headers = await authHeaders()
  const res = await fetch('/api/live-roles', {
    method: 'POST',
    headers,
    body: JSON.stringify({ action: 'promote', roomId, dailyRoomName, targetUserId, role: 'co_host' })
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error)
  return data
}

// Rétrograder co-host -> viewer
export async function demoteToViewer({ roomId, dailyRoomName, targetUserId }) {
  const headers = await authHeaders()
  const res = await fetch('/api/live-roles', {
    method: 'POST',
    headers,
    body: JSON.stringify({ action: 'demote', roomId, dailyRoomName, targetUserId, role: 'viewer' })
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error)
  return data
}

// S'abonner aux changements de rôles en temps réel
export function subscribeRoles(debateId, callback) {
  const channel = supabase.channel(`live-roles-${debateId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'debate_participants', filter: `debate_id=eq.${debateId}` }, (payload) => {
      callback(payload.new || payload.old)
    })
    .subscribe()
  return () => supabase.removeChannel(channel)
}

// Récupérer tous les participants avec rôles
export async function getLiveParticipants(debateId) {
  const { data } = await supabase.from('debate_participants').select('*, profiles!debate_participants_user_id_fkey(username, avatar_url)').eq('debate_id', debateId)
  return data || []
}
