-- BAARO — Colonnes amis + RLS follows (obligatoire pour FriendRequestButton)
alter table public.follows
  add column if not exists status text not null default 'accepted';
alter table public.follows
  add column if not exists is_friend boolean not null default false;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'follows_follower_followed_unique'
  ) then
    alter table public.follows
      add constraint follows_follower_followed_unique
      unique (follower_id, followed_id);
  end if;
exception when others then
  raise notice 'Unique follows déjà présent ou doublons à nettoyer';
end $$;

alter table public.follows enable row level security;

drop policy if exists follows_select on public.follows;
drop policy if exists "follows_read" on public.follows;
create policy follows_select on public.follows
  for select using (
    auth.uid() is not null
    and (follower_id = auth.uid() or followed_id = auth.uid())
  );

drop policy if exists follows_insert_own on public.follows;
drop policy if exists "follows_own" on public.follows;
create policy follows_insert_own on public.follows
  for insert with check (
    follower_id = auth.uid() and follower_id <> followed_id
  );

drop policy if exists follows_update_own on public.follows;
drop policy if exists "follows_update_own" on public.follows;
create policy follows_update_own on public.follows
  for update using (
    follower_id = auth.uid() or followed_id = auth.uid()
  )
  with check (
    follower_id = auth.uid() or followed_id = auth.uid()
  );

drop policy if exists follows_delete_own on public.follows;
drop policy if exists "follows_delete_own" on public.follows;
create policy follows_delete_own on public.follows
  for delete using (
    follower_id = auth.uid() or followed_id = auth.uid()
  );
