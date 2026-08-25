-- ============================================
-- BAARO : Livraisons (dont drone, en mode simulation pour l'instant)
-- ============================================

create table public.delivery_orders (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  buyer_id uuid not null references public.profiles(user_id) on delete cascade,
  shop_product_id uuid references public.shop_products(id) on delete set null,

  method text not null check (method in ('pickup', 'courier', 'drone')),
  provider text not null default 'mock', -- 'mock' aujourd'hui, 'wing'/'zipline'/... plus tard

  -- Adresse/point de livraison (le retrait en boutique n'en a pas besoin)
  dropoff_lat double precision,
  dropoff_lng double precision,
  dropoff_address text,

  status text not null default 'pending' check (
    status in ('pending', 'dispatched', 'in_transit', 'delivered', 'cancelled', 'failed')
  ),

  -- Position simulée pendant le vol (mise à jour périodique côté client
  -- en mode 'mock' ; viendrait d'un webhook du provider en mode réel)
  current_lat double precision,
  current_lng double precision,

  estimated_delivery_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_delivery_orders_buyer on public.delivery_orders(buyer_id, created_at desc);
create index idx_delivery_orders_shop on public.delivery_orders(shop_id, created_at desc);

alter table public.delivery_orders enable row level security;

create policy "delivery_select_buyer_or_shop_owner" on public.delivery_orders
  for select using (
    buyer_id = auth.uid()
    or exists (select 1 from public.shops where id = delivery_orders.shop_id and owner_id = auth.uid())
  );

create policy "delivery_insert_buyer" on public.delivery_orders
  for insert with check (buyer_id = auth.uid());

-- Seul le propriétaire de la boutique peut faire progresser une livraison
-- (en mode réel, ce serait plutôt une Edge Function appelée par le webhook du provider)
create policy "delivery_update_shop_owner" on public.delivery_orders
  for update using (
    exists (select 1 from public.shops where id = delivery_orders.shop_id and owner_id = auth.uid())
  );
