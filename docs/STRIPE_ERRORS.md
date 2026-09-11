# Gestion des erreurs Stripe — BAARO

## Fichiers

| Fichier | Rôle |
|---------|------|
| `api/_stripe.js` | Client Stripe + `mapStripeError` + Checkout Session |
| `api/payments.js` | Crée session Stripe **ou** CinetPay selon `provider` |
| `api/webhooks.js` | Webhooks Stripe (signature) + CinetPay |

## Variables d'environnement

```
STRIPE_SECRET_KEY=sk_live_...   # ou sk_test_
STRIPE_WEBHOOK_SECRET=whsec_...
PUBLIC_APP_URL=https://ton-domaine.com
```

## Erreurs côté API (réponse JSON)

```json
{
  "error": "Carte refusée par ta banque.",
  "code": "card_declined",
  "decline_code": "generic_decline",
  "provider": "stripe",
  "request_id": "req_xxx"
}
```

| HTTP | Cas |
|------|-----|
| 400 | Requête invalide (montant, params) |
| 401 | Token auth manquant/invalide |
| 402 | Carte refusée / paiement échoué |
| 403 | Permission Stripe |
| 409 | Idempotency conflict |
| 429 | Rate limit |
| 500 | Config / auth Stripe côté serveur |
| 502/503 | Stripe down ou réseau |

## Types d'erreurs gérés (`mapStripeError`)

| `err.type` | Message utilisateur |
|------------|---------------------|
| `StripeCardError` | Message carte (fonds, CVC, expirée, fraude…) |
| `StripeRateLimitError` | Trop de tentatives |
| `StripeInvalidRequestError` | Requête invalide |
| `StripeAPIError` | Service indisponible |
| `StripeConnectionError` | Réseau |
| `StripeAuthenticationError` | Config serveur (clé) |
| `StripeIdempotencyError` | Opération déjà traitée |

## Webhooks Stripe à activer

Dashboard Stripe → Webhooks → endpoint `https://ton-domaine/api/webhooks` :

- `checkout.session.completed` → confirme le paiement
- `checkout.session.expired` → marque commande `failed`
- `payment_intent.payment_failed` → log / monitoring

**Important :** le body doit rester **brut** pour vérifier la signature (`config.api.bodyParser = false`).

## Côté client (React)

```js
try {
  const data = await createPayment({ provider: 'stripe', ... });
  if (data.payment_url) window.location.href = data.payment_url;
} catch (e) {
  // paymentProvider.js throw Error(message)
  showToast(e.message, 'error');
}
```

Si tu parses la réponse JSON d'erreur :

```js
const res = await fetch('/api/payments', { ... });
const data = await res.json();
if (!res.ok) {
  showToast(data.error || 'Paiement impossible', 'error');
  // data.code, data.decline_code pour analytics
}
```

## Dépendance

```bash
npm i stripe
```

## Sécurité

- Montant **toujours** relu en DB pour les commandes (`order_*`)
- Signature webhook vérifiée (`STRIPE_WEBHOOK_SECRET`)
- Clé secrète **uniquement** serveur
- Messages utilisateur sans détails techniques internes
