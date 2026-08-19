-- ============================================================
-- BAARO — Chat + Amis (conversations, messages, follows)
-- Idempotent
-- ============================================================

-- 1) Table conversations
create table if not exists conversations (
  id uuid primary key default gen_random_uuid(),
  user1_id uuid not null references auth.users(id) on delete cascade,
  user2_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user1_id, user2_id)
);

create index if not exists idx_conversations_user1 on conversations (user1_id);
create index if not exists idx_conversations_user2 on conversations (user2_id);

alter table conversations enable row level security;

drop policy if exists "conversations_read" on conversations;
drop policy if exists "conversations_insert" on conversations;
create policy "conversations_read" on conversations
  for select using (auth.uid() = user1_id or auth.uid() = user2_id);
create policy "conversations_insert" on conversations
  for insert with check (auth.uid() = user1_id or auth.uid() = user2_id);

-- 2) Messages : colonnes attendues par l'app
alter table messages add column if not exists conversation_id uuid references conversations(id) on delete cascade;
alter table messages add column if not exists sender_id uuid references auth.users(id) on delete cascade;
alter table messages add column if not exists recipient_id uuid references auth.users(id) on delete set null;
alter table messages add column if not exists text text;
alter table messages add column if not exists created_at timestamptz default now();

create index if not exists idx_messages_conversation on messages (conversation_id, created_at);

alter table messages enable row level security;

drop policy if exists "messages_read" on messages;
drop policy if exists "messages_insert" on messages;
drop policy if exists "messages_read_own" on messages;
drop policy if exists "messages_send_own" on messages;

create policy "messages_read_own" on messages
  for select using (
    auth.uid() = sender_id
    or auth.uid() = recipient_id
    or exists (
      select 1 from conversations c
      where c.id = messages.conversation_id
        and (c.user1_id = auth.uid() or c.user2_id = auth.uid())
    )
  );

create policy "messages_send_own" on messages
  for insert with check (auth.uid() = sender_id);

-- Realtime (ignore si déjà ajouté)
do $$
begin
  alter publication supabase_realtime add table messages;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table conversations;
exception when duplicate_object then null;
end $$;

-- 3) Follows / amis (colonnes)
create table if not exists follows (
  follower_id uuid not null references auth.users(id) on delete cascade,
  followed_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'accepted',
  is_friend boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (follower_id, followed_id)
);

alter table follows add column if not exists status text default 'accepted';
alter table follows add column if not exists is_friend boolean default false;
alter table follows add column if not exists id uuid default gen_random_uuid();

-- id unique pour accept/reject par id
create unique index if not exists idx_follows_id on follows (id);

alter table follows enable row level security;
drop policy if exists "follows_read" on follows;
drop policy if exists "follows_own" on follows;
create policy "follows_read" on follows for select using (true);
create policy "follows_own" on follows
  for all using (auth.uid() = follower_id)
  with check (auth.uid() = follower_id);

-- 4) Index recherche profils
create index if not exists idx_profiles_handle on profiles (handle);
create index if not exists idx_profiles_display_name on profiles (display_name);
