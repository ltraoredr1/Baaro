import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { Compass, Send, ArrowLeft, Home, MessageCircle, Users, Phone, Search } from 'lucide-react';
import { useCommunity, useChannelMessages, useCurrentUser } from '../hooks/useCommunity';
import { FriendsTab } from '../features/friends/index.js';
import ContactsTab from '../features/contacts/ContactsTab.jsx';
import { COLORS as THEME_COLORS } from '../theme.js';
import ChannelItem from './community/ChannelItem.jsx';

const FALLBACK = {
  bg: "#0B1220", surface: "#111A2C", surface2: "rgba(255,255,255,0.06)",
  border: "rgba(255,255,255,0.08)", ivory: "#F5F3EF",
  muted: "rgba(245,243,239,0.5)", gold: "#D9AE52", teal: "#2DBFA6",
};

const CATEGORIES = [
  { id: 'all', label: 'Tous' },
  { id: 'community', label: 'Communauté', emoji: '🌍' },
  { id: 'business', label: 'Business', emoji: '💼' },
  { id: 'tech', label: 'Tech', emoji: '💻' },
  { id: 'etudes', label: 'Études', emoji: '📚' },
  { id: 'divertissement', label: 'Fun', emoji: '🎮' },
];

export default function CommunityTab({ onOpenProfile }) {
  const C = {...FALLBACK,...(THEME_COLORS||{})};
  const { id } = useCurrentUser() || {};
  const { groups = [], loading } = useCommunity() || {};

  const [selectedGroup, setSelectedGroup] = useState(null);
  const [selectedChannel, setSelectedChannel] = useState(null);
  const [activeTab, setActiveTab] = useState('groups');
  const [mobileView, setMobileView] = useState('groups');
  const [groupSearch, setGroupSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [msgText, setMsgText] = useState('');

  const messagesEndRef = useRef(null);
  const { messages = [], sendMessage } = useChannelMessages(selectedChannel?.id) || {};

  // Fix boucle : sélection 1 fois
  useEffect(() => {
    if (!selectedGroup && groups.length > 0) {
      const g = groups[0];
      setSelectedGroup(g);
      setSelectedChannel(g.channels?.find(c => c.type!=='voice') || g.channels?.[0] || null);
    }
  }, [groups.length]); // pas groups

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const filteredGroups = useMemo(() => {
    const q = groupSearch.trim().toLowerCase();
    return groups.filter(g => {
      const matchesSearch =!q || g.name?.toLowerCase().includes(q) || g.description?.toLowerCase().includes(q);
      const matchesCat = selectedCategory==='all' || (g.category||'community')===selectedCategory;
      return matchesSearch && matchesCat;
    });
  }, [groups, groupSearch, selectedCategory]);

  const textChannels = useMemo(() => selectedGroup?.channels?.filter(c=>c.type!=='voice')||[], [selectedGroup]);

  const handleSelectGroup = useCallback((group) => {
    setSelectedGroup(group);
    setSelectedChannel(group.channels?.find(c=>c.type!=='voice') || group.channels?.[0] || null);
    setMobileView('channels');
  }, []);

  const handleSelectChannel = useCallback((channel) => {
    setSelectedChannel(channel);
    setMobileView('chat');
  }, []);

  const handleSend = useCallback(async () => {
    const t = msgText.trim();
    if (!t) return;
    setMsgText('');
    try { await sendMessage?.(t); } catch {}
  }, [msgText, sendMessage]);

  if (loading) {
    return <div className="flex h-[100dvh] items-center justify-center" style={{ background:C.bg }}><div className="w-14 h-14 rounded-[18px] animate-pulse" style={{ background:C.gold }} /></div>;
  }

  return (
    <div className="flex flex-col md:flex-row h-[100dvh] md:h-[calc(100vh-70px)] w-full overflow-hidden" style={{ background:C.bg, color:C.ivory }}>
      {/* RAIL DESKTOP */}
      <div className="hidden md:flex w-[80px] flex-col items-center py-4 gap-3 border-r" style={{ background:C.surface, borderColor:C.border }}>
        <button onClick={()=>{ setActiveTab('discover'); setMobileView('discover'); }} className="w-[52px] h-[52px] rounded-[18px] flex items-center justify-center" style={{ background: activeTab==='discover'?C.gold:C.surface2, color: activeTab==='discover'?C.bg:C.teal }}><Compass size={24} /></button>
        {groups.slice(0,15).map(g=>(
          <button key={g.id} onClick={()=>handleSelectGroup(g)} className="w-[52px] h-[52px] rounded-[18px] font-black text-[18px] overflow-hidden shrink-0" style={{ background: selectedGroup?.id===g.id?C.gold:C.surface2, color: selectedGroup?.id===g.id?C.bg:C.muted }}>
            {g.avatar_url? <img src={g.avatar_url} className="w-full h-full object-cover" alt="" /> : g.name?.[0]?.toUpperCase()}
          </button>
        ))}
      </div>

      {/* SIDEBAR */}
      <div className={`${mobileView==='chat'? 'hidden md:flex':'flex'} w-full md:w-[360px] flex-col border-r shrink-0`} style={{ background:C.surface, borderColor:C.border }}>
        <div className="h-[64px] px-4 flex items-center gap-2 border-b shrink-0" style={{ borderColor:C.border }}>
          {mobileView!=='groups' && <button onClick={()=>setMobileView('groups')} className="md:hidden p-2 -ml-2"><ArrowLeft size={20}/></button>}
          <h2 className="font-black text-[15px] truncate">{activeTab==='discover'? 'Découvrir' : selectedGroup?.name || 'Communautés'}</h2>
        </div>

        {activeTab==='discover' || mobileView==='discover'? (
          <div className="p-3 space-y-3 flex-1 overflow-y-auto">
            <div className="flex items-center gap-2 px-3 py-2 rounded-[12px] bg-white/5"><Search size={16} className="opacity-40" /><input value={groupSearch} onChange={e=>setGroupSearch(e.target.value)} placeholder="Rechercher..." className="bg-transparent outline-none text-sm flex-1" /></div>
            <div className="flex gap-2 overflow-x-auto scrollbar-none pb-1">{CATEGORIES.map(c=><button key={c.id} onClick={()=>setSelectedCategory(c.id)} className={`px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap ${selectedCategory===c.id? 'bg-white text-black':'bg-white/10'}`}>{c.emoji||''} {c.label}</button>)}</div>
            {filteredGroups.map(g=><button key={g.id} onClick={()=>handleSelectGroup(g)} className="w-full text-left p-3 rounded-[12px] bg-white/5 hover:bg-white/10 flex gap-3"><div className="w-10 h-10 rounded-[10px] bg-white/10 flex items-center justify-center font-black shrink-0">{g.name?.[0]}</div><div className="min-w-0"><p className="text-sm font-bold truncate">{g.name}</p><p className="text-xs opacity-50 truncate">{g.description}</p></div></button>)}
          </div>
        ):(
          <>
            <div className="flex gap-1 p-2 border-b shrink-0" style={{ borderColor:C.border }}>
              {[{id:'groups',label:'Canaux',icon:MessageCircle},{id:'friends',label:'Amis',icon:Users},{id:'contacts',label:'Contacts',icon:Phone}].map(t=>{
                const Icon=t.icon; const active=activeTab===t.id;
                return <button key={t.id} onClick={()=>{setActiveTab(t.id); setMobileView(t.id)}} className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-[12px] text-[11px] font-black uppercase" style={{ background: active?C.gold:'transparent', color: active?C.bg:C.muted }}><Icon size={14}/>{t.label}</button>
              })}
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-1">
              {activeTab==='groups' && textChannels.map(ch=><ChannelItem key={ch.id} channel={ch} isActive={selectedChannel?.id===ch.id} onSelect={handleSelectChannel} />)}
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
            {messages.map(m=><div key={m.id} className="p-2.5 rounded-[10px] bg-white/5 text-sm break-words"><span className="font-bold opacity-60">{m.profiles?.handle||'Membre'}:</span> {m.text}</div>)}
            <div ref={messagesEndRef} />
          </div>
          <div className="p-3 flex gap-2 border-t shrink-0" style={{ borderColor:C.border, paddingBottom:'env(safe-area-inset-bottom)' }}>
            <input value={msgText} onChange={e=>setMsgText(e.target.value)} onKeyDown={e=>{ if(e.key==='Enter'&&!e.shiftKey){ e.preventDefault(); handleSend(); } }} placeholder={`Message dans #${selectedChannel.name}`} className="flex-1 p-3 rounded-[12px] bg-white/10 outline-none text-sm" />
            <button onClick={handleSend} disabled={!msgText.trim()} className="p-3 rounded-[12px] disabled:opacity-30" style={{ background:C.gold, color:C.bg }}><Send size={18} /></button>
          </div>
        </>: <div className="flex-1 flex items-center justify-center opacity-30 text-sm">Sélectionne un canal</div>}
      </div>

      {/* MOBILE NAV */}
      <div className="flex md:hidden h-[72px] border-t items-center justify-between px-2 shrink-0" style={{ background:C.surface, borderColor:C.border, paddingBottom:'env(safe-area-inset-bottom)' }}>
        {[{id:'groups',icon:Home,label:'Groupes'},{id:'discover',icon:Compass,label:'Découvrir'},{id:'friends',icon:Users,label:'Amis'},{id:'contacts',icon:Phone,label:'Contacts'}].map(t=>{
          const Icon=t.icon; const active=mobileView===t.id;
          return <button key={t.id} onClick={()=>{setActiveTab(t.id); setMobileView(t.id)}} className="flex flex-col items-center flex-1 py-1"><div className="w-8 h-8 rounded-[10px] flex items-center justify-center" style={{ background: active?C.gold:'transparent', color: active?C.bg:C.muted }}><Icon size={18}/></div><span className="text-[9px] font-black mt-1" style={{ color: active?C.gold:C.muted }}>{t.label}</span></button>
        })}
      </div>
    </div>
  );
}
