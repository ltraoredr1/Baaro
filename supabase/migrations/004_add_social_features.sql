-- À exécuter en plus du schéma existant, dans une nouvelle requête SQL Supabase.

create table if not exists comments (
  id uuid primary key default gen_random_uuid(), post_id uuid not null references posts(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade, text text not null, created_at timestamptz not null default now()
);
create table if not exists notifications (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  message text not null, read boolean not null default false, created_at timestamptz not null default now()
);
create table if not exists blocks (
  blocker_id uuid not null references auth.users(id) on delete cascade, blocked_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(), primary key (blocker_id, blocked_id)
);
create table if not exists reports (
  id uuid primary key default gen_random_uuid(), reporter_id uuid not null references auth.users(id) on delete cascade,
  target_type text not null, target_id text not null, reason text, created_at timestamptz not null default now()
);
create table if not exists stories (
  id uuid primary key default gen_random_uuid(), author_id uuid not null references auth.users(id) on delete cascade,
  text text not null, created_at timestamptz not null default now(), expires_at timestamptz not null default (now() + interval '24 hours')
);

alter table comments enable row level security;
alter table notifications enable row level security;
alter table blocks enable row level security;
alter table reports enable row level security;
alter table stories enable row level security;

create policy "comments_read" on comments for select using (true);
create policy "comments_insert" on comments for insert with check (auth.uid() = author_id);
create policy "notif_own" on notifications for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "blocks_own" on blocks for all using (auth.uid() = blocker_id) with check (auth.uid() = blocker_id);
create policy "reports_insert" on reports for insert with check (auth.uid() = reporter_id);
create policy "reports_own_read" on reports for select using (auth.uid() = reporter_id);
create policy "stories_read" on stories for select using (true);
create policy "stories_insert" on stories for insert with check (auth.uid() = author_id);
