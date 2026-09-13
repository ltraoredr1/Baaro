# BAARO — Contrainte : max 12 fichiers dans `api/`

## État actuel : 14 fichiers

```
_cors.js
_logger.js
_rateLimit.js
_stripe.js
_supabaseAdmin.js     ← 5 helpers
ai.js
chat.js
live.js
payments.js
referral.js
register-device.js
translate.js
wallet.js
webhooks.js           ← 9 routes
```

## Objectif : ≤ 12 fichiers

### Option recommandée (sans casser les rewrites Vercel)

Les rewrites dans `vercel.json` pointent déjà vers des handlers consolidés :
- `/api/gifts` → `wallet`
- `/api/payout` → `wallet`
- `/api/create-payment` → `payments`
- `/api/stripe-webhook` / `/api/payment-webhook` → `webhooks`
- `/api/create-room` / `/api/live-roles` → `live`
- etc.

**Plan de réduction :**

| Action | Fichiers gagnés | Résultat |
|--------|-----------------|----------|
| 1. Fusionner `_cors.js` + `_rateLimit.js` + `_supabaseAdmin.js` → **`_core.js`** | −2 | 12 |
| 2. (optionnel) Fusionner `register-device.js` dans `wallet.js` ou un handler notif existant | −1 | 11 |
| 3. (optionnel) Fusionner `translate.js` dans `ai.js` / `chat.js` | −1 | 10 |

### Cible à 12 fichiers

```
_core.js          # cors + rateLimit + supabaseAdmin
_logger.js        # log + Sentry (déjà fusionné)
_stripe.js
ai.js
chat.js
live.js
payments.js
referral.js
register-device.js   # ou fusionné
translate.js         # ou fusionné
wallet.js
webhooks.js
```
→ **12 fichiers max**

### Règle à respecter

- **Aucun nouveau fichier** dans `api/` (Sentry va dans `_logger.js`)
- Nouveaux helpers → sous-dossier `api/_lib/` (déjà présent) **ou** dans `_core.js` / `_logger.js`
- Nouvelles routes → query `?route=` sur un handler existant (comme déjà fait dans `vercel.json`)

### Usage Sentry après fusion

```js
import { logError, flushLogs } from "./_logger.js";

} catch (err) {
  logError("wallet", err, { userId: user?.id });
  await flushLogs();
  return res.status(500).json({ error: "Erreur serveur" });
}
```

Pas de `import` Sentry dans chaque handler : tout passe par `logError` + `flushLogs`.
```
