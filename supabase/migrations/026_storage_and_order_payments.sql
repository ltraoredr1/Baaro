-- BAARO 026: paiement des commandes + média boutique
alter table public.orders add column if not exists paid_at timestamptz;

insert into storage.buckets (id, name, public)
values ('shop-media', 'shop-media', true)
on conflict (id) do update set public = excluded.public;

drop policy if exists "shop_media_public_read" on storage.objects;
create policy "shop_media_public_read" on storage.objects for select using (bucket_id = 'shop-media');

drop policy if exists "shop_media_owner_insert" on storage.objects;
create policy "shop_media_owner_insert" on storage.objects for insert to authenticated
with check (
  bucket_id = 'shop-media'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "shop_media_owner_update" on storage.objects;
create policy "shop_media_owner_update" on storage.objects for update to authenticated
using (
  bucket_id = 'shop-media'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'shop-media'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "shop_media_owner_delete" on storage.objects;
create policy "shop_media_owner_delete" on storage.objects for delete to authenticated
using (
  bucket_id = 'shop-media'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create or replace function public.mark_order_paid(p_order_id uuid, p_payment_ref text, p_provider text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.orders
     set payment_status = 'paid',
         paid_at = coalesce(paid_at, now()),
         status = case when status = 'pending' then 'confirmed' else status end,
         updated_at = now()
   where id = p_order_id
     and payment_status <> 'paid';

  if not found then
    raise exception 'Commande inexistante ou déjà payée';
  end if;
end;
$$;

revoke all on function public.mark_order_paid(uuid, text, text) from public, anon, authenticated;
grant execute on function public.mark_order_paid(uuid, text, text) to service_role;
