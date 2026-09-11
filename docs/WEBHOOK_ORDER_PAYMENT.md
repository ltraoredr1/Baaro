# Paiement des commandes — extension du webhook existant

**Aucun nouvel endpoint.** On réutilise `/api/webhooks.js` et `/api/payments.js`.

## Convention payment_ref

| Préfixe | Type |
|---------|------|
| `shop_…` / `trial_…` | Abonnement boutique |
| `company_…` | Abonnement entreprise |
| `order_…` | Paiement d’une commande marketplace |

Format commande : `order_{orderId}_{timestamp}`

## Modification minimale de `api/webhooks.js`

Dans le handler qui confirme un paiement (après validation signature Stripe/CinetPay) :

```js
// Après avoir récupéré payment_ref et status === 'confirmed' / 'completed'

if (paymentRef.startsWith("order_")) {
  // Extraire orderId : order_{uuid}_{ts}
  const parts = paymentRef.split("_");
  // parts[0] = "order", parts[1..-2] peuvent faire partie de l'uuid si tirets
  // Plus robuste :
  const match = paymentRef.match(/^order_([0-9a-f-]{36})_/i);
  if (match) {
    const orderId = match[1];
    // service_role client
    await supabaseAdmin.rpc("mark_order_paid", {
      p_order_id: orderId,
      p_payment_ref: paymentRef,
      p_provider: provider, // 'cinetpay' | 'stripe'
    });
  }
  return; // ne pas passer par activate_shop_subscription
}

// sinon : logique abonnement boutique / company existante
```

## Modification minimale de `api/payments.js` (optionnel)

Si ton endpoint exige un `shop_id` pour les abonnements, accepte aussi les refs `order_*` :

```js
// Ne pas bloquer si shop_id est présent mais que payment_ref commence par order_
// Le montant doit venir du serveur : recalculer depuis order_items si besoin

if (paymentRef.startsWith("order_")) {
  const match = paymentRef.match(/^order_([0-9a-f-]{36})_/i);
  if (match) {
    const { data: order } = await supabaseAdmin
      .from("orders")
      .select("id, total_amount, currency, buyer_id, payment_status")
      .eq("id", match[1])
      .single();
    if (!order) throw new Error("Commande introuvable");
    if (order.payment_status === "paid") throw new Error("Déjà payée");
    // Forcer amount / currency depuis la DB (jamais depuis le client)
    amount = order.total_amount;
    currency = order.currency;
  }
}
```

## Flux complet

1. Client crée la commande (`createOrder`) → `payment_status = unpaid`
2. Si « Payer maintenant » → update `payment_status = pending` + `createPayment(...)`
3. Redirection CinetPay/Stripe
4. Webhook → `mark_order_paid(orderId, ref, provider)`
5. Commande passe en `status = paid`, `payment_status = paid`

## Sécurité

- Montant **toujours** relu en base (jamais confiance au client)
- `mark_order_paid` = `security definer` + **service_role only**
- RLS : seul buyer / shop owner voient la commande
