# BAARO Economy — Monetization V19 / V20

BAARO Economy est la couche de revenus créateurs et de retraits, fondée sur des montants fiduciaires en unités mineures. Elle ne réintroduit ni crypto-actif ni portefeuille crypto transférable.

## Sources de revenus

La couche économique est destinée à comptabiliser les revenus générés par :

- Pourboires
- Abonnements créateurs
- Commandes marketplace
- Billets live et formations payantes
- Événements de revenus publicitaires
- Campagnes commerciales et autres produits lorsque leur parcours serveur de paiement et de livraison est activé

Les points Creator Rewards constituent un système d'engagement séparé. Ils ne sont pas de l'argent, ne sont pas retirables et ne doivent pas être ajoutés au registre des espèces.

Tous les produits de monétisation ne sont pas nécessairement activés pour un lancement public. Un produit ne peut être considéré comme payable que lorsque son parcours serveur de vérification du paiement et de livraison est implémenté et configuré.

## Règles financières

- Les montants sont stockés en entiers dans l'unité mineure.
- La devise et la conversion du fournisseur doivent être explicites.
- Le navigateur ne doit pas écrire directement dans le registre financier ni modifier un solde faisant autorité.
- Les parts de revenus sont contrôlées côté serveur.
- Les événements de revenus doivent être idempotents.
- Les revenus créateurs passent par les états en attente et disponibles selon les vérifications et règlements côté serveur.
- Une demande de retrait réserve les fonds disponibles avant l'exécution du transfert.
- Seul un code serveur de confiance et autorisé peut terminer ou annuler un retrait.
- Les retraits sont soumis au minimum de retrait, au KYC et aux contrôles de risque.
- Les BAARO Credits restent des crédits fermés : pas de retrait, de transfert entre utilisateurs ou de conversion en XOF.

## Parcours paiement et revenus attendu

1. Le client démarre un paiement via `POST /api/payments`. Les prix et droits doivent être résolus et validés côté serveur.
2. Le fournisseur traite le paiement.
3. Le webhook vérifie indépendamment le résultat, le montant attendu et la devise.
4. Si le produit génère un revenu créateur, le serveur enregistre un événement idempotent.
5. Le revenu reste en attente jusqu'à la validation serveur applicable.
6. Le créateur demande un retrait. Le serveur authentifie la demande et réserve le montant.
7. Pour Mobile Money, le parcours CinetPay Transfer dépend de la configuration réelle du jeton de transfert et de l'URL de notification.
8. Le webhook de retrait doit revérifier le statut auprès du fournisseur avant de confirmer ou d'annuler la réservation.

La présence de routes telles que `/api/payments`, `/api/payouts` ou `/api/payout-webhook` dans le dépôt ne prouve pas que les comptes fournisseurs, secrets, webhooks ou fonctions SQL distantes sont opérationnels.

## Méthodes de retrait et limites

- **Mobile Money :** automatisation possible uniquement si le compte, le jeton de transfert, les notifications et les contrôles sont configurés et testés.
- **Virement bancaire :** un statut de traitement manuel ne constitue pas une intégration bancaire automatisée ni une preuve de paiement.
- **KYC et risque :** l'éligibilité dépend du profil vérifié et des contrôles réellement appliqués.
- **Production :** les tests statiques ne prouvent pas que les comptes marchands, les webhooks, les règlements ou les destinations de retrait fonctionnent. Des tests de bout en bout sont obligatoires avant lancement.

## Pont de revenus publicitaires

Toute route de revenus publicitaires doit être strictement serveur, authentifiée de serveur à serveur et protégée par un secret dédié. L'appelant doit fournir une clé d'idempotence stable. Le secret ne doit jamais être exposé au client.

## Configuration de production

Configurer uniquement les secrets des fournisseurs réellement activés, notamment :

- Identifiants Supabase serveur et credentials publics nécessaires au flux authentifié.
- Clés CinetPay pour les paiements entrants.
- Jeton CinetPay Transfer si les retraits Mobile Money automatisés sont activés.
- URL publique de notification.
- Clés Stripe secrètes et secret webhook si Stripe est activé.
- Secret dédié au pont de revenus publicitaires si utilisé.
- Credentials Upstash si le rate limiting de production repose sur Upstash.

Ne jamais committer les secrets de production ni les placer dans des variables `VITE_*`.

## Base de données et vérifications

Les fichiers de migration SQL ont été volontairement supprimés de ce dépôt par le mainteneur pour des raisons de sécurité. Leur absence est intentionnelle et ne doit pas être « corrigée » en restaurant ou en générant une migration.

Certains scripts du dépôt ont historiquement tenté de lire `supabase/migrations/0001_baaro_unified.sql`. En l'absence de ce fichier, les assertions dépendantes de cette migration ne sont pas exécutées ou ne peuvent pas l'être. Cela ne prouve pas que le schéma déployé est correct.

Un contrôle statique positif ne valide pas le schéma Supabase distant, les policies RLS, les permissions RPC ni les données de production. Les vérifications de code doivent être complétées par une procédure séparée, autorisée et contrôlée, de validation de la base réellement déployée. Ne jamais appliquer du SQL provenant de cette documentation à la base de production.

## Documents associés

- `docs/ECONOMY.md` : principes économiques et règles de sécurité.
- `docs/REAL_MONEY_V20.md` : parcours paiement et retrait à vérifier.
- `docs/LEGAL_COMPLIANCE.md` : points de conformité restant à finaliser.
