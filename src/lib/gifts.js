// src/lib/gifts.js - Système cadeaux BARO pour Lives

import { supabase } from '../supabaseClient'

export async function fetchGiftCatalog() {
  const { data } = await supabase.from('gifts_catalog').select('*').order('price_points')
  return data || []
}

export async function sendGift({ debateId, receiverId, giftId, amount = 1 }) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('Non connecté')

  const res = await fetch('/api/gifts', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`
    },
    body: JSON.stringify({ debateId, receiverId, giftId, amount })
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error)
  return data
}

export function subscribeGifts(debateId, callback) {
  const channel = supabase.channel(`gifts-${debateId}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'gifts_sent', filter: `debate_id=eq.${debateId}` }, (payload) => {
      // Enrichir avec catalogue et profiles si besoin
      callback(payload.new)
    })
    .subscribe()
  return () => supabase.removeChannel(channel)
}

// Animation cadeaux côté UI
export function playGiftAnimation(gift, container) {
  // Crée un élément flottant ❤️ ⭐ 💎 qui monte
  const el = document.createElement('div')
  el.textContent = gift.icon || '🎁'
  el.style.position = 'absolute'
  el.style.bottom = '20%'
  el.style.left = Math.random() * 80 + 10 + '%'
  el.style.fontSize = gift.price_points > 100 ? '48px' : '32px'
  el.style.animation = 'floatUp 3s ease-out forwards'
  el.style.pointerEvents = 'none'
  container.appendChild(el)
  setTimeout(() => el.remove(), 3000)
}
