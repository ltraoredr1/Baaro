# BAARO Economy

BAARO Economy permet à la plateforme et à ses utilisateurs de gagner de l'argent sans réintroduire de crypto-actif.

## Sources

- publicité
- pourboires
- abonnements créateurs
- ventes / marketplace
- campagnes commerciales
- parrainage
- bonus BAARO

## Sécurité financière

- Les montants sont des entiers en unités mineures (ex. centimes / centimes XOF selon le fournisseur).
- Le navigateur ne peut pas écrire dans le ledger ni modifier un solde.
- Les taux de partage sont définis côté serveur dans `economy_policies`.
- Les événements de revenus sont idempotents via une clé unique.
- Les revenus commencent en `pending`, puis passent en `available` après règlement serveur.
- Un retrait réserve le montant dans `payout_hold_minor` avant tout paiement.
- Seul le rôle `service_role` peut confirmer ou annuler un paiement.
- Les retraits sont soumis aux contrôles anti-fraude et, lorsque nécessaire, au KYC.

## Partage initial

| Source | Part créateur | Part BAARO avant frais fournisseur |
|---|---:|---:|
| Publicité | 85% | 15% |
| Pourboires | 90% | 10% |
| Abonnements | 85% | 15% |
| Marketplace | 90% | 10% |
| Campagnes | 80% | 20% |
| Parrainage | 70% | 30% |
| Bonus BAARO | 100% | 0% |

Les frais du prestataire de paiement sont séparés et ne sont pas masqués dans les métadonnées du règlement.

## Flux de paiement

1. Un événement économique confirmé par un système serveur appelle `record_economy_event`.
2. Le montant créateur est placé en attente.
3. Après vérification, `settle_economy_event` rend le montant disponible.
4. L'utilisateur demande un retrait depuis **Revenus**.
5. `request_economy_payout` réserve les fonds.
6. Le système de paiement/KYC externe exécute le transfert.
7. Un service de confiance appelle `complete_economy_payout` ou `cancel_economy_payout`.

`api/` reste volontairement inchangé dans cette version. Le branchement des webhooks de paiement vers les fonctions économiques doit donc être effectué par le service serveur autorisé qui traite déjà ou qui traitera les événements de paiement; aucune clé secrète n'est exposée au client.
