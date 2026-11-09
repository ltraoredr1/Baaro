# BAARO Economy

BAARO Economy permet à la plateforme et à ses utilisateurs de générer des revenus en monnaie fiduciaire, sans crypto-actif ni portefeuille crypto transférable.

## Sources de revenus prévues

- Publicité
- Pourboires
- Abonnements créateurs
- Ventes et marketplace
- Campagnes commerciales
- Parrainage
- Bonus BAARO

Un produit ne doit être présenté comme monétisable que si son parcours serveur de paiement, de vérification et de livraison est effectivement implémenté et configuré.

## Sécurité financière

- Les montants sont stockés en entiers dans l'unité mineure de la devise.
- La devise et les conversions fournisseur doivent être explicites.
- Le navigateur ne doit jamais écrire directement dans le registre financier ni modifier un solde faisant autorité.
- Les règles de partage doivent être contrôlées côté serveur.
- Les événements financiers doivent être idempotents.
- Les revenus créateurs restent en attente jusqu'à leur validation et leur règlement côté serveur.
- Une demande de retrait doit réserver les fonds disponibles avant le transfert.
- Seul un service serveur autorisé peut confirmer ou annuler un retrait.
- Les retraits sont soumis aux contrôles de risque, de fraude et, lorsque nécessaire, au KYC.
- Les BAARO Credits restent des crédits fermés : aucun retrait, transfert entre utilisateurs ou conversion en XOF.

**Limite importante :** les migrations SQL ont été volontairement supprimées du dépôt par le mainteneur pour des raisons de sécurité. Les règles décrites ici sont des exigences métier ; elles ne prouvent pas que les tables, RPC ou policies correspondantes existent dans la base Supabase déployée.

## Partage initial documenté

| Source | Part créateur | Part BAARO avant frais fournisseur |
|---|---:|---:|
| Publicité | 85 % | 15 % |
| Pourboires | 90 % | 10 % |
| Abonnements | 85 % | 15 % |
| Marketplace | 90 % | 10 % |
| Campagnes | 80 % | 20 % |
| Parrainage | 70 % | 30 % |
| Bonus BAARO | 100 % | 0 % |

Ces pourcentages sont des valeurs documentées et ne doivent pas être considérés comme activés en production sans vérification de la configuration serveur applicable. Les frais du prestataire de paiement sont séparés.

## Flux financier attendu

1. Le serveur vérifie le paiement : fournisseur, montant, devise, statut et identifiant d'idempotence.
2. Si le produit génère un revenu créateur, le serveur enregistre l'événement dans le registre financier.
3. Le revenu reste en attente jusqu'à validation et règlement selon les règles applicables.
4. Le créateur demande un retrait depuis Revenus.
5. Le serveur réserve les fonds disponibles avant le transfert.
6. Le prestataire de paiement exécute le transfert selon le pays et la configuration.
7. Un service serveur autorisé vérifie le résultat auprès du fournisseur, puis confirme ou annule le retrait.

Les noms de tables et de RPC mentionnés dans d'autres documents sont des contrats techniques à vérifier sur la base déployée. Ils ne peuvent pas être confirmés à partir de ce dépôt.

## Routes et intégrations

Le dépôt contient des routes serveur de paiement et de retrait. Leur présence ne garantit pas que les secrets, comptes marchands, webhooks, profils KYC, fonctions SQL distantes ou destinations de paiement sont configurés.

Avant toute activation publique, effectuer des tests d'intégration en environnement sandbox, puis une validation opérationnelle autorisée. Ne jamais exposer une clé secrète dans le frontend ou dans une variable `VITE_*`.

## Règle de protection de la base

Ne pas restaurer une ancienne migration, en générer une nouvelle ou exécuter du SQL sur la base existante sur la seule base de cette documentation. Toute évolution de schéma doit suivre une procédure séparée, explicitement approuvée par le mainteneur, avec sauvegarde vérifiée, revue SQL et validation en environnement de test.
