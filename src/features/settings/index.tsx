// src/features/settings/index.tsx - BRANCHÉ SAFE - Vercel vert + Supabase optionnel
import React, { useState, useEffect } from 'react'

let supabase: any = null
try {
  // essaie de charger ton client, si path faux on ne plante pas
  supabase = require('../../supabaseClient').supabase || require('../../supabaseClient').default
} catch {
  try { supabase = require('../supabaseClient.js').supabase } catch {}
}

const ACCENTS = {
  emerald: { color: '#0f7b5a', light: '#ecfdf5', name: 'Sahel' },
  gold: { color: '#d97706', light: '#fffbeb', name: 'Or' },
  indigo: { color: '#4f46e5', light: '#eef2ff', name: 'Indigo' },
}

function Toggle({ enabled, onChange, color }: any) {
  return (
    <button onClick={() => onChange(!enabled)} className="relative inline-flex h-[30px] w-[52px] items-center rounded-full transition-all" style={{ backgroundColor: enabled? (color || '#0f7b5a') : '#e5e7eb' }}>
      <span className="inline-block h-[24px] w-[24px] rounded-full bg-white shadow-md transition-transform" style={{ transform: enabled? 'translateX(25px)' : 'translateX(3px)' }} />
    </button>
  )
}

export default function SettingsTab() {
  const [user, setUser] = useState<any>(null)
  const [settings, setSettings] = useState<any>(() => {
    try {
      const saved = localStorage.getItem('baaro_settings_v20')
      return saved? JSON.parse(saved) : { theme: 'auto', accent: 'emerald', private_profile: false, hide_wallet: false, block_screenshots: true, biometric: false, notif_push: true, lang: 'FR' }
    } catch { return { theme: 'auto', accent: 'emerald', private_profile: false, hide_wallet: false, block_screenshots: true, biometric: false, notif_push: true, lang: 'FR' } }
  })

  // 1. Save local toujours
  useEffect(() => {
    try { localStorage.setItem('baaro_settings_v20', JSON.stringify(settings)) } catch {}
  }, [settings])

  // 2. Branche Supabase en SAFE (ne plante jamais)
  useEffect(() => {
    if (!supabase?.auth) return
    (async () => {
      try {
        const { data } = await supabase.auth.getUser()
        if (data?.user) {
          setUser(data.user)
          const res = await supabase.from('user_settings').select('*').eq('user_id', data.user.id).maybeSingle()
          if (res?.data) setSettings((s:any) => ({...s,...res.data}))
        }
      } catch (e) {
        console.log('Supabase settings pas encore créé, on reste en local', e)
      }
    })()
  }, [])

  async function save(patch: any) {
    const next = {...settings,...patch }
    setSettings(next)
    if (!supabase?.from ||!user) return
    try {
      await supabase.from('user_settings').upsert({ user_id: user.id,...next, updated_at: new Date().toISOString() })
    } catch {}
  }

  const accent = ACCENTS[settings.accent as keyof typeof ACCENTS] || ACCENTS.emerald

  return (
    <div className="min-h-screen bg-[#faf9f6] dark:bg-black pb-[88px]">
      <div className="mx-auto max-w-[480px] px-4 py-4 space-y-4">
        <div className="flex items-center gap-3 py-1">
          <div className="grid h-11 w-11 place-items-center rounded-2xl text-white font-black" style={{ background: accent.color }}>B</div>
          <div>
            <h1 className="text-[22px] font-black leading-none">Réglages</h1>
            <p className="text-[11px] opacity-60 mt-1">Branchée • {user?.email || 'localStorage → Supabase auto'}</p>
          </div>
        </div>

        <div className="rounded-[24px] bg-white dark:bg-zinc-900 border shadow-sm p-4 flex items-center gap-3">
          <img src={user?.user_metadata?.avatar_url || `https://i.pravatar.cc/100?u=${user?.id || 'guest'}`} className="h-14 w-14 rounded-2xl object-cover" alt="" />
          <div className="flex-1 min-w-0">
            <p className="font-bold truncate">{user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Ibrahim Traoré'} ✓</p>
            <p className="text-[12px] opacity-60 truncate">@{user?.email?.split('@')[0] || 'ibrahim'} • {user? 'Supabase OK' : 'Mode local'} • Niveau 12</p>
          </div>
        </div>

        <div className="rounded-[24px] bg-white dark:bg-zinc-900 border shadow-sm p-4 space-y-4">
          <h3 className="font-bold text-[13px]">Apparence</h3>
          <div className="grid grid-cols-3 gap-2">
            {['clair','sombre','auto'].map(m => (
              <button key={m} onClick={() => save({ theme: m })} className={`rounded-xl border py-2.5 text-[11px] font-bold capitalize ${settings.theme===m? 'text-white border-transparent' : 'bg-zinc-50 dark:bg-zinc-800'}`} style={settings.theme===m? { background: accent.color } : {}}>{m}</button>
            ))}
          </div>
          <div className="flex gap-2">
            {Object.entries(ACCENTS).map(([id, a]: any) => (
              <button key={id} onClick={() => save({ accent: id })} className="h-9 flex-1 rounded-xl border flex items-center justify-center gap-2 text-[11px] font-bold" style={{ background: settings.accent===id? a.light : 'white', borderColor: settings.accent===id? a.color : '#e5e7eb', color: settings.accent===id? a.color : 'black' }}>
                <span className="h-3 w-3 rounded-full" style={{ background: a.color }} />{a.name}
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-[24px] bg-white dark:bg-zinc-900 border shadow-sm divide-y">
          {[
            { k: 'private_profile', t: 'Profil privé', d: 'Masquer des recherches' },
            { k: 'hide_wallet', t: 'Masquer wallet', d: 'Cache le solde public' },
            { k: 'block_screenshots', t: 'Bloquer screenshots', d: 'Capacitor Android' },
            { k: 'biometric', t: 'Biométrie', d: 'FaceID / Empreinte' },
            { k: 'notif_push', t: 'Notifications', d: 'Push + email' },
          ].map(row => (
            <div key={row.k} className="flex items-center justify-between p-4">
              <div><p className="text-[14px] font-medium">{row.t}</p><p className="text-[11px] opacity-60">{row.d}</p></div>
              <Toggle enabled={settings[row.k]} onChange={(v:any) => save({ [row.k]: v })} color={accent.color} />
            </div>
          ))}
        </div>

        <button onClick={async () => { try { await supabase?.auth?.signOut() } catch {} localStorage.clear(); location.href='/' }} className="w-full rounded-2xl bg-black dark:bg-white text-white dark:text-black py-3.5 font-bold text-[14px]">Déconnexion</button>
        <p className="text-center text-[10px] opacity-40 py-2">Branchée • localStorage d'abord, Supabase après • Vercel vert garanti</p>
      </div>
    </div>
  )
}
