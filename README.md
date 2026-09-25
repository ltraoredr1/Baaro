# BAARO

Réseau social mondial avec portefeuille de points, crypto interne (**BARO Coin**),
messagerie, **communauté (groupes & canaux style Telegram)**, marketplace, lives,
abonnements, amis et assistant IA intégré.

Données (points, transactions, avoirs crypto, social, communauté) stockées dans
Postgres via Supabase.  
Compte anonyme créé automatiquement pour chaque visiteur (auth e-mail / téléphone possible ensuite).

**Site principal** : [baaro-xi.vercel.app](https://baaro-xi.vercel.app)  
**Site secondaire** : [baaro-three.vercel.app](https://baaro-three.vercel.app)

---

## Stack

| Couche | Techno |
|--------|--------|
| Frontend | React 18 + Vite + Tailwind + PWA |
| Backend data | Supabase (Postgres, Auth, Realtime, Storage, RLS) |
| API | Vercel Serverless (`api/` — 7/12 fichiers) |
| Live | Daily.co + WebRTC |
| Mobile | Capacitor (Android / iOS) — push natif inclus |
| IA | Proxy multi-fournisseurs (`/api/live` — gateway v2) |

---

## Identité utilisateur (règle unique)

```
auth.users.id
 ├── profiles.id          = auth.users.id
 ├── wallets.id           = auth.users.id
 ├── crypto_holdings.id   = auth.users.id
 └── device_accounts.id  = auth.users.id
```

### Règles d’or

| Règle | Détail |
|-------|--------|
| **Une seule identité technique** | `auth.users.id` (UUID Supabase Auth) |
| **Handle / email / téléphone** | Attributs d’affichage ou de contact, **jamais** clés relationnelles |
| **FK partout** | `follower_id`, `followed_id`, `sender_id`, `author_id`, `owner_id`, etc. → `auth.users.id` |
| **Objets métier** | `posts.id`, `follows`, `groups.id`, `channels.id`… identifient le contenu / la relation, pas l’utilisateur |

### Helpers côté code

- `getCurrentUserId()` → retourne uniquement `auth.users.id`
- `isValidAuthUserId(value)` → rejette email / handle
- `assertUserId(userId, current)` → garde-fou d’égalité

### Mode invité / anonyme

- Session Supabase `is_anonymous = true`
- Profil créé automatiquement avec `id = auth.users.id`
- Conversion possible vers compte permanent (email ou téléphone) **sans changer l’ID**
- Flags locaux : `baaro_guest_ok` (session) + `baaro_is_guest`

---

## Abonnements & amis

| Élément | Détail |
|---------|--------|
| Table | `follows` : `follower_id`, `followed_id`, **`status`**, **`is_friend`** |
| Abonnement | `toggle_follow()` / follow simple |
| Demande d’ami | `status = 'pending'`, `is_friend = true` → UI `FriendRequestButton` |
| Amis acceptés | `status = 'accepted'`, `is_friend = true` |
| RPC | `get_user_friends()`, `toggle_follow()` |
| RLS | Lecture / écriture limitées aux participants de la relation |

---

## Communauté (style Telegram)

| Concept | Table / RPC |
|---------|-------------|
| Groupe | `groups` (`is_public`, `owner_id`, `category`) |
| Canal | `channels` — types : `text`, `voice`, **`announce`** |
| Membres | `group_members` (`role` : owner / admin / moderator / member) |
| Messages | `channel_messages` (+ rate-limit) |
| Invitations | `group_invites` (code, max_uses, expires_at) |
| Bans / signalements | `group_bans`, `community_reports` |

### RPC principales

| Fonction | Rôle |
|----------|------|
| `create_community_group` | Groupe + owner + canal `#general` |
| `create_community_channel` | Canal (owner/admin uniquement) |
| `join_community_group` | Join public **ou** via code invite |
| `create_group_invite` / `list_group_invites` / `revoke_group_invite` | Gestion des codes |
| `peek_group_invite` | Aperçu avant rejoindre |
| `ban_community_member` / `set_member_role` | Modération |
| `report_community_message` | Signalement |

### Règles produit

- **Membres** écrivent dans les canaux `text` / `voice`
- Canal **`announce`** : lecture pour tous, écriture owner / admin / modo
- **Créer un canal** / **générer une invite** : owner & admin
- Deep-link : `/?invite=CODE`

### Fichiers client

- `src/hooks/useCommunity.js` — groupes, canaux, invites, messages realtime
- `src/components/CommunityTab.jsx` — UI Groupes / Découvrir / Amis / Contacts
- `src/components/community/ChannelItem.jsx`

---

## Fonctionnalités principales

- Fil social : posts, réactions, sondages, favoris, partages, score de feed
- Vidéos & Stories (lazy load + pause hors viewport pour limiter la conso)
- Messagerie (chiffrement E2E côté client) + appels
- **Communauté** : groupes, canaux, invitations, modération
- Amis & contacts (demande d’ami, sync répertoire, recherche téléphone / e-mail)
- Lives (rôles, cadeaux, multi-host)
- Portefeuille points + conversion BARO (écritures **uniquement** via `/api/wallet`)
- Marketplace / boutiques / commandes (prix recalculés serveur)
- Annuaire Entreprises & services
- Assistant IA (multi-modèles)
- Notifications realtime (`/api/social`) + **push Web & Capacitor natif**
- Mode hors-ligne Nearby (Android natif uniquement)
- Protection anti-fraude : Turnstile, limite appareils, plafonds gains, âge min. cashout

---

## Notifications push

| Plateforme | Module |
|------------|--------|
| Web | Service Worker + VAPID (`VITE_VAPID_PUBLIC_KEY`) |
| Android / iOS | `@capacitor/push-notifications` (enregistrement sans crash si permission refusée) |

Fichier : `src/lib/pushNotifications.js`  
Tokens stockés dans `push_tokens` (upsert par user + token).

---

## API — Structure finale (7/12)

Respect de la limite documentée dans `docs/API-12-FILES-PLAN.md`.

| Endpoint | Fusion | Rôle |
|----------|--------|------|
| `live.js` | ai + chat + live | AI Gateway v2, chat, Daily token, create-room, live-roles |
| `wallet.js` | payments + payout + wallet | Stripe + CinetPay + earn/redeem/convert/send_gift |
| `social.js` | notifications + comments + stories + blocks + reactions + reports | Fil social + notifications |
| `referral.js` | — | my-code, apply, group-invite |
| `register-device.js` | — | Push FCM / device binding |
| `translate.js` | — | Traduction |
| `webhooks.js` | — | CinetPay / Stripe webhooks |

**Exemples d’usage :**

```js
// Social
POST /api/social { action: "comment", post_id, text }
POST /api/social { action: "like", post_id }
POST /api/social { action: "block", blocked_id }

// Wallet
POST /api/wallet { action: "status" }
POST /api/wallet { action: "earn", actionKey: "publish_post", referenceId }
POST /api/wallet { action: "pay", amount: 500, provider: "cinetpay" }
```

---

## Démarrage rapide

```bash
npm install
cp .env.example .env.local
# Renseigner VITE_SUPABASE_*, SUPABASE_SERVICE_ROLE_KEY, etc.

npm run dev
```

Ouvre [http://localhost:5173](http://localhost:5173).

### Migrations Supabase

Appliquer les fichiers de `supabase/migrations/` **dans l’ordre numérique** sur un projet de staging d’abord.  
Les scripts legacy (`legacy/`) ne doivent plus être rejoués sur une base déjà migrée.

Migrations utiles pour la communauté / amis :

- Schéma communauté + RLS + RPC groupes / canaux / bans
- Invitations (`group_invites`) + `join_community_group` (code ou public)
- Canaux type `announce` + `can_post_in_channel`
- `follows.status` / `follows.is_friend` + policies

### Garde-fou avant prod

```bash
npm run check:production
npm run audit:security
npm run build
```

---

## Déploiement Vercel

Variables obligatoires (exemples dans `.env.example` / `.env.production.example`) :

- `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (**jamais** préfixée `VITE_`)
- `ALLOWED_ORIGINS`, `PUBLIC_APP_URL`
- `VITE_VAPID_PUBLIC_KEY` (notifications web)
- Clés IA / paiement / Daily selon les modules activés

Rewrites legacy (dans `vercel.json`) :

```json
{
  "rewrites": [
    { "source": "/api/ai", "destination": "/api/live" },
    { "source": "/api/chat", "destination": "/api/live" },
    { "source": "/api/create-room", "destination": "/api/live" },
    { "source": "/api/payments", "destination": "/api/wallet" },
    { "source": "/api/payout", "destination": "/api/wallet" }
  ]
}
```

---

## Structure utile

```
api/                      # Serverless 7/12
  _lib/ai/                # Router IA
  _shared.js              # getAdminClient, requireUser, rateLimitAsync, applyCors
src/app/                  # Coque principale (MainShell, tabs lazy)
src/features/             # Feed, messages, wallet, lives, shop, auth, profile…
  friends/                # FriendRequestButton, FriendsTab
  contacts/               # ContactsTab
src/components/           # UI partagée
  CommunityTab.jsx        # Groupes / Découvrir / Amis / Contacts
  community/              # ChannelItem, UnreadBadge…
  LazyMedia.jsx           # Images + vidéos lazy (conso)
src/hooks/
  useCommunity.js         # Groupes, canaux, invites, messages
src/lib/
  pushNotifications.js    # Web + Capacitor
supabase/migrations/      # Schéma + RLS (source de vérité)
scripts/                  # check:production, audit:security…
docs/                     # Audits, checklist prod, roadmaps
```

---

## Règles de non-régression

1. **Wallet** : jamais d’écriture directe client sur `wallets` / `transactions` / `crypto_holdings`.
2. **Prix marketplace** : toujours recalculés côté serveur.
3. **Identité** : toujours `auth.users.id` comme FK — jamais email / handle / téléphone.
4. **API** : pas de nouveau fichier dans `api/` au-delà de 12 sans revue (actuellement 7/12).
5. **SECURITY DEFINER** : fixer `search_path` et tester avec 2 comptes distincts.
6. **Communauté** : join / create canal / invites uniquement via RPC ; respect des rôles (announce = admin).
7. **Amis** : demandes via `status` + `is_friend` ; ne pas confondre avec un simple follow.
8. Fonctionnalités non branchées (ex. cashout Stripe) restent en 503 / message clair.

---

## Scripts npm

| Script | Rôle |
|--------|------|
| `npm run dev` | Dev local |
| `npm run build` | Build production |
| `npm run check:production` | Fichiers / scripts critiques |
| `npm run audit:security` | Scan statique sécurité |
| `npm run check:e2e` | Préparation E2E |
| `npm run cap:sync` | Sync Capacitor après build |

---

## Documentation

- `docs/PRODUCTION-CHECKLIST.md` — checklist mise en prod
- `docs/SECURITY.md` — modèle de menace wallet / auth
- `docs/IDENTITY-USER-ID.md` — modèle d’identité
- `docs/REMAINING-OPS.md` — Upstash, Stripe, CinetPay, observabilité
- `docs/BAARO-2.0-ALL-ROADMAP.md` — consolidation long terme
- `docs/API-12-FILES-PLAN.md` — plan limite 12 fichiers API

---

## Licence / contribution

Dépôt public.  
Avant toute PR : `npm run build` + `npm run check:production` + `npm run audit:security`.
