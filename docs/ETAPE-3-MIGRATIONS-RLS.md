# BAARO — Étape 3 : Migrations + RLS

## Objectif
1. Vérifier que **toutes** les migrations sont appliquées dans le bon ordre  
2. Contrôler les policies RLS (surtout marketplace / entreprises / wallet / messages)  
3. Détecter les conflits de numérotation et les trous éventuels

---

## 1. Liste officielle des migrations (ordre recommandé)

```
001_security_foundation.sql
002_add_media.sql
003_add_debates.sql
004_add_social_features.sql
005_add_profile_bio.sql
006_add_messages_security.sql
007_add_multihost_gifts.sql
008_fix_chat_friends.sql
009_fix_debates_security.sql
010_performance.sql
011_baaro_core_media_security.sql
012_wallet_atomic_security.sql
013_follow_messages_security.sql
014_follow_column_compatibility.sql
015_reward_integrity_security.sql
016_video_views_feed_integrity.sql
017_messaging_calls_integrity.sql
018_live_integrity_realtime.sql
019_ai_routing_foundation.sql
020_notifications_foundation.sql
020_wallet_ledger.sql                    ← doublon de numéro
021_economy_payout_foundation.sql
022_shops_and_delivery.sql
023_marketplace_orders.sql
024_companies_and_services.sql
025_company_reviews.sql
026_storage_and_order_payments.sql
027_marketplace_economy_security.sql
028_auth_accounts.sql
028_stable_user_accounts.sql             ← doublon de numéro
029_profile_contacts_links_socials.sql
```

### Points d’attention
| Problème | Impact | Action recommandée |
|----------|--------|--------------------|
| Deux fichiers `020_*` | Ordre d’application ambigu selon l’outil | Renommer `020_wallet_ledger.sql` → `020b_wallet_ledger.sql` (ou `020_1_...`) |
| Deux fichiers `028_*` | Idem | Renommer `028_stable_user_accounts.sql` → `028b_...` |
| `mark_order_paid` définie en 026 puis redéfinie en 027 | OK (027 est la version finale + idempotente) | Toujours appliquer 027 **après** 026 |
| `create_order_secure` uniquement en 027 | Critique sécurité prix | Vérifier qu’elle existe en prod |

---

## 2. Vérification rapide dans Supabase SQL Editor

Exécute ces requêtes **en tant que service_role** (ou dans le SQL Editor avec droits admin).

### A. Tables marketplace / entreprises présentes ?
```sql
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in (
    'orders','order_items','shop_reviews','order_financials',
    'companies','company_programs','company_tariffs','company_infos',
    'company_subscriptions','company_reviews'
  )
order by table_name;
```
→ Tu dois voir **au minimum** : orders, order_items, shop_reviews, order_financials, companies, company_programs, company_tariffs, company_infos, company_subscriptions.

### B. Fonctions critiques présentes ?
```sql
select proname, prosecdef
from pg_proc
where pronamespace = 'public'::regnamespace
  and proname in (
    'create_order_secure',
    'mark_order_paid',
    'wallet_ledger_append',
    'activate_shop_subscription',
    'activate_company_subscription',
    'add_diamonds_to_wallet'
  )
order by proname;
```

### C. RLS activé sur les tables sensibles ?
```sql
select c.relname as table_name, c.relrowsecurity as rls_enabled
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in (
    'orders','order_items','order_financials','shop_reviews',
    'companies','company_programs','company_tariffs','company_infos',
    'company_subscriptions','wallets','transactions','messages'
  )
order by 1;
```
→ `rls_enabled` doit être `true` pour toutes.

### D. Policies existantes (aperçu)
```sql
select schemaname, tablename, policyname, cmd, roles
from pg_policies
where schemaname = 'public'
  and tablename in (
    'orders','order_items','order_financials',
    'companies','company_programs','company_tariffs',
    'wallets','messages'
  )
order by tablename, policyname;
```

---

## 3. Checklist RLS multi-utilisateurs (tests manuels obligatoires)

Prépare **deux comptes** distincts : **User A** et **User B**.

| # | Scénario | Attendu | OK ? |
|---|----------|---------|------|
| 1 | User A crée une commande via `create_order_secure` | Commande créée, prix recalculé côté serveur | ☐ |
| 2 | User B essaie de `SELECT` la commande de A | **0 ligne** (sauf s’il est owner de la boutique) | ☐ |
| 3 | User B essaie d’`UPDATE` le statut de la commande de A | **Échec** (policy owner only) | ☐ |
| 4 | User A (acheteur) voit ses `order_items` | OK | ☐ |
| 5 | User B ne voit pas les `order_items` de A | **0 ligne** | ☐ |
| 6 | User A lit le wallet de B | **Échec / 0 ligne** | ☐ |
| 7 | User A lit les messages d’une conversation où il n’est pas participant | **0 ligne** | ☐ |
| 8 | User A upload dans `shop-media/{userB_id}/...` | **Échec** (foldername = auth.uid()) | ☐ |
| 9 | User B (owner boutique) voit les commandes de sa boutique | OK | ☐ |
| 10 | `mark_order_paid` appelé deux fois avec le même order_id | **Idempotent** (pas d’erreur fatale, pas de double crédit) | ☐ |
| 11 | Entreprise : User A ne peut pas modifier les programmes de B | **Échec** | ☐ |
| 12 | Entreprise inactive (`is_active=false`) : User B ne la voit pas en SELECT public | **0 ligne** (sauf si owner) | ☐ |

### Script SQL d’aide pour les tests (à adapter)

```sql
-- À exécuter en se connectant avec le JWT de User A puis User B
-- (ou via supabase-js côté client)

-- Exemple : User A regarde les commandes de User B
select * from orders where buyer_id = '<UUID_USER_B>';
-- Attendu : 0 lignes

-- User A regarde les order_financials d’une commande de B
select * from order_financials where order_id = '<ORDER_ID_DE_B>';
-- Attendu : 0 lignes
```

---

## 4. Points de sécurité déjà corrects (ne pas casser)

D’après le code des migrations :

- **Prix** : `create_order_secure` recalcule toujours depuis `shop_products` → jamais de confiance au client.
- **Commission** : 5 % enregistrée dans `order_financials` (configurable plus tard).
- **Paiement** : `mark_order_paid` est `security definer` + grant **uniquement** à `service_role` → le client ne peut pas marquer une commande payée.
- **Pickup code** : généré côté serveur.
- **Quantité** : bornée (1–100).
- **Devises mixtes** : refusées.
- **Storage shop-media** : écriture limitée au dossier `auth.uid()`.

---

## 5. Actions concrètes à faire maintenant

1. **Dans Supabase SQL Editor** (staging d’abord) :
   - Exécuter les 4 requêtes de vérification (sections 2.A → 2.D)
   - Noter les tables / fonctions manquantes

2. **Si des migrations manquent** :
   - Les appliquer **dans l’ordre strict** (surtout 023 → 024 → 025 → 026 → 027)
   - Ne jamais appliquer 027 avant 023/026

3. **Renommer les doublons** (recommandé pour clarté) :
   ```bash
   # Dans le repo local
   git mv supabase/migrations/020_wallet_ledger.sql \
          supabase/migrations/020b_wallet_ledger.sql
   git mv supabase/migrations/028_stable_user_accounts.sql \
          supabase/migrations/028b_stable_user_accounts.sql
   ```
   Puis commit + réappliquer si besoin (les `if not exists` / `create or replace` protègent).

4. **Faire les 12 tests RLS** avec deux comptes réels.

5. **Storage** :
   ```sql
   select id, name, public from storage.buckets where id = 'shop-media';
   ```
   + tester upload croisé (User A → dossier User B) → doit échouer.

---

## 6. Checklist finale Étape 3

- [ ] Toutes les tables marketplace/entreprises existent
- [ ] `create_order_secure` et `mark_order_paid` (version 027) existent
- [ ] RLS activé sur orders, order_items, order_financials, companies, wallets, messages…
- [ ] 12 scénarios multi-utilisateurs validés
- [ ] Storage shop-media : lecture publique OK, écriture croisée refusée
- [ ] Doublons 020 / 028 documentés ou renommés
- [ ] Staging validé avant production

---

Une fois cette étape validée, on passe à l’**Étape 4** (UX-PERF : LazyMedia, EmptyState, OfflineBanner, etc.).
```
