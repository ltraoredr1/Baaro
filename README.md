# BAARO 2.0 — Super-app communautaire

Réseau social + wallet + live + IA régionale, conçu pour l’Afrique et les marchés émergents.

**Version** : 2.0.0-v20+ (package de correctifs inclus)

## Fonctionnalités principales

- Feed social, Stories, Vidéos
- Messagerie + appels (Daily.co)
- Debates / salles de discussion
- Communauté type Discord (groupes, canaux, vocal, rôles)
- Wallet BARO (gains, redeem, convert, payout)
- Paiements Stripe + CinetPay
- Assistant IA multi-providers avec routing par pays
- Traduction texte / média
- Notifications push + mode offline
- Application mobile (Capacitor Android / iOS)

## Stack

| Couche        | Technologie                          |
|---------------|--------------------------------------|
| Frontend      | React 18, Vite, Tailwind, Capacitor  |
| API           | Vercel Serverless                    |
| Base de données | Supabase (Auth, Postgres, Realtime, Storage, RLS) |
| Live / Appels | Daily.co                             |
| Paiements     | Stripe, CinetPay                     |
| IA            | OpenAI, Anthropic, Gemini, Moonshot, xAI, n8n |
| Rate-limit    | Upstash Redis (optionnel)            |

## Démarrage rapide

```bash
cp .env.example .env.local
# Renseigner VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, etc.

# Migrations Supabase (ordre dans supabase/README.md)
# Puis :
npm ci
npm run dev
```

## Scripts utiles

```bash
npm run build
npm run check:lock
npm run check:production
npm run audit:security
npm run check:e2e
npm run cap:sync
npm run cap:android
```

## Architecture

```
src/
├── app/           # Shell (App, MainShell, tabs lazy)
├── features/      # Une feature = un dossier + index
├── components/    # UI partagée
├── services/      # supabase, walletApi
├── hooks/, lib/, contexts/
api/               # Endpoints serverless (wallet, chat, payout…)
supabase/          # Schéma + migrations
```

## Sécurité

- Service-role Supabase **uniquement** côté serveur
- Wallet : montants jamais décidés par le client
- Idempotence des récompenses (reference_id)
- CORS strict en production
- Rate-limiting (mémoire + Upstash)
- Headers de sécurité (CSP, HSTS, etc.) dans `vercel.json`

## Documentation versionnée

Voir les fichiers `docs-BAARO-vXX-*.md` :
- v11 Messaging / Calls
- v12 Live
- v13 AI régional
- v14 Notifications
- v15 Performance
- v16 Android
- v17 Payout
- v18 E2E
- v19 Security
- v20 Production

## Licence

Projet privé — tous droits réservés.
