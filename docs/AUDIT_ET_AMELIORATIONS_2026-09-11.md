# BAARO — audit + améliorations intégrées

Date: 2026-09-11

## État vérifié dans `Baaro-main.zip`

### Déjà présents
- Fil social, vidéos, messages, débats, communauté.
- Wallet / BARO et économie de points.
- Assistant IA et passerelle multi-fournisseurs.
- Shop avec boutiques, produits/services, inscription et gestion.
- Commandes acheteur/vendeur.
- Paiements Stripe/CinetPay.
- Upload média boutique.
- Live, cadeaux/multi-host et notifications.
- Capacitor Android/iOS.
- Supabase RLS et migrations de sécurité.

### Problèmes détectés et corrigés
1. Les migrations marketplace/entreprises 023–026 n'étaient pas toutes présentes dans le ZIP principal.
2. Le webhook appelait `mark_order_paid` avec 3 paramètres alors que la fonction SQL existante n'en acceptait que 2.
3. La création de commande faisait confiance au prix envoyé par le navigateur: risque de modification du prix côté client.
4. Le paiement de commande n'était pas déclenché depuis `OrderCheckout`.
5. Les fonctionnalités Entreprises / Services étaient présentes dans les composants mais pas exposées comme onglet principal/Plus.
6. Plusieurs composants d'intégration avaient des chemins relatifs cassés.
7. Le CI ignorait les échecs de `check:lock` et `audit:security` avec `|| true`.
8. Un hook de virtualisation `useWindowVirtual.js` existait. Il a été retiré conformément à la contrainte du projet.

## Améliorations ajoutées

### Marketplace
- `create_order_secure()` recalcule les prix depuis `shop_products`.
- Vérification serveur de la boutique et de la disponibilité des produits.
- Limitation de quantité par ligne.
- Contrôle des devises mixtes.
- Code de retrait généré côté serveur.
- Paiement lancé après création de la commande.
- Répartition financière enregistrée avec 5% de commission BAARO / 95% vendeur comme base configurable.

### Paiements
- `mark_order_paid(order_id, payment_ref, provider)` compatible avec le webhook.
- Idempotence: une commande déjà payée n'est pas recréditée.
- La confirmation de paiement reste côté serveur.

### Entreprises
- Annuaire entreprises/services.
- Transport, itinéraires, programmes, horaires, tarifs et informations.
- Inscription entreprise avec essai.
- Gestion des entreprises.
- Avis.
- Nouvel accès « Entreprises » dans « Plus ».

### Qualité / sécurité
- Imports API AI corrigés.
- Imports des composants d'intégration corrigés.
- CI rendu strict sur le lockfile et l'audit sécurité.
- Aucun Docker, conteneur, VM ou mécanisme de virtualisation ajouté.
- Aucun prix client utilisé comme vérité de facturation.

## Vérification

- Audit statique des imports relatifs: aucune importation relative réellement introuvable dans le code actif; les 2 correspondances restantes proviennent uniquement d'exemples dans les commentaires de `initPerf.js` et `vitals.js`.
- Le build local n'a pas pu être exécuté jusqu'au bout dans cet environnement car l'installation npm a expiré avant de rendre `vite` disponible. Il faut donc laisser Vercel/GitHub CI faire la validation finale avec `npm ci && npm run build`.

## Migrations à appliquer

023 — marketplace/orders/reviews  
024 — entreprises/programmes/tarifs/infos/abonnements  
025 — avis entreprises  
026 — stockage + paiement commandes  
027 — commandes sécurisées + économie marketplace

Ordre obligatoire: 023 → 024 → 025 → 026 → 027.

## Point important

Les taux de commission sont une base technique (5%) et doivent être validés par BAARO avant exploitation commerciale. Le système ne déclenche pas automatiquement un retrait réel vers un vendeur depuis le navigateur.
