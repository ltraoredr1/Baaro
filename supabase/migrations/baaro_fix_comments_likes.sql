-- ============================================================
-- BAARO — Reparation commentaires + likes + compteurs
-- Idempotent. A executer dans Supabase > SQL Editor.
-- ============================================================

-- 1. Colonnes compteurs sur posts
alter table public.posts
  add column if not exists comments_count integer not null default 0;
alter table public.posts
  add column if not exists likes_count integer not null default 0;

-- 2. Table comments
create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  text text not null,
  created_at timestamptz not null default now()
);

create index if not exists comments_post_id_idx
  on public.comments (post_id, created_at desc);

alter table public.comments enable row level security;

drop policy if exists "comments_read" on public.comments;
drop policy if exists "comments_insert" on public.comments;
drop policy if exists "comments_own_delete" on public.comments;
drop policy if exists "comments_own_update" on public.comments;
drop policy if exists comments_read on public.comments;
drop policy if exists comments_insert on public.comments;
drop policy if exists comments_own_delete on public.comments;
drop policy if exists comments_own_update on public.comments;

create policy comments_read on public.comments
  for select using (true);

create policy comments_insert on public.comments
  for insert to authenticated
  with check (auth.uid() = author_id);

create policy comments_own_delete on public.comments
  for delete to authenticated
  using (auth.uid() = author_id);

create policy comments_own_update on public.comments
  for update to authenticated
  using (auth.uid() = author_id)
  with check (auth.uid() = author_id);

-- 3. Table post_likes
create table if not exists public.post_likes (
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create index if not exists post_likes_user_idx
  on public.post_likes (user_id);

alter table public.post_likes enable row level security;

drop policy if exists post_likes_read on public.post_likes;
drop policy if exists post_likes_insert on public.post_likes;
drop policy if exists post_likes_delete on public.post_likes;
drop policy if exists "post_likes_read" on public.post_likes;
drop policy if exists "post_likes_own" on public.post_likes;

create policy post_likes_read on public.post_likes
  for select using (true);

create policy post_likes_insert on public.post_likes
  for insert to authenticated
  with check (auth.uid() = user_id);

create policy post_likes_delete on public.post_likes
  for delete to authenticated
  using (auth.uid() = user_id);

-- 4. Trigger compteur commentaires
create or replace function public.baaro_sync_post_comment_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_post_id uuid;
begin
  target_post_id := case when tg_op = 'DELETE' then old.post_id else new.post_id end;

  update public.posts p
  set comments_count = (
    select count(*)::int from public.comments c where c.post_id = target_post_id
  )
  where p.id = target_post_id;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists trg_baaro_post_comment_count on public.comments;
create trigger trg_baaro_post_comment_count
  after insert or delete on public.comments
  for each row execute function public.baaro_sync_post_comment_count();

-- 5. Trigger compteur likes
create or replace function public.baaro_sync_post_like_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_post_id uuid;
begin
  target_post_id := case when tg_op = 'DELETE' then old.post_id else new.post_id end;

  update public.posts
  set likes_count = (
    select count(*)::int from public.post_likes where post_id = target_post_id
  )
  where id = target_post_id;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists trg_baaro_post_like_count on public.post_likes;
create trigger trg_baaro_post_like_count
  after insert or delete on public.post_likes
  for each row execute function public.baaro_sync_post_like_count();

-- 6. Recalcul global des compteurs
update public.posts p
set comments_count = coalesce((
  select count(*)::int from public.comments c where c.post_id = p.id
), 0);

update public.posts p
set likes_count = coalesce((
  select count(*)::int from public.post_likes l where l.post_id = p.id
), 0);

update public.posts set comments_count = 0 where comments_count < 0;
update public.posts set likes_count = 0 where likes_count < 0;

-- 7. Realtime (ignore si deja present)
do $$
begin
  begin
    alter publication supabase_realtime add table public.comments;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.post_likes;
  exception when duplicate_object then null;
  end;
end $$;
