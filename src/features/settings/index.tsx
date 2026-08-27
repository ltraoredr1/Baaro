
// src/features/settings/index.tsx - FINAL TSX - VERT VERCEL - BAARO 2.0 v20+
import React, { useEffect, useState } from 'react'
import { supabase } from '../../supabaseClient'

type Accent = { id: 'emerald' | 'gold' | 'indigo'; name: string; color: string; light: string }
const ACCENTS: Record<string, Accent> = {
  emerald: { id: 'emerald', name: 'Sahel', color: '#0f7b5a', light: '#ecfdf5' },
  gold: { id: 'gold', name: 'Or', color: '#d97706', light: '#fffbeb' },
  indigo: { id: 'indigo', name: 'Indigo', color: '#4f46e5', light: '#eef2ff' },
}

function Toggle({ enabled, onChange, color }: { enabled: boolean; onChange: (v: boolean) => void; color?: string }) {
  return (
    <button
      onClick={() => onChange(!enabled)}
      className="relative inline-flex h-[30px] w-[52px] items-center rounded-full transition-all"
      style={{ backgroundColor: enabled ? color || '#0f7b5a' : '#e5e7eb' }}
    >
      <span className="inline-block h-[24px] w-[24px] rounded-full bg-white shadow-md transition-transform" style={{ transform: enabled ? 'translateX(25px)' : 'translateX(3px)' }} />
    </button>
  )
}

export default function SettingsTab() {
  const [user, setUser] = useState<any>(null)
  const [settings, setSettings] = useState({
    theme: 'auto' as 'clair' | 'sombre' | 'auto',
    accent: 'emerald' as 'emerald' | 'gold' | 'indigo',
    lang: 'FR',
    private_profile: false,
    hide_wallet: false,
    block_screenshots: true,
    biometric: false,
    notif_push: true,
  })
  const [loading, setLoading] = useState(true)

  const accent = ACCENTS[settings.accent]

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser()
      if (data?.user) {
        setUser(data.user)
        const res: any = await supabase.from('user_settings').select('*').eq('user_id', data.user.id).single()
        if (res.data) setSettings(s => ({ ...s, ...res.data }))
      }
      setLoading(false)
    })()
  }, [])

  async function save(patch: Partial<typeof settings>) {
    const next = { ...settings, ...patch }
    setSettings(next)
    if (!user) return
    await supabase.from('user_settings').upsert({
      user_id: user.id,
      ...next,
      updated_at: new Date().toISOString()
    } as any)
  }

  if (loading) return <div className="min-h-screen grid place-items-center bg-[#faf9f6]"><div className="h-8 w-8 rounded-full border-2 border-emerald-600 border-t-transparent animate-spin" /></div>

  return (
    <div className="min-h-screen bg-[#faf9f6] dark:bg-black pb-[88px]">
      <div className="mx-auto max-w-[480px] px-4 py-4 space-y-4">
        <div className="flex items-center gap-3 py-1">
          <div className="grid h-11 w-11 place-items-center rounded-2xl text-white font-black text-[18px]" style={{ background: accent.color }}>B</div>
          <div>
            <h1 className="text-[22px] font-black leading-none tracking-tight">Réglages</h1>
            <p className="text-[11px] opacity-60 mt-1">Baaro 2.0.0-v20+ • {user?.email || 'Bamako • Vert Vercel'}</p>
          </div>
        </div>

        <div className="rounded-[24px] bg-white dark:bg-zinc-900 border shadow-sm p-4 flex items-center gap-3">
          <img src={user?.user_metadata?.avatar_url || `https://i.pravatar.cc/100?u=${user?.id}`} className="h-14 w-14 rounded-2xl object-cover" alt="" />
          <div className="flex-1 min-w-0">
            <p className="font-bold truncate flex items-center gap-1.5">{user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Ibrahim Traoré'} <span className="text-[10px] px-1.5 py-0.5 rounded-full text-white" style={{ background: accent.color }}>✓</span></p>
            <p className="text-[12px] opacity-60 truncate">@{user?.email?.split('@')[0] || 'ibrahim'} • 2,450 BARO • Niveau 12 • TSX</p>
          </div>
          <button className="h-8 px-3 rounded-full bg-zinc-100 dark:bg-zinc-800 text-[11px] font-bold">Voir</button>
        </div>

        <div className="rounded-[24px] bg-white dark:bg-zinc-900 border shadow-sm p-4 space-y-4">
          <h3 className="font-bold text-[13px]">Apparence</h3>
          <div className="grid grid-cols-3 gap-2">
            {(['clair','sombre','auto'] as const).map(m => (
              <button key={m} onClick={() => save({ theme: m })} className={`rounded-xl border py-2.5 text-[11px] font-bold capitalize ${settings.theme===m ? 'text-white border-transparent' : 'bg-zinc-50 dark:bg-zinc-800'}`} style={settings.theme===m ? { background: accent.color } : {}}>{m}</button>
            ))}
          </div>
          <div className="flex gap-2">
            {Object.values(ACCENTS).map(a => (
              <button key={a.id} onClick={() => save({ accent: a.id as any })} className="h-9 flex-1 rounded-xl border flex items-center justify-center gap-2 text-[11px] font-bold" style={{ background: settings.accent===a.id ? a.light : 'white', borderColor: settings.accent===a.id ? a.color : '#e5e7eb', color: settings.accent===a.id ? a.color : 'black' }}>
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
              <Toggle enabled={(settings as any)[row.k]} onChange={v => save({ [row.k]: v } as any)} color={accent.color} />
            </div>
          ))}
        </div>

        <div className="space-y-2">
          <button onClick={async () => { await supabase.auth.signOut(); location.href='/' }} className="w-full rounded-2xl bg-black dark:bg-white text-white dark:text-black py-3.5 font-bold text-[14px]">Déconnexion</button>
          <p className="text-center text-[10px] opacity-40 py-2">Baaro • TSX Vert Vercel • {new Date().toLocaleDateString()} • Made in Bamako</p>
        </div>
      </div>
    </div>
  )
}
