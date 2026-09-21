import { useEffect, useState, useCallback, useRef } from 'react'
import { supabase } from '../supabaseClient'

export function useCurrentUser() {
  const [id, setId] = useState(null)
  const [loadingUser, setLoadingUser] = useState(true)

  useEffect(() => {
    let mounted = true
    supabase.auth.getUser().then(({ data }) => {
      if (mounted) {
        setId(data?.user?.id || null)
        setLoadingUser(false)
      }
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      if (mounted) {
        setId(session?.user?.id || null)
        setLoadingUser(false)
      }
    })
    return () => { mounted = false; subscription?.unsubscribe() }
  }, [])

  return { id, loadingUser }
}

/* COMMUNITY - 1 requête au lieu de 7 */
export function useCommunity(externalId) {
  const { id: authId } = useCurrentUser()
  const id = externalId || authId
  const [groups, setGroups] = useState([])
  const [friends, setFriends] = useState([])
  const [allUsers, setAllUsers] = useState([])
  const [loading, setLoading] = useState(true)

  const loadAll = useCallback(async () => {
    if (!id) { setGroups([]); setFriends([]); setAllUsers([]); setLoading(false); return }
    setLoading(true)
    try {
      // 1. Groupes + members + channels + profiles en 1 seule requête grâce aux FK
      const { data: groupsData, error: gError } = await supabase
       .from('groups')
       .select(`
          id, name, description, avatar_url, is_public, owner_id, category, created_at,
          channels (id, group_id, name, type, description, topic, created_at),
          group_members (group_id, user_id, role, joined_at, profiles:profiles!user_id(id, display_name, handle, avatar_url))
        `)
       .order('created_at', { ascending: false })
       .limit(20) // Pagination obligatoire, pas 100

      if (gError) throw gError

      // Normalisation pour CommunityTab
      const enriched = (groupsData || []).map(g => ({
       ...g,
        members: (g.group_members || []).map(m => ({...m, profiles: m.profiles })),
        channels: g.channels || []
      }))
      // Supprime doublons + enlève group_members brut
      setGroups(enriched.map(({ group_members,...rest }) => rest))

      // 2. Friends + Users en parallèle
      const [{ data: friendIds }, { data: users }] = await Promise.all([
        supabase.rpc('get_user_friends', { user_id: id }),
        supabase.from('profiles').select('id, display_name, handle, avatar_url, flag').order('created_at', { ascending: false }).limit(30)
      ])

      if (friendIds?.length) {
        const ids = friendIds.map(f => f.friend_id || f.id).filter(Boolean)
        const { data: friendProfiles } = await supabase.from('profiles').select('id, display_name, handle, avatar_url').in('id', ids)
        setFriends(friendProfiles || [])
      } else setFriends([])
      setAllUsers(users || [])

    } catch (e) { console.error('loadAll:', e) }
    finally { setLoading(false) }
  }, [id])

  useEffect(() => { loadAll() }, [loadAll])

  const createGroup = useCallback(async ({ name, description, is_public, category }) => {
    if (!id) throw new Error('Non connecté')
    const { data: group, error } = await supabase.from('groups').insert({
      name: name.trim(), description: description?.trim() || null,
      is_public:!!is_public, owner_id: id, category: category || 'community'
    }).select().single()
    if (error) throw error
    // Trigger SQL s'occupe de group_members owner + channels par défaut
    await loadAll()
    return group
  }, [id, loadAll])

  const createChannel = useCallback(async (groupId, payload) => {
    const name = payload.name.trim().toLowerCase().replace(/\s+/g,'-').replace(/[^a-z0-9-_]/g,'')
    const { data, error } = await supabase.from('channels').insert({
      group_id: groupId, name, type: payload.type === 'voice'? 'voice' : 'text',
      description: payload.description?.trim() || null
    }).select().single()
    if (error) throw error
    await loadAll()
    return data
  }, [loadAll])

  const banMember = useCallback(async (groupId, targetId) => {
    const { error } = await supabase.from('group_members').delete().eq('group_id', groupId).eq('user_id', targetId)
    if (error) throw error
    await loadAll()
  }, [loadAll])

  const loadUsers = useCallback(async (search = '') => {
    let q = supabase.from('profiles').select('id, display_name, handle, avatar_url, flag').limit(30)
    if (search.trim()) q = q.ilike('display_name', `%${search.trim().slice(0,30)}%`)
    const { data } = await q
    setAllUsers(data || [])
    return data
  }, [])

  return { friends, allUsers, groups, loading, loadAll, createGroup, createChannel, banMember, loadUsers, id }
}

/* MESSAGES - 1 requête avec join profil, pas 2 */
export function useChannelMessages(channelId) {
  const { id } = useCurrentUser()
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(false)
  const channelRef = useRef(channelId)
  useEffect(() => { channelRef.current = channelId }, [channelId])

  useEffect(() => {
    if (!channelId) { setMessages([]); return }
    setLoading(true)
    supabase.from('channel_messages')
     .select('id, channel_id, sender_id, text, created_at, profiles:profiles!sender_id(id, display_name, handle, avatar_url)')
     .eq('channel_id', channelId)
     .order('created_at', { ascending: true })
     .limit(50)
     .then(({ data }) => { setMessages(data || []); setLoading(false) })

    const sub = supabase.channel(`msg-${channelId}`)
     .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'channel_messages', filter: `channel_id=eq.${channelId}` },
        payload => {
          if (channelRef.current!== channelId) return
          // On fetch le profil directement via la payload si possible
          setMessages(m => m.some(x => x.id === payload.new.id)? m : [...m, payload.new])
        }
      ).subscribe()
    return () => supabase.removeChannel(sub)
  }, [channelId])

  const sendMessage = useCallback(async (text) => {
    const t = text?.trim()
    if (!t ||!id ||!channelId) return null
    const { data, error } = await supabase.from('channel_messages').insert({ channel_id: channelId, sender_id: id, text: t }).select().single()
    if (error) throw error
    return data
  }, [id, channelId])

  return { messages, loading, sendMessage }
}

export function useVoiceChannel(channelId) {
  const { id } = useCurrentUser()
  const [participants, setParticipants] = useState([])
  const [isJoined, setIsJoined] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!channelId) return
    supabase.from('voice_participants').select('*').eq('channel_id', channelId).then(({ data }) => {
      setParticipants(data || [])
      setIsJoined((data || []).some(p => p.user_id === id))
    })
    const sub = supabase.channel(`voice-${channelId}`)
     .on('postgres_changes', { event: '*', schema: 'public', table: 'voice_participants', filter: `channel_id=eq.${channelId}` },
        () => supabase.from('voice_participants').select('*').eq('channel_id', channelId).then(({ data }) => {
          setParticipants(data || [])
          setIsJoined((data || []).some(p => p.user_id === id))
        })
      ).subscribe()
    return () => supabase.removeChannel(sub)
  }, [channelId, id])

  const joinVoice = useCallback(() => supabase.from('voice_participants').upsert({ channel_id: channelId, user_id: id }, { onConflict: 'channel_id,user_id' }), [channelId, id])
  const leaveVoice = useCallback(() => supabase.from('voice_participants').delete().eq('channel_id', channelId).eq('user_id', id), [channelId, id])

  return { participants, isJoined, loading, joinVoice, leaveVoice }
}
