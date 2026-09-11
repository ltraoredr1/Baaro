-- BAARO 023: commandes marketplace
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  buyer_id uuid not null references public.profiles(user_id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','confirmed','preparing','ready','in_transit','delivered','cancelled')),
  payment_status text not null default 'unpaid' check (payment_status in ('unpaid','pending','paid','failed','refunded')),
  method text not null default 'pickup' check (method in ('pickup','delivery')),
  total_amount numeric(12,2) not null check (total_amount >= 0),
  currency text not null default 'XOF',
  pickup_code text,
  notes text,
  dropoff_address text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid references public.shop_products(id) on delete set null,
  name text not null,
  unit_price numeric(12,2) not null check (unit_price >= 0),
  quantity integer not null check (quantity > 0),
  currency text not null default 'XOF',
  created_at timestamptz not null default now()
);

create table if not exists public.shop_reviews (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  rating integer not null check (rating between 1 and 5),
  comment text,
  created_at timestamptz not null default now(),
  unique(shop_id, user_id)
);

create index if not exists idx_orders_buyer_created on public.orders(buyer_id, created_at desc);
create index if not exists idx_orders_shop_created on public.orders(shop_id, created_at desc);
create index if not exists idx_order_items_order on public.order_items(order_id);
create index if not exists idx_shop_reviews_shop on public.shop_reviews(shop_id, created_at desc);

alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.shop_reviews enable row level security;

drop policy if exists "orders_buyer_or_owner_select" on public.orders;
create policy "orders_buyer_or_owner_select" on public.orders for select using (
  buyer_id = auth.uid()
  or exists (select 1 from public.shops s where s.id = orders.shop_id and s.owner_id = auth.uid())
);

drop policy if exists "orders_buyer_insert" on public.orders;
create policy "orders_buyer_insert" on public.orders for insert with check (buyer_id = auth.uid());

drop policy if exists "orders_owner_update" on public.orders;
create policy "orders_owner_update" on public.orders for update using (
  exists (select 1 from public.shops s where s.id = orders.shop_id and s.owner_id = auth.uid())
);

drop policy if exists "order_items_participant_select" on public.order_items;
create policy "order_items_participant_select" on public.order_items for select using (
  exists (
    select 1 from public.orders o
    where o.id = order_items.order_id
      and (o.buyer_id = auth.uid()
           or exists (select 1 from public.shops s where s.id = o.shop_id and s.owner_id = auth.uid()))
  )
);

drop policy if exists "order_items_buyer_insert" on public.order_items;
create policy "order_items_buyer_insert" on public.order_items for insert with check (
  exists (select 1 from public.orders o where o.id = order_items.order_id and o.buyer_id = auth.uid())
);

drop policy if exists "shop_reviews_public_select" on public.shop_reviews;
create policy "shop_reviews_public_select" on public.shop_reviews for select using (true);
drop policy if exists "shop_reviews_owner_write" on public.shop_reviews;
create policy "shop_reviews_owner_write" on public.shop_reviews for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Compatibilité avec l'UI d'inscription boutique.
alter table public.shops add column if not exists currency text not null default 'XOF';
alter table public.shops add column if not exists subscription_status text not null default 'none';
alter table public.shops add column if not exists trial_ends_at timestamptz;

-- Compatibilité: l'essai gratuit est une trace d'abonnement, sans paiement.
alter table public.shop_subscriptions drop constraint if exists shop_subscriptions_provider_check;
alter table public.shop_subscriptions add constraint shop_subscriptions_provider_check
  check (provider in ('stripe','paypal','cinetpay','paydunya','trial'));
alter table public.shop_subscriptions drop constraint if exists shop_subscriptions_status_check;
alter table public.shop_subscriptions add constraint shop_subscriptions_status_check
  check (status in ('pending','confirmed','failed','trial'));
