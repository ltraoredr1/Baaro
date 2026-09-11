# BAARO — Patch Marketplace + Entreprises & Services

## Correction principale
Ce patch ajoute les composants manquants référencés par `ShopTab.jsx` :
- ShopDetail
- OrderCheckout
- OrdersBuyer
- OrdersSeller
- ShopCard

Il conserve l'annuaire et le gestionnaire de produits existants.

## Base de données
Appliquer :
`supabase/migrations/026_marketplace_and_companies.sql`

Cette migration ajoute :
- `orders`
- `order_items`
- `companies`
- `company_programs`
- `company_tariffs`
- `company_infos`
- colonnes nécessaires aux abonnements Shop

## Important
Le checkout crée la commande mais ne déclenche pas encore un paiement réel. Le paiement commande doit être branché sur le flux CinetPay/Stripe existant après validation de la migration.

Aucune virtualisation n'est utilisée.
