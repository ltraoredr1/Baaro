import { useEffect, useState } from 'react'
import { supabase } from '../../../supabaseClient'

type Settings = {
  theme: 'clair' | 'sombre' | 'auto'
  accent: 'emerald' | 'gold' | 'indigo'
  private_profile: boolean
  hide_wallet: boolean
  block_screenshots: boolean
}

export function useSettings() {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setLoading(false); return }
      const { data } = await supabase.from('user_settings').select('*').eq('user_id', user.id).single()
      if (data) setSettings(data as Settings)
      setLoading(false)
    })()
  }, [])

  async function update(patch: Partial<Settings>) {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data } = await supabase.from('user_settings').upsert({
      user_id: user.id,
      ...patch,
      updated_at: new Date().toISOString()
    }).select().single()
    if (data) setSettings(data as Settings)
  }

  return { settings, loading, update }
}
