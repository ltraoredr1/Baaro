import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../supabaseClient'

export function useCommunity(userId) {
  const [friends, setFriends] = useState([])
  const [allUsers, setAllUsers] = useState([])
  const [groups, setGroups] = useState([])
  const [loading, setLoading] = useState(true)

  const loadFriends = useCallback(async () => {
    if (!userId) return
    const { data } = await supabase.from('follows').select('followed_id, profiles!follows_followed_id_fkey(username, avatar_url, is_online)').eq('follower_id', userId)
    if (data) setFriends(data.map(f => ({ id: f.followed_id, ...f.profiles })))
  }, [userId])

  const loadUsers = useCallback(async (search = '') => {
    let q = supabase.from('profiles').select('id, username, avatar_url, bio, country, is_online').limit(50)
    if (search) q = q.ilike('username', `%${search}%`)
    const { data } = await q
    if (data) setAllUsers(data)
  }, [])

  const loadGroups = useCallback(async () => {
    if (!userId) return
    const { data } = await supabase.from('group_members').select('group_id, groups(id, name, description, avatar_url, is_private, owner_id), role').eq('user_id', userId)
    if (data) {
      const enriched = []
      for (let m of data) {
        const { data: channels } = await supabase.from('channels').select('*').eq('group_id', m.groups.id).order('created_at')
        const { data: members } = await supabase.from('group_members').select('user_id, role, profiles!group_members_user_id_fkey(username, avatar_url)').eq('group_id', m.groups.id)
        const { data: roles } = await supabase.from('group_roles').select('*').eq('group_id', m.groups.id)
        enriched.push({ ...m.groups, myRole: m.role, channels: channels||[], members: members||[], customRoles: roles||[], isOwner: m.groups.owner_id === userId })
      }
      setGroups(enriched)
    }
  }, [userId])

  useEffect(() => {
    Promise.all([loadFriends(), loadUsers(), loadGroups()]).finally(()=>setLoading(false))
    const ch = supabase.channel('community-v2').on('postgres_changes', { event: '*', schema: 'public', table: 'group_members' }, loadGroups).on('postgres_changes', { event: '*', schema: 'public', table: 'channels' }, loadGroups).subscribe()
    return () => supabase.removeChannel(ch)
  }, [loadFriends, loadUsers, loadGroups])

  const createGroup = async ({ name, description, is_private, avatar_url }) => {
    const { data: group } = await supabase.from('groups').insert({ name, description, is_private, avatar_url, owner_id: userId }).select().single().throwOnError()
    await supabase.from('group_members').insert({ group_id: group.id, user_id: userId, role: 'owner' })
    await supabase.from('channels').insert([
      { group_id: group.id, name: 'général', type: 'text', description: 'Discussion générale' },
      { group_id: group.id, name: 'annonces', type: 'announcement' },
      { group_id: group.id, name: 'Vocal Général', type: 'voice' },
      { group_id: group.id, name: 'Trading BARO', type: 'text' }
    ])
    await supabase.from('group_roles').insert([
      { group_id: group.id, name: 'Admin', color: '#FF0000', permissions: { manage_channels: true, manage_members: true, ban_members: true } },
      { group_id: group.id, name: 'Modérateur', color: '#00FF00', permissions: { mute_members: true, manage_channels: false } },
      { group_id: group.id, name: 'Membre', color: '#888888', permissions: {} }
    ])
    await loadGroups()
    return group
  }

  const createChannel = async (groupId, payload) => {
    const { data } = await supabase.from('channels').insert({ group_id: groupId, ...payload }).select().single()
    await loadGroups()
    return data
  }

  const deleteChannel = async (channelId) => {
    await supabase.from('channels').delete().eq('id', channelId)
    await loadGroups()
  }

  const banMember = async (groupId, targetUserId) => {
    await supabase.from('group_members').delete().eq('group_id', groupId).eq('user_id', targetUserId)
    // optionnel: ajouter à banned list
  }

  const updateMemberRole = async (groupId, targetUserId, newRole) => {
    await supabase.from('group_members').update({ role: newRole }).eq('group_id', groupId).eq('user_id', targetUserId)
    await loadGroups()
  }

  const joinGroup = async (groupId) => {
    await supabase.from('group_members').insert({ group_id: groupId, user_id: userId, role: 'member' })
    await loadGroups()
  }

  return { friends, allUsers, groups, loading, loadUsers, createGroup, createChannel, deleteChannel, banMember, updateMemberRole, joinGroup }
}

export function useChannelMessages(channelId) {
  const [messages, setMessages] = useState([])
  useEffect(() => {
    if (!channelId) return
    supabase.from('channel_messages').select('*, profiles!channel_messages_sender_id_fkey(username, avatar_url)').eq('channel_id', channelId).order('created_at', { ascending: true }).limit(100).then(({ data }) => setMessages(data||[]))
    const ch = supabase.channel(`channel-${channelId}`).on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'channel_messages', filter: `channel_id=eq.${channelId}` }, p => setMessages(prev => [...prev, { ...p.new, profiles: { username: '...' } }])).subscribe()
    return () => supabase.removeChannel(ch)
  }, [channelId])
  const sendMessage = async (text) => {
    const { data: { session } } = await supabase.auth.getSession()
    await supabase.from('channel_messages').insert({ channel_id: channelId, sender_id: session.user.id, text })
  }
  return { messages, sendMessage }
}

// Hook vocal branché sur ton webrtc.js existant
export function useVoiceChannel(channelId, userId) {
  const [participants, setParticipants] = useState([])
  const [isJoined, setIsJoined] = useState(false)

  useEffect(() => {
    if (!channelId) return
    supabase.from('voice_participants').select('*, profiles!voice_participants_user_id_fkey(username, avatar_url)').eq('channel_id', channelId).then(({ data }) => setParticipants(data||[]))
    const ch = supabase.channel(`voice-${channelId}`).on('postgres_changes', { event: '*', schema: 'public', table: 'voice_participants', filter: `channel_id=eq.${channelId}` }, async () => {
      const { data } = await supabase.from('voice_participants').select('*, profiles!voice_participants_user_id_fkey(username, avatar_url)').eq('channel_id', channelId)
      setParticipants(data||[])
    }).subscribe()
    return () => supabase.removeChannel(ch)
  }, [channelId])

  const joinVoice = async () => {
    await supabase.from('voice_participants').upsert({ channel_id: channelId, user_id: userId })
    setIsJoined(true)
    // TODO: brancher ici ton webrtc.js : startVoiceRoom(channelId)
  }
  const leaveVoice = async () => {
    await supabase.from('voice_participants').delete().eq('channel_id', channelId).eq('user_id', userId)
    setIsJoined(false)
    // TODO: leaveVoiceRoom()
  }

  return { participants, isJoined, joinVoice, leaveVoice }
}
