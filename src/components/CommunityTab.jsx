import { useState } from 'react'
import { useCommunity, useChannelMessages, useVoiceChannel } from '../hooks/useCommunity'

export default function CommunityTab({ userId }) {
  const { friends, allUsers, groups, createGroup, createChannel, deleteChannel, banMember, updateMemberRole, loadUsers } = useCommunity(userId)
  const [activeTab, setActiveTab] = useState('groups')
  const [selectedGroup, setSelectedGroup] = useState(null)
  const [selectedChannel, setSelectedChannel] = useState(null)
  const [showCreateGroup, setShowCreateGroup] = useState(false)
  const [newGroup, setNewGroup] = useState({ name: '', description: '', is_private: false })
  const [newChannelName, setNewChannelName] = useState('')
  const [newChannelType, setNewChannelType] = useState('text')
  const [search, setSearch] = useState('')
  const [showMembers, setShowMembers] = useState(true)

  const { messages, sendMessage } = useChannelMessages(selectedChannel?.id)
  const { participants: voiceParticipants, isJoined, joinVoice, leaveVoice } = useVoiceChannel(selectedChannel?.id, userId)
  const [msgText, setMsgText] = useState('')

  const myRoleInSelected = selectedGroup?.members?.find(m => m.user_id === userId)?.role || selectedGroup?.myRole
  const isAdmin = ['owner','admin'].includes(myRoleInSelected)
  const isOwner = myRoleInSelected === 'owner'

  const roleColor = (role) => {
    if(role==='owner') return 'bg-red-600 text-white'
    if(role==='admin') return 'bg-[#FF6B00] text-white'
    if(role==='moderator') return 'bg-green-600 text-white'
    return 'bg-white/10 text-white/60'
  }

  const handleCreateGroup = async () => {
    if(!newGroup.name) return
    const g = await createGroup(newGroup)
    setShowCreateGroup(false)
    setNewGroup({ name:'', description:'', is_private:false })
    setSelectedGroup(g)
  }

  return (
    <div className="flex h-[calc(100vh-70px)] bg-[#0A0A0A] text-white font-sans">
      {/* COLONNE 1 - Groupes */}
      <div className="w-[72px] bg-[#0F0F0F] border-r border-white/5 flex flex-col items-center py-3 gap-3 overflow-y-auto">
        <div className="w-12 h-12 rounded-[18px] bg-white/10 flex items-center justify-center">🏠</div>
        <div className="w-8 h-[2px] bg-white/10 rounded-full"></div>
        {groups.map(g => (
          <button key={g.id} onClick={()=>{setSelectedGroup(g); setSelectedChannel(g.channels?.[0]||null)}} className={`w-12 h-12 rounded-[18px] flex items-center justify-center font-bold text-sm transition-all ${selectedGroup?.id===g.id ? 'bg-[#FF6B00] rounded-[12px]' : 'bg-[#1A1A1A] hover:bg-[#222] hover:rounded-[12px]'}`}>
            {g.name[0]?.toUpperCase()}
          </button>
        ))}
        <button onClick={()=>setShowCreateGroup(true)} className="w-12 h-12 rounded-[18px] bg-[#1A1A1A] hover:bg-[#FF6B00] flex items-center justify-center">+</button>
      </div>

      {/* COLONNE 2 - Canaux / Listes */}
      <div className="w-64 bg-[#111] border-r border-white/10 flex flex-col">
        <div className="h-12 px-4 flex items-center font-bold border-b border-white/10 shadow">
          {selectedGroup ? selectedGroup.name : 'Communauté'}
        </div>

        <div className="flex gap-1 p-2">
          <button onClick={()=>setActiveTab('groups')} className={`flex-1 py-1.5 rounded text-xs ${activeTab==='groups'?'bg-white/15':''}`}>Canaux</button>
          <button onClick={()=>setActiveTab('friends')} className={`flex-1 py-1.5 rounded text-xs ${activeTab==='friends'?'bg-white/15':''}`}>Amis</button>
          <button onClick={()=>setActiveTab('discover')} className={`flex-1 py-1.5 rounded text-xs ${activeTab==='discover'?'bg-white/15':''}`}>Découvrir</button>
        </div>

        <div className="flex-1 overflow-y-auto px-2 py-2">
          {activeTab==='groups' && selectedGroup && (
            <>
              <div className="text-[11px] text-white/30 uppercase tracking-widest mb-2 px-2">Canaux texte</div>
              {selectedGroup.channels?.filter(c=>c.type!=='voice').map(ch => (
                <div key={ch.id} className="group flex items-center justify-between">
                  <div onClick={()=>setSelectedChannel(ch)} className={`flex-1 flex items-center gap-2 px-2 py-1.5 rounded text-sm cursor-pointer ${selectedChannel?.id===ch.id ? 'bg-white/10 text-white' : 'text-white/50 hover:text-white/90 hover:bg-white/5'}`}>
                    <span className="text-white/30">#</span>{ch.name}
                  </div>
                  {isAdmin && <button onClick={()=>deleteChannel(ch.id)} className="opacity-0 group-hover:opacity-100 text-[10px] text-red-400 pr-2">✕</button>}
                </div>
              ))}

              <div className="text-[11px] text-white/30 uppercase tracking-widest mt-4 mb-2 px-2">Canaux vocaux</div>
              {selectedGroup.channels?.filter(c=>c.type==='voice').map(ch => (
                <div key={ch.id} className="mb-1">
                  <div onClick={()=>setSelectedChannel(ch)} className={`flex items-center gap-2 px-2 py-1.5 rounded text-sm cursor-pointer ${selectedChannel?.id===ch.id ? 'bg-white/10' : 'text-white/50 hover:bg-white/5'}`}>
                    🔊 {ch.name}
                  </div>
                  {/* Participants vocaux */}
                  {ch.id===selectedChannel?.id && voiceParticipants.length>0 && (
                    <div className="ml-6 mt-1 space-y-1">
                      {voiceParticipants.map(p => (
                        <div key={p.user_id} className="flex items-center gap-2 text-xs text-white/60">
                          <img src={p.profiles?.avatar_url || `https://api.dicebear.com/7.x/initials/svg?seed=${p.profiles?.username}`} className="w-5 h-5 rounded-full" />
                          {p.profiles?.username} {p.is_muted && '🔇'}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}

              {isAdmin && (
                <div className="mt-4 px-2 flex gap-1">
                  <input value={newChannelName} onChange={e=>setNewChannelName(e.target.value)} placeholder="nouveau canal" className="flex-1 bg-black/60 text-xs px-2 py-1 rounded" />
                  <select value={newChannelType} onChange={e=>setNewChannelType(e.target.value)} className="bg-black/60 text-xs rounded">
                    <option value="text">Texte</option>
                    <option value="voice">Vocal</option>
                    <option value="announcement">Annonce</option>
                  </select>
                  <button onClick={async()=>{ if(newChannelName){ await createChannel(selectedGroup.id, {name:newChannelName, type:newChannelType}); setNewChannelName('')} }} className="bg-[#FF6B00] px-2 rounded text-xs">+</button>
                </div>
              )}

              <div className="mt-6">
                <button onClick={()=>setShowMembers(!showMembers)} className="text-[11px] text-white/30 uppercase tracking-widest px-2">Membres — {selectedGroup.members?.length}</button>
                {showMembers && selectedGroup.members?.map(m => (
                  <div key={m.user_id} className="group flex items-center gap-2 px-2 py-1.5 text-xs">
                    <img src={m.profiles?.avatar_url || `https://api.dicebear.com/7.x/initials/svg?seed=${m.profiles?.username}`} className="w-6 h-6 rounded-full" />
                    <span className="flex-1 truncate">{m.profiles?.username}</span>
                    <span className={`text-[9px] px-1.5 py-0.5 rounded ${roleColor(m.role)}`}>{m.role}</span>
                    {isAdmin && m.user_id!==userId && m.role!=='owner' && (
                      <div className="hidden group-hover:flex gap-1">
                        <button onClick={()=>updateMemberRole(selectedGroup.id, m.user_id, m.role==='admin'?'member':'admin')} className="text-[9px]">👑</button>
                        <button onClick={()=>banMember(selectedGroup.id, m.user_id)} className="text-[9px] text-red-400">🚫</button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}

          {activeTab==='friends' && friends.map(f => (
            <div key={f.id} className="px-2 py-2 flex items-center gap-2 text-sm hover:bg-white/5 rounded">
              <img src={f.avatar_url || `https://api.dicebear.com/7.x/initials/svg?seed=${f.username}`} className="w-7 h-7 rounded-full" />
              <span>{f.username}</span><span className="ml-auto w-2 h-2 bg-green-500 rounded-full"></span>
            </div>
          ))}

          {activeTab==='discover' && (
            <div>
              <input value={search} onChange={e=>{setSearch(e.target.value); loadUsers(e.target.value)}} placeholder="Chercher" className="w-full bg-black/50 px-3 py-2 rounded-full text-xs mb-3" />
              {allUsers.map(u => (
                <div key={u.id} className="flex items-center gap-2 py-1.5 text-sm">
                  <img src={u.avatar_url || `https://api.dicebear.com/7.x/initials/svg?seed=${u.username}`} className="w-7 h-7 rounded-full" />
                  <div className="flex-1"><div>{u.username}</div><div className="text-[10px] text-white/40">{u.country||'Mali'}</div></div>
                  <button className="text-[10px] bg-white/10 px-3 py-1 rounded-full">Suivre</button>
                </div>
              ))}
            </div>
          )}

          {activeTab==='groups' && !selectedGroup && (
            <div className="text-center text-white/30 text-xs mt-10">Sélectionne un groupe à gauche<br/>ou crée-en un nouveau</div>
          )}
        </div>
      </div>

      {/* COLONNE 3 - Chat */}
      <div className="flex-1 flex flex-col bg-[#151515]">
        {!selectedChannel ? (
          <div className="flex-1 flex flex-col items-center justify-center text-white/30">
            <div className="text-5xl mb-4">💬</div>
            <div className="text-sm">Bienvenue dans {selectedGroup?.name || 'Baaro'}</div>
            <div className="text-xs mt-1">Choisis un canal pour discuter</div>
          </div>
        ) : selectedChannel.type==='voice' ? (
          <div className="flex-1 flex flex-col items-center justify-center">
            <div className="text-6xl mb-4">🔊</div>
            <h3 className="font-bold text-lg">{selectedChannel.name}</h3>
            <p className="text-white/40 text-xs mb-6">{voiceParticipants.length} participant(s)</p>
            <div className="flex gap-3">
              {!isJoined ? (
                <button onClick={joinVoice} className="bg-green-600 px-6 py-2 rounded-full text-sm">Rejoindre le vocal</button>
              ) : (
                <button onClick={leaveVoice} className="bg-red-600 px-6 py-2 rounded-full text-sm">Quitter</button>
              )}
            </div>
            <div className="mt-8 grid grid-cols-3 gap-4">
              {voiceParticipants.map(p => (
                <div key={p.user_id} className="bg-[#111] p-3 rounded-xl text-center">
                  <img src={p.profiles?.avatar_url || `https://api.dicebear.com/7.x/initials/svg?seed=${p.profiles?.username}`} className="w-12 h-12 rounded-full mx-auto mb-2" />
                  <div className="text-xs">{p.profiles?.username}</div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <>
            <div className="h-12 border-b border-white/10 flex items-center px-4 gap-2">
              <span className="text-white/30">#</span><span className="font-bold">{selectedChannel.name}</span>
              <span className="text-xs text-white/30 ml-2">{selectedChannel.description}</span>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {messages.map(m => (
                <div key={m.id} className="flex gap-3">
                  <img src={m.profiles?.avatar_url || `https://api.dicebear.com/7.x/initials/svg?seed=${m.profiles?.username || 'user'}`} className="w-8 h-8 rounded-full mt-0.5" />
                  <div>
                    <div className="flex items-baseline gap-2"><span className="text-sm font-bold">{m.profiles?.username||'Utilisateur'}</span><span className="text-[10px] text-white/30">{new Date(m.created_at).toLocaleTimeString()}</span></div>
                    <div className="text-[14px] text-white/80 leading-5">{m.text}</div>
                  </div>
                </div>
              ))}
            </div>
            <div className="p-3">
              <div className="bg-[#0A0A0A] rounded-full flex items-center px-2">
                <input value={msgText} onChange={e=>setMsgText(e.target.value)} onKeyDown={e=>{ if(e.key==='Enter' && msgText.trim()){ sendMessage(msgText); setMsgText('') }}} placeholder={`Envoyer un message dans #${selectedChannel.name}`} className="flex-1 bg-transparent px-4 py-3 text-sm outline-none" />
                <button onClick={()=>{ if(msgText.trim()){ sendMessage(msgText); setMsgText('')} }} className="bg-[#FF6B00] w-8 h-8 rounded-full flex items-center justify-center">↑</button>
              </div>
            </div>
          </>
        )}
      </div>

      {showCreateGroup && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-[#1A1A1A] p-6 rounded-2xl w-full max-w-sm border border-white/10">
            <h3 className="font-bold text-lg mb-1">Créer un groupe</h3>
            <p className="text-xs text-white/40 mb-4">Un groupe peut avoir plusieurs canaux comme Discord</p>
            <input value={newGroup.name} onChange={e=>setNewGroup({...newGroup, name:e.target.value})} placeholder="Nom (ex: Traders BARO Mali)" className="w-full bg-black/50 p-3 rounded-xl mb-3 text-sm" />
            <textarea value={newGroup.description} onChange={e=>setNewGroup({...newGroup, description:e.target.value})} placeholder="Description" className="w-full bg-black/50 p-3 rounded-xl mb-3 text-sm h-20" />
            <label className="flex items-center gap-2 text-sm mb-6"><input type="checkbox" checked={newGroup.is_private} onChange={e=>setNewGroup({...newGroup, is_private:e.target.checked})} /> Groupe privé (sur invitation)</label>
            <div className="flex gap-2 justify-end">
              <button onClick={()=>setShowCreateGroup(false)} className="px-5 py-2.5 text-sm">Annuler</button>
              <button onClick={handleCreateGroup} className="bg-[#FF6B00] px-5 py-2.5 rounded-full text-sm font-bold">Créer le groupe</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
