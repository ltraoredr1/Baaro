# BAARO — Package de correctifs (remédiation complète)

Applique ces fichiers pour corriger et perfectionner les points critiques identifiés.

## Fichiers fournis

```
baaro-fixes/
├── api/
│   ├── _cors.js              # CORS strict en prod + headers étendus
│   ├── _logger.js            # Logging structuré JSON
│   ├── chat.js               # Circuit breaker + fallback + rateLimitAsync
│   ├── wallet.js             # rateLimitAsync + logging + daily cap configurable
│   └── ai/
│       ├── circuit.js        # Circuit breaker
│       └── router.js         # Router v2 avec exclude (fallback)
├── supabase/
│   └── migrations/
│       └── 020_wallet_ledger.sql
└── docs/
    └── APPLY-FIXES.md        # Ce fichier
```

## 1. Appliquer les fichiers API

Depuis la racine du projet BAARO :

```bash
# Copier les correctifs
cp baaro-fixes/api/_cors.js          api/_cors.js
cp baaro-fixes/api/_logger.js        api/_logger.js
cp baaro-fixes/api/chat.js           api/chat.js
cp baaro-fixes/api/wallet.js         api/wallet.js
cp baaro-fixes/api/ai/circuit.js     api/ai/circuit.js
cp baaro-fixes/api/ai/router.js      api/ai/router.js
```

Vérifie que `api/ai/openai-compatible.js` existe déjà (il n’est pas modifié).

## 2. Migration Supabase

Dans le SQL Editor Supabase (staging d’abord) :

1. Exécute `020_wallet_ledger.sql`
2. Vérifie :
   ```sql
   SELECT * FROM wallet_ledger LIMIT 0;
   SELECT proname FROM pg_proc WHERE proname = 'wallet_ledger_append';
   ```

**Optionnel mais recommandé** : dans tes RPC `wallet_earn_v2`, `wallet_redeem_v2`, `wallet_convert_v2`, appelle :

```sql
PERFORM public.wallet_ledger_append(
  p_user_id,
  p_action_key,   -- ou 'redeem' / 'convert'
  p_pts,          -- + ou -
  v_new_balance,
  p_reference_id,
  jsonb_build_object('source', 'wallet_earn_v2')
);
```

## 3. Variables d’environnement (Vercel)

Ajoute / vérifie :

```
ALLOWED_ORIGINS=https://baaro-xi.vercel.app,https://baaro.app
BAARO_DAILY_EARN_CAP=100
UPSTASH_REDIS_REST_URL=...
UPSTASH_REDIS_REST_TOKEN=...
```

## 4. Migrer les autres routes vers rateLimitAsync

Dans **tous** les handlers sensibles, remplace :

```js
import { rateLimit } from "./_rateLimit.js";
// ...
const limit = rateLimit(req, { key: "...", max: 20, windowMs: 60_000 });
```

par :

```js
import { rateLimitAsync } from "./_rateLimit.js";
// ...
const limit = await rateLimitAsync(req, { key: "...", max: 20, windowMs: 60_000 });
```

Routes prioritaires :
- `api/payout.js`
- `api/gifts.js`
- `api/create-payment.js`
- `api/payment-webhook.js` / `stripe-webhook.js`
- `api/referral.js`
- `api/create-room.js`
- `api/chat-call.js`

## 5. Tests de validation (obligatoire)

### Sécurité
- [ ] Origine `https://evil.com` → 403 sur `/api/wallet`
- [ ] Compte A ne lit pas les messages de B
- [ ] Double `earn` avec même `referenceId` → 1 seul crédit
- [ ] Webhook Stripe rejoué → idempotent

### IA
- [ ] Provider down → fallback automatique
- [ ] Headers `X-BAARO-AI-Provider`, `X-BAARO-AI-Latency-Ms` présents
- [ ] Circuit open après 3 échecs

### Wallet
- [ ] Guest ne gagne pas de points
- [ ] Cap journalier respecté
- [ ] Cashout refusé si compte < 3 jours

## 6. Déploiement

```bash
npm run check:lock
npm run build
npm run check:production   # si le script existe
# puis deploy Vercel
```

## Ordre recommandé

1. Staging : copier fichiers + migration 020
2. Tests manuels checklist ci-dessus
3. Production : mêmes étapes + monitoring

---

**Note** : Ces correctifs ne remplacent pas un audit de sécurité live ni des tests e2e automatisés.
Ils résolvent les problèmes structurels identifiés (CORS, rate-limit multi-instance, IA fallback, ledger, logging).
