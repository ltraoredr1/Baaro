# BAARO

Réseau social mondial avec portefeuille de points, crypto interne (**BARO Coin**),
messagerie, marketplace, lives, abonnements et assistant IA intégré.

Données (points, transactions, avoirs crypto, social) stockées dans Postgres via Supabase.  
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
| Mobile | Capacitor (Android / iOS) |
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
| **FK partout** | `follower_id`, `followed_id`, `sender_id`, `author_id`, `actor_id`, etc. pointent vers `auth.users.id` |
| **Objets métier** | `posts.id`, `follows.id`, `messages.id`… identifient le contenu / la relation, pas l’utilisateur |

### Helpers côté code

- `getCurrentUserId()` → retourne uniquement `auth.users.id`
- `isValidAuthUserId(value)` → rejette email / handle
- `assertUserId(userId, current)` → garde-fou d’égalité

### Mode invité / anonyme

- Session Supabase `is_anonymous = true`
- Profil créé automatiquement avec `id = auth.users.id`
- Conversion possible vers compte permanent (email ou téléphone) **sans changer l’ID**
- Flags locaux : `baaro_guest_ok` (session) + `baaro_is_guest`

### Système d’abonnement & amis

- Table `follows` : `follower_id`, `followed_id`, `status`, `is_friend`
- Fonctions SQL : `get_user_friends()`, `toggle_follow()`
- Trigger `on_follow_created` pour les notifications
- RLS activées

---

## Fonctionnalités principales

- Fil social : posts, réactions, sondages, favoris, partages, score de feed
- Vidéos & Stories
- Messagerie (chiffrement E2E côté client) + appels
- Lives (rôles, cadeaux, multi-host)
- Portefeuille points + conversion BARO (écritures **uniquement** via `/api/wallet`)
- Marketplace / boutiques / commandes (prix recalculés serveur)
- Annuaire Entreprises & services
- Assistant IA (multi-modèles)
- Notifications realtime (via `/api/social`)
- Mode hors-ligne Nearby (Android natif uniquement)
- Protection anti-fraude : Turnstile, limite appareils, plafonds gains, âge min. cashout

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
api/                 # Serverless 7/12
  _lib/ai/           # Router IA
  _shared.js         # getAdminClient, requireUser, rateLimitAsync, applyCors
src/app/             # Coque principale (MainShell, tabs lazy)
src/features/        # Feed, messages, wallet, lives, shop, auth, profile…
src/components/      # UI partagée
src/hooks/ src/lib/  # Données, crypto E2E, identité, rate-limit client…
supabase/migrations/ # Schéma + RLS (source de vérité)
scripts/             # check:production, audit:security…
docs/                # Audits, checklist prod, roadmaps
```

---

## Règles de non-régression

1. **Wallet** : jamais d’écriture directe client sur `wallets` / `transactions` / `crypto_holdings`.
2. **Prix marketplace** : toujours recalculés côté serveur.
3. **Identité** : toujours `auth.users.id` comme FK — jamais email / handle / téléphone.
4. **API** : pas de nouveau fichier dans `api/` au-delà de 12 sans revue (actuellement 7/12).
5. **SECURITY DEFINER** : fixer `search_path` et tester avec 2 comptes distincts.
6. Fonctionnalités non branchées (ex. cashout Stripe) restent en 503 / message clair.

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
