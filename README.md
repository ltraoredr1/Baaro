# BAARO Marketplace + Entreprises & Services

Pack complet pour étendre BAARO avec :

1. **Marketplace boutiques** (commandes, panier, pickup/livraison)
2. **Entreprises & Services** (transport, radio, TV, télécoms, banques, etc.)
   - Auto-inscription
   - Programmes / grilles / horaires / itinéraires
   - Tarifs
   - Informations complémentaires

---

## Structure des fichiers

```
baaro-marketplace/
├── migrations/
│   ├── 023_marketplace_orders.sql      # Commandes + avis boutiques
│   └── 024_companies_and_services.sql  # Entreprises, programmes, tarifs
├── services/
│   ├── shopApi.js                      # API boutiques + commandes
│   └── companyApi.js                   # API entreprises
├── components/
│   ├── ShopCard.jsx
│   ├── ProductCard.jsx
│   ├── ShopDetail.jsx
│   ├── OrderCheckout.jsx
│   ├── OrdersBuyer.jsx
│   ├── CompanyCard.jsx
│   ├── CompanyDetail.jsx
│   ├── CompanyRegistrationForm.jsx
│   ├── CompanyManager.jsx
│   └── CompaniesTab.jsx                # Onglet principal entreprises
└── README.md
```

---

## Installation

### 1. Migrations Supabase

Dans l’ordre :

```bash
# Dans le SQL Editor Supabase (ou via CLI)
# 1. 023_marketplace_orders.sql
# 2. 024_companies_and_services.sql
```

### 2. Copier les fichiers dans ton projet

```
src/features/shop/
├── services/
│   ├── shopApi.js
│   └── companyApi.js
├── components/
│   ├── ShopCard.jsx
│   ├── ProductCard.jsx
│   ├── ShopDetail.jsx
│   ├── OrderCheckout.jsx
│   ├── OrdersBuyer.jsx
│   ├── CompanyCard.jsx
│   ├── CompanyDetail.jsx
│   ├── CompanyRegistrationForm.jsx
│   ├── CompanyManager.jsx
│   └── CompaniesTab.jsx
```

Ajuste les imports relatifs si besoin (`../../../theme.js`, `../../../supabaseClient.js`, etc.).

### 3. Brancher l’onglet

Dans ton shell / navigation, ajoute un onglet :

```jsx
import CompaniesTab from "./features/shop/components/CompaniesTab.jsx";

// ...
{activeTab === "companies" && <CompaniesTab userId={user?.id} />}
```

Tu peux aussi fusionner boutiques + entreprises dans un seul onglet « Marketplace ».

---

## Types d’entreprises supportés

| Type         | Exemples                          |
|--------------|-----------------------------------|
| `transport`  | Bus, taxi, train, compagnie aérienne |
| `radio`      | Stations FM, webradio             |
| `tv`         | Chaînes TV, plateformes           |
| `telecom`    | Opérateurs mobile, ISP            |
| `energy`     | Électricité, solaire              |
| `bank`       | Banques, microfinance             |
| `insurance`  | Assurances                        |
| `education`  | Écoles, centres de formation      |
| `health`     | Cliniques, pharmacies             |
| `hospitality`| Hôtels, restaurants               |
| `shop`       | Commerces (alternative à shops)   |
| `other`      | Autre                             |

---

## Fonctionnalités

### Boutiques (existant enrichi)
- Annuaire + fiche + produits
- Panier + commande (pickup / livraison)
- Code de retrait
- Mes commandes (acheteur)

### Entreprises
- **Auto-inscription** (30 jours gratuits puis abonnement annuel)
- **Programmes** : horaires, grilles radio/TV, itinéraires transport, émissions
- **Tarifs** : grilles tarifaires (ticket, abonnement, spot pub…)
- **Infos** : conditions, couverture, FAQ, etc.
- Fiche publique avec onglets Programmes / Tarifs / Infos
- Gestion complète côté propriétaire

---

## Prochaines étapes possibles

1. Upload logo / cover (Supabase Storage)
2. Paiement réel des commandes boutique (CinetPay / Stripe)
3. `OrdersSeller.jsx` (vendeur change le statut)
4. Avis / notes sur entreprises
5. Géolocalisation « près de moi »
6. Notifications (nouvelle commande, fin d’essai…)

---

## Notes

- Les chemins d’import (`theme.js`, `supabaseClient.js`, `ToastContext`, `paymentProvider.js`) correspondent à la structure BAARO actuelle.
- `CompanyRegistrationForm` réutilise `shop_pricing` et `createPayment` pour rester cohérent avec le système de paiement existant.
- Pour le paiement entreprise, tu pourras adapter l’endpoint `/api/payments` pour accepter aussi `company_id` si besoin.

---

## Patch API (payments + webhooks)

Fichiers prêts à remplacer dans ton repo :

```
api/payments.js   ← remplace le fichier existant
api/webhooks.js   ← remplace le fichier existant
```

Ils gèrent maintenant :
1. Topup diamants (comportement d'origine)
2. Abonnement boutique (`shop_*`)
3. Abonnement entreprise (`company_*`)
4. Paiement commande marketplace (`order_*`)

**Aucun nouvel endpoint** — toujours 9 / 12 max.

Après copie : redéployer Vercel + appliquer migration `026`.
