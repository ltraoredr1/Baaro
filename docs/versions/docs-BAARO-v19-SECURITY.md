# BAARO 2.0 v19 — Final Security Audit

## Objectif

Cette version ajoute un audit statique et une checklist de validation live.

## Contrôles

- secrets et clés côté serveur ;
- service-role Supabase hors frontend ;
- CORS wildcard ;
- URLs publiques pour les buckets privés ;
- SECURITY DEFINER et search_path ;
- grants/revoke des fonctions ;
- RLS activé sur les tables avec policies ;
- endpoints sensibles et rate limiting ;
- idempotence wallet/rewards/gifts/payout ;
- accès croisés entre comptes ;
- replay et concurrence.

## Validation live obligatoire

Créer deux comptes de test A/B et vérifier :

1. A ne lit pas les messages privés de B.
2. A ne modifie pas les messages de B.
3. A ne lit pas les fichiers privés de B.
4. A ne modifie pas le wallet de B.
5. A ne crédite pas son wallet via une action falsifiée.
6. A ne rejoint pas une room Daily destinée à B.
7. A ne modifie pas les rôles d'un Live dont il n'est pas autorisé.
8. A ne récupère pas les données de payout de B.
9. Les webhooks sont authentifiés et idempotents.
10. Les opérations concurrentes ne créent pas de double crédit/débit.

## Règle

Un résultat "statique OK" n'est pas une certification de sécurité. La certification finale
doit être faite après exécution contre un projet Supabase de staging, avec journaux et comptes
de test.
