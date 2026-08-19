-- ============================================
-- BAARO : Boutiques, produits/services, abonnements
-- Version internationale (pays / devise / provider multiples)
-- ============================================

-- NOTE : suppose que profiles a une colonne is_premium (boolean).
-- Adapte si ton statut Premium est stocké autrement.

create table public.shops (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(user_id) on delete cascade,
  name text not null,
  description text,
  category text,
  country text not null, -- code ISO 3166-1 alpha-2, ex: 'ML', 'FR', 'US'
  city text,
  latitude double precision,
  longitude double precision,
  logo_url text,
  is_active boolean not null default false, -- activé seulement après paiement confirmé
  subscription_expires_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.shop_products (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  name text not null,
  description text,
  price numeric(12,2) not null, -- dans la devise du shop_products.currency
  currency text not null default 'XOF', -- code ISO 4217, ex: 'XOF', 'EUR', 'USD'
  type text not null default 'produit' check (type in ('produit', 'service')),
  image_url text,
  is_available boolean not null default true,
  created_at timestamptz not null default now()
);

-- Historique des paiements d'abonnement (traçabilité + anti-fraude)
create table public.shop_subscriptions (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  amount numeric(12,2) not null, -- montant dans la devise ci-dessous
  currency text not null, -- code ISO 4217, ex: 'XOF', 'EUR', 'USD'
  was_premium_rate boolean not null,
  provider text not null check (provider in ('stripe', 'paypal', 'cinetpay', 'paydunya')),
  payment_ref text unique, -- référence Stripe/PayPal/CinetPay/PayDunya
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'failed')),
  period_start timestamptz,
  period_end timestamptz,
  created_at timestamptz not null default now()
);

-- Tarification de référence par devise (maintenue à la main, ou via une
-- Edge Function planifiée qui met à jour les montants selon les taux de change)
create table public.shop_pricing (
  currency text primary key, -- code ISO 4217
  amount_normal numeric(12,2) not null,
  amount_premium numeric(12,2) not null,
  updated_at timestamptz not null default now()
);

insert into public.shop_pricing (currency, amount_normal, amount_premium) values
  ('XOF', 5000, 2500),
  ('EUR', 8, 4),
  ('USD', 9, 4.5);
-- Ajoute d'autres devises au besoin. Ces valeurs sont indicatives,
-- à ajuster selon le pouvoir d'achat local et le taux de change réel.

create index idx_shops_country_city on public.shops(country, city) where is_active;
create index idx_shop_products_shop on public.shop_products(shop_id);

-- ============================================
-- RLS
-- ============================================
alter table public.shops enable row level security;
alter table public.shop_products enable row level security;
alter table public.shop_subscriptions enable row level security;
alter table public.shop_pricing enable row level security;

-- Boutiques actives visibles par tous ; le propriétaire voit aussi la sienne inactive
create policy "shops_select" on public.shops
  for select using (is_active = true or owner_id = auth.uid());

create policy "shops_insert_owner" on public.shops
  for insert with check (owner_id = auth.uid());

create policy "shops_update_owner" on public.shops
  for update using (owner_id = auth.uid());

-- Produits visibles si la boutique est active
create policy "products_select" on public.shop_products
  for select using (
    exists (select 1 from public.shops where id = shop_products.shop_id and (is_active or owner_id = auth.uid()))
  );

create policy "products_write_owner" on public.shop_products
  for all using (
    exists (select 1 from public.shops where id = shop_products.shop_id and owner_id = auth.uid())
  );

-- L'abonnement n'est visible que par le propriétaire de la boutique
create policy "subscriptions_select_owner" on public.shop_subscriptions
  for select using (
    exists (select 1 from public.shops where id = shop_subscriptions.shop_id and owner_id = auth.uid())
  );

-- La tarification de référence est publique en lecture (affichage des prix)
create policy "pricing_select_public" on public.shop_pricing
  for select using (true);

-- ============================================
-- Fonction : active la boutique pour 1 an après confirmation de paiement
-- (à appeler UNIQUEMENT depuis le webhook de paiement, en Edge Function,
-- avec la clé service_role — jamais depuis le client)
-- ============================================
create or replace function public.activate_shop_subscription(
  p_shop_id uuid,
  p_payment_ref text,
  p_amount numeric,
  p_currency text,
  p_provider text,
  p_was_premium boolean
)
returns void as $$
begin
  update public.shop_subscriptions
  set status = 'confirmed',
      period_start = now(),
      period_end = now() + interval '1 year'
  where payment_ref = p_payment_ref;

  update public.shops
  set is_active = true,
      subscription_expires_at = now() + interval '1 year'
  where id = p_shop_id;
end;
$$ language plpgsql security definer;

-- CRITIQUE : sans ce revoke, n'importe quel utilisateur authentifié pourrait
-- appeler cette fonction en RPC depuis le client et activer sa boutique
-- gratuitement (security definer = exécutée avec les droits du créateur,
-- donc elle ignore la RLS par défaut si elle reste ouverte à tous).
revoke execute on function public.activate_shop_subscription from public, anon, authenticated;
grant execute on function public.activate_shop_subscription to service_role;
