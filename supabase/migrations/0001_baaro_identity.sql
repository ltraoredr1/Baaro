-- BAARO - IDENTITE UNIQUE : profiles.id = auth.uid()
-- 1 seul ID partout, build APK clean

-- Extensions
create extension if not exists "uuid-ossp";

-- 1. PROFILES - TABLE MERE
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'Membre BAARO',
  handle text unique not null,
  flag text default '🌍',
  bio text default '',
  avatar_url text,
  phone text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_profiles_handle on public.profiles(handle);

-- 2. TRIGGER AUTO-CREATION PROFIL
create or replace function public.handle_new_user()
returns trigger as $$
declare
  base_handle text;
begin
  base_handle := '@user_' || substr(new.id::text, 1, 8);
  
  insert into public.profiles (id, display_name, handle)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'display_name', 'Membre BAARO'),
    base_handle
  )
  on conflict (id) do nothing;
  
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users for each row execute procedure public.handle_new_user();

-- 3. FOLLOWS / FRIENDS - 4 FK vers profiles.id
create table if not exists public.follows (
  follower_id uuid not null references public.profiles(id) on delete cascade,
  followed_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'accepted' check (status in ('pending','accepted','rejected')),
  is_friend boolean not null default false,
  created_at timestamptz default now(),
  primary key (follower_id, followed_id),
  check (follower_id != followed_id)
);

create index if not exists idx_follows_follower on public.follows(follower_id, status);
create index if not exists idx_follows_followed on public.follows(followed_id, status);

-- 4. NOTIFICATIONS PREFERENCES - user_id = profiles.id
create table if not exists public.notification_preferences (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  push_enabled boolean default true,
  messages boolean default true,
  social boolean default true,
  live boolean default true,
  wallet boolean default true,
  marketing boolean default false,
  updated_at timestamptz default now()
);

-- 5. GIFTS CATALOG + GIFTS SENT
create table if not exists public.gifts_catalog (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  icon text not null,
  price_points int not null check (price_points > 0),
  created_at timestamptz default now()
);

create table if not exists public.gifts_sent (
  id uuid primary key default uuid_generate_v4(),
  room_id uuid not null, -- debate_rooms.id
  sender_id uuid not null references public.profiles(id) on delete cascade,
  receiver_id uuid not null references public.profiles(id) on delete cascade,
  gift_id uuid not null references public.gifts_catalog(id),
  amount int not null default 1 check (amount between 1 and 20),
  created_at timestamptz default now()
);

-- 6. RLS
alter table public.profiles enable row level security;
alter table public.follows enable row level security;
alter table public.notification_preferences enable row level security;
alter table public.gifts_sent enable row level security;

-- Profiles : tout le monde lit, seul owner update
drop policy if exists "profiles_read_all" on public.profiles;
create policy "profiles_read_all" on public.profiles for select using (true);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles for update using (auth.uid() = id);

-- Follows : owner peut tout gérer
drop policy if exists "follows_all_own" on public.follows;
create policy "follows_all_own" on public.follows for all using (auth.uid() = follower_id or auth.uid() = followed_id);

-- Notification : owner only
drop policy if exists "notif_own" on public.notification_preferences;
create policy "notif_own" on public.notification_preferences for all using (auth.uid() = user_id);

-- Gifts sent : lecture salon, écriture authentifiée
drop policy if exists "gifts_read_room" on public.gifts_sent;
create policy "gifts_read_room" on public.gifts_sent for select using (true);

drop policy if exists "gifts_insert_auth" on public.gifts_sent;
create policy "gifts_insert_auth" on public.gifts_sent for insert with check (auth.uid() = sender_id);

-- RPC record_feed_event doit utiliser auth.uid() dedans
