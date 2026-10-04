import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'

export default function InvitePage() {
  const { code } = useParams()
  const navigate = useNavigate()
  const [status, setStatus] = useState('loading')
  const [error, setError] = useState('')
  const [groupName, setGroupName] = useState('')
  const handledRef = useRef(false)

  useEffect(() => {
    async function handleInvite() {
      if (!code || handledRef.current) return
      handledRef.current = true

      try {
        const { data: { session } } = await supabase.auth.getSession()
        
        // PAS DE SESSION -> on laisse App.jsx gérer le pending
        if (!session) {
          try {
            localStorage.setItem('pending_invite_code', code.toUpperCase())
          } catch {}
          // On renvoie vers / qui affichera AuthScreen, pas /login qui n'existe pas
          navigate('/', { replace: true })
          return
        }

        const res = await fetch(`/api/invite/${code.toUpperCase()}`, {
          headers: { Authorization: `Bearer ${session.access_token}` }
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Code invalide ou expiré')

        // Succès -> on nettoie
        try {
          localStorage.removeItem('pending_invite_code')
        } catch {}

        setGroupName(data.group_name || 'le groupe')
        setStatus('success')
        
        setTimeout(() => {
          navigate(`/community?group=${data.group_id}`, { replace: true })
        }, 1500)

      } catch (e) {
        setStatus('error')
        setError(e.message)
      }
    }
    handleInvite()
  }, [code, navigate])

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white flex items-center justify-center p-4">
      <div className="bg-[#151515] border border-white/10 rounded-2xl p-8 w-full max-w-sm text-center">
        <div className="text-5xl mb-4">👥</div>
        <h1 className="text-xl font-bold mb-2">Invitation Baaro</h1>
        <p className="text-sm text-white/50 mb-6">
          Code: <span className="font-mono bg-white/10 px-2 py-1 rounded">{code?.toUpperCase()}</span>
        </p>

        {status === 'loading' && (
          <div className="flex flex-col items-center gap-3">
            <div className="w-6 h-6 border-2 border-[#FF6B00] border-t-transparent rounded-full animate-spin"></div>
            <p className="text-sm text-white/60">Vérification du lien...</p>
          </div>
        )}
        {status === 'success' && (
          <div className="flex flex-col items-center gap-3">
            <div className="w-12 h-12 bg-green-500 rounded-full flex items-center justify-center">✓</div>
            <p className="text-sm">Tu as rejoint <b>{groupName}</b> !</p>
            <p className="text-xs text-white/40">Redirection...</p>
          </div>
        )}
        {status === 'error' && (
          <div className="flex flex-col items-center gap-3">
            <div className="w-12 h-12 bg-red-500 rounded-full flex items-center justify-center">✕</div>
            <p className="text-sm text-red-400">{error}</p>
            <button onClick={() => navigate('/', { replace: true })} className="mt-2 text-xs bg-white/10 px-4 py-2 rounded-full">
              Accueil
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
