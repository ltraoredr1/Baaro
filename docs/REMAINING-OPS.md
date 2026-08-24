# BAARO — reste ops (après patch audit)

## Upstash Redis (rate-limit prod)

1. Créer une base Redis REST sur [upstash.com](https://upstash.com)
2. Vercel → env :
   - `UPSTASH_REDIS_REST_URL`
   - `UPSTASH_REDIS_REST_TOKEN`
3. Déployer `api/_rateLimit.js` (ce patch)
4. Migrer progressivement les handlers vers `await rateLimitAsync(...)`  
   (wallet, chat, referral, create-payment déjà en async dans le patch create-payment)

Sans ces variables → fallback mémoire (OK en local, faible en multi-instance Vercel).

## Stripe

1. `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET`
2. Dashboard Stripe → Webhook → URL `https://ton-domaine/api/stripe-webhook`  
   Event : `checkout.session.completed`
3. Déployer `api/stripe-webhook.js`

## CinetPay

1. `CINETPAY_API_KEY` + `CINETPAY_SITE_ID`
2. `PUBLIC_APP_URL` = domaine public
3. notify_url = `/api/payment-webhook`

## CSP

`vercel.json` inclut une CSP de base. Si un CDN / domaine média manque, ajoute-le dans `connect-src` / `img-src` après test console navigateur.

## Nettoyage

```bash
bash scripts/cleanup-legacy.sh
git status
```

## CI

Copier `.github/workflows/ci.yml` → le pipeline build + smoke au push.

## Observabilité (manuel)

- [ ] Sentry (ou équivalent) frontend + serverless
- [ ] Alertes 5xx Vercel
- [ ] Log anomalies wallet (crédits anormaux)
- [ ] Quota coûts IA par provider

## Tests live RLS (checklist v19)

Deux comptes A/B — messages, wallet, storage, live roles, payout, webhooks idempotents.
