# Retouches à faire dans `src/components/CommunityTab.jsx`

Aucune suppression : 4 modifications ciblées, additives uniquement.

## 1. Import (en haut du fichier)

Cherchez le bloc d'import lucide-react + les imports friends, et ajoutez `Phone`
ainsi que l'import de `ContactsTab` :

```diff
 import { 
   Hash, Mic, Send, Plus, Users, Search, Lock,
-  Crown, Pin, Settings, Volume2, Compass, Sparkles, Globe, Flame, Smile, FileText, X, ArrowLeft, Home, MessageCircle, Heart, Bell, Zap, Coffee, Gamepad2, Briefcase, Code2, BookOpen, Music, MessageSquare
+  Crown, Pin, Settings, Volume2, Compass, Sparkles, Globe, Flame, Smile, FileText, X, ArrowLeft, Home, MessageCircle, Heart, Bell, Zap, Coffee, Gamepad2, Briefcase, Code2, BookOpen, Music, MessageSquare, Phone
 } from 'lucide-react';
 import { useCommunity, useChannelMessages, useVoiceChannel, useCurrentUser } from '../hooks/useCommunity';
 import FollowButton from '../features/friends/FollowButton.jsx';
 import { FriendsTab, FriendRequests } from '../features/friends/index.js';
+import ContactsTab from '../features/contacts/ContactsTab.jsx';
 import { COLORS } from '../theme.js';
```

## 2. Titre de l'en-tête (desktop + mobile)

Cherchez la ligne du `<h2>` qui affiche le titre du panneau :

```diff
- <h2 className="font-black text-[15px] truncate tracking-tight" style={{ color: COLORS.ivory }}>{activeTab==='discover' ? 'Découvrir' : activeTab==='friends' ? 'Amis' : selectedGroup?.name || 'Communautés'}</h2>
+ <h2 className="font-black text-[15px] truncate tracking-tight" style={{ color: COLORS.ivory }}>{activeTab==='discover' ? 'Découvrir' : activeTab==='friends' ? 'Amis' : activeTab==='contacts' ? 'Contacts' : selectedGroup?.name || 'Communautés'}</h2>
```

## 3. Onglets desktop (dans la barre "Canaux / Amis")

```diff
- {[{id:'groups', label:'Canaux', icon: MessageCircle},{id:'friends', label:'Amis', icon: Heart}].map(tab => {
+ {[{id:'groups', label:'Canaux', icon: MessageCircle},{id:'friends', label:'Amis', icon: Heart},{id:'contacts', label:'Contacts', icon: Phone}].map(tab => {
```

## 4. Contenu de l'onglet + barre du bas mobile

Juste après le bloc qui affiche `<FriendRequests />` / `<FriendsTab />`, ajoutez
le rendu de `ContactsTab` :

```diff
  {(mobileView==='friends' || activeTab==='friends') && (<div className="p-3 space-y-4"><FriendRequests onOpenProfile={onOpenProfile} /><div className="h-[1px]" style={{ background: COLORS.border }} /><FriendsTab onOpenProfile={onOpenProfile} /></div>)}
+ {(mobileView==='contacts' || activeTab==='contacts') && (<ContactsTab onOpenProfile={onOpenProfile} />)}
```

Et dans la barre de navigation mobile en bas (4 icônes Groupes/Canaux/Découvrir/Amis),
ajoutez "Contacts" comme 5ᵉ icône, et excluez aussi `contacts` du repli par défaut
sur "Groupes" (même logique que pour `friends`) :

```diff
- {[{id:'groups', icon: Home, label: 'Groupes'},{id:'channels', icon: MessageCircle, label: 'Canaux'},{id:'discover', icon: Compass, label: 'Découvrir'},{id:'friends', icon: Users, label: 'Amis'}].map(tab => { const Icon = tab.icon; const active = mobileView===tab.id || (tab.id==='groups' && activeTab==='groups' && mobileView!=='discover' && mobileView!=='friends'); return <button key={tab.id} onClick={()=>{ if(tab.id==='groups'){ setActiveTab('groups'); setMobileView('groups'); } else { setActiveTab(tab.id); setMobileView(tab.id); } }} className="flex flex-col items-center justify-center gap-1 py-2 px-3 rounded-[16px]"><div className={`w-9 h-9 rounded-[12px] flex items-center justify-center transition-all ${active ? 'shadow-lg scale-105' : ''}`} style={{ background: active ? `linear-gradient(135deg, ${COLORS.gold}, #ff8c42)` : 'transparent', color: active ? COLORS.bg : COLORS.muted }}><Icon size={20} /></div><span className="text-[10px] font-black" style={{ color: active ? COLORS.gold : COLORS.muted }}>{tab.label}</span></button>; })}
+ {[{id:'groups', icon: Home, label: 'Groupes'},{id:'channels', icon: MessageCircle, label: 'Canaux'},{id:'discover', icon: Compass, label: 'Découvrir'},{id:'friends', icon: Users, label: 'Amis'},{id:'contacts', icon: Phone, label: 'Contacts'}].map(tab => { const Icon = tab.icon; const active = mobileView===tab.id || (tab.id==='groups' && activeTab==='groups' && mobileView!=='discover' && mobileView!=='friends' && mobileView!=='contacts'); return <button key={tab.id} onClick={()=>{ if(tab.id==='groups'){ setActiveTab('groups'); setMobileView('groups'); } else { setActiveTab(tab.id); setMobileView(tab.id); } }} className="flex flex-col items-center justify-center gap-1 py-2 px-3 rounded-[16px]"><div className={`w-9 h-9 rounded-[12px] flex items-center justify-center transition-all ${active ? 'shadow-lg scale-105' : ''}`} style={{ background: active ? `linear-gradient(135deg, ${COLORS.gold}, #ff8c42)` : 'transparent', color: active ? COLORS.bg : COLORS.muted }}><Icon size={20} /></div><span className="text-[10px] font-black" style={{ color: active ? COLORS.gold : COLORS.muted }}>{tab.label}</span></button>; })}
```

C'est tout — aucune autre ligne de `CommunityTab.jsx` n'est touchée.

---

# Autres fichiers à copier tels quels

- `src/hooks/useContacts.js` — nouveau
- `src/features/friends/FriendRequestButton.jsx` — nouveau (complète `FriendRequests.jsx`
  côté envoi de demande, sans toucher à `FollowButton.jsx` ni `FriendRequests.jsx`)
- `src/features/friends/index.js` — remplace l'ancien (ajoute juste l'export de
  `FriendRequestButton`, les 3 exports existants sont identiques)
- `src/features/contacts/ContactsTab.jsx` — nouveau
- `supabase-add-contacts.sql` — à exécuter dans le SQL Editor de Supabase, **après**
  `supabase-schema.sql` et `supabase-add-social-features.sql`

# Avant de déployer

1. Exécutez `supabase-add-contacts.sql` dans Supabase.
2. Vérifiez que `follows` a bien une contrainte unique sur `(follower_id, followed_id)` —
   sinon une demande envoyée deux fois créerait deux lignes. Si besoin, décommentez la
   dernière ligne du fichier SQL.
3. Le Contact Picker (`navigator.contacts.select`) ne fonctionne que sur Chrome Android
   (HTTPS obligatoire) — partout ailleurs, `ContactsTab` bascule automatiquement sur la
   recherche manuelle par numéro/e-mail, donc aucune régression sur desktop/iOS.
