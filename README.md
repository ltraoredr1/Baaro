# BAARO

**Plateforme sociale + marketplace + entreprises & services**  
Version `2.0.0-v20`

BAARO est une application web et mobile (Capacitor) qui combine :
- un réseau social (fil, stories, vidéos, débats live, messagerie)
- un portefeuille de points + BARO Coin
- une marketplace de boutiques (commandes, panier, pickup / livraison)
- un annuaire d’entreprises & services (transport, radio, TV, télécoms, banques, santé, etc.)
- un assistant IA multi-fournisseurs
- des notifications push et un mode hors-ligne (Nearby)

**Démo en ligne** : [baaro-xi.vercel.app](https://baaro-xi.vercel.app)

---

## Stack technique

| Couche              | Technologie                          |
|---------------------|--------------------------------------|
| Frontend            | React 18 + Vite + Tailwind CSS       |
| Backend / Auth / DB | Supabase (Postgres + Auth + Realtime + Storage + RLS) |
| API Serverless      | Vercel Functions                     |
| Live / Appels       | Daily.co                             |
| IA                  | Claude / OpenAI / xAI / Google / Moonshot (via gateway) |
| Paiements           | Stripe + CinetPay                    |
| Mobile              | Capacitor 6 (Android / iOS)          |
| Rate-limit          | Upstash Redis (recommandé en prod)   |

---

## Fonctionnalités principales

### Social
- Fil d’actualité, stories, vidéos
- Débats live multi-hôtes + cadeaux
- Messagerie
- Points & récompenses (idempotentes)
- Profil enrichi (contacts, liens, réseaux sociaux)

### Marketplace
- Annuaire de boutiques + fiches produits
- Panier + commande (pickup / livraison)
- Code de retrait généré côté serveur
- Prix recalculés côté serveur (sécurité)
- Commission BAARO configurable
- Avis acheteurs

### Entreprises & Services
- Auto-inscription (essai gratuit puis abonnement)
- Types supportés : transport, radio, TV, telecom, energy, bank, insurance, education, health, hospitality, shop, other
- Programmes / grilles / horaires / itinéraires
- Tarifs
- Informations complémentaires + avis

### Économie & paiements
- Wallet points + BARO
- Ledger transactionnel
- Stripe + CinetPay
- Webhooks signés et idempotents

### Technique
- Mode hors-ligne (plugin Nearby)
- Rate-limiting distribué
- CSP + headers de sécurité
- CI GitHub Actions
- Scripts de vérification (lockfile, sécurité, production, e2e…)

---

## Prérequis

- Node.js 18+
- Compte Supabase
- Compte Vercel
- (Optionnel) Upstash Redis, Stripe, CinetPay, Daily.co, clés IA

---

## Installation locale

```bash
# 1. Cloner
git clone https://github.com/ltraoredr1/Baaro.git
cd Baaro

# 2. Installer les dépendances
npm ci

# 3. Variables d’environnement
cp .env.example .env
# Remplir les valeurs (voir section ci-dessous)

# 4. Lancer
npm run dev
```

L’application est disponible sur `http://localhost:5173`.

---

## Variables d’environnement

### Publiques (préfixe `VITE_`)
```env
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_APP_ENV=development
VITE_API_BASE_URL=http://localhost:5173
VITE_TURNSTILE_SITE_KEY=
```

### Serveur uniquement (jamais de préfixe `VITE_`)
```env
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_URL=                    # alias optionnel
ALLOWED_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
PUBLIC_APP_URL=http://localhost:5173

# Rate-limit (fortement recommandé en production)
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=

# IA
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
XAI_API_KEY=
# ... (autres providers selon configuration)

# Live
DAILY_API_KEY=
DAILY_DOMAIN=

# Paiements
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
CINETPAY_API_KEY=
CINETPAY_SITE_ID=
```

Voir le fichier `.env.example` pour la liste complète.

---

## Scripts utiles

```bash
npm run dev                 # Développement
npm run build               # Build production
npm run preview             # Prévisualiser le build

# Capacitor
npm run cap:sync            # Build + sync
npm run cap:android         # Ouvrir Android Studio
npm run cap:ios             # Ouvrir Xcode

# Qualité & sécurité
npm run check:lock          # Vérifier le lockfile
npm run audit:security      # Scan sécurité
npm run check:production    # Checklist production
npm run check:e2e           # Readiness E2E
npm run check:e2e-smoke     # Smoke tests
```

---

## Base de données (migrations)

Les migrations se trouvent dans `supabase/migrations/`.

**Ordre important pour la marketplace / entreprises :**
1. `023_marketplace_orders.sql`
2. `024_companies_and_services.sql`
3. `025_...` (avis entreprises)
4. `026_...` (stockage + paiement commandes)
5. `027_...` (commandes sécurisées + économie)

Appliquer toujours dans l’ordre.  
Tester les policies RLS avec au moins deux comptes utilisateurs distincts.

---

## Architecture (résumé)

```
Frontend (React + Vite)
    ↓
Supabase (Auth + Postgres + Realtime + Storage)
    ↓
Vercel Functions (/api/*)
    ├── wallet / payments / webhooks
    ├── chat / AI gateway
    ├── live (Daily)
    └── rate-limit (Upstash)
```

Documentation détaillée disponible dans le dossier `docs/` :
- `ARCHITECTURE.md`
- `SECURITY.md`
- `PRODUCTION-CHECKLIST.md`
- `BAARO-2.0-ALL-ROADMAP.md`
- `UX-PERF.md`
- `REMAINING-OPS.md`
- etc.

---

## Sécurité (points clés)

- Toutes les écritures wallet passent par le service role + ledger.
- Prix des commandes recalculés côté serveur (jamais de confiance au client).
- Webhooks de paiement idempotents et signés.
- RLS activé sur toutes les tables sensibles.
- CORS strict en production (`ALLOWED_ORIGINS`).
- Rate-limiting distribué recommandé (Upstash).
- Cashout réel désactivé tant que le payout n’est pas validé en sandbox.

---

## Déploiement

1. Créer le projet Supabase et appliquer les migrations dans l’ordre.
2. Configurer les variables d’environnement sur Vercel.
3. Déployer (le `vercel.json` contient déjà CSP, headers de sécurité et rewrites).
4. Configurer les webhooks Stripe / CinetPay.
5. (Optionnel) Générer l’app mobile avec Capacitor.

Voir `docs/DEPLOY.md` et `docs/PRODUCTION-CHECKLIST.md`.

---

## Roadmap 2.0 (extrait)

- Pagination cursor + ranking du feed
- Upload vidéo signé + transcodage
- Observabilité (Sentry + métriques)
- i18n réelle FR/EN + packs régionaux
- Payout réel (sandbox → production)
- Tests E2E automatisés complets

Voir `docs/BAARO-2.0-ALL-ROADMAP.md` pour le plan détaillé.

---

## Contribution

1. Créer une branche depuis `main`
2. Respecter les scripts de vérification (`check:lock`, `audit:security`…)
3. Documenter les migrations et les changements de schéma
4. Tester les policies RLS en multi-utilisateurs

---

## Licence

Projet privé / propriétaire.  
Tous droits réservés.
```