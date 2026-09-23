## BAARO
Réseau social mondial avec portefeuille de points, crypto interne (BARO Coin),
messagerie, marketplace, lives, abonnements et assistant IA intégré.

Données (points, transactions, avoirs crypto, social) stockées dans Postgres via Supabase.
Compte anonyme créé automatiquement pour chaque visiteur (auth e-mail possible ensuite).

# Site : baaro-xi.vercel.app

### Stack
Couche	Techno
Frontend	React 18 + Vite + Tailwind + PWA
Backend data	Supabase (Postgres, Auth, Realtime, Storage, RLS)
API	Vercel Serverless (api/ - 7/12 fichiers)
Live	Daily.co + WebRTC
Mobile	Capacitor (Android / iOS)
IA	Proxy multi-fournisseurs (/api/live - gateway v2)
Fonctionnalités principales
Fil social : posts, réactions, sondages, favoris, partages, score de feed
Vidéos & Stories
Messagerie (chiffrement E2E côté client) + appels
Lives (rôles, cadeaux, multi-host)
Portefeuille points + conversion BARO (écritures uniquement via /api/wallet)
Marketplace / boutiques / commandes (prix recalculés serveur)
Annuaire Entreprises & services
Assistant IA (multi-modèles)
Notifications realtime (via /api/social)
Mode hors-ligne Nearby (Android natif uniquement)
Protection anti-fraude : Turnstile, limite appareils, plafonds gains, âge min. cashout
## Identifications
Modèle d’identité définitivement retenu:
auth.users.id
    ├── profiles.id = auth.users.id
    ├── wallets.id = auth.users.id
    ├── crypto_holdings.id = auth.users.id
    └── device_accounts.id = auth.users.id
Donc :

auth.users.id = seule identité technique utilisateur
handle, téléphone, email ≠ identité
follower_id, followed_id, sender_id, receiver_id, actor_id, reporter_id, blocker_id, etc. restent des FK vers cette identité
follows.id, quand présent, identifie la relation, pas l'utilisateur.
Systeme d'abonnement et amis
Table follows : colonnes follower_id, followed_id, status, is_friend ✅
Fonctions SQL : get_user_friends(), toggle_follow() ✅
Trigger : on_follow_created pour les notifications ✅
Politiques RLS : activées et fonctionnelles ✅
API - Structure finale (7/12)
Respect de la limite documentée docs/API-12-FILES-PLAN.md.

Endpoint	Fusion	Rôle
live.js	ai.js + chat.js + live.js (3→1)	AI Gateway v2, chat, Daily token, create-room, live-roles
wallet.js	payments.js + payout.js + wallet.js (3→1)	Stripe + CinetPay + earn/redeem/convert/send_gift + payout 503
social.js	notifications + comments + stories + blocks + reactions + reports (6→1)	Fil social complet + notifications realtime
referral.js	-	my-code, apply, group-invite (BAARO-XXXX + invites groupes + live)
register-device.js	-	Push FCM / device binding
translate.js	-	Traduction
webhooks.js	-	CinetPay / Stripe webhooks
Utilisation social.js :

js
POST /api/social { action: "comment", post_id, text }
POST /api/social { action: "list_comments", post_id }
POST /api/social { action: "like", post_id }
POST /api/social { action: "block", blocked_id }
POST /api/social { action: "create_story", text, media_url }
POST /api/social { action: "notification" }
POST /api/social { action: "unread_count" }
POST /api/social { action: "read_all" }
Utilisation wallet.js :

js
POST /api/wallet { action: "status" }
POST /api/wallet { action: "earn", actionKey: "publish_post", referenceId }
POST /api/wallet { action: "pay", amount: 500, provider: "cinetpay" }
POST /api/wallet { action: "pay", amount: 1000, provider: "stripe" }
GET  /api/wallet?action=payments // historique topup
Démarrage rapide
bash
npm install
cp .env.example .env.local
# Renseigner VITE_SUPABASE_*, SUPABASE_SERVICE_ROLE_KEY, etc.
npm run dev
Ouvre http://localhost:5173.

Migrations Supabase
Appliquer les fichiers de supabase/migrations/ dans l’ordre numérique sur un projet de staging d’abord.
Les scripts legacy hors ordre (legacy/) ne doivent plus être rejoués sur une base déjà migrée.

Garde-fou avant prod :

bash
npm run check:production
npm run audit:security
npm run build
Déploiement Vercel
Variables obligatoires (exemples dans .env.example / .env.production.example) :

VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY (jamais préfixée VITE_)
ALLOWED_ORIGINS, PUBLIC_APP_URL
Clés IA / paiement / Daily selon les modules activés
Les rewrites legacy :

json
{
  "rewrites": [
    { "source": "/api/ai", "destination": "/api/live" },
    { "source": "/api/chat", "destination": "/api/live" },
    { "source": "/api/create-room", "destination": "/api/live" },
    { "source": "/api/payments", "destination": "/api/wallet" },
    { "source": "/api/payout", "destination": "/api/wallet" }
  ]
}
Structure utile
api/                 # Serverless 7/12 (live, wallet, social, referral, register-device, translate, webhooks)
  _lib/ai/           # Router IA
  _shared.js         # getAdminClient, requireUser, rateLimitAsync, applyCors
src/app/             # Coque principale (MainShell, tabs lazy)
src/features/        # Feed, messages, wallet, lives, shop, …
src/components/      # UI partagée
src/hooks/ src/lib/  # Données, crypto E2E, rate-limit client, …
supabase/migrations/ # Schéma + RLS (source de vérité)
scripts/             # check:production, audit:security, …
docs/                # Audits, checklist prod, roadmaps
Règles de non-régression
Wallet : jamais d’écriture directe client sur wallets / transactions / crypto_holdings.
Prix marketplace : toujours recalculés côté serveur (create_order_secure / équivalent).
Pas de virtualisation de liste ajoutée sans validation produit explicite.
Pas de nouveau fichier dans api/ au-delà de 12 sans revue (actuellement 7/12).
Toute migration SECURITY DEFINER doit fixer search_path et être testée avec 2 comptes distincts.
Les fonctionnalités non branchées (ex. cashout Stripe désactivé) restent en 503 / message clair — ne pas les présenter comme actives.
Identité : toujours auth.users.id comme FK — jamais email/handle/téléphone.
Scripts npm
Script	Rôle
npm run dev	Dev local
npm run build	Build production
npm run check:production	Fichiers / scripts critiques
npm run audit:security	Scan statique sécurité
npm run check:e2e	Préparation E2E
npm run cap:sync	Sync Capacitor après build
Documentation
docs/PRODUCTION-CHECKLIST.md — checklist mise en prod
docs/SECURITY.md — modèle de menace wallet / auth
docs/REMAINING-OPS.md — Upstash, Stripe, CinetPay, observabilité
docs/BAARO-2.0-ALL-ROADMAP.md — consolidation long terme
docs/API-12-FILES-PLAN.md — plan limite 12 fichiers API
docs/AUDIT_ET_AMELIORATIONS_2026-09-11.md — dernier audit marketplace / entreprises
Licence / contribution
Dépôt public. Avant toute PR : npm run build + npm run check:production + npm run audit:security.

