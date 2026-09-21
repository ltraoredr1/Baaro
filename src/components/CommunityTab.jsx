import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { Compass, Send, ArrowLeft, Home, MessageCircle, Users, Phone, Search } from 'lucide-react';
import { useCommunity, useChannelMessages, useCurrentUser } from '../hooks/useCommunity';
import { FriendsTab } from '../features/friends/index.js';
import ContactsTab from '../features/contacts/ContactsTab.jsx';
import { COLORS } from '../theme.js';
import ChannelItem from './community/ChannelItem.jsx';

const CATEGORIES = [
  { id: 'all', label: 'Tous' },
  { id: 'community', label: 'Communauté', emoji: '🌍' },
  { id: 'business', label: 'Business', emoji: '💼' },
  { id: 'tech', label: 'Tech', emoji: '💻' },
  { id: 'etudes', label: 'Études', emoji: '📚' },
  { id: 'divertissement', label: 'Fun', emoji: '🎮' },
];

export default function CommunityTab({ onOpenProfile }) {
  const { id } = useCurrentUser();
  const { groups, loading } = useCommunity();

  const [selectedGroup, setSelectedGroup] = useState(null);
  const [selectedChannel, setSelectedChannel] = useState(null);
  const [activeTab, setActiveTab] = useState('groups');
  const [mobileView, setMobileView] = useState('groups');
  const [groupSearch, setGroupSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [msgText, setMsgText] = useState('');

  const messagesEndRef = useRef(null);
  const { messages, sendMessage } = useChannelMessages(selectedChannel?.id);

  // Sélection initiale - 1 seule fois, pas de boucle
  useEffect(() => {
    if (!selectedGroup && groups?.length) {
      const g = groups[0];
      setSelectedGroup(g);
      setSelectedChannel(g.channels?.find(c => c.type!== 'voice') || g.channels?.[0] || null);
    }
  }, [groups]); // PAS selectedGroup ici

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const filteredGroups = useMemo(() => {
    const q = groupSearch.trim().toLowerCase();
    return groups.filter(g => {
      const matchesSearch =!q || g.name?.toLowerCase().includes(q) || g.description?.toLowerCase().includes(q);
      const matchesCat = selectedCategory === 'all' || (g.category || 'community') === selectedCategory;
      return matchesSearch && matchesCat;
    });
  }, [groups, groupSearch, selectedCategory]);

  const textChannels = useMemo(() => selectedGroup?.channels?.filter(c => c.type!== 'voice') || [], [selectedGroup]);

  const handleSelectGroup = useCallback((group) => {
    setSelectedGroup(group);
    setSelectedChannel(group.channels?.find(c => c.type!== 'voice') || group.channels?.[0] || null);
    setMobileView('channels');
  }, []);

  const handleSelectChannel = useCallback((channel) => {
    setSelectedChannel(channel);
    setMobileView('chat');
  }, []);

  if (loading) {
    return <div className="flex h-[100dvh] items-center justify-center" style={{ background: COLORS.bg }}><div className="w-14 h-14 rounded-[18px] animate-pulse" style={{ background: COLORS.gold }} /></div>;
  }

  return (
    <div className="flex flex-col md:flex-row h-[100dvh] md:h-[calc(100vh-70px)] w-full overflow-hidden" style={{ background: COLORS.bg, color: COLORS.ivory }}>
      {/* RAIL */}
      <div className="hidden md:flex w-[80px] flex-col items-center py-4 gap-3 border-r" style={{ background: COLORS.surface, borderColor: COLORS.border }}>
        <button onClick={() => { setActiveTab('discover'); setMobileView('discover'); }} className="w-[52px] h-[52px] rounded-[18px] flex items-center justify-center" style={{ background: activeTab==='discover'? COLORS.gold : COLORS.surface2, color: activeTab==='discover'? COLORS.bg : COLORS.teal }}><Compass size={24} /></button>
        {groups.slice(0,15).map(g => (
          <button key={g.id} onClick={() => handleSelectGroup(g)} className="w-[52px] h-[52px] rounded-[18px] font-black text-[18px] overflow-hidden" style={{ background: selectedGroup?.id===g.id? COLORS.gold : COLORS.surface2, color: selectedGroup?.id===g.id? COLORS.bg : COLORS.muted }}>
            {g.avatar_url? <img src={g.avatar_url} className="w-full h-full object-cover" alt="" /> : g.name?.[0]?.toUpperCase()}
          </button>
        ))}
      </div>

      {/* SIDEBAR */}
      <div className={`${mobileView==='chat'? 'hidden md:flex' : 'flex'} w-full md:w-[360px] flex-col border-r`} style={{ background: COLORS.surface, borderColor: COLORS.border }}>
        <div className="h-[64px] px-4 flex items-center gap-2 border-b" style={{ borderColor: COLORS.border }}>
          {mobileView!=='groups' && <button onClick={() => setMobileView('groups')} className="md:hidden p-2 -ml-2"><ArrowLeft size={20} /></button>}
          <h2 className="font-black text-[15px] truncate">{activeTab==='discover'? 'Découvrir' : selectedGroup?.name || 'Communautés'}</h2>
        </div>

        {activeTab==='discover' || mobileView==='discover'? (
          <div className="p-3 space-y-3 flex-1 overflow-y-auto">
            <div className="flex items-center gap-2 px-3 py-2 rounded-[12px] bg-white/5"><Search size={16} className="opacity-40" /><input value={groupSearch} onChange={e=>setGroupSearch(e.target.value)} placeholder="Rechercher..." className="bg-transparent outline-none text-sm flex-1" /></div>
            <div className="flex gap-2 overflow-x-auto scrollbar-none">{CATEGORIES.map(c => <button key={c.id} onClick={()=>setSelectedCategory(c.id)} className={`px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap ${selectedCategory===c.id? 'bg-white text-black':'bg-white/10'}`}>{c.emoji||''} {c.label}</button>)}</div>
            {filteredGroups.map(g => <button key={g.id} onClick={()=>handleSelectGroup(g)} className="w-full text-left p-3 rounded-[12px] bg-white/5 hover:bg-white/10 flex gap-3"><div className="w-10 h-10 rounded-[10px] bg-white/10 flex items-center justify-center font-black">{g.name?.[0]}</div><div><p className="text-sm font-bold">{g.name}</p><p className="text-xs opacity-50 truncate">{g.description}</p></div></button>)}
          </div>
        ) : (
          <>
            <div className="flex gap-1 p-2 border-b" style={{ borderColor: COLORS.border }}>
              {[{id:'groups',label:'Canaux',icon:MessageCircle},{id:'friends',label:'Amis',icon:Users},{id:'contacts',label:'Contacts',icon:Phone}].map(t => {
                const Icon=t.icon; const active=activeTab===t.id;
                return <button key={t.id} onClick={()=>{setActiveTab(t.id); setMobileView(t.id)}} className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-[12px] text-[11px] font-black uppercase" style={{ background: active? COLORS.gold:'transparent', color: active? COLORS.bg:COLORS.muted }}><Icon size={14}/>{t.label}</button>
              })}
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-1">
              {activeTab==='groups' && textChannels.map(ch => <ChannelItem key={ch.id} channel={ch} isActive={selectedChannel?.id===ch.id} onSelect={handleSelectChannel} />)}
              {activeTab==='friends' && <FriendsTab onOpenProfile={onOpenProfile} />}
              {activeTab==='contacts' && <ContactsTab onOpenProfile={onOpenProfile} />}
            </div>
          </>
        )}
      </div>

      {/* CHAT */}
      <div className={`${mobileView==='chat'? 'flex':'hidden'} md:flex flex-1 flex-col min-w-0`}>
        {selectedChannel? <>
          <div className="flex-1 overflow-y-auto p-4 space-y-2">
            {messages.map(m => <div key={m.id} className="p-2.5 rounded-[10px] bg-white/5 text-sm"><span className="font-bold opacity-60">{m.profiles?.handle || 'Membre'}:</span> {m.text}</div>)}
            <div ref={messagesEndRef} />
          </div>
          <div className="p-3 flex gap-2 border-t" style={{ borderColor: COLORS.border }}>
            <input value={msgText} onChange={e=>setMsgText(e.target.value)} onKeyDown={e=>e.key==='Enter'&& sendMessage(msgText).then(()=>setMsgText(''))} placeholder={`Message dans #${selectedChannel.name}`} className="flex-1 p-3 rounded-[12px] bg-white/10 outline-none text-sm" />
            <button onClick={()=> sendMessage(msgText).then(()=>setMsgText(''))} className="p-3 rounded-[12px]" style={{ background: COLORS.gold, color: COLORS.bg }}><Send size={18} /></button>
          </div>
        </> : <div className="flex-1 flex items-center justify-center opacity-30">Sélectionne un canal</div>}
      </div>

      {/* MOBILE NAV */}
      <div className="flex md:hidden h-[72px] border-t items-center justify-between px-2" style={{ background: COLORS.surface, borderColor: COLORS.border }}>
        {[{id:'groups',icon:Home,label:'Groupes'},{id:'discover',icon:Compass,label:'Découvrir'},{id:'friends',icon:Users,label:'Amis'},{id:'contacts',icon:Phone,label:'Contacts'}].map(t => {
          const Icon=t.icon; const active=mobileView===t.id;
          return <button key={t.id} onClick={()=>{setActiveTab(t.id); setMobileView(t.id)}} className="flex flex-col items-center flex-1"><div className="w-8 h-8 rounded-[10px] flex items-center justify-center" style={{ background: active? COLORS.gold:'transparent', color: active? COLORS.bg:COLORS.muted }}><Icon size={18} /></div><span className="text-[9px] font-black mt-1" style={{ color: active? COLORS.gold:COLORS.muted }}>{t.label}</span></button>
        })}
      </div>
    </div>
  );
}
