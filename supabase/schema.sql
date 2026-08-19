-- Schéma BAARO pour Supabase. À coller dans SQL Editor puis "Run".

create table if not exists wallets (
  user_id uuid primary key references auth.users(id) on delete cascade,
  balance numeric not null default 0, updated_at timestamptz not null default now()
);
create table if not exists transactions (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  label text not null, pts numeric not null, action_key text, day_key date, reference_id uuid, created_at timestamptz not null default now()
);
create table if not exists crypto_holdings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  holdings numeric not null default 0, updated_at timestamptz not null default now()
);
create table if not exists profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'Nouveau membre', flag text default '🌍', handle text, created_at timestamptz not null default now()
);
create table if not exists posts (
  id uuid primary key default gen_random_uuid(), author_id uuid not null references auth.users(id) on delete cascade,
  text text not null, created_at timestamptz not null default now()
);
create table if not exists post_likes (
  post_id uuid not null references posts(id) on delete cascade, user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(), primary key (post_id, user_id)
);
create table if not exists videos (
  id uuid primary key default gen_random_uuid(), author_id uuid not null references auth.users(id) on delete cascade,
  title text not null, duration text, views int not null default 0, created_at timestamptz not null default now()
);
create table if not exists follows (
  follower_id uuid not null references auth.users(id) on delete cascade, followed_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(), primary key (follower_id, followed_id)
);
create table if not exists messages (
  id uuid primary key default gen_random_uuid(), conversation_id uuid not null,
  sender_id uuid not null references auth.users(id) on delete cascade, recipient_id uuid not null references auth.users(id) on delete cascade,
  text text not null, created_at timestamptz not null default now()
);

alter table wallets enable row level security;
alter table transactions enable row level security;
alter table crypto_holdings enable row level security;
alter table profiles enable row level security;
alter table posts enable row level security;
alter table post_likes enable row level security;
alter table videos enable row level security;
alter table follows enable row level security;
alter table messages enable row level security;

create policy "wallet_own" on wallets for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "tx_own" on transactions for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "crypto_own" on crypto_holdings for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "profiles_read" on profiles for select using (true);
create policy "profiles_insert" on profiles for insert with check (auth.uid() = user_id);
create policy "profiles_update" on profiles for update using (auth.uid() = user_id);

create policy "posts_read" on posts for select using (true);
create policy "posts_insert" on posts for insert with check (auth.uid() = author_id);

create policy "likes_read" on post_likes for select using (true);
create policy "likes_own" on post_likes for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "videos_read" on videos for select using (true);
create policy "videos_insert" on videos for insert with check (auth.uid() = author_id);

create policy "follows_read" on follows for select using (true);
create policy "follows_own" on follows for all using (auth.uid() = follower_id) with check (auth.uid() = follower_id);

create table if not exists votes (
  proposal_id text not null, user_id uuid not null references auth.users(id) on delete cascade,
  choice text not null, created_at timestamptz not null default now(), primary key (proposal_id, user_id)
);
alter table votes enable row level security;
create policy "votes_read" on votes for select using (true);
create policy "votes_own" on votes for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "messages_read" on messages for select using (auth.uid() = sender_id or auth.uid() = recipient_id);
create policy "messages_insert" on messages for insert with check (auth.uid() = sender_id);
