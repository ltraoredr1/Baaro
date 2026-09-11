-- BAARO 027: commandes sécurisées + économie marketplace
-- Objectif : ne jamais faire confiance au prix envoyé par le navigateur.
-- Aucun conteneur/VM/virtualisation n'est requis.

create table if not exists public.order_financials (
  order_id uuid primary key references public.orders(id) on delete cascade,
  gross_amount numeric(12,2) not null check (gross_amount >= 0),
  platform_fee numeric(12,2) not null default 0 check (platform_fee >= 0),
  seller_amount numeric(12,2) not null default 0 check (seller_amount >= 0),
  fee_rate numeric(7,5) not null default 0.05 check (fee_rate >= 0 and fee_rate <= 1),
  currency text not null default 'XOF',
  created_at timestamptz not null default now(),
  paid_at timestamptz
);

create index if not exists idx_order_financials_paid
  on public.order_financials(paid_at desc);

alter table public.order_financials enable row level security;

drop policy if exists order_financials_participant_select on public.order_financials;
create policy order_financials_participant_select
on public.order_financials for select using (
  exists (
    select 1 from public.orders o
    where o.id = order_financials.order_id
      and (
        o.buyer_id = auth.uid()
        or exists (
          select 1 from public.shops s
          where s.id = o.shop_id and s.owner_id = auth.uid()
        )
      )
  )
);

create or replace function public.create_order_secure(
  p_shop_id uuid,
  p_method text,
  p_notes text,
  p_dropoff_address text,
  p_items jsonb
)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_order public.orders;
  v_item jsonb;
  v_product public.shop_products;
  v_currency text;
  v_total numeric(12,2) := 0;
  v_qty integer;
  v_pickup text;
begin
  if v_uid is null then raise exception 'authentication_required'; end if;
  if p_shop_id is null then raise exception 'shop_required'; end if;
  if p_method not in ('pickup','delivery') then raise exception 'invalid_delivery_method'; end if;
  if jsonb_typeof(coalesce(p_items, '[]'::jsonb)) <> 'array'
     or jsonb_array_length(coalesce(p_items, '[]'::jsonb)) = 0 then
    raise exception 'items_required';
  end if;
  if not exists (select 1 from public.shops s where s.id=p_shop_id and s.is_active=true) then
    raise exception 'shop_unavailable';
  end if;
  if p_method='delivery' and nullif(trim(coalesce(p_dropoff_address,'')),'') is null then
    raise exception 'delivery_address_required';
  end if;

  -- Vérification des prix côté serveur.
  for v_item in select * from jsonb_array_elements(p_items)
  loop
    if (v_item->>'productId') is null then raise exception 'product_required'; end if;
    v_qty := greatest(1, least(coalesce((v_item->>'quantity')::integer,1),100));
    select * into v_product from public.shop_products
      where id=(v_item->>'productId')::uuid and shop_id=p_shop_id and is_available=true;
    if not found then raise exception 'product_unavailable'; end if;

    if v_currency is null then v_currency:=coalesce(v_product.currency,'XOF');
    elsif v_currency<>coalesce(v_product.currency,'XOF') then
      raise exception 'mixed_currency_not_supported';
    end if;
    v_total := v_total + v_product.price*v_qty;
  end loop;

  if v_total <= 0 then raise exception 'invalid_total'; end if;
  if p_method='pickup' then v_pickup:=upper(substr(replace(gen_random_uuid()::text,'-',''),1,8)); end if;

  insert into public.orders(
    shop_id,buyer_id,status,payment_status,method,total_amount,currency,pickup_code,notes,dropoff_address
  ) values (
    p_shop_id,v_uid,'pending','unpaid',p_method,v_total,coalesce(v_currency,'XOF'),v_pickup,
    nullif(trim(coalesce(p_notes,'')),''),
    nullif(trim(coalesce(p_dropoff_address,'')),'')
  ) returning * into v_order;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_qty := greatest(1, least(coalesce((v_item->>'quantity')::integer,1),100));
    select * into v_product from public.shop_products
      where id=(v_item->>'productId')::uuid and shop_id=p_shop_id and is_available=true;
    insert into public.order_items(order_id,product_id,name,unit_price,quantity,currency)
    values (v_order.id,v_product.id,v_product.name,v_product.price,v_qty,v_product.currency);
  end loop;

  insert into public.order_financials(order_id,gross_amount,platform_fee,seller_amount,fee_rate,currency)
  values (v_order.id,v_total,round(v_total*0.05,2),round(v_total*0.95,2),0.05,coalesce(v_currency,'XOF'));

  return v_order;
end;
$$;

revoke all on function public.create_order_secure(uuid,text,text,text,jsonb) from public, anon;
grant execute on function public.create_order_secure(uuid,text,text,text,jsonb) to authenticated;

-- Recrée la fonction de paiement avec idempotence et enregistre la répartition BAARO.
create or replace function public.mark_order_paid(
  p_order_id uuid,
  p_payment_ref text,
  p_provider text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'order_not_found'; end if;

  if v_order.payment_status = 'paid' then
    return;
  end if;

  update public.orders
     set payment_status = 'paid',
         paid_at = coalesce(paid_at, now()),
         status = case when status = 'pending' then 'confirmed' else status end,
         updated_at = now()
   where id = p_order_id;

  update public.order_financials
     set paid_at = coalesce(paid_at, now())
   where order_id = p_order_id;

  -- La commission est enregistrée ici; le versement vendeur reste contrôlé
  -- par le système de payout et n'est jamais déclenché depuis le client.
end;
$$;

revoke all on function public.mark_order_paid(uuid,text,text) from public, anon, authenticated;
grant execute on function public.mark_order_paid(uuid,text,text) to service_role;
