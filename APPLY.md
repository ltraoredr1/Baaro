# BAARO — Patch audit complet (bloquants + restes)

## Contenu du pack

### Vague 1 (critique)
- `src/features/shop/ShopRegistrationForm.jsx` — syntaxe
- `src/lib/paymentProvider.js` — Bearer + `/api/create-payment`
- `api/create-payment.js` — auth + CinetPay + Stripe
- `api/payment-webhook.js` — admin unifié
- `api/_supabaseAdmin.js` — VITE_ ou SUPABASE_URL
- `api/chat.js` — profiles.user_id
- `supabase/migrations/020_shops_and_delivery.sql`

### Vague 2 (restes audit)
- `api/_rateLimit.js` — Upstash Redis optionnel + mémoire
- `api/stripe-webhook.js` — activation boutique Stripe
- `vercel.json` — CSP + HSTS
- `.env.example` / `.env.production.example`
- `scripts/cleanup-legacy.sh`
- `scripts/check-e2e-smoke.mjs`
- `.github/workflows/ci.yml`
- `docs/REMAINING-OPS.md`

## Application

```bash
cd /chemin/vers/Baaro
# dézipper baaro-patches.zip à la racine ou à côté

cp baaro-patches/src/features/shop/ShopRegistrationForm.jsx src/features/shop/
cp baaro-patches/src/lib/paymentProvider.js src/lib/
cp baaro-patches/api/*.js api/
cp baaro-patches/vercel.json .
cp baaro-patches/.env.example .
cp baaro-patches/.env.production.example .
cp baaro-patches/supabase/migrations/020_shops_and_delivery.sql supabase/migrations/
mkdir -p scripts .github/workflows docs
cp baaro-patches/scripts/* scripts/
cp baaro-patches/.github/workflows/ci.yml .github/workflows/
cp baaro-patches/docs/REMAINING-OPS.md docs/

bash scripts/cleanup-legacy.sh
```

### package.json — ajouter le script smoke

```json
"check:e2e-smoke": "node scripts/check-e2e-smoke.mjs"
```

### Supabase

Exécuter `020_shops_and_delivery.sql` dans le SQL Editor.

### Vercel env

| Variable | Usage |
|----------|--------|
| `VITE_SUPABASE_URL` | Client + admin |
| `VITE_SUPABASE_ANON_KEY` | Client |
| `SUPABASE_SERVICE_ROLE_KEY` | API |
| `ALLOWED_ORIGINS` | CORS |
| `PUBLIC_APP_URL` | Webhooks / return URLs |
| `VITE_API_BASE_URL` | createPayment + Capacitor |
| `UPSTASH_REDIS_REST_URL` | Rate-limit distribué |
| `UPSTASH_REDIS_REST_TOKEN` | Rate-limit distribué |
| `CINETPAY_API_KEY` / `CINETPAY_SITE_ID` | Mobile money |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` | Carte |

### Test

```bash
npm install
node scripts/check-e2e-smoke.mjs
npm run dev
```

PC : sidebar → **Boutiques**.

### Android

```bash
# VITE_API_BASE_URL=https://prod...
npm run build && npx cap add android && npm run cap:sync:android && npx cap open android
```

### Encore manuel (hors code)

- Compte Upstash + clés Vercel
- Webhook Stripe dashboard → `/api/stripe-webhook`
- Tests live RLS A/B (docs v19)
- Sentry / monitoring
- PayPal (non branché)
