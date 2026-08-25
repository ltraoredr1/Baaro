# BAARO - Module Communauté V3 (Tout-en-un)

Ce module ajoute à Baaro : liste d'amis, découverte d'utilisateurs, groupes avec plusieurs canaux (texte + vocal), rôles, invitations par lien, notifications temps réel, et récompenses BARO.

## 📁 Fichiers à ajouter

```
supabase/
  - supabase-add-community.sql        (V1: groupes, membres, canaux, messages)
  - supabase-add-community-v2.sql     (V2: rôles custom, voice_participants)
  - supabase-add-community-v3.sql     (V3: invites, notifs, rewards_log)

src/hooks/
  - useCommunity.js                   (logique principale + voice)
  - useCommunityExtras.js             (invites, notifs, rewards)

src/components/
  - CommunityTab.jsx                  (UI complète 3 colonnes type Discord)

api/
  - invite/[code].js                  (rejoindre via baaro.app/invite/XXXXXX)
```

## 🛠️ Installation (ordre important)

1. **SQL dans Supabase** (SQL Editor) :
```sql
-- exécute dans l'ordre :
-- supabase-add-community.sql
-- supabase-add-community-v2.sql
-- supabase-add-community-v3.sql
```

2. **Active Realtime** : Database > Replication > ajoute :
   - channel_messages
   - group_members
   - voice_participants
   - community_notifications
   - group_invites

3. **Copie les fichiers JS** dans src/hooks et src/components

4. **Dans src/App.jsx** :

```jsx
import CommunityTab from './components/CommunityTab'
import { useCommunityNotifications } from './hooks/useCommunityExtras'

// dans ton composant App :
const { unreadCount } = useCommunityNotifications(session?.user?.id)

// dans ton menu :
{ activeTab === 'community' && <CommunityTab userId={session?.user?.id} /> }

// badge notif sur icône communauté :
<span className="relative">
  👥 Communauté
  {unreadCount > 0 && <span className="absolute -top-1 -right-1 bg-red-500 text-[10px] px-1 rounded-full">{unreadCount}</span>}
</span>
```

5. **Route d'invitation** : si tu utilises React Router, ajoute :
```jsx
<Route path="/invite/:code" element={<InvitePage />} />
// InvitePage appelle joinViaCode(code) puis redirige vers /community
```

## 🎮 Utilisation

- Créer groupe : bouton + dans sidebar gauche → nom, description, privé/public
- Par défaut 4 canaux créés : #général, #annonces, 🔊Vocal Général, #Trading BARO
- Créer canal : champ en bas de liste canaux (admin seulement)
- Inviter : bouton 🔗 Inviter → génère baaro.app/invite/XXXXXX (choisis max uses, expiration)
- Rôles : hover sur membre → 👑 promouvoir admin / 🚫 bannir (owner/admin seulement)
- Vocal : Rejoindre / Quitter → branché sur src/lib/webrtc.js existant
- Rewards : chaque action crédite via /api/wallet (sécurisé serveur, anti-double)

## 🔒 Sécurité (comme ton système portefeuille)

- Toutes écritures via RLS + service_role key côté serveur
- Idempotence via community_rewards_log (user_id, action, reference_id) unique
- Pas de confiance au montant envoyé par client

## 💰 Barème points BARO Communauté

| Action | Points |
|---|---|
| Créer groupe | +10 |
| Créer canal | +2 |
| Créer lien invitation | +5 |
| Rejoindre via lien | +3 |
| Premier message jour / groupe | +1 |
| Daily streak (7j consécutifs) | +15 |

À ajuster dans useCommunityExtras.js -> logReward()

## 🚀 Prochaines étapes suggérées

- Mentions @username dans channel_messages (parse texte)
- Threads / réponses à un message
- Upload fichier dans canaux (réutilise ton bucket media)
- Modération IA (filtre toxicité avant envoi)

Bon build !
