-- ============================================
-- BAARO migration 020 : shops + delivery
-- Exécuter après les migrations 001–019
-- Idempotent partiel (IF NOT EXISTS où possible)
-- ============================================

-- Boutiques
create table if not exists public.shops (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(user_id) on delete cascade,
  name text not null,
  description text,
  category text,
  country text not null,
  city text,
  latitude double precision,
  longitude double precision,
  logo_url text,
  is_active boolean not null default false,
  subscription_expires_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.shop_products (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  name text not null,
  description text,
  price numeric(12,2) not null,
  currency text not null default 'XOF',
  type text not null default 'produit' check (type in ('produit', 'service')),
  image_url text,
  is_available boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.shop_subscriptions (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  amount numeric(12,2) not null,
  currency text not null,
  was_premium_rate boolean not null,
  provider text not null check (provider in ('stripe', 'paypal', 'cinetpay', 'paydunya')),
  payment_ref text unique,
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'failed')),
  period_start timestamptz,
  period_end timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.shop_pricing (
  currency text primary key,
  amount_normal numeric(12,2) not null,
  amount_premium numeric(12,2) not null,
  updated_at timestamptz not null default now()
);

insert into public.shop_pricing (currency, amount_normal, amount_premium) values
  ('XOF', 5000, 2500),
  ('EUR', 8, 4),
  ('USD', 9, 4.5)
on conflict (currency) do nothing;

create index if not exists idx_shops_country_city on public.shops(country, city) where is_active;
create index if not exists idx_shop_products_shop on public.shop_products(shop_id);

alter table public.shops enable row level security;
alter table public.shop_products enable row level security;
alter table public.shop_subscriptions enable row level security;
alter table public.shop_pricing enable row level security;

-- Policies (drop + recreate pour idempotence soft)
drop policy if exists "shops_select" on public.shops;
create policy "shops_select" on public.shops
  for select using (is_active = true or owner_id = auth.uid());

drop policy if exists "shops_insert_owner" on public.shops;
create policy "shops_insert_owner" on public.shops
  for insert with check (owner_id = auth.uid());

drop policy if exists "shops_update_owner" on public.shops;
create policy "shops_update_owner" on public.shops
  for update using (owner_id = auth.uid());

drop policy if exists "products_select" on public.shop_products;
create policy "products_select" on public.shop_products
  for select using (
    exists (
      select 1 from public.shops
      where id = shop_products.shop_id and (is_active or owner_id = auth.uid())
    )
  );

drop policy if exists "products_write_owner" on public.shop_products;
create policy "products_write_owner" on public.shop_products
  for all using (
    exists (
      select 1 from public.shops
      where id = shop_products.shop_id and owner_id = auth.uid()
    )
  );

drop policy if exists "subscriptions_select_owner" on public.shop_subscriptions;
create policy "subscriptions_select_owner" on public.shop_subscriptions
  for select using (
    exists (
      select 1 from public.shops
      where id = shop_subscriptions.shop_id and owner_id = auth.uid()
    )
  );

-- Insert subscription : owner only
drop policy if exists "subscriptions_insert_owner" on public.shop_subscriptions;
create policy "subscriptions_insert_owner" on public.shop_subscriptions
  for insert with check (
    exists (
      select 1 from public.shops
      where id = shop_subscriptions.shop_id and owner_id = auth.uid()
    )
  );

drop policy if exists "pricing_select_public" on public.shop_pricing;
create policy "pricing_select_public" on public.shop_pricing
  for select using (true);

-- Activation (service_role only)
create or replace function public.activate_shop_subscription(
  p_shop_id uuid,
  p_payment_ref text,
  p_amount numeric,
  p_currency text,
  p_provider text,
  p_was_premium boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.shop_subscriptions
  set status = 'confirmed',
      period_start = now(),
      period_end = now() + interval '1 year'
  where payment_ref = p_payment_ref
    and status = 'pending';

  update public.shops
  set is_active = true,
      subscription_expires_at = now() + interval '1 year'
  where id = p_shop_id;
end;
$$;

revoke all on function public.activate_shop_subscription(uuid, text, numeric, text, text, boolean) from public, anon, authenticated;
grant execute on function public.activate_shop_subscription(uuid, text, numeric, text, text, boolean) to service_role;

-- Delivery (dépend de shops / shop_products)
create table if not exists public.delivery_orders (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  buyer_id uuid not null references public.profiles(user_id) on delete cascade,
  shop_product_id uuid references public.shop_products(id) on delete set null,
  method text not null check (method in ('pickup', 'courier', 'drone')),
  provider text not null default 'mock',
  dropoff_lat double precision,
  dropoff_lng double precision,
  dropoff_address text,
  status text not null default 'pending' check (
    status in ('pending', 'dispatched', 'in_transit', 'delivered', 'cancelled', 'failed')
  ),
  current_lat double precision,
  current_lng double precision,
  estimated_delivery_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_delivery_orders_buyer on public.delivery_orders(buyer_id, created_at desc);
create index if not exists idx_delivery_orders_shop on public.delivery_orders(shop_id, created_at desc);

alter table public.delivery_orders enable row level security;

drop policy if exists "delivery_select_buyer_or_shop_owner" on public.delivery_orders;
create policy "delivery_select_buyer_or_shop_owner" on public.delivery_orders
  for select using (
    buyer_id = auth.uid()
    or exists (select 1 from public.shops where id = delivery_orders.shop_id and owner_id = auth.uid())
  );

drop policy if exists "delivery_insert_buyer" on public.delivery_orders;
create policy "delivery_insert_buyer" on public.delivery_orders
  for insert with check (buyer_id = auth.uid());

drop policy if exists "delivery_update_shop_owner" on public.delivery_orders;
create policy "delivery_update_shop_owner" on public.delivery_orders
  for update using (
    exists (select 1 from public.shops where id = delivery_orders.shop_id and owner_id = auth.uid())
  );
