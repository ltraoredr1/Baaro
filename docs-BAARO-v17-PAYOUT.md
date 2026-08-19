# BAARO 2.0 v17 — Economy & Payout Foundation

## Principe

Le retrait réel reste désactivé par défaut. Cette version ajoute uniquement le socle
de données et de sécurité nécessaire à un vrai payout.

## Modèle

- `payout_accounts` : compte de versement vérifié.
- `payout_requests` : demande idempotente et auditable.
- `provider_payout_id` : identifiant du prestataire.
- `status` : pending / processing / paid / failed / cancelled / requires_review.

## Activation future

Avant d'activer un paiement réel :

1. Stripe Connect onboarding.
2. Vérification du pays et de la devise.
3. KYC/KYB et contrôles de risque adaptés au modèle BAARO.
4. Table/RPC officielle de conversion points → devise.
5. Réservation atomique des points.
6. Webhook Stripe signé et idempotent.
7. Réconciliation quotidienne.
8. Gestion des remboursements et échecs.
9. Limites de retrait et revue antifraude.
10. Tests de concurrence et de replay.

## Règle

Le frontend ne doit jamais pouvoir créditer un payout, modifier son statut,
fournir un `provider_payout_id`, ni choisir arbitrairement un taux de conversion.
