-- BAARO UNIFIED DATABASE MIGRATION
-- Fresh database: one coordinated migration.



-- ============================================================
-- FRESH DATABASE BOOTSTRAP — CANONICAL IDENTITY FIRST
-- profiles.id is auth.users.id. No public.profiles.user_id exists.
-- ============================================================
create extension if not exists "uuid-ossp";

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

-- ===== SOURCE 0001_initial_baaro.sql =====
-- ============================================================
-- BAARO — CORE TABLES FOR A FRESH SUPABASE PROJECT
-- These are the foundational tables required before all hardening/index migrations.
-- ============================================================

create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles(id) on delete cascade,
  text text not null default '',
  media_url text,
  media_type text check (media_type is null or media_type in ('image','video','audio')),
  likes_count integer not null default 0,
  comments_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.videos (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles(id) on delete cascade,
  video_url text not null,
  thumbnail_url text,
  title text not null default 'Vidéo BAARO',
  description text,
  duration text,
  views bigint not null default 0,
  likes integer not null default 0,
  comments_count integer not null default 0,
  is_repost boolean not null default false,
  original_author_id uuid references public.profiles(id) on delete set null,
  sound_id text,
  sound_url text,
  sound_title text,
  mute_original boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid references public.profiles(id) on delete set null,
  text text not null default '',
  type text not null default 'text',
  media_url text,
  media_mime text,
  media_size bigint,
  media_duration numeric,
  file_name text,
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.wallets (
  id uuid primary key references public.profiles(id) on delete cascade,
  balance numeric not null default 0 check (balance >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists public.crypto_holdings (
  id uuid primary key references public.profiles(id) on delete cascade,
  holdings numeric not null default 0 check (holdings >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  label text not null,
  pts numeric not null,
  action_key text not null,
  day_key date,
  reference_id uuid,
  created_at timestamptz not null default now()
);

create table if not exists public.blocks (
  id uuid primary key default gen_random_uuid(),
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

create table if not exists public.groups (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  description text,
  avatar_url text,
  is_public boolean not null default true,
  is_private boolean not null default false,
  category text not null default 'community',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.group_members (
  group_id uuid not null references public.groups(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('owner','admin','moderator','member')),
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

create table if not exists public.channels (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  name text not null,
  type text not null default 'text',
  description text,
  topic text,
  created_at timestamptz not null default now()
);

create table if not exists public.channel_messages (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.channels(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  text text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  buyer_id uuid not null references public.profiles(id) on delete cascade,
  shop_id uuid,
  status text not null default 'pending',
  method text,
  total_amount numeric not null default 0,
  currency text not null default 'XOF',
  pickup_code text,
  notes text,
  payment_status text not null default 'pending',
  payment_reference text,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid,
  name text not null,
  unit_price numeric not null default 0,
  quantity integer not null default 1 check (quantity > 0),
  currency text not null default 'XOF',
  created_at timestamptz not null default now()
);

create index if not exists idx_posts_author_created on public.posts(author_id, created_at desc);
create index if not exists idx_posts_created on public.posts(created_at desc);
create index if not exists idx_videos_author_created on public.videos(author_id, created_at desc);
create index if not exists idx_messages_conversation_created on public.messages(conversation_id, created_at desc);
create index if not exists idx_transactions_user_created on public.transactions(user_id, created_at desc);
create index if not exists idx_blocks_blocker on public.blocks(blocker_id);
create index if not exists idx_blocks_blocked on public.blocks(blocked_id);
create index if not exists idx_groups_owner_created on public.groups(owner_id, created_at desc);
create index if not exists idx_group_members_user on public.group_members(user_id);
create index if not exists idx_channels_group_created on public.channels(group_id, created_at);
create index if not exists idx_channel_messages_channel_created on public.channel_messages(channel_id, created_at desc);
create index if not exists idx_orders_buyer_created on public.orders(buyer_id, created_at desc);
create index if not exists idx_orders_shop_created on public.orders(shop_id, created_at desc);
create index if not exists idx_order_items_order on public.order_items(order_id);

alter table public.posts enable row level security;
alter table public.videos enable row level security;
alter table public.messages enable row level security;
alter table public.wallets enable row level security;
alter table public.crypto_holdings enable row level security;
alter table public.transactions enable row level security;
alter table public.blocks enable row level security;
alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.channels enable row level security;
alter table public.channel_messages enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;


-- ============================================================
-- SOURCE: 0001_baaro_identity.sql
-- ============================================================
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
create policy "notif_own" on public.notification_preferences for all using (auth.uid() = id);

-- Gifts sent : lecture salon, écriture authentifiée
drop policy if exists "gifts_read_room" on public.gifts_sent;
create policy "gifts_read_room" on public.gifts_sent for select using (true);

drop policy if exists "gifts_insert_auth" on public.gifts_sent;
create policy "gifts_insert_auth" on public.gifts_sent for insert with check (auth.uid() = sender_id);

-- RPC record_feed_event doit utiliser auth.uid() dedans


-- ============================================================
-- SOURCE: 0002_security_fix.sql
-- ============================================================
-- BAARO — correctif de sécurité du portefeuille + fonctionnalités
-- anti faux-comptes. À coller dans le SQL Editor de Supabase et exécuter
-- APRÈS supabase-schema.sql (et les autres migrations déjà appliquées).

-- 1) Le portefeuille, l'historique et les avoirs crypto ne doivent plus
--    jamais être modifiables directement depuis le navigateur : jusqu'ici,
--    la policy vérifiait seulement "auth.uid() = user_id", pas que la
--    valeur écrite était légitime — n'importe qui pouvait donc se créer
--    un solde arbitraire via la console. Désormais, seule la lecture de
--    ses propres lignes reste autorisée ; toutes les écritures passent par
--    /api/wallet, avec la clé de service (qui ignore RLS).
drop policy if exists "wallet_own" on wallets;
drop policy if exists "crypto_own" on crypto_holdings;
drop policy if exists "tx_own" on transactions;

create policy "wallet_read_own" on wallets for select using (auth.uid() = id);
create policy "crypto_read_own" on crypto_holdings for select using (auth.uid() = id);
create policy "tx_read_own" on transactions for select using (auth.uid() = id);
-- Volontairement aucune policy insert/update/delete pour anon/authenticated
-- sur ces trois tables : seul service_role (bypass RLS) peut désormais y
-- écrire, depuis les fonctions serveur.

-- 2) Marqueur de compte restreint. Posé à true par /api/register-device
--    quand un même appareil dépasse le nombre de comptes autorisés. Un
--    compte restreint peut toujours naviguer et gagner des points, mais
--    pas racheter de récompenses à valeur réelle (carte cadeau, virement,
--    conversion en BARO).
alter table profiles add column if not exists restricted boolean not null default false;

-- 3) Table de liaison appareil <-> comptes. Aucune policy définie : RLS
--    activé + zéro policy = accès refusé à anon/authenticated, seul
--    service_role peut y lire/écrire depuis les fonctions serveur.
create table if not exists device_accounts (
  device_id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (device_id, user_id)
);
alter table device_accounts enable row level security;


-- ============================================================
-- SOURCE: 0003_add_media.sql
-- ============================================================
-- À exécuter en plus du schéma existant, dans une nouvelle requête SQL Supabase.
alter table posts add column if not exists media_url text;
alter table posts add column if not exists media_type text;


-- ============================================================
-- SOURCE: 0004_add_debates.sql
-- ============================================================
-- Ajoute les "Débats" : salons de groupe combinant texte, vocal, vidéo et
-- un participant IA. À exécuter après les migrations précédentes, dans une
-- nouvelle requête du SQL Editor Supabase.
--
-- Important : contrairement à la messagerie privée (chiffrée de bout en
-- bout, voir supabase-add-e2e-encryption.sql), les messages texte des
-- débats de groupe sont stockés en clair côté serveur — comme pour les
-- publications. Le chiffrement de bout en bout pour un groupe (où chaque
-- membre doit pouvoir déchiffrer) demanderait un système de clés partagées
-- nettement plus complexe ; à envisager dans une itération future si
-- nécessaire.
--
-- L'audio et la vidéo, eux, ne transitent jamais par le serveur : ils
-- passent en direct entre les appareils via WebRTC (voir src/lib/webrtc.js).
-- Seuls les messages de signalisation (offres/réponses de connexion)
-- passent par Supabase Realtime, sans être stockés en base.

create table if not exists debate_rooms (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  topic text,
  mode text not null default 'video' check (mode in ('text', 'audio', 'video')),
  max_participants int not null default 6 check (max_participants between 2 and 12),
  ai_enabled boolean not null default true,
  invite_code text not null unique default substr(replace(gen_random_uuid()::text, '-', ''), 1, 8),
  status text not null default 'active' check (status in ('active', 'ended')),
  created_at timestamptz not null default now(),
  ended_at timestamptz
);

create table if not exists debate_participants (
  room_id uuid not null references debate_rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  primary key (room_id, user_id)
);

create table if not exists debate_messages (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references debate_rooms(id) on delete cascade,
  sender_id uuid references auth.users(id) on delete set null,
  sender_type text not null default 'user' check (sender_type in ('user', 'ai', 'system')),
  text text not null,
  created_at timestamptz not null default now()
);

alter table debate_rooms enable row level security;
alter table debate_participants enable row level security;
alter table debate_messages enable row level security;

-- Salons : visibles par toute personne connectée (pour rejoindre via code
-- ou invitation) ; seul l'hôte peut modifier/terminer son salon.
create policy "debate_rooms_read" on debate_rooms for select using (auth.uid() is not null);
create policy "debate_rooms_insert" on debate_rooms for insert with check (auth.uid() = host_id);
create policy "debate_rooms_update_host" on debate_rooms for update using (auth.uid() = host_id);

-- Participation : chacun voit qui participe aux salons ; chacun ne peut
-- s'ajouter/se retirer que lui-même.
create policy "debate_participants_read" on debate_participants for select using (auth.uid() is not null);
create policy "debate_participants_insert" on debate_participants for insert with check (auth.uid() = id);
create policy "debate_participants_update_own" on debate_participants for update using (auth.uid() = id);

-- Messages : lisibles et écrits uniquement par les membres du salon.
-- Un message peut aussi être envoyé "au nom de l'IA" (sender_id = null,
-- sender_type = 'ai') tant que l'auteur de la requête est bien membre du
-- salon — c'est le client qui appelle Claude et republie la réponse.
create policy "debate_messages_read" on debate_messages for select using (
  exists (select 1 from debate_participants dp where dp.room_id = debate_messages.room_id and dp.user_id = auth.uid())
);
create policy "debate_messages_insert" on debate_messages for insert with check (
  exists (select 1 from debate_participants dp where dp.room_id = debate_messages.room_id and dp.user_id = auth.uid())
  and (sender_type = 'user' and sender_id = auth.uid() or sender_type in ('ai', 'system'))
);

create index if not exists debate_messages_room_idx on debate_messages (room_id, created_at);
create index if not exists debate_participants_room_idx on debate_participants (room_id);

-- Active Supabase Realtime sur ces deux tables (Database > Replication
-- dans le tableau de bord Supabase, ou via cette commande) pour que les
-- messages et l'arrivée/le départ de participants s'affichent en direct.
alter publication supabase_realtime add table debate_messages;
alter publication supabase_realtime add table debate_participants;


-- ============================================================
-- SOURCE: 0005_add_profile_bio.sql
-- ============================================================
-- À exécuter en plus du schéma existant, dans une nouvelle requête SQL Supabase.
alter table profiles add column if not exists bio text default '';


-- ============================================================
-- SOURCE: 0006_add_messages_security.sql
-- ============================================================
-- Corrige la sécurité de la messagerie privée (table `messages`).
-- La table a été créée avec RLS activée mais SANS aucune policy, ce qui
-- bloquait tout accès (aucune lecture ni écriture possible).
-- À exécuter après supabase-schema.sql, dans une nouvelle requête du SQL Editor.

drop policy if exists "messages_read_own" on messages;
create policy "messages_read_own" on messages
  for select
  using (auth.uid() = sender_id or auth.uid() = recipient_id);

drop policy if exists "messages_send_own" on messages;
create policy "messages_send_own" on messages
  for insert
  with check (auth.uid() = sender_id);


-- ============================================================
-- SOURCE: 0007_add_multihost_gifts.sql
-- ============================================================
-- ============================================================
-- BAARO — Lives multi-hôtes (Daily.co) + Cadeaux
-- À exécuter APRÈS supabase-add-debates.sql et supabase-fix-debates-security.sql
-- Version corrigée sur le vrai schéma (debate_rooms/debate_participants
-- avec PK (room_id,user_id), debate_messages avec sender_id/sender_type).
-- ============================================================

-- 1. RÔLES DANS LE LIVE
-- ------------------------------------------------------------
alter table debate_participants
  add column if not exists role text not null default 'viewer'
  check (role in ('host', 'co_host', 'viewer'));

-- Pas besoin de contrainte d'unicité supplémentaire : (room_id, user_id)
-- est déjà la clé primaire de debate_participants.

create index if not exists idx_debate_participants_broadcasters
  on debate_participants (room_id, role)
  where role in ('host', 'co_host');

-- ⚠️ CORRECTIF DE SÉCURITÉ IMPORTANT ⚠️
-- La policy existante "debate_participants_update_own" (voir
-- supabase-add-debates.sql) autorise chaque utilisateur à modifier N'IMPORTE
-- QUELLE colonne de sa propre ligne, y compris "role" — un spectateur
-- pourrait donc s'auto-promouvoir hôte par un simple UPDATE depuis la
-- console du navigateur. Les policies RLS sont permissives (OR entre
-- elles) : ajouter une policy plus restrictive ne suffit PAS à bloquer ça.
-- La seule protection fiable est un trigger qui rejette tout changement de
-- "role" sauf s'il vient de la clé service_role (donc uniquement via
-- api/live-roles.js, qui vérifie déjà côté serveur que l'appelant est
-- l'hôte du salon).

create or replace function prevent_client_role_change()
returns trigger as $$
begin
  if NEW.role is distinct from OLD.role then
    if auth.role() <> 'service_role' then
      raise exception 'Le rôle ne peut être modifié que par le serveur';
    end if;
  end if;
  return NEW;
end;
$$ language plpgsql security definer
SET search_path = public;

drop trigger if exists debate_participants_role_guard on debate_participants;
create trigger debate_participants_role_guard
  before update on debate_participants
  for each row execute function prevent_client_role_change();

-- ============================================================
-- 2. CADEAUX (GIFTS)
-- ============================================================

create table if not exists gift_types (
  id text primary key,
  label text not null,
  icon text not null,
  cost_points integer not null check (cost_points > 0),
  created_at timestamptz not null default now()
);

insert into gift_types (id, label, icon, cost_points) values
  ('heart_gold', 'Cœur doré', '💛', 10),
  ('rose', 'Rose', '🌹', 50),
  ('star', 'Étoile', '⭐', 100),
  ('crown', 'Couronne', '👑', 500)
on conflict (id) do nothing;

create table if not exists gifts_sent (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references debate_rooms(id) on delete cascade,
  from_user_id uuid not null references auth.users(id),
  to_user_id uuid not null references auth.users(id),
  gift_type_id text not null references gift_types(id),
  points_spent integer not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_gifts_sent_room on gifts_sent (room_id, created_at desc);

alter table gift_types enable row level security;
alter table gifts_sent enable row level security;

drop policy if exists "gift_types_public_read" on gift_types;
create policy "gift_types_public_read" on gift_types for select using (true);

drop policy if exists "gifts_sent_public_read" on gifts_sent;
create policy "gifts_sent_public_read" on gifts_sent for select using (true);

-- Aucune policy INSERT côté client : uniquement via api/gifts.js (service_role).

-- ============================================================
-- 3. LIMITE CONNUE — messages IA/système usurpables
-- ============================================================
-- La policy "debate_messages_insert" existante (supabase-add-debates.sql)
-- autorise TOUT membre du salon à insérer un message avec
-- sender_type IN ('ai','system') et un texte arbitraire — donc à usurper
-- l'IA ou une annonce système. C'est déjà le cas indépendamment de ce
-- correctif (pas introduit par le multi-hôte). Pour corriger proprement,
-- il faudrait faire écrire les messages IA depuis le serveur
-- (service_role, dans api/chat.js) plutôt que depuis le client comme le
-- fait useRoomChat.askAI() actuellement — je peux le faire si tu m'envoies
-- api/chat.js.

-- ============================================================
-- Realtime (Database > Replication) si pas déjà fait :
-- alter publication supabase_realtime add table gifts_sent;
-- alter publication supabase_realtime add table debate_participants; -- déjà fait par add-debates.sql
-- ============================================================


-- ============================================================
-- SOURCE: 0008_fix_chat_friends.sql
-- ============================================================
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


-- ============================================================
-- SOURCE: 0009_fix_debates_security.sql
-- ============================================================
-- Correctifs de sécurité pour les Débats/Lives — à exécuter APRÈS
-- supabase-add-debates.sql, dans une nouvelle requête du SQL Editor
-- Supabase.
--
-- 1) Le code d'invitation n'était pas vraiment secret. L'ancienne policy
--    de lecture ("auth.uid() is not null") laissait n'importe quel
--    compte connecté — même anonyme — faire un simple
--    `select * from debate_rooms` et lire ainsi l'invite_code de TOUS
--    les salons, pas seulement les siens. On restreint désormais la
--    lecture aux salons dont on est l'hôte ou déjà participant·e, et on
--    fait passer la vérification du code par une fonction serveur (RPC)
--    qui, elle, est autorisée à lire la table sans être limitée par
--    cette policy — c'est elle qui décide si le code est valide.
--
-- 2) On empêche un·e participant·e de faire passer un message pour un
--    message de l'IA ou du système : avant, seul le type (sender_type)
--    était vérifié, n'importe qui pouvait insérer sender_type='ai' avec
--    n'importe quel sender_id. On impose désormais sender_id = null
--    pour ces deux types.
--
-- 3) Le nouveau mode "Live" (un·e seul·e hôte diffuse, façon TikTok Live)
--    supporte davantage de monde qu'un débat à plusieurs caméras : on
--    relève le plafond de spectateur·ices.

-- --- 1) Lecture restreinte + fonction de jointure par code -----------

drop policy if exists "debate_rooms_read" on debate_rooms;
create policy "debate_rooms_read" on debate_rooms for select using (
  auth.uid() = host_id
  or exists (
    select 1 from debate_participants dp
    where dp.room_id = debate_rooms.id and dp.user_id = auth.uid()
  )
);

-- Rejoindre un live par code : fonction "security definer", donc elle
-- peut lire debate_rooms (y compris invite_code) même si l'appelant·e
-- n'a pas encore le droit de lire cette ligne. Elle vérifie le code et
-- la capacité, puis ajoute l'appelant·e comme participant·e — c'est
-- l'unique porte d'entrée pour rejoindre par code désormais.
create or replace function join_debate_by_code(p_code text)
returns debate_rooms
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room debate_rooms;
  v_count int;
begin
  select * into v_room from debate_rooms
    where invite_code = lower(trim(p_code)) and status = 'active';

  if not found then
    raise exception 'Aucun live actif avec ce code.';
  end if;

  select count(*) into v_count from debate_participants
    where room_id = v_room.id and left_at is null;

  if v_count >= v_room.max_participants then
    raise exception 'Ce live est complet.';
  end if;

  insert into debate_participants (room_id, user_id, joined_at, left_at)
  values (v_room.id, auth.uid(), now(), null)
  on conflict (room_id, user_id) do update set left_at = null, joined_at = now();

  return v_room;
end;
$$;

grant execute on function join_debate_by_code(text) to authenticated, anon;

-- --- 2) Empêcher l'usurpation des messages IA/système -----------------

drop policy if exists "debate_messages_insert" on debate_messages;
create policy "debate_messages_insert" on debate_messages for insert with check (
  exists (select 1 from debate_participants dp where dp.room_id = debate_messages.room_id and dp.user_id = auth.uid())
  and (
    (sender_type = 'user' and sender_id = auth.uid())
    or (sender_type in ('ai', 'system') and sender_id is null)
  )
);

-- --- 3) Plafond de spectateur·ices relevé ------------------------------

alter table debate_rooms drop constraint if exists debate_rooms_max_participants_check;
alter table debate_rooms add constraint debate_rooms_max_participants_check
  check (max_participants between 2 and 50);

-- Note : la fonction join_debate_by_code() ne se substitue pas à un vrai
-- rate limiting contre le brute-force d'un code à 8 caractères — pour un
-- lancement à fort trafic, envisager d'ajouter une limite de tentatives
-- (par IP ou par compte) côté edge function si besoin.


-- ============================================================
-- SOURCE: 0010_performance.sql
-- ============================================================
-- ============================================================
-- BAARO — Optimisation performances SQL
-- A executer dans Supabase → SQL Editor
-- Idempotent (safe a relancer)
-- ============================================================

-- ------------------------------------------------------------
-- 1. FOLLOWS (requetes les plus frequentes)
-- ------------------------------------------------------------
create index if not exists idx_follows_follower_status
  on public.follows (follower_id, status);

create index if not exists idx_follows_following_status
  on public.follows (followed_id, status);

create index if not exists idx_follows_friends
  on public.follows (follower_id, is_friend, status)
  where is_friend = true;

create index if not exists idx_follows_pending
  on public.follows (followed_id, status, is_friend)
  where status = 'pending' and is_friend = true;

-- ------------------------------------------------------------
-- 2. PROFILES (recherche + lookup)
-- ------------------------------------------------------------
create index if not exists idx_profiles_handle
  on public.profiles (handle);

create index if not exists idx_profiles_display_name
  on public.profiles (display_name);

create extension if not exists pg_trgm;

create index if not exists idx_profiles_display_name_trgm
  on public.profiles using gin (display_name gin_trgm_ops);

create index if not exists idx_profiles_handle_trgm
  on public.profiles using gin (handle gin_trgm_ops);

-- ------------------------------------------------------------
-- 3. POSTS (feed)
-- ------------------------------------------------------------
create index if not exists idx_posts_created_at
  on public.posts (created_at desc);

create index if not exists idx_posts_author_created
  on public.posts (author_id, created_at desc);

-- ------------------------------------------------------------
-- 4. POST_LIKES
-- ------------------------------------------------------------
create index if not exists idx_post_likes_user
  on public.post_likes (user_id);

create index if not exists idx_post_likes_post
  on public.post_likes (post_id);

-- ------------------------------------------------------------
-- 5. COMMENTS
-- ------------------------------------------------------------
create index if not exists idx_comments_post_created
  on public.comments (post_id, created_at desc);

create index if not exists idx_comments_author
  on public.comments (author_id);

-- ------------------------------------------------------------
-- 6. MESSAGES
-- ------------------------------------------------------------
create index if not exists idx_messages_conversation_created
  on public.messages (conversation_id, created_at desc);

create index if not exists idx_messages_sender
  on public.messages (sender_id);

create index if not exists idx_messages_recipient
  on public.messages (recipient_id);

-- ------------------------------------------------------------
-- 7. NOTIFICATIONS
-- ------------------------------------------------------------
create index if not exists idx_notifications_user_created
  on public.notifications (user_id, created_at desc);

create index if not exists idx_notifications_user_unread
  on public.notifications (user_id, created_at desc)
  where read = false;

-- ------------------------------------------------------------
-- 8. VIDEOS
-- ------------------------------------------------------------
create index if not exists idx_videos_author_created
  on public.videos (author_id, created_at desc);

create index if not exists idx_videos_created
  on public.videos (created_at desc);

-- ------------------------------------------------------------
-- 9. DEBATES
-- ------------------------------------------------------------
create index if not exists idx_debate_rooms_host
  on public.debate_rooms (host_id);

create index if not exists idx_debate_rooms_created
  on public.debate_rooms (created_at desc);

create index if not exists idx_debate_participants_user
  on public.debate_participants (user_id);

create index if not exists idx_debate_messages_room_created
  on public.debate_messages (room_id, created_at);

-- ------------------------------------------------------------
-- 11. TRANSACTIONS
-- ------------------------------------------------------------
create index if not exists idx_transactions_user_created
  on public.transactions (user_id, created_at desc);

-- ------------------------------------------------------------
-- 12. BLOCKS
-- ------------------------------------------------------------
create index if not exists idx_blocks_blocker
  on public.blocks (blocker_id);

create index if not exists idx_blocks_blocked
  on public.blocks (blocked_id);

-- ------------------------------------------------------------
-- 13. ANALYZE (met a jour les stats du planificateur Postgres)
-- ------------------------------------------------------------
analyze public.follows;
analyze public.profiles;
analyze public.posts;
analyze public.post_likes;
analyze public.comments;
analyze public.messages;
analyze public.notifications;
analyze public.videos;
analyze public.wallets;
analyze public.transactions;

-- ============================================================
-- FIN
-- ============================================================


-- ============================================================
-- SOURCE: 0011_baaro_core_media_security.sql
-- ============================================================
-- ============================================================
-- BAARO 2.0 — Core media/social/device/call schema
-- Idempotent. Execute after 001..010.
-- ============================================================

-- Profiles used by the current frontend
alter table public.profiles add column if not exists avatar_url text;
alter table public.profiles add column if not exists country text;
alter table public.profiles add column if not exists points numeric not null default 0;
alter table public.profiles add column if not exists is_verified boolean not null default false;
alter table public.profiles add column if not exists referral_code text;
alter table public.profiles add column if not exists referred_by uuid references auth.users(id) on delete set null;
create unique index if not exists idx_profiles_referral_code on public.profiles(referral_code) where referral_code is not null;

-- Posts counters used by the feed
alter table public.posts add column if not exists likes_count integer not null default 0;
alter table public.posts add column if not exists comments_count integer not null default 0;

-- Videos: complete contract used by VideosTab
alter table public.videos add column if not exists description text;
alter table public.videos add column if not exists video_url text;
alter table public.videos add column if not exists thumbnail_url text;
alter table public.videos add column if not exists likes integer not null default 0;
alter table public.videos add column if not exists comments_count integer not null default 0;
alter table public.videos add column if not exists is_repost boolean not null default false;
alter table public.videos add column if not exists original_author_id uuid references auth.users(id) on delete set null;
alter table public.videos add column if not exists sound_id text;

create table if not exists public.sounds (
  id text primary key,
  title text not null,
  artist text,
  audio_url text,
  cover_url text,
  usage_count integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.video_likes (
  video_id uuid not null references public.videos(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (video_id, user_id)
);

create table if not exists public.video_comments (
  id uuid primary key default gen_random_uuid(),
  video_id uuid not null references public.videos(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  content text not null check (length(trim(content)) between 1 and 2000),
  created_at timestamptz not null default now()
);

create index if not exists idx_video_likes_user on public.video_likes(user_id);
create index if not exists idx_video_comments_video_created on public.video_comments(video_id, created_at asc);

-- Push subscriptions
create table if not exists public.push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  token text not null,
  platform text not null default 'web',
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, token)
);
create index if not exists idx_push_tokens_user on public.push_tokens(user_id);

-- 1-to-1 calls
create table if not exists public.calls (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references public.conversations(id) on delete set null,
  caller_id uuid not null references auth.users(id) on delete cascade,
  callee_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (type in ('voice','video')),
  status text not null default 'ringing' check (status in ('ringing','accepted','rejected','missed','ended','cancelled')),
  daily_room_name text,
  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_calls_caller_created on public.calls(caller_id, created_at desc);
create index if not exists idx_calls_callee_created on public.calls(callee_id, created_at desc);

-- Debate role requests used by the live UI
create table if not exists public.debate_role_requests (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.debate_rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  requested_role text not null default 'co_host' check (requested_role in ('co_host','host')),
  status text not null default 'pending' check (status in ('pending','approved','rejected','cancelled')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  unique(room_id, user_id, status)
);
create index if not exists idx_role_requests_room_status on public.debate_role_requests(room_id, status, created_at desc);

-- Referral rewards
create table if not exists public.referral_rewards (
  id uuid primary key default gen_random_uuid(),
  referrer_id uuid not null references auth.users(id) on delete cascade,
  referred_id uuid not null references auth.users(id) on delete cascade,
  pts_referrer integer not null check (pts_referrer > 0),
  pts_referred integer not null check (pts_referred > 0),
  created_at timestamptz not null default now(),
  unique(referred_id),
  check (referrer_id <> referred_id)
);
create index if not exists idx_referral_rewards_referrer on public.referral_rewards(referrer_id, created_at desc);

-- Message media fields used by MessagesTab
alter table public.messages add column if not exists type text not null default 'text';
alter table public.messages add column if not exists media_url text;
alter table public.messages add column if not exists media_mime text;
alter table public.messages add column if not exists media_size bigint;
alter table public.messages add column if not exists media_duration numeric;
alter table public.messages add column if not exists file_name text;
alter table public.messages add column if not exists thumbnail_url text;

-- Debate fields used by Daily live management
alter table public.debate_rooms add column if not exists daily_room_name text;
alter table public.debate_rooms add column if not exists ended_at timestamptz;
alter table public.debate_rooms add column if not exists status text not null default 'active';
alter table public.debate_rooms add column if not exists max_participants integer not null default 10;
alter table public.debate_participants add column if not exists role text not null default 'viewer';

-- RLS for newly added tables
alter table public.sounds enable row level security;
alter table public.video_likes enable row level security;
alter table public.video_comments enable row level security;
alter table public.push_tokens enable row level security;
alter table public.calls enable row level security;
alter table public.debate_role_requests enable row level security;
alter table public.referral_rewards enable row level security;

-- Idempotent policies
 drop policy if exists sounds_read on public.sounds;
create policy sounds_read on public.sounds for select using (true);

drop policy if exists video_likes_read on public.video_likes;
create policy video_likes_read on public.video_likes for select using (auth.uid() is not null);
drop policy if exists video_likes_own on public.video_likes;
create policy video_likes_own on public.video_likes for all using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists video_comments_read on public.video_comments;
create policy video_comments_read on public.video_comments for select using (true);
drop policy if exists video_comments_insert on public.video_comments;
create policy video_comments_insert on public.video_comments for insert with check (auth.uid() = author_id);
drop policy if exists video_comments_update_own on public.video_comments;
create policy video_comments_update_own on public.video_comments for update using (auth.uid() = author_id) with check (auth.uid() = author_id);
drop policy if exists video_comments_delete_own on public.video_comments;
create policy video_comments_delete_own on public.video_comments for delete using (auth.uid() = author_id);


drop policy if exists push_tokens_own on public.push_tokens;
create policy push_tokens_own on public.push_tokens for all using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists calls_participant_read on public.calls;
create policy calls_participant_read on public.calls for select using (auth.uid() = caller_id or auth.uid() = callee_id);
drop policy if exists calls_caller_insert on public.calls;
create policy calls_caller_insert on public.calls for insert with check (auth.uid() = caller_id);
drop policy if exists calls_participant_update on public.calls;
create policy calls_participant_update on public.calls for update using (auth.uid() = caller_id or auth.uid() = callee_id) with check (auth.uid() = caller_id or auth.uid() = callee_id);

drop policy if exists role_requests_read on public.debate_role_requests;
create policy role_requests_read on public.debate_role_requests for select using (auth.uid() = user_id or exists (select 1 from public.debate_rooms r where r.id = debate_role_requests.room_id and r.host_id = auth.uid()));
drop policy if exists role_requests_insert on public.debate_role_requests;
create policy role_requests_insert on public.debate_role_requests for insert with check (auth.uid() = id);
drop policy if exists role_requests_update on public.debate_role_requests;
create policy role_requests_update on public.debate_role_requests for update using (exists (select 1 from public.debate_rooms r where r.id = debate_role_requests.room_id and r.host_id = auth.uid()) or auth.uid() = user_id) with check (exists (select 1 from public.debate_rooms r where r.id = debate_role_requests.room_id and r.host_id = auth.uid()) or auth.uid() = id);

drop policy if exists referral_rewards_read_own on public.referral_rewards;
create policy referral_rewards_read_own on public.referral_rewards for select using (auth.uid() = referrer_id or auth.uid() = referred_id);

-- Video policies: replace unsafe/duplicate legacy policies
 drop policy if exists videos_insert on public.videos;
 drop policy if exists "Créer vidéo" on public.videos;
 drop policy if exists "Users can upload videos" on public.videos;
 drop policy if exists videos_update_own on public.videos;
 drop policy if exists "Users can update own videos" on public.videos;
 drop policy if exists videos_delete_own on public.videos;
 drop policy if exists "Users can delete own videos" on public.videos;
create policy videos_insert on public.videos for insert with check (auth.uid() = author_id);
create policy videos_update_own on public.videos for update using (auth.uid() = author_id) with check (auth.uid() = author_id);
create policy videos_delete_own on public.videos for delete using (auth.uid() = author_id);


-- Useful indexes
create index if not exists idx_videos_created on public.videos(created_at desc);
create index if not exists idx_videos_author_created on public.videos(author_id, created_at desc);

-- Realtime (safe to repeat)
do $$ begin alter publication supabase_realtime add table public.videos; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.video_likes; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.video_comments; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.calls; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.push_tokens; exception when duplicate_object then null; end $$;

-- Counter triggers
create or replace function public.baaro_sync_video_like_count()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    update public.videos set likes = likes + 1 where id = new.video_id;
    return new;
  elsif tg_op = 'DELETE' then
    update public.videos set likes = greatest(0, likes - 1) where id = old.video_id;
    return old;
  end if;
  return null;
end $$;
drop trigger if exists trg_baaro_video_like_count on public.video_likes;
create trigger trg_baaro_video_like_count after insert or delete on public.video_likes for each row execute function public.baaro_sync_video_like_count();

create or replace function public.baaro_sync_video_comment_count()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    update public.videos set comments_count = comments_count + 1 where id = new.video_id;
    return new;
  elsif tg_op = 'DELETE' then
    update public.videos set comments_count = greatest(0, comments_count - 1) where id = old.video_id;
    return old;
  end if;
  return null;
end $$;
drop trigger if exists trg_baaro_video_comment_count on public.video_comments;
create trigger trg_baaro_video_comment_count after insert or delete on public.video_comments for each row execute function public.baaro_sync_video_comment_count();


-- ============================================================
-- FIN
-- ============================================================

-- Backfill counters for databases that already contain data.
update public.videos v
set likes = coalesce((select count(*) from public.video_likes l where l.video_id = v.id), 0),
    comments_count = coalesce((select count(*) from public.video_comments c where c.video_id = v.id), 0);
update public.posts p
set likes_count = coalesce((select count(*) from public.post_likes l where l.post_id = p.id), 0),
    comments_count = coalesce((select count(*) from public.comments c where c.post_id = p.id), 0);


-- ============================================================
-- SOURCE: 0012_wallet_atomic_security.sql
-- ============================================================
-- BAARO 2.0 - Wallet atomique / ledger sécurisé
-- À exécuter après 011_baaro_core_media_security.sql.

alter table public.transactions
  add column if not exists action_key text,
  add column if not exists day_key date;

create index if not exists idx_transactions_user_created
  on public.transactions(user_id, created_at desc);

create index if not exists idx_transactions_user_day_positive
  on public.transactions(user_id, day_key, pts)
  where pts > 0;

create unique index if not exists ux_transactions_daily_bonus
  on public.transactions(user_id, day_key)
  where action_key = 'daily_bonus';

create or replace function public.wallet_ensure(p_user_id uuid, p_welcome_bonus numeric default 50)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  w public.wallets%rowtype;
  bonus numeric := greatest(coalesce(p_welcome_bonus, 0), 0);
begin
  insert into public.wallets(id, balance)
  values (p_user_id, 0)
  on conflict (user_id) do nothing;

  select * into w from public.wallets where id = p_user_id for update;

  if bonus > 0 and not exists (
    select 1 from public.transactions
    where user_id = p_user_id and action_key = 'welcome_bonus'
  ) then
    update public.wallets
      set balance = balance + bonus, updated_at = now()
    where user_id = p_user_id
    returning * into w;

    insert into public.transactions(user_id, label, pts, action_key, day_key)
    values (p_user_id, 'Bonus de bienvenue', bonus, 'welcome_bonus', current_date);
  end if;

  return jsonb_build_object('user_id', w.id, 'balance', w.balance, 'updated_at', w.updated_at);
end;
$$;

create or replace function public.wallet_earn(
  p_user_id uuid,
  p_pts numeric,
  p_label text,
  p_action_key text,
  p_daily_cap numeric default 100,
  p_daily_bonus boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  w public.wallets%rowtype;
  earned numeric := 0;
  actual_pts numeric;
  tx public.transactions%rowtype;
begin
  if p_pts is null or p_pts <= 0 then raise exception 'INVALID_POINTS'; end if;
  if length(coalesce(p_label,'')) = 0 then raise exception 'INVALID_LABEL'; end if;

  perform public.wallet_ensure(p_user_id, 0);
  select * into w from public.wallets where id = p_user_id for update;

  select coalesce(sum(pts), 0) into earned
  from public.transactions
  where user_id = p_user_id and pts > 0 and created_at >= date_trunc('day', now());

  if p_daily_bonus and exists (
    select 1 from public.transactions
    where user_id = p_user_id and action_key = 'daily_bonus' and day_key = current_date
  ) then
    raise exception 'DAILY_BONUS_ALREADY_CLAIMED';
  end if;

  if earned >= p_daily_cap then raise exception 'DAILY_CAP_REACHED'; end if;
  actual_pts := least(p_pts, p_daily_cap - earned);

  update public.wallets
    set balance = balance + actual_pts, updated_at = now()
  where user_id = p_user_id
  returning * into w;

  insert into public.transactions(user_id, label, pts, action_key, day_key)
  values (p_user_id, left(p_label, 120), actual_pts, p_action_key, current_date)
  returning * into tx;

  return jsonb_build_object(
    'balance', w.balance,
    'earned_today', earned + actual_pts,
    'remaining_today', greatest(0, p_daily_cap - earned - actual_pts),
    'transaction', to_jsonb(tx)
  );
end;
$$;

create or replace function public.wallet_redeem(
  p_user_id uuid,
  p_cost numeric,
  p_label text,
  p_action_key text default 'redeem'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  w public.wallets%rowtype;
  tx public.transactions%rowtype;
begin
  if p_cost is null or p_cost <= 0 then raise exception 'INVALID_COST'; end if;
  perform public.wallet_ensure(p_user_id, 0);
  select * into w from public.wallets where id = p_user_id for update;
  if w.balance < p_cost then raise exception 'INSUFFICIENT_BALANCE'; end if;

  update public.wallets set balance = balance - p_cost, updated_at = now()
  where id = p_user_id returning * into w;

  insert into public.transactions(user_id, label, pts, action_key, day_key)
  values (p_user_id, left(p_label, 120), -p_cost, p_action_key, current_date)
  returning * into tx;

  return jsonb_build_object('balance', w.balance, 'transaction', to_jsonb(tx));
end;
$$;

create or replace function public.wallet_convert(
  p_user_id uuid,
  p_pts numeric,
  p_points_per_baro numeric default 100
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  w public.wallets%rowtype;
  h public.crypto_holdings%rowtype;
  tx public.transactions%rowtype;
  baro numeric;
begin
  if p_pts is null or p_pts <= 0 or p_pts <> trunc(p_pts) then raise exception 'INVALID_POINTS'; end if;
  if p_points_per_baro <= 0 then raise exception 'INVALID_RATE'; end if;

  perform public.wallet_ensure(p_user_id, 0);
  select * into w from public.wallets where id = p_user_id for update;
  if w.balance < p_pts then raise exception 'INSUFFICIENT_BALANCE'; end if;
  baro := round((p_pts / p_points_per_baro)::numeric, 3);

  insert into public.crypto_holdings(id, holdings)
  values (p_user_id, 0)
  on conflict (user_id) do nothing;
  select * into h from public.crypto_holdings where id = p_user_id for update;

  update public.wallets set balance = balance - p_pts, updated_at = now()
  where id = p_user_id returning * into w;
  update public.crypto_holdings set holdings = holdings + baro, updated_at = now()
  where id = p_user_id returning * into h;

  insert into public.transactions(user_id, label, pts, action_key, day_key)
  values (p_user_id, format('Conversion en %s BARO', baro), -p_pts, 'convert_baro', current_date)
  returning * into tx;

  return jsonb_build_object('balance', w.balance, 'holdings', h.holdings, 'transaction', to_jsonb(tx));
end;
$$;

revoke all on function public.wallet_ensure(uuid, numeric) from public, anon, authenticated;
revoke all on function public.wallet_earn(uuid, numeric, text, text, numeric, boolean) from public, anon, authenticated;
revoke all on function public.wallet_redeem(uuid, numeric, text, text) from public, anon, authenticated;
revoke all on function public.wallet_convert(uuid, numeric, numeric) from public, anon, authenticated;
grant execute on function public.wallet_ensure(uuid, numeric) to service_role;
grant execute on function public.wallet_earn(uuid, numeric, text, text, numeric, boolean) to service_role;
grant execute on function public.wallet_redeem(uuid, numeric, text, text) to service_role;
grant execute on function public.wallet_convert(uuid, numeric, numeric) to service_role;


-- Calls: participants may update status, but identity/room fields cannot be rewritten.
create or replace function public.prevent_call_identity_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.caller_id <> old.caller_id
     or new.callee_id <> old.callee_id
     or coalesce(new.conversation_id::text, '') <> coalesce(old.conversation_id::text, '')
     or coalesce(new.daily_room_name, '') <> coalesce(old.daily_room_name, '')
     or new.type <> old.type
     or new.created_at <> old.created_at then
    raise exception 'CALL_IDENTITY_FIELDS_IMMUTABLE';
  end if;
  if new.status not in ('ringing','accepted','rejected','missed','ended','cancelled') then
    raise exception 'INVALID_CALL_STATUS';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_calls_immutable_identity on public.calls;
create trigger trg_calls_immutable_identity
before update on public.calls
for each row execute function public.prevent_call_identity_change();

drop policy if exists calls_participant_update on public.calls;
create policy calls_participant_update on public.calls
  for update
  using (auth.uid() = caller_id or auth.uid() = callee_id)
  with check (auth.uid() = caller_id or auth.uid() = callee_id);

drop policy if exists gifts_sent_public_read on public.gifts_sent;
create policy gifts_sent_room_read on public.gifts_sent
  for select using (
    auth.uid() is not null and exists (
      select 1 from public.debate_rooms r
      where r.id = gifts_sent.room_id
      and (
        r.host_id = auth.uid()
        or exists (
          select 1 from public.debate_participants p
          where p.room_id = gifts_sent.room_id and p.user_id = auth.uid()
        )
      )
    )
  );


-- ============================================================
-- SOURCE: 0013_follow_messages_security.sql
-- ============================================================
-- BAARO 2.0 — Follow/message security consistency
-- Execute after 012_wallet_atomic_security.sql.

-- The canonical column in public.follows is followed_id.
-- Existing installations already use this name; this migration mainly hardens constraints/policies.

alter table public.follows enable row level security;
drop policy if exists "follows_read" on public.follows;
drop policy if exists "follows_own" on public.follows;
create policy "follows_read" on public.follows
  for select using (auth.uid() is not null);
create policy "follows_own" on public.follows
  for insert with check (auth.uid() = follower_id and follower_id <> followed_id);
create policy "follows_update_own" on public.follows
  for update
  using (auth.uid() = follower_id)
  with check (auth.uid() = follower_id and follower_id <> followed_id);
create policy "follows_delete_own" on public.follows
  for delete using (auth.uid() = follower_id);

-- Messages: a sender may only send to the other participant of the conversation.
-- This prevents arbitrary message injection into a valid conversation row.
drop policy if exists "messages_send_own" on public.messages;
create policy "messages_send_own" on public.messages
  for insert
  with check (
    auth.uid() = sender_id
    and (
      recipient_id is null
      or recipient_id <> sender_id
    )
    and exists (
      select 1
      from public.conversations c
      where c.id = messages.conversation_id
        and (
          (c.user1_id = auth.uid() and c.user2_id = messages.recipient_id)
          or
          (c.user2_id = auth.uid() and c.user1_id = messages.recipient_id)
        )
    )
  );

-- Prevent clients from changing sender/conversation identity on an existing message.
create or replace function public.prevent_message_identity_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.sender_id <> old.sender_id
     or new.conversation_id <> old.conversation_id
     or coalesce(new.recipient_id::text, '') <> coalesce(old.recipient_id::text, '') then
    raise exception 'MESSAGE_IDENTITY_FIELDS_IMMUTABLE';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_messages_immutable_identity on public.messages;
create trigger trg_messages_immutable_identity
before update on public.messages
for each row execute function public.prevent_message_identity_change();

-- Users may not update messages through the client unless they are the sender.
drop policy if exists "messages_update_own" on public.messages;
create policy "messages_update_own" on public.messages
  for update
  using (auth.uid() = sender_id)
  with check (auth.uid() = sender_id);

do $$
begin
exception when duplicate_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table public.videos;
exception when duplicate_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table public.follows;
exception when duplicate_object then null;
end $$;

-- Atomic gift transfer: debit sender, credit host, write ledger and gift record in one transaction.
create or replace function public.wallet_send_gift(
  p_sender_id uuid,
  p_room_id uuid,
  p_gift_type_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  room public.debate_rooms%rowtype;
  gift public.gift_types%rowtype;
  sender public.wallets%rowtype;
  host public.wallets%rowtype;
  gift_row public.gifts_sent%rowtype;
begin
  if p_sender_id is null or p_room_id is null or p_gift_type_id is null then
    raise exception 'INVALID_GIFT_REQUEST';
  end if;

  select * into room from public.debate_rooms where id = p_room_id for share;
  if not found or room.status <> 'active' then raise exception 'LIVE_NOT_FOUND'; end if;
  if room.host_id = p_sender_id then raise exception 'SELF_GIFT_FORBIDDEN'; end if;

  select * into gift from public.gift_types where id = p_gift_type_id for share;
  if not found or gift.cost_points <= 0 then raise exception 'GIFT_NOT_FOUND'; end if;

  -- Lock wallets in deterministic UUID order to reduce deadlocks under high gift traffic.
  if p_sender_id::text < room.host_id::text then
    perform public.wallet_ensure(p_sender_id, 0);
    perform public.wallet_ensure(room.host_id, 0);
    select * into sender from public.wallets where id = p_sender_id for update;
    select * into host from public.wallets where id = room.host_id for update;
  else
    perform public.wallet_ensure(room.host_id, 0);
    perform public.wallet_ensure(p_sender_id, 0);
    select * into host from public.wallets where id = room.host_id for update;
    select * into sender from public.wallets where id = p_sender_id for update;
  end if;

  if sender.balance < gift.cost_points then raise exception 'INSUFFICIENT_BALANCE'; end if;

  update public.wallets set balance = balance - gift.cost_points, updated_at = now()
    where user_id = p_sender_id;
  update public.wallets set balance = balance + gift.cost_points, updated_at = now()
    where user_id = room.host_id;

  insert into public.transactions(user_id, label, pts, action_key, day_key)
  values
    (p_sender_id, 'Cadeau envoyé : ' || gift.id, -gift.cost_points, 'gift_sent', current_date),
    (room.host_id, 'Cadeau reçu : ' || gift.id, gift.cost_points, 'gift_received', current_date);

  insert into public.gifts_sent(room_id, from_user_id, to_user_id, gift_type_id, points_spent)
  values (p_room_id, p_sender_id, room.host_id, gift.id, gift.cost_points)
  returning * into gift_row;

  select * into sender from public.wallets where id = p_sender_id;
  return jsonb_build_object('balance', sender.balance, 'gift', to_jsonb(gift_row));
end;
$$;
revoke all on function public.wallet_send_gift(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.wallet_send_gift(uuid, uuid, text) to service_role;

-- Atomic referral application. The unique referred_id constraint plus the profile update
-- happen in the same transaction as both wallet credits.
create or replace function public.apply_referral_reward(
  p_referrer_id uuid,
  p_referred_id uuid,
  p_code text,
  p_referrer_pts numeric default 25,
  p_referred_pts numeric default 15
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  reward public.referral_rewards%rowtype;
begin
  if p_referrer_id is null or p_referred_id is null or p_referrer_id = p_referred_id then
    raise exception 'INVALID_REFERRAL';
  end if;

  update public.profiles
    set referred_by = p_referrer_id
  where id = p_referred_id and referred_by is null;
  if not found then raise exception 'REFERRAL_ALREADY_APPLIED'; end if;

  if not exists (select 1 from public.profiles where id = p_referrer_id and referral_code = upper(trim(p_code))) then
    raise exception 'INVALID_REFERRAL_CODE';
  end if;

  insert into public.referral_rewards(referrer_id, referred_id, pts_referrer, pts_referred)
  values (p_referrer_id, p_referred_id, p_referrer_pts, p_referred_pts)
  returning * into reward;

  perform public.wallet_earn(p_referrer_id, p_referrer_pts, 'Parrainage — filleul inscrit', 'referral_referrer', 100, false);
  perform public.wallet_earn(p_referred_id, p_referred_pts, 'Bonus code parrainage ' || upper(trim(p_code)), 'referral_referred', 100, false);

  return jsonb_build_object('reward', to_jsonb(reward));
end;
$$;
revoke all on function public.apply_referral_reward(uuid, uuid, text, numeric, numeric) from public, anon, authenticated;
grant execute on function public.apply_referral_reward(uuid, uuid, text, numeric, numeric) to service_role;


-- ============================================================
-- SOURCE: 0014_debate_single_id.sql
-- ============================================================
-- Migration 014 : Un seul identifiant unique (id)
-- Date : 2026-09-18
-- Objectif : Supprimer toute dépendance à user_id et auth.uid()
-- pour permettre l'utilisation d'IDs personnalisés

-- Résumé des changements :
-- 1. Suppression des contraintes FK vers auth.users
-- 2. Conversion UUID → TEXT pour toutes les colonnes d'identité
-- 3. Suppression de la colonne redondante user_id dans debate_messages
-- 4. Réécriture des politiques RLS pour compatibilité TEXT

-- Voir le script complet exécuté dans l'historique SQL de Supabase


-- ============================================================
-- SOURCE: 0015_follow_column_compatibility.sql
-- ============================================================
-- BAARO 014 : Correction des colonnes user_id → id + Sécurité complète

-- ============================================
-- 1. RENOMMER user_id EN id (si nécessaire)
-- ============================================

DO $$
BEGIN
  -- poll_votes
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema='public' AND table_name='poll_votes' AND column_name='user_id'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema='public' AND table_name='poll_votes' AND column_name='id'
  ) THEN
    ALTER TABLE public.poll_votes RENAME COLUMN user_id TO id;
  END IF;

  -- post_reactions
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema='public' AND table_name='post_reactions' AND column_name='user_id'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema='public' AND table_name='post_reactions' AND column_name='id'
  ) THEN
    ALTER TABLE public.post_reactions RENAME COLUMN user_id TO id;
  END IF;

  -- post_bookmarks
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema='public' AND table_name='post_bookmarks' AND column_name='user_id'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema='public' AND table_name='post_bookmarks' AND column_name='id'
  ) THEN
    ALTER TABLE public.post_bookmarks RENAME COLUMN user_id TO id;
  END IF;

  -- post_shares
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema='public' AND table_name='post_shares' AND column_name='user_id'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema='public' AND table_name='post_shares' AND column_name='id'
  ) THEN
    ALTER TABLE public.post_shares RENAME COLUMN user_id TO id;
  END IF;
END $$;

-- ============================================
-- 2. CRÉATION DES TABLES (si elles n'existent pas)
-- ============================================

CREATE TABLE IF NOT EXISTS public.polls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID REFERENCES public.posts(id) ON DELETE CASCADE,
  question TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.poll_options (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id UUID REFERENCES public.polls(id) ON DELETE CASCADE,
  option_text TEXT NOT NULL,
  position INT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.poll_votes (
  poll_id UUID REFERENCES public.polls(id) ON DELETE CASCADE,
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  option_id UUID REFERENCES public.poll_options(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (poll_id, id)
);

CREATE TABLE IF NOT EXISTS public.post_reactions (
  post_id UUID REFERENCES public.posts(id) ON DELETE CASCADE,
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  reaction TEXT NOT NULL CHECK (reaction IN ('love', 'laugh', 'wow', 'sad', 'angry', 'support')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (post_id, id)
);

CREATE TABLE IF NOT EXISTS public.post_shares (
  post_id UUID REFERENCES public.posts(id) ON DELETE CASCADE,
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  channel TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (post_id, id)
);

CREATE TABLE IF NOT EXISTS public.post_bookmarks (
  post_id UUID REFERENCES public.posts(id) ON DELETE CASCADE,
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (post_id, id)
);

-- ============================================
-- 3. VUE POUR RÉSULTATS DE SONDAGES
-- ============================================
CREATE OR REPLACE VIEW public.poll_results AS
SELECT 
  po.poll_id,
  po.id AS option_id,
  po.option_text,
  po.position,
  COUNT(pv.id)::INT AS vote_count
FROM public.poll_options po
LEFT JOIN public.poll_votes pv ON po.id = pv.option_id
GROUP BY po.poll_id, po.id, po.option_text, po.position;

-- ============================================
-- 4. INDEX POUR PERFORMANCES
-- ============================================
CREATE INDEX IF NOT EXISTS idx_poll_votes_poll_id ON public.poll_votes(poll_id);
CREATE INDEX IF NOT EXISTS idx_post_reactions_post_id ON public.post_reactions(post_id);
CREATE INDEX IF NOT EXISTS idx_post_bookmarks_post_id ON public.post_bookmarks(post_id);
CREATE INDEX IF NOT EXISTS idx_post_shares_post_id ON public.post_shares(post_id);

-- ============================================
-- 5. ACTIVATION RLS
-- ============================================
ALTER TABLE public.polls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.poll_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.poll_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_bookmarks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_shares ENABLE ROW LEVEL SECURITY;

-- ============================================
-- 6. POLITIQUES DE SÉCURITÉ
-- ============================================

-- Polls
DROP POLICY IF EXISTS "polls_read_public" ON public.polls;
CREATE POLICY "polls_read_public" ON public.polls
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "polls_insert_author" ON public.polls;
CREATE POLICY "polls_insert_author" ON public.polls
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.posts p 
      WHERE p.id = polls.post_id AND p.author_id = auth.uid()
    )
  );

-- Poll options
DROP POLICY IF EXISTS "poll_options_read_public" ON public.poll_options;
CREATE POLICY "poll_options_read_public" ON public.poll_options
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "poll_options_insert_author" ON public.poll_options;
CREATE POLICY "poll_options_insert_author" ON public.poll_options
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.polls p
      JOIN public.posts po ON po.id = p.post_id
      WHERE p.id = poll_options.poll_id AND po.author_id = auth.uid()
    )
  );

-- Poll votes
DROP POLICY IF EXISTS "poll_votes_read_public" ON public.poll_votes;
CREATE POLICY "poll_votes_read_public" ON public.poll_votes
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "poll_votes_own" ON public.poll_votes;
CREATE POLICY "poll_votes_own" ON public.poll_votes
  FOR ALL 
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Post reactions
DROP POLICY IF EXISTS "post_reactions_read_public" ON public.post_reactions;
CREATE POLICY "post_reactions_read_public" ON public.post_reactions
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "post_reactions_own" ON public.post_reactions;
CREATE POLICY "post_reactions_own" ON public.post_reactions
  FOR ALL 
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Post bookmarks (PRIVÉ)
DROP POLICY IF EXISTS "post_bookmarks_own" ON public.post_bookmarks;
CREATE POLICY "post_bookmarks_own" ON public.post_bookmarks
  FOR ALL 
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Post shares
DROP POLICY IF EXISTS "post_shares_read_public" ON public.post_shares;
CREATE POLICY "post_shares_read_public" ON public.post_shares
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "post_shares_own" ON public.post_shares;
CREATE POLICY "post_shares_own" ON public.post_shares
  FOR ALL 
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- ============================================
-- 7. FONCTION toggle_follow
-- ============================================
CREATE OR REPLACE FUNCTION public.toggle_follow(p_target UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_following BOOLEAN;
BEGIN
  IF p_target = auth.uid() THEN
    RAISE EXCEPTION 'CANNOT_FOLLOW_SELF';
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_target) THEN
    RAISE EXCEPTION 'TARGET_NOT_FOUND';
  END IF;
  
  SELECT EXISTS (
    SELECT 1 FROM public.follows 
    WHERE follower_id = auth.uid() AND followed_id = p_target
  ) INTO v_is_following;
  
  IF v_is_following THEN
    DELETE FROM public.follows 
    WHERE follower_id = auth.uid() AND followed_id = p_target;
    RETURN FALSE;
  ELSE
    INSERT INTO public.follows (follower_id, followed_id)
    VALUES (auth.uid(), p_target);
    RETURN TRUE;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.toggle_follow(UUID) FROM PUBLIC, ANON;
GRANT EXECUTE ON FUNCTION public.toggle_follow(UUID) TO AUTHENTICATED;

-- ============================================
-- 8. FONCTION vote_poll (sécurisée)
-- ============================================
CREATE OR REPLACE FUNCTION public.vote_poll(p_poll_id UUID, p_option_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.poll_votes 
    WHERE poll_id = p_poll_id AND id = auth.uid() 
    AND created_at > NOW() - INTERVAL '2 seconds'
  ) THEN
    RAISE EXCEPTION 'SOCIAL_RATE_LIMIT';
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM public.poll_options 
    WHERE id = p_option_id AND poll_id = p_poll_id
  ) THEN
    RAISE EXCEPTION 'INVALID_POLL_OPTION';
  END IF;
  
  IF EXISTS (SELECT 1 FROM public.poll_votes WHERE poll_id = p_poll_id AND id = auth.uid()) THEN
    UPDATE public.poll_votes 
    SET option_id = p_option_id, created_at = NOW()
    WHERE poll_id = p_poll_id AND id = auth.uid();
  ELSE
    INSERT INTO public.poll_votes (poll_id, id, option_id)
    VALUES (p_poll_id, auth.uid(), p_option_id);
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.vote_poll(UUID, UUID) FROM PUBLIC, ANON;
GRANT EXECUTE ON FUNCTION public.vote_poll(UUID, UUID) TO AUTHENTICATED;

-- ============================================
-- 9. FONCTION get_social_suggestions
-- ============================================
CREATE OR REPLACE FUNCTION public.get_social_suggestions(p_limit INT DEFAULT 6)
RETURNS TABLE (id UUID, handle TEXT, full_name TEXT, avatar_url TEXT, mutual_count INT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    p.id, p.handle, p.full_name, p.avatar_url,
    (SELECT COUNT(*) FROM public.follows f2 
     WHERE f2.followed_id = p.id 
     AND f2.follower_id IN (SELECT followed_id FROM public.follows WHERE follower_id = auth.uid())
    )::INT AS mutual_count
  FROM public.profiles p
  WHERE p.id != auth.uid()
    AND p.id NOT IN (SELECT followed_id FROM public.follows WHERE follower_id = auth.uid())
  ORDER BY mutual_count DESC, RANDOM()
  LIMIT p_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.get_social_suggestions(INT) FROM PUBLIC, ANON;
GRANT EXECUTE ON FUNCTION public.get_social_suggestions(INT) TO AUTHENTICATED;

-- ============================================
-- 10. ACTIVATION REALTIME
-- ============================================
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.poll_votes;
  ALTER PUBLICATION supabase_realtime ADD TABLE public.post_reactions;
  ALTER PUBLICATION supabase_realtime ADD TABLE public.post_bookmarks;
  ALTER PUBLICATION supabase_realtime ADD TABLE public.post_shares;
EXCEPTION WHEN duplicate_object THEN 
  NULL;
END $$;

ALTER TABLE public.poll_votes REPLICA IDENTITY FULL;
ALTER TABLE public.post_reactions REPLICA IDENTITY FULL;
ALTER TABLE public.post_bookmarks REPLICA IDENTITY FULL;
ALTER TABLE public.post_shares REPLICA IDENTITY FULL;


-- ============================================================
-- SOURCE: 0016_reward_integrity_security.sql
-- ============================================================
-- BAARO 2.0 — Reward integrity / anti-farming
-- Every non-daily reward must reference a real, server-verifiable event.

alter table public.transactions
  add column if not exists reference_id uuid;

create index if not exists idx_transactions_reward_reference
  on public.transactions(user_id, action_key, reference_id)
  where pts > 0 and reference_id is not null;

create unique index if not exists ux_transactions_reward_event
  on public.transactions(user_id, action_key, reference_id)
  where pts > 0 and reference_id is not null;

create or replace function public.wallet_earn(
  p_user_id uuid,
  p_pts numeric,
  p_label text,
  p_action_key text,
  p_daily_cap numeric default 100,
  p_daily_bonus boolean default false,
  p_reference_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  w public.wallets%rowtype;
  earned numeric := 0;
  actual_pts numeric;
  tx public.transactions%rowtype;
  event_exists boolean := false;
begin
  if p_pts is null or p_pts <= 0 then raise exception 'INVALID_POINTS'; end if;
  if length(coalesce(p_label,'')) = 0 then raise exception 'INVALID_LABEL'; end if;

  if not p_daily_bonus then
    if p_reference_id is null then raise exception 'REWARD_REFERENCE_REQUIRED'; end if;

    case p_action_key
      when 'publish_post' then
        select exists(select 1 from public.posts where id = p_reference_id and author_id = p_user_id) into event_exists;
      when 'publish_post_media' then
        select exists(select 1 from public.posts where id = p_reference_id and author_id = p_user_id and media_url is not null) into event_exists;
      when 'like_post' then
        select exists(select 1 from public.post_likes where post_id = p_reference_id and user_id = p_user_id) into event_exists;
      when 'comment' then
        select exists(select 1 from public.comments where id = p_reference_id and author_id = p_user_id) into event_exists;
      when 'subscribe' then
        select exists(select 1 from public.follows where follower_id = p_user_id and followed_id = p_reference_id) into event_exists;
      when 'like_video' then
        select exists(select 1 from public.video_likes where video_id = p_reference_id and user_id = p_user_id) into event_exists;
      when 'comment_video' then
        select exists(select 1 from public.video_comments where id = p_reference_id and author_id = p_user_id) into event_exists;
      when 'publish_video' then
        select exists(select 1 from public.videos where id = p_reference_id and author_id = p_user_id) into event_exists;
      when 'repost_video' then
        select exists(select 1 from public.videos where id = p_reference_id and author_id = p_user_id and is_repost = true) into event_exists;
      when 'publish_story' then
      else
        raise exception 'UNVERIFIABLE_REWARD_ACTION';
    end case;

    if not event_exists then raise exception 'REWARD_EVENT_NOT_FOUND'; end if;

    if exists (
      select 1 from public.transactions
      where user_id = p_user_id and action_key = p_action_key and reference_id = p_reference_id and pts > 0
    ) then
      raise exception 'REWARD_ALREADY_CLAIMED';
    end if;
  else
    if p_action_key <> 'daily_bonus' then raise exception 'INVALID_DAILY_BONUS'; end if;
    if exists (
      select 1 from public.transactions
      where user_id = p_user_id and action_key = 'daily_bonus' and day_key = current_date
    ) then
      raise exception 'DAILY_BONUS_ALREADY_CLAIMED';
    end if;
  end if;

  perform public.wallet_ensure(p_user_id, 0);
  select * into w from public.wallets where id = p_user_id for update;

  select coalesce(sum(pts), 0) into earned
  from public.transactions
  where user_id = p_user_id and pts > 0 and created_at >= date_trunc('day', now());

  if earned >= p_daily_cap then raise exception 'DAILY_CAP_REACHED'; end if;
  actual_pts := least(p_pts, p_daily_cap - earned);

  update public.wallets
    set balance = balance + actual_pts, updated_at = now()
  where user_id = p_user_id
  returning * into w;

  insert into public.transactions(user_id, label, pts, action_key, day_key, reference_id)
  values (p_user_id, left(p_label, 120), actual_pts, p_action_key, current_date, p_reference_id)
  returning * into tx;

  return jsonb_build_object(
    'balance', w.balance,
    'earned_today', earned + actual_pts,
    'remaining_today', greatest(0, p_daily_cap - earned - actual_pts),
    'transaction', to_jsonb(tx)
  );
end;
$$;

revoke all on function public.wallet_earn(uuid, numeric, text, text, numeric, boolean) from public, anon, authenticated;
revoke all on function public.wallet_earn(uuid, numeric, text, text, numeric, boolean, uuid) from public, anon, authenticated;
grant execute on function public.wallet_earn(uuid, numeric, text, text, numeric, boolean, uuid) to service_role;

-- Only a participant may send a gift in an active room.
create or replace function public.wallet_send_gift(
  p_sender_id uuid,
  p_room_id uuid,
  p_gift_type_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  room public.debate_rooms%rowtype;
  gift public.gift_types%rowtype;
  sender public.wallets%rowtype;
  host public.wallets%rowtype;
  gift_row public.gifts_sent%rowtype;
begin
  if p_sender_id is null or p_room_id is null or p_gift_type_id is null then raise exception 'INVALID_GIFT_REQUEST'; end if;
  select * into room from public.debate_rooms where id = p_room_id for share;
  if not found or room.status <> 'active' then raise exception 'LIVE_NOT_FOUND'; end if;
  if room.host_id = p_sender_id then raise exception 'SELF_GIFT_FORBIDDEN'; end if;
  if not exists (select 1 from public.debate_participants where room_id = p_room_id and user_id = p_sender_id) then
    raise exception 'NOT_LIVE_PARTICIPANT';
  end if;
  select * into gift from public.gift_types where id = p_gift_type_id for share;
  if not found or gift.cost_points <= 0 then raise exception 'GIFT_NOT_FOUND'; end if;

  if p_sender_id::text < room.host_id::text then
    perform public.wallet_ensure(p_sender_id, 0); perform public.wallet_ensure(room.host_id, 0);
    select * into sender from public.wallets where id = p_sender_id for update;
    select * into host from public.wallets where id = room.host_id for update;
  else
    perform public.wallet_ensure(room.host_id, 0); perform public.wallet_ensure(p_sender_id, 0);
    select * into host from public.wallets where id = room.host_id for update;
    select * into sender from public.wallets where id = p_sender_id for update;
  end if;

  if sender.balance < gift.cost_points then raise exception 'INSUFFICIENT_BALANCE'; end if;
  update public.wallets set balance = balance - gift.cost_points, updated_at = now() where user_id = p_sender_id;
  update public.wallets set balance = balance + gift.cost_points, updated_at = now() where user_id = room.host_id;
  insert into public.transactions(user_id, label, pts, action_key, day_key)
  values
    (p_sender_id, 'Cadeau envoyé : ' || gift.id, -gift.cost_points, 'gift_sent', current_date),
    (room.host_id, 'Cadeau reçu : ' || gift.id, gift.cost_points, 'gift_received', current_date);
  insert into public.gifts_sent(room_id, from_user_id, to_user_id, gift_type_id, points_spent)
  values (p_room_id, p_sender_id, room.host_id, gift.id, gift.cost_points)
  returning * into gift_row;
  select * into sender from public.wallets where id = p_sender_id;
  return jsonb_build_object('balance', sender.balance, 'gift', to_jsonb(gift_row));
end;
$$;
revoke all on function public.wallet_send_gift(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.wallet_send_gift(uuid, uuid, text) to service_role;


-- ============================================================
-- SOURCE: 0017_video_views_feed_integrity.sql
-- ============================================================

-- One authenticated view per video per user per UTC day. The client may call
-- register_video_view repeatedly; the unique constraint makes it idempotent.
create table if not exists public.video_views (
  video_id uuid not null references public.videos(id) on delete cascade,
  viewer_id uuid not null references auth.users(id) on delete cascade,
  view_date date not null default current_date,
  viewed_at timestamptz not null default now(),
  primary key (video_id, viewer_id, view_date)
);

create index if not exists idx_video_views_video_date
  on public.video_views(video_id, view_date desc);
create index if not exists idx_video_views_viewer_date
  on public.video_views(viewer_id, viewed_at desc);

alter table public.video_views enable row level security;
drop policy if exists video_views_own_read on public.video_views;
create policy video_views_own_read on public.video_views
  for select using (auth.uid() = viewer_id);

-- Views are registered through the RPC only; clients cannot insert arbitrary
-- viewer identities.
drop policy if exists video_views_own_insert on public.video_views;

create or replace function public.register_video_view(p_video_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  inserted boolean := false;
  new_views integer := 0;
begin
  if uid is null then raise exception 'AUTH_REQUIRED'; end if;
  if not exists (select 1 from public.videos where id = p_video_id) then
    raise exception 'VIDEO_NOT_FOUND';
  end if;

  insert into public.video_views(video_id, viewer_id, view_date)
  values (p_video_id, uid, current_date)
  on conflict do nothing;

  inserted := found;
  if inserted then
    update public.videos
      set views = coalesce(views, 0) + 1
      where id = p_video_id
      returning views into new_views;
  else
    select coalesce(views, 0) into new_views
    from public.videos where id = p_video_id;
  end if;

  return jsonb_build_object('counted', inserted, 'views', new_views);
end;
$$;

revoke all on function public.register_video_view(uuid) from public, anon;
grant execute on function public.register_video_view(uuid) to authenticated;

-- Keep counters consistent after likes/comments on existing databases.
update public.videos v
set views = greatest(coalesce(v.views, 0), 0);

  for select using (expires_at > now());

create index if not exists idx_posts_created_id
  on public.posts(created_at desc, id desc);
create index if not exists idx_posts_author_created
  on public.posts(author_id, created_at desc, id desc);
create index if not exists idx_follows_followed_status
  on public.follows(followed_id, status, created_at desc);


-- ============================================================
-- SOURCE: 0018_messaging_calls_integrity.sql
-- ============================================================
-- BAARO 2.0 — Messaging + Calls integrity hardening
-- Apply after migrations 001-016.

-- 1) Messages: sender/recipient/conversation must describe the same private chat.
create or replace function public.validate_message_participants()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  c public.conversations;
begin
  select * into c from public.conversations where id = new.conversation_id for share;
  if not found then raise exception 'CONVERSATION_NOT_FOUND'; end if;

  if new.sender_id is null or new.sender_id <> auth.uid() then
    raise exception 'MESSAGE_SENDER_FORBIDDEN';
  end if;

  if not ((c.user1_id = new.sender_id and c.user2_id = new.recipient_id)
       or (c.user2_id = new.sender_id and c.user1_id = new.recipient_id)) then
    raise exception 'MESSAGE_PARTICIPANTS_MISMATCH';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_messages_validate_participants on public.messages;
create trigger trg_messages_validate_participants
before insert on public.messages
for each row execute function public.validate_message_participants();

create or replace function public.prevent_message_identity_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.sender_id <> old.sender_id
     or coalesce(new.recipient_id::text,'') <> coalesce(old.recipient_id::text,'')
     or new.conversation_id <> old.conversation_id then
    raise exception 'MESSAGE_IDENTITY_FIELDS_IMMUTABLE';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_messages_identity_guard on public.messages;
create trigger trg_messages_identity_guard
before update on public.messages
for each row execute function public.prevent_message_identity_change();

-- 2) Conversations: prevent self-conversations and make pair ordering canonical.
create or replace function public.normalize_conversation_pair()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare tmp uuid;
begin
  if new.user1_id = new.user2_id then raise exception 'SELF_CONVERSATION_FORBIDDEN'; end if;
  if new.user1_id > new.user2_id then
    tmp := new.user1_id; new.user1_id := new.user2_id; new.user2_id := tmp;
  end if;
  if auth.uid() is not null and auth.uid() <> new.user1_id and auth.uid() <> new.user2_id then
    raise exception 'CONVERSATION_PARTICIPANT_FORBIDDEN';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_conversations_normalize on public.conversations;
create trigger trg_conversations_normalize
before insert on public.conversations
for each row execute function public.normalize_conversation_pair();

-- 3) Calls: caller/callee must belong to the same conversation.
create or replace function public.validate_call_participants()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare c public.conversations;
begin
  if new.caller_id = new.callee_id then raise exception 'SELF_CALL_FORBIDDEN'; end if;
  select * into c from public.conversations where id = new.conversation_id;
  if not found then raise exception 'CONVERSATION_NOT_FOUND'; end if;
  if not ((c.user1_id = new.caller_id and c.user2_id = new.callee_id)
       or (c.user2_id = new.caller_id and c.user1_id = new.callee_id)) then
    raise exception 'CALL_PARTICIPANTS_MISMATCH';
  end if;
  if new.caller_id <> auth.uid() then raise exception 'CALLER_FORBIDDEN'; end if;
  return new;
end;
$$;

drop trigger if exists trg_calls_validate_participants on public.calls;
create trigger trg_calls_validate_participants
before insert on public.calls
for each row execute function public.validate_call_participants();

-- Restrict call status transitions to sensible forward states.
create or replace function public.validate_call_status_transition()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.status = 'ringing' and new.status not in ('ringing','accepted','rejected','missed','cancelled','ended') then
    raise exception 'INVALID_CALL_STATUS_TRANSITION';
  elsif old.status = 'accepted' and new.status not in ('accepted','ended','cancelled') then
    raise exception 'INVALID_CALL_STATUS_TRANSITION';
  elsif old.status in ('rejected','missed','ended','cancelled') and new.status <> old.status then
    raise exception 'CALL_ALREADY_TERMINAL';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_calls_status_transition on public.calls;
create trigger trg_calls_status_transition
before update on public.calls
for each row execute function public.validate_call_status_transition();

-- Realtime remains useful for incoming calls and messages.
do $$ begin
  alter publication supabase_realtime add table public.calls;
exception when duplicate_object then null; end $$;


-- ============================================================
-- SOURCE: 0019_live_integrity_realtime.sql
-- ============================================================
-- BAARO 2.0 v12 — Live/Debates integrity, role requests and realtime
-- Execute after 017_messaging_calls_integrity.sql.

-- 1. Normalize role request schema used by the current API/UI.
alter table public.debate_role_requests
  add column if not exists from_user_id uuid references auth.users(id) on delete cascade;
alter table public.debate_role_requests
  add column if not exists to_user_id uuid references auth.users(id) on delete cascade;
alter table public.debate_role_requests
  add column if not exists responded_at timestamptz;

-- Keep legacy user_id as a compatibility alias for installations created by 011.
alter table public.debate_role_requests alter column user_id drop not null;

-- Backfill legacy rows when the old schema had only user_id.
update public.debate_role_requests r
set to_user_id = coalesce(r.to_user_id, r.user_id)
where r.to_user_id is null and r.user_id is not null;

update public.debate_role_requests r
set user_id = coalesce(r.user_id, r.to_user_id),
    from_user_id = coalesce(r.from_user_id, dr.host_id)
from public.debate_rooms dr
where r.room_id = dr.id and r.from_user_id is null;

-- Current API statuses are pending/accepted/refused/cancelled.
alter table public.debate_role_requests drop constraint if exists debate_role_requests_status_check;
alter table public.debate_role_requests
  add constraint debate_role_requests_status_check
  check (status in ('pending','accepted','refused','cancelled','approved','rejected'));

create unique index if not exists uq_role_request_pending_target
  on public.debate_role_requests(room_id, to_user_id)
  where status = 'pending';
create index if not exists idx_role_requests_target_status
  on public.debate_role_requests(to_user_id, status, created_at desc);

alter table public.debate_role_requests enable row level security;
drop policy if exists role_requests_read on public.debate_role_requests;
create policy role_requests_read on public.debate_role_requests
  for select using (
    auth.uid() = to_user_id
    or auth.uid() = from_user_id
    or exists (select 1 from public.debate_rooms r where r.id = debate_role_requests.room_id and r.host_id = auth.uid())
  );

drop policy if exists role_requests_insert on public.debate_role_requests;
create policy role_requests_insert on public.debate_role_requests
  for insert with check (
    auth.uid() = from_user_id
    and exists (
      select 1 from public.debate_rooms r
      where r.id = room_id and r.host_id = auth.uid() and r.status = 'active'
    )
  );

-- Server-only mutation: prevents a client from changing status/target directly.
drop policy if exists role_requests_update on public.debate_role_requests;
create policy role_requests_update on public.debate_role_requests
  for update using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- 2. Atomic join with row lock to prevent concurrent capacity bypass.
create or replace function public.join_debate_room(p_room_id uuid, p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  room public.debate_rooms%rowtype;
  participant public.debate_participants%rowtype;
  active_count integer;
begin
  if p_room_id is null or p_user_id is null then raise exception 'INVALID_JOIN_REQUEST'; end if;

  select * into room from public.debate_rooms where id = p_room_id for update;
  if not found or room.status not in ('active','paused') then raise exception 'LIVE_NOT_FOUND'; end if;

  select * into participant
  from public.debate_participants
  where room_id = p_room_id and user_id = p_user_id
  for update;

  if found then
    update public.debate_participants set left_at = null, joined_at = now()
    where room_id = p_room_id and user_id = p_user_id;
  else
    select count(*) into active_count from public.debate_participants
    where room_id = p_room_id and left_at is null;
    if active_count >= room.max_participants then raise exception 'LIVE_FULL'; end if;

    insert into public.debate_participants(room_id,user_id,role)
    values (p_room_id,p_user_id,case when room.host_id = p_user_id then 'host' else 'viewer' end);
  end if;

  select * into participant from public.debate_participants
  where room_id = p_room_id and user_id = p_user_id;

  return jsonb_build_object(
    'room_id', room.id,
    'daily_room_name', room.daily_room_name,
    'host_id', room.host_id,
    'status', room.status,
    'max_participants', room.max_participants,
    'role', participant.role
  );
end;
$$;
revoke all on function public.join_debate_room(uuid,uuid) from public, anon, authenticated;
grant execute on function public.join_debate_room(uuid,uuid) to service_role;

-- 3. Secure join-by-code: authenticated users only, uppercase comparison, locked capacity.
create or replace function public.join_debate_by_code(p_code text)
returns public.debate_rooms
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.debate_rooms;
  v_count int;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into v_room from public.debate_rooms
  where invite_code = upper(trim(p_code)) and status in ('active','paused')
  for update;
  if not found then raise exception 'LIVE_NOT_FOUND'; end if;

  if exists (select 1 from public.debate_participants where room_id = v_room.id and user_id = auth.uid()) then
    update public.debate_participants set left_at = null, joined_at = now()
    where room_id = v_room.id and user_id = auth.uid();
    return v_room;
  end if;

  select count(*) into v_count from public.debate_participants
  where room_id = v_room.id and left_at is null;
  if v_count >= v_room.max_participants then raise exception 'LIVE_FULL'; end if;

  insert into public.debate_participants(room_id,user_id,role)
  values(v_room.id,auth.uid(),'viewer');
  return v_room;
end;
$$;
revoke all on function public.join_debate_by_code(text) from public, anon;
grant execute on function public.join_debate_by_code(text) to authenticated;

-- 4. Atomic role request response. Only the intended recipient may accept/refuse.
create or replace function public.respond_debate_role_request(
  p_request_id uuid,
  p_user_id uuid,
  p_accept boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  req public.debate_role_requests%rowtype;
  room public.debate_rooms%rowtype;
  participant public.debate_participants%rowtype;
begin
  select * into req from public.debate_role_requests where id = p_request_id for update;
  if not found or req.status <> 'pending' then raise exception 'ROLE_REQUEST_NOT_FOUND'; end if;
  if req.to_user_id <> p_user_id then raise exception 'ROLE_REQUEST_FORBIDDEN'; end if;

  select * into room from public.debate_rooms where id = req.room_id for update;
  if not found or room.status <> 'active' then
    update public.debate_role_requests set status='cancelled', responded_at=now() where id=req.id;
    raise exception 'LIVE_NOT_FOUND';
  end if;

  if not p_accept then
    update public.debate_role_requests set status='refused', responded_at=now() where id=req.id;
    return jsonb_build_object('status','refused','daily_room_name',room.daily_room_name);
  end if;

  select * into participant from public.debate_participants
  where room_id=req.room_id and user_id=p_user_id and left_at is null for update;
  if not found then raise exception 'ROLE_REQUEST_FORBIDDEN'; end if;

  update public.debate_participants set role='co_host'
  where room_id=req.room_id and user_id=p_user_id;
  update public.debate_role_requests set status='accepted', responded_at=now() where id=req.id;

  return jsonb_build_object('status','accepted','role','co_host','daily_room_name',room.daily_room_name);
end;
$$;
revoke all on function public.respond_debate_role_request(uuid,uuid,boolean) from public, anon, authenticated;
grant execute on function public.respond_debate_role_request(uuid,uuid,boolean) to service_role;

-- 5. Prevent direct client role-request insertion/update through old permissive policies.
drop policy if exists role_requests_insert on public.debate_role_requests;
drop policy if exists role_requests_update on public.debate_role_requests;

-- 6. Realtime for live gifts/roles.
do $$ begin alter publication supabase_realtime add table public.gifts_sent; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.debate_role_requests; exception when duplicate_object then null; end $$;

-- 7. Gift feed is visible only to participants of the room or the sender/recipient.
drop policy if exists gifts_sent_public_read on public.gifts_sent;
create policy gifts_sent_read_participants on public.gifts_sent for select using (
  auth.uid() = from_user_id or auth.uid() = to_user_id or exists (
    select 1 from public.debate_participants dp
    where dp.room_id = gifts_sent.room_id and dp.user_id = auth.uid() and dp.left_at is null
  )
);


-- ============================================================
-- SOURCE: 0020_ai_routing_foundation.sql
-- ============================================================
-- BAARO AI routing foundation. Provider credentials stay in server environment variables.
-- This table stores user preference only; it does not store API keys or provider secrets.
alter table public.profiles add column if not exists ai_provider_preference text;
alter table public.profiles add column if not exists ai_language text;

alter table public.profiles drop constraint if exists profiles_ai_provider_preference_check;
alter table public.profiles add constraint profiles_ai_provider_preference_check
  check (ai_provider_preference is null or ai_provider_preference in ('auto','n8n','anthropic','openai','gemini','moonshot','xai'));

create index if not exists profiles_country_idx on public.profiles(country);
create index if not exists profiles_ai_provider_preference_idx on public.profiles(ai_provider_preference);

comment on column public.profiles.ai_provider_preference is 'BAARO AI preference; credentials remain server-side.';
comment on column public.profiles.ai_language is 'Preferred language for BAARO AI responses.';


-- ============================================================
-- SOURCE: 0021_notifications_foundation.sql
-- ============================================================
-- BAARO 2.0 v14 — notification preferences and push hygiene
create table if not exists public.notification_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  push_enabled boolean not null default true,
  messages boolean not null default true,
  social boolean not null default true,
  live boolean not null default true,
  wallet boolean not null default true,
  marketing boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table public.notification_preferences enable row level security;
drop policy if exists notification_preferences_own on public.notification_preferences;
create policy notification_preferences_own
on public.notification_preferences
for all
using (auth.uid() = user_id)
with check (auth.uid() = id);

create index if not exists idx_push_tokens_platform on public.push_tokens(platform);
create index if not exists idx_push_tokens_updated on public.push_tokens(updated_at desc);

-- Remove stale browser/device subscriptions without touching active tokens.
create or replace function public.prune_stale_push_tokens(max_age interval default interval '180 days')
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare deleted_count integer;
begin
  delete from public.push_tokens
  where updated_at < now() - max_age;
  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

revoke all on function public.prune_stale_push_tokens(interval) from public, anon, authenticated;
grant execute on function public.prune_stale_push_tokens(interval) to service_role;


-- ============================================================
-- SOURCE: 0022_wallet_ledger.sql
-- ============================================================
-- BAARO 2.0 — Migration 020 : wallet_ledger append-only
-- Exécuter APRÈS les migrations précédentes (jusqu'à 019 inclus).

-- Table ledger immuable (append-only)
CREATE TABLE IF NOT EXISTS public.wallet_ledger (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action_key    text NOT NULL,
  pts           integer NOT NULL,          -- positif = crédit, négatif = débit
  balance_after integer NOT NULL,
  reference_id  uuid,
  metadata      jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wallet_ledger_user_created
  ON public.wallet_ledger (user_id, created_at DESC);

-- Idempotence : une seule ligne par (user, action, reference)
CREATE UNIQUE INDEX IF NOT EXISTS idx_wallet_ledger_idempotency
  ON public.wallet_ledger (user_id, action_key, reference_id)
  WHERE reference_id IS NOT NULL;

-- RLS
ALTER TABLE public.wallet_ledger ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own ledger" ON public.wallet_ledger;
CREATE POLICY "Users can read own ledger"
  ON public.wallet_ledger
  FOR SELECT
  USING (auth.uid() = id);

-- Aucune policy INSERT/UPDATE/DELETE pour le rôle authentifié.
-- Seul service_role (côté serveur) peut écrire.

-- Fonction helper pour insérer dans le ledger (appelée depuis les RPC wallet_*)
CREATE OR REPLACE FUNCTION public.wallet_ledger_append(
  p_user_id       uuid,
  p_action_key    text,
  p_pts           integer,
  p_balance_after integer,
  p_reference_id  uuid DEFAULT NULL,
  p_metadata      jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO public.wallet_ledger (
    user_id, action_key, pts, balance_after, reference_id, metadata
  )
  VALUES (
    p_user_id, p_action_key, p_pts, p_balance_after, p_reference_id, COALESCE(p_metadata, '{}'::jsonb)
  )
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.wallet_ledger_append FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.wallet_ledger_append TO service_role;

COMMENT ON TABLE public.wallet_ledger IS
  'Ledger append-only des mouvements wallet BAARO. Écriture uniquement via service_role / RPC.';


-- ============================================================
-- SOURCE: 0023_economy_payout_foundation.sql
-- ============================================================
-- BAARO 2.0 v17 — Economy / Payout foundation
-- Payouts are intentionally disabled until a verified provider integration is configured.

create table if not exists public.payout_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('stripe_connect')),
  provider_account_id text not null,
  country_code text check (country_code is null or country_code ~ '^[A-Z]{2}$'),
  currency text check (currency is null or currency ~ '^[A-Z]{3}$'),
  status text not null default 'pending'
    check (status in ('pending','enabled','disabled','restricted')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(provider, provider_account_id),
  unique(user_id, provider)
);

create table if not exists public.payout_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  payout_account_id uuid references public.payout_accounts(id) on delete restrict,
  amount_points bigint not null check (amount_points > 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  amount_minor bigint not null check (amount_minor > 0),
  status text not null default 'pending'
    check (status in ('pending','processing','paid','failed','cancelled','requires_review')),
  idempotency_key text not null,
  provider_payout_id text,
  failure_code text,
  failure_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, idempotency_key)
);

create index if not exists payout_requests_user_created_idx
  on public.payout_requests(user_id, created_at desc);

create index if not exists payout_requests_status_idx
  on public.payout_requests(status, created_at);

alter table public.payout_accounts enable row level security;
alter table public.payout_requests enable row level security;

drop policy if exists payout_accounts_select_own on public.payout_accounts;
create policy payout_accounts_select_own
on public.payout_accounts for select
using (auth.uid() = id);

drop policy if exists payout_requests_select_own on public.payout_requests;
create policy payout_requests_select_own
on public.payout_requests for select
using (auth.uid() = id);

-- No client INSERT/UPDATE/DELETE policies are intentionally created.
-- Payout mutations must happen through authenticated server-side functions.

create or replace function public.create_payout_request(
  p_idempotency_key text,
  p_amount_points bigint,
  p_currency text
)
returns public.payout_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_wallet public.wallets;
  v_account public.payout_accounts;
  v_request public.payout_requests;
  v_amount_minor bigint;
begin
  if v_uid is null then
    raise exception 'authentication_required';
  end if;

  if p_idempotency_key is null or length(trim(p_idempotency_key)) < 16
     or length(trim(p_idempotency_key)) > 128 then
    raise exception 'invalid_idempotency_key';
  end if;

  if p_amount_points <= 0 then
    raise exception 'invalid_amount';
  end if;

  select * into v_request
  from public.payout_requests
  where user_id = v_uid and idempotency_key = trim(p_idempotency_key)
  for update;

  if found then
    return v_request;
  end if;

  select * into v_account
  from public.payout_accounts
  where user_id = v_uid and provider = 'stripe_connect'
  for update;

  if not found or v_account.status <> 'enabled' then
    raise exception 'payout_account_not_ready';
  end if;

  -- Conversion must be replaced by the configured business-rate table/RPC
  -- before enabling payouts. This function intentionally refuses a real payout.
  raise exception 'payout_disabled_until_provider_configuration';
end;
$$;

revoke all on function public.create_payout_request(text,bigint,text) from public, anon, authenticated;
grant execute on function public.create_payout_request(text,bigint,text) to authenticated;


-- ============================================================
-- SOURCE: 0024_companies_and_services.sql
-- ============================================================
-- BAARO 024: entreprises, transports, voyages, programmes, tarifs et informations
create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  description text,
  company_type text not null default 'other',
  category text,
  country text not null,
  city text,
  phone text,
  email text,
  website text,
  logo_url text,
  currency text not null default 'XOF',
  is_active boolean not null default false,
  subscription_status text not null default 'none',
  trial_ends_at timestamptz,
  subscription_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint companies_type_check check (company_type in ('shop','transport','radio','tv','telecom','energy','bank','insurance','education','health','hospitality','other'))
);

create table if not exists public.company_programs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  title text not null,
  description text,
  program_type text not null default 'service',
  days_of_week integer[] not null default '{}',
  start_time time,
  end_time time,
  origin text,
  destination text,
  frequency text,
  price numeric(12,2),
  currency text not null default 'XOF',
  metadata jsonb not null default '{}'::jsonb,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.company_tariffs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  description text,
  price numeric(12,2) not null check (price >= 0),
  currency text not null default 'XOF',
  unit text,
  tariff_type text,
  valid_from timestamptz,
  valid_until timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.company_infos (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  title text not null,
  content text not null,
  is_public boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.company_subscriptions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  amount numeric(12,2) not null default 0,
  currency text not null default 'XOF',
  was_premium_rate boolean not null default false,
  provider text not null,
  payment_ref text unique,
  status text not null default 'pending',
  period_start timestamptz,
  period_end timestamptz,
  created_at timestamptz not null default now(),
  constraint company_subscription_provider_check check (provider in ('stripe','paypal','cinetpay','paydunya','trial')),
  constraint company_subscription_status_check check (status in ('pending','confirmed','failed','trial'))
);

create index if not exists idx_companies_active_type on public.companies(company_type, country, city) where is_active;
create index if not exists idx_company_programs_company on public.company_programs(company_id, is_active, sort_order);
create index if not exists idx_company_tariffs_company on public.company_tariffs(company_id, is_active);
create index if not exists idx_company_infos_company on public.company_infos(company_id, is_public, sort_order);

alter table public.companies enable row level security;
alter table public.company_programs enable row level security;
alter table public.company_tariffs enable row level security;
alter table public.company_infos enable row level security;
alter table public.company_subscriptions enable row level security;

drop policy if exists "companies_select" on public.companies;
create policy "companies_select" on public.companies for select using (is_active = true or owner_id = auth.uid());
drop policy if exists "companies_insert_owner" on public.companies;
create policy "companies_insert_owner" on public.companies for insert with check (owner_id = auth.uid());
drop policy if exists "companies_update_owner" on public.companies;
create policy "companies_update_owner" on public.companies for update using (owner_id = auth.uid());

drop policy if exists "company_programs_select" on public.company_programs;
create policy "company_programs_select" on public.company_programs for select using (
  is_active = true or exists (select 1 from public.companies c where c.id = company_programs.company_id and c.owner_id = auth.uid())
);
drop policy if exists "company_programs_owner_write" on public.company_programs;
create policy "company_programs_owner_write" on public.company_programs for all using (
  exists (select 1 from public.companies c where c.id = company_programs.company_id and c.owner_id = auth.uid())
) with check (
  exists (select 1 from public.companies c where c.id = company_programs.company_id and c.owner_id = auth.uid())
);

drop policy if exists "company_tariffs_select" on public.company_tariffs;
create policy "company_tariffs_select" on public.company_tariffs for select using (
  is_active = true or exists (select 1 from public.companies c where c.id = company_tariffs.company_id and c.owner_id = auth.uid())
);
drop policy if exists "company_tariffs_owner_write" on public.company_tariffs;
create policy "company_tariffs_owner_write" on public.company_tariffs for all using (
  exists (select 1 from public.companies c where c.id = company_tariffs.company_id and c.owner_id = auth.uid())
) with check (
  exists (select 1 from public.companies c where c.id = company_tariffs.company_id and c.owner_id = auth.uid())
);

drop policy if exists "company_infos_select" on public.company_infos;
create policy "company_infos_select" on public.company_infos for select using (
  is_public = true or exists (select 1 from public.companies c where c.id = company_infos.company_id and c.owner_id = auth.uid())
);
drop policy if exists "company_infos_owner_write" on public.company_infos;
create policy "company_infos_owner_write" on public.company_infos for all using (
  exists (select 1 from public.companies c where c.id = company_infos.company_id and c.owner_id = auth.uid())
) with check (
  exists (select 1 from public.companies c where c.id = company_infos.company_id and c.owner_id = auth.uid())
);

drop policy if exists "company_subscriptions_owner_select" on public.company_subscriptions;
create policy "company_subscriptions_owner_select" on public.company_subscriptions for select using (
  exists (select 1 from public.companies c where c.id = company_subscriptions.company_id and c.owner_id = auth.uid())
);


-- ============================================================
-- SOURCE: 0025_company_reviews.sql
-- ============================================================
-- BAARO 025: avis entreprises
create table if not exists public.company_reviews (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  rating integer not null check (rating between 1 and 5),
  comment text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(company_id, user_id)
);
create index if not exists idx_company_reviews_company on public.company_reviews(company_id, created_at desc);
alter table public.company_reviews enable row level security;
drop policy if exists "company_reviews_public_select" on public.company_reviews;
create policy "company_reviews_public_select" on public.company_reviews for select using (true);
drop policy if exists "company_reviews_user_insert" on public.company_reviews;
create policy "company_reviews_user_insert" on public.company_reviews for insert with check (user_id = auth.uid());
drop policy if exists "company_reviews_user_update" on public.company_reviews;
create policy "company_reviews_user_update" on public.company_reviews for update using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "company_reviews_user_delete" on public.company_reviews;
create policy "company_reviews_user_delete" on public.company_reviews for delete using (user_id = auth.uid());


-- ============================================================
-- SOURCE: 0026_storage_and_order_payments.sql
-- ============================================================
-- BAARO 026: paiement des commandes + média boutique
alter table public.orders add column if not exists paid_at timestamptz;

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


-- ============================================================
-- SOURCE: 0027_auth_accounts.sql
-- ============================================================
-- BAARO: profils persistants pour tous les modes d'inscription.
-- Couvre email, téléphone OTP et OAuth (Facebook/X/Google/etc.).

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  base_name text;
  base_handle text;
begin
  base_name := coalesce(
    nullif(new.raw_user_meta_data ->> 'display_name', ''),
    nullif(new.raw_user_meta_data ->> 'full_name', ''),
    nullif(new.raw_user_meta_data ->> 'name', ''),
    nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
    nullif(new.phone, ''),
    'Membre BAARO'
  );

  base_handle := coalesce(
    nullif(new.raw_user_meta_data ->> 'handle', ''),
    '@user_' || substr(replace(new.id::text, '-', ''), 1, 8)
  );

  insert into public.profiles (user_id, display_name, handle, flag)
  values (new.id, left(base_name, 80), left(base_handle, 40), '🌍')
  on conflict (user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

-- Répare également les utilisateurs déjà créés avant cette migration.
insert into public.profiles (user_id, display_name, handle, flag)
select
  u.id,
  left(coalesce(
    nullif(u.raw_user_meta_data ->> 'display_name', ''),
    nullif(u.raw_user_meta_data ->> 'full_name', ''),
    nullif(u.raw_user_meta_data ->> 'name', ''),
    nullif(split_part(coalesce(u.email, ''), '@', 1), ''),
    nullif(u.phone, ''),
    'Membre BAARO'
  ), 80),
  left('@user_' || substr(replace(u.id::text, '-', ''), 1, 8), 40),
  '🌍'
from auth.users u
left join public.profiles p on p.id = u.id
where p.id is null;


-- ============================================================
-- SOURCE: 0028_profile_contacts_links_socials.sql
-- ============================================================
-- 029_profile_contacts_links_socials.sql
-- BAARO: jusqu'à 3 téléphones + 3 e-mails par profil,
-- liens personnels/site web et réseaux sociaux.
-- Aucun secret ni mot de passe n'est stocké ici.

create table if not exists public.profile_contacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  contact_type text not null check (contact_type in ('phone','email')),
  value text not null,
  label text not null default '',
  position smallint not null check (position between 1 and 3),
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, contact_type, position)
);

create unique index if not exists profile_contacts_one_primary
  on public.profile_contacts(user_id, contact_type)
  where is_primary = true;

create table if not exists public.profile_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  link_type text not null check (link_type in ('website','link')),
  label text not null default '',
  url text not null,
  position smallint not null default 1 check (position between 1 and 10),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.profile_social_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  platform text not null check (
    platform in (
      'facebook','youtube','tiktok','bigo','instagram','x',
      'linkedin','whatsapp','telegram','snapchat','other'
    )
  ),
  username text not null default '',
  url text not null,
  position smallint not null default 1 check (position between 1 and 10),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, platform)
);

create index if not exists profile_contacts_user_idx on public.profile_contacts(user_id);
create index if not exists profile_links_user_idx on public.profile_links(user_id);
create index if not exists profile_social_links_user_idx on public.profile_social_links(user_id);

alter table public.profile_contacts enable row level security;
alter table public.profile_links enable row level security;
alter table public.profile_social_links enable row level security;

drop policy if exists profile_contacts_public_read on public.profile_contacts;
create policy profile_contacts_public_read on public.profile_contacts
  for select using (true);

drop policy if exists profile_contacts_owner_write on public.profile_contacts;
create policy profile_contacts_owner_write on public.profile_contacts
  for all using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists profile_links_public_read on public.profile_links;
create policy profile_links_public_read on public.profile_links
  for select using (true);

drop policy if exists profile_links_owner_write on public.profile_links;
create policy profile_links_owner_write on public.profile_links
  for all using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists profile_social_public_read on public.profile_social_links;
create policy profile_social_public_read on public.profile_social_links
  for select using (true);

drop policy if exists profile_social_owner_write on public.profile_social_links;
create policy profile_social_owner_write on public.profile_social_links
  for all using (auth.uid() = id) with check (auth.uid() = id);

-- Limite stricte de 3 numéros et 3 e-mails par profil.
create or replace function public.enforce_profile_contact_limit()
returns trigger
language plpgsql
as $$
declare
  total integer;
begin
  select count(*) into total
  from public.profile_contacts
  where user_id = new.user_id
    and contact_type = new.contact_type
    and id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid);

  if total >= 3 then
    raise exception 'Maximum de 3 contacts de ce type par profil';
  end if;

  return new;
end;
$$;

drop trigger if exists profile_contacts_limit on public.profile_contacts;
create trigger profile_contacts_limit
before insert or update of user_id, contact_type
on public.profile_contacts
for each row execute function public.enforce_profile_contact_limit();

-- Un seul primaire par type, géré par l'index partiel ci-dessus.


-- ============================================================
-- SOURCE: 0029_profile_handle_unique.sql
-- ============================================================
-- 030_profile_handle_unique.sql
-- Unicité des identifiants (handle) + protection conflits

drop index if exists public.profiles_handle_unique;
create unique index profiles_handle_unique
  on public.profiles (lower(handle))
  where handle is not null
    and length(trim(handle)) > 0;

comment on index public.profiles_handle_unique is
  'BAARO: un seul profil par handle (case-insensitive)';

-- Optionnel — décommente pour reset les placeholders :
-- update public.profiles
--   set handle = null, updated_at = now()
-- where lower(handle) in ('@membre', '@member', '@user', 'membre', 'member', 'user');


-- ============================================================
-- SOURCE: 0030_cleanup_legacy_handles.sql
-- ============================================================
-- 031_cleanup_legacy_handles.sql
-- Nettoie les handles hérités : @user_xxx, @membre, uuid-like
-- Après 029 + 030

-- 1) Repérer (lecture seule — à exécuter d'abord pour voir le volume)
-- select user_id, display_name, handle
-- from public.profiles
-- where handle ~* '^@?user_[0-9a-f]'
--    or lower(handle) in ('@membre', '@member', '@user', 'membre', 'member', 'user')
--    or handle ~* '^[0-9a-f]{8}-[0-9a-f]{4}-';

-- 2) Libérer les handles legacy (force une vraie saisie au prochain enregistrement)
update public.profiles
set
  handle = null,
  updated_at = now()
where
  handle is not null
  and (
    handle ~* '^@?user_[0-9a-f]'
    or lower(coalesce(handle, '')) in (
      '@membre', '@member', '@user',
      'membre', 'member', 'user'
    )
    or handle ~* '^[0-9a-f]{8}-[0-9a-f]{4}-'
  );

-- 3) Optionnel : si display_name est encore le défaut, le laisser ;
--    l'utilisateur choisira nom + @ dans Réglages.

comment on table public.profiles is
  'BAARO profiles — handles legacy @user_xxx nettoyés (031)';


-- ============================================================
-- SOURCE: 0031_profile_avatar_cover.sql
-- ============================================================
-- 032_profile_avatar_cover.sql
-- Photo de profil + bannière de couverture

alter table public.profiles
  add column if not exists avatar_url text;

alter table public.profiles
  add column if not exists cover_url text;


-- ============================================================
-- SOURCE: 0032_profile_identity_location_country.sql
-- ============================================================
-- 033_profile_identity_location_country.sql
-- BAARO — identité de profil, âge, localisation et pays d'inscription.
-- Aucun nouvel endpoint API. Les règles sensibles sont imposées par PostgreSQL/RLS.

alter table public.profiles
  add column if not exists first_name text not null default '',
  add column if not exists last_name text not null default '',
  add column if not exists birth_date date,
  add column if not exists location text,
  add column if not exists registered_country text,
  add column if not exists country_changed_at timestamptz,
  add column if not exists country_change_available_at timestamptz,
  add column if not exists country text;

-- Normalisation + règles métier côté serveur.
create or replace function public.guard_profile_identity_and_country()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_registered text;
  v_previous text;
  v_next text;
  v_flag text;
begin
  -- Nettoyage et limites de taille.
  new.first_name := left(trim(coalesce(new.first_name, '')), 60);
  new.last_name := left(trim(coalesce(new.last_name, '')), 60);
  new.location := left(trim(coalesce(new.location, '')), 120);
  new.display_name := left(trim(coalesce(new.display_name, '')), 120);
  new.bio := left(trim(coalesce(new.bio, '')), 500);

  v_previous := upper(nullif(trim(coalesce(old.country, '')), ''));
  v_next := upper(nullif(trim(coalesce(new.country, '')), ''));
  v_registered := upper(nullif(trim(coalesce(old.registered_country, '')), ''));

  if new.birth_date is not null then
    if new.birth_date < date '1900-01-01' or new.birth_date > (current_date - interval '13 years')::date then
      raise exception 'Date de naissance invalide: âge minimum de 13 ans';
    end if;
  end if;

  -- Le pays d'inscription est immuable après sa première définition.
  if tg_op = 'INSERT' then
    if v_next is not null then
      new.country := v_next;
      new.registered_country := v_next;
      new.country_changed_at := null;
      new.country_change_available_at := null;
    else
      new.country := null;
      new.registered_country := null;
    end if;
  else
    if v_registered is not null then
      new.registered_country := v_registered;
    elsif v_next is not null then
      new.registered_country := v_next;
    else
      new.registered_country := null;
    end if;

    if v_previous is distinct from v_next then
      -- Première définition du pays : pas de délai.
      if v_previous is null then
        new.country_changed_at := null;
        new.country_change_available_at := null;
      else
        -- Tout changement ultérieur est bloqué pendant 4 mois.
        if old.country_change_available_at is not null
           and old.country_change_available_at > now() then
          raise exception 'Changement de pays disponible le %', old.country_change_available_at;
        end if;
        new.country_changed_at := now();
        new.country_change_available_at := now() + interval '4 months';
      end if;
    else
      new.country_changed_at := old.country_changed_at;
      new.country_change_available_at := old.country_change_available_at;
    end if;
  end if;

  -- Le drapeau est dérivé du pays et ne peut pas être arbitrairement modifié.
  v_next := upper(nullif(trim(coalesce(new.country, '')), ''));
  v_flag := case v_next
    when 'ML' then '🇲🇱'
    when 'SN' then '🇸🇳'
    when 'CI' then '🇨🇮'
    when 'BF' then '🇧🇫'
    when 'GN' then '🇬🇳'
    when 'NE' then '🇳🇪'
    when 'TG' then '🇹🇬'
    when 'BJ' then '🇧🇯'
    when 'CM' then '🇨🇲'
    when 'NG' then '🇳🇬'
    when 'GH' then '🇬🇭'
    when 'MA' then '🇲🇦'
    else '🌍'
  end;
  new.flag := v_flag;

  return new;
end;
$$;

drop trigger if exists profiles_identity_country_guard on public.profiles;
create trigger profiles_identity_country_guard
before insert or update of first_name, last_name, birth_date, location, country, registered_country, flag, display_name, bio
on public.profiles
for each row execute function public.guard_profile_identity_and_country();

-- Remet les anciennes lignes en état cohérent sans modifier le pays d'inscription
-- lorsqu'il existe déjà.
update public.profiles
set
  first_name = left(trim(coalesce(first_name, '')), 60),
  last_name = left(trim(coalesce(last_name, '')), 60),
  location = left(trim(coalesce(location, '')), 120),
  registered_country = upper(nullif(trim(coalesce(registered_country, country)), '')),
  country = upper(nullif(trim(coalesce(country, registered_country)), '')),
  flag = case upper(nullif(trim(coalesce(country, '')), ''))
    when 'ML' then '🇲🇱'
    when 'SN' then '🇸🇳'
    when 'CI' then '🇨🇮'
    when 'BF' then '🇧🇫'
    when 'GN' then '🇬🇳'
    when 'NE' then '🇳🇪'
    when 'TG' then '🇹🇬'
    when 'BJ' then '🇧🇯'
    when 'CM' then '🇨🇲'
    when 'NG' then '🇳🇬'
    when 'GH' then '🇬🇭'
    when 'MA' then '🇲🇦'
    else '🌍'
  end
where true;

create index if not exists idx_profiles_country on public.profiles(country);
create index if not exists idx_profiles_registered_country on public.profiles(registered_country);
create index if not exists idx_profiles_country_change_available on public.profiles(country_change_available_at);

comment on column public.profiles.first_name is 'Prénom du profil.';
comment on column public.profiles.last_name is 'Nom de famille du profil.';
comment on column public.profiles.birth_date is 'Date de naissance; l''âge affiché est calculé à partir de cette date.';
comment on column public.profiles.location is 'Localisation déclarée par l''utilisateur.';
comment on column public.profiles.registered_country is 'Pays d''inscription initial, immuable.';
comment on column public.profiles.country is 'Pays actuel du profil; changement limité à une fois tous les 4 mois.';
comment on column public.profiles.country_change_available_at is 'Prochaine date à laquelle un changement de pays est autorisé.';


-- ============================================================
-- SOURCE: 0033_single_user_id_identity.sql
-- ============================================================
-- BAARO: correctif définitif identité + profil + abonnements + amis
-- Exécuter après les migrations existantes. Id utilisateur canonique = auth.users.id.

-- PROFIL: colonnes nécessaires et RLS
alter table public.profiles add column if not exists first_name text;
alter table public.profiles add column if not exists last_name text;
alter table public.profiles add column if not exists birth_date date;
alter table public.profiles add column if not exists location text;
alter table public.profiles add column if not exists country text;
alter table public.profiles add column if not exists avatar_url text;
alter table public.profiles add column if not exists cover_url text;
alter table public.profiles add column if not exists bio text;
alter table public.profiles add column if not exists updated_at timestamptz default now();
alter table public.profiles enable row level security;
drop policy if exists "profiles_read" on public.profiles;
create policy "profiles_read" on public.profiles for select using (true);
drop policy if exists "profiles_insert" on public.profiles;
create policy "profiles_insert" on public.profiles for insert with check (auth.uid() = id);
drop policy if exists "profiles_update" on public.profiles;
create policy "profiles_update" on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);

-- WALLET: une seule ligne par utilisateur, même user_id que auth.users.id.
alter table public.wallets enable row level security;
drop policy if exists "wallet_own" on public.wallets;
create policy "wallet_own" on public.wallets for all using (auth.uid() = id) with check (auth.uid() = id);

-- FOLLOWS: normaliser l'ancien nom avant toute requête qui utilise followed_id.
do $$
begin
  if to_regclass('public.follows') is null then
    create table public.follows (
      follower_id uuid not null references auth.users(id) on delete cascade,
      followed_id uuid not null references auth.users(id) on delete cascade,
      created_at timestamptz not null default now(),
      primary key (follower_id, followed_id)
    );
  end if;
end $$;

do $$
begin
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='follows' and column_name='following_id')
     and not exists (select 1 from information_schema.columns where table_schema='public' and table_name='follows' and column_name='followed_id') then
    alter table public.follows rename column following_id to followed_id;
  end if;
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='follows' and column_name='followed_id') then
    alter table public.follows add column followed_id uuid;
  end if;
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='follows' and column_name='following_id')
     and exists (select 1 from information_schema.columns where table_schema='public' and table_name='follows' and column_name='followed_id') then
    update public.follows set followed_id=coalesce(followed_id,following_id) where followed_id is null;
    alter table public.follows drop column following_id;
  end if;
end $$;

alter table public.follows add column if not exists status text not null default 'accepted';
alter table public.follows add column if not exists is_friend boolean not null default false;
alter table public.follows add column if not exists id uuid default gen_random_uuid();

-- Garantir l'unicité du couple sans dépendre du nom d'une ancienne PK.
create unique index if not exists uq_follows_user_pair on public.follows(follower_id, followed_id);
create index if not exists idx_follows_follower_status on public.follows(follower_id,status);
create index if not exists idx_follows_followed_status on public.follows(followed_id,status);
create index if not exists idx_follows_friends on public.follows(follower_id,followed_id,is_friend,status);

-- Recréer les FK utilisateur si elles manquent.
do $$
begin
  if not exists (select 1 from pg_constraint where conrelid='public.follows'::regclass and contype='f' and pg_get_constraintdef(oid) ilike '%follower_id%auth.users%') then
    alter table public.follows add constraint follows_follower_auth_fk foreign key (follower_id) references auth.users(id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conrelid='public.follows'::regclass and contype='f' and pg_get_constraintdef(oid) ilike '%followed_id%auth.users%') then
    alter table public.follows add constraint follows_followed_auth_fk foreign key (followed_id) references auth.users(id) on delete cascade;
  end if;
end $$;

alter table public.follows enable row level security;
drop policy if exists "follows_read" on public.follows;
create policy "follows_read" on public.follows for select using (true);
drop policy if exists "follows_own" on public.follows;
create policy "follows_own" on public.follows for insert with check (auth.uid()=follower_id);
drop policy if exists "follows_delete_own" on public.follows;
create policy "follows_delete_own" on public.follows for delete using (auth.uid()=follower_id);
drop policy if exists "follows_request_receiver" on public.follows;
create policy "follows_request_receiver" on public.follows for update using (auth.uid()=followed_id and status='pending' and is_friend=true) with check (auth.uid()=followed_id);

-- Suivre / désuivre. La cible est toujours auth.users.id.
create or replace function public.toggle_follow(p_target uuid)
returns boolean language plpgsql security definer set search_path=public,auth as $$
declare me uuid:=auth.uid(); following boolean;
begin
  if me is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if p_target is null or p_target=me then raise exception 'INVALID_TARGET'; end if;
  if not exists(select 1 from auth.users where id=p_target) then raise exception 'USER_NOT_FOUND'; end if;
  select exists(select 1 from public.follows where follower_id=me and followed_id=p_target and status='accepted') into following;
  if following then delete from public.follows where follower_id=me and followed_id=p_target; return false; end if;
  insert into public.follows(follower_id,followed_id,status,is_friend) values(me,p_target,'accepted',false)
    on conflict(follower_id,followed_id) do update set status='accepted',is_friend=false;
  return true;
end $$;
revoke all on function public.toggle_follow(uuid) from public;
grant execute on function public.toggle_follow(uuid) to authenticated;


-- ============================================================
-- SOURCE: 0034_canonical_user_id.sql
-- ============================================================
-- BAARO — Identité canonique unique
-- Source de vérité utilisateur: auth.users.id (UUID Supabase Auth).
-- Les identifiants locaux, emails, handles et noms ne doivent jamais être utilisés
-- comme clés de relation utilisateur.

DO $$
DECLARE
  r record;
BEGIN
  -- Tables principales: ajouter la FK vers auth.users si une colonne utilisateur
  -- existe et qu'une FK équivalente n'est pas déjà présente.
  FOR r IN
    SELECT * FROM (VALUES
      ('profiles','user_id'),
      ('wallets','user_id'),
      ('transactions','user_id'),
      ('crypto_holdings','user_id'),
      ('post_likes','user_id'),
      ('comments','author_id'),
      ('follows','follower_id'),
      ('follows','followed_id'),
      ('messages','sender_id'),
      ('messages','recipient_id'),
      ('videos','author_id'),
      ('notifications','user_id'),
      ('notification_preferences','user_id'),
      ('push_tokens','user_id'),
      ('post_reactions','user_id'),
      ('post_bookmarks','user_id'),
      ('post_shares','user_id'),
      ('poll_votes','user_id'),
      ('group_members','user_id'),
      ('channel_messages','sender_id'),
      ('voice_participants','user_id'),
      ('debate_participants','user_id'),
      ('debate_messages','sender_id'),
      ('wallet_ledger','user_id')
    ) AS x(table_name, column_name)
  LOOP
    IF to_regclass('public.' || r.table_name) IS NOT NULL
       AND EXISTS (
         SELECT 1 FROM information_schema.columns c
         WHERE c.table_schema='public' AND c.table_name=r.table_name
           AND c.column_name=r.column_name AND c.udt_name='uuid'
       )
       AND NOT EXISTS (
         SELECT 1 FROM pg_constraint c
         WHERE c.conrelid=('public.'||r.table_name)::regclass
           AND c.contype='f'
           AND c.confrelid='auth.users'::regclass
           AND pg_get_constraintdef(c.oid) ILIKE '%'||r.column_name||'%'
       ) THEN
      BEGIN
        EXECUTE format(
          'ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES auth.users(id) ON DELETE CASCADE',
          r.table_name, left(r.table_name||'_'||r.column_name||'_auth_fk', 63), r.column_name
        );
      EXCEPTION WHEN duplicate_object THEN NULL;
      END;
    END IF;
  END LOOP;
END $$;

-- Empêcher les relations self-follow et les profils sans utilisateur.
DO $$ BEGIN
  IF to_regclass('public.follows') IS NOT NULL THEN
    BEGIN
      ALTER TABLE public.follows ADD CONSTRAINT follows_no_self CHECK (follower_id <> followed_id);
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END IF;
END $$;

-- RLS: une ligne appartenant à un utilisateur ne peut être créée/modifiée
-- qu'avec son auth.uid(). Les policies existantes plus spécifiques restent intactes.
ALTER TABLE IF EXISTS public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.post_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.post_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.post_bookmarks ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.post_shares ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.poll_votes ENABLE ROW LEVEL SECURITY;

COMMENT ON SCHEMA public IS 'BAARO: auth.users.id is the single canonical user identity for all user relations.';


-- ============================================================
-- SOURCE: 0035_rename_user_id_to_id.sql
-- ============================================================
-- BAARO: supprimer le problème user_id — identité unique = id
-- profiles.id / wallets.id / crypto_holdings.id = auth.users.id
-- Ne renomme PAS les colonnes FK des tables de relation (post_likes.user_id, etc.)

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='profiles' AND column_name='user_id'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='profiles' AND column_name='id'
  ) THEN
    ALTER TABLE public.profiles RENAME COLUMN user_id TO id;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='wallets' AND column_name='user_id'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='wallets' AND column_name='id'
  ) THEN
    ALTER TABLE public.wallets RENAME COLUMN user_id TO id;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='crypto_holdings' AND column_name='user_id'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='crypto_holdings' AND column_name='id'
  ) THEN
    ALTER TABLE public.crypto_holdings RENAME COLUMN user_id TO id;
  END IF;
END $$;

-- Policies
DO $$
BEGIN
  DROP POLICY IF EXISTS "profiles_insert" ON public.profiles;
  CREATE POLICY "profiles_insert" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);
  DROP POLICY IF EXISTS "profiles_update" ON public.profiles;
  CREATE POLICY "profiles_update" ON public.profiles FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

  DROP POLICY IF EXISTS "wallet_own" ON public.wallets;
  CREATE POLICY "wallet_own" ON public.wallets FOR ALL USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

  DROP POLICY IF EXISTS "crypto_own" ON public.crypto_holdings;
  CREATE POLICY "crypto_own" ON public.crypto_holdings FOR ALL USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

COMMENT ON TABLE public.profiles IS 'BAARO: id = auth.users.id (identité unique, plus de user_id)';
COMMENT ON TABLE public.wallets IS 'BAARO: id = auth.users.id';
COMMENT ON TABLE public.crypto_holdings IS 'BAARO: id = auth.users.id';

-- =====================================================================
-- IMPORTANT : les fonctions PL/pgSQL ne sont PAS mises à jour automatiquement
-- par un RENAME COLUMN. On corrige les références wallets.user_id / 
-- profiles.user_id / crypto_holdings.user_id dans les corps de fonctions.
-- =====================================================================
DO $$
DECLARE
  r RECORD;
  def text;
  new_def text;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname, n.nspname
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prokind = 'f'
      AND pg_get_functiondef(p.oid) ~* '(wallets|profiles|crypto_holdings).*user_id|from public\.(wallets|profiles|crypto_holdings) where user_id'
  LOOP
    def := pg_get_functiondef(r.oid);
    new_def := def;
    -- Remplacements ciblés pour les tables d'identité uniquement
    new_def := regexp_replace(new_def, 'from public\.wallets where user_id', 'from public.wallets where id', 'gi');
    new_def := regexp_replace(new_def, 'from public\.profiles where user_id', 'from public.profiles where id', 'gi');
    new_def := regexp_replace(new_def, 'from public\.crypto_holdings where user_id', 'from public.crypto_holdings where id', 'gi');
    new_def := regexp_replace(new_def, 'update public\.wallets set ([^;]+) where user_id', 'update public.wallets set \1 where id', 'gi');
    new_def := regexp_replace(new_def, 'update public\.profiles set ([^;]+) where user_id', 'update public.profiles set \1 where id', 'gi');
    new_def := regexp_replace(new_def, 'update public\.crypto_holdings set ([^;]+) where user_id', 'update public.crypto_holdings set \1 where id', 'gi');
    new_def := regexp_replace(new_def, 'join public\.profiles p on p\.user_id', 'join public.profiles p on p.id', 'gi');
    new_def := regexp_replace(new_def, 'left join public\.profiles p on p\.user_id', 'left join public.profiles p on p.id', 'gi');
    new_def := regexp_replace(new_def, 'profiles\.user_id', 'profiles.id', 'gi');
    new_def := regexp_replace(new_def, 'wallets\.user_id', 'wallets.id', 'gi');
    new_def := regexp_replace(new_def, 'crypto_holdings\.user_id', 'crypto_holdings.id', 'gi');

    IF new_def IS DISTINCT FROM def THEN
      BEGIN
        EXECUTE new_def;
        RAISE NOTICE 'Fonction corrigée: %.%', r.nspname, r.proname;
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'Impossible de corriger %.%: %', r.nspname, r.proname, SQLERRM;
      END;
    END IF;
  END LOOP;
END $$;


-- ============================================================
-- SOURCE: 0036_identity_id_only_and_profile_persistence.sql
-- ============================================================
-- BAARO 038: identité unique = id uniquement + persistance des profils
-- - profiles / wallets / crypto_holdings : clé primaire = id (UUID auth.users.id)
-- - Plus de colonne user_id sur ces tables d'identité
-- - FKs qui référençaient profiles(user_id) pointent vers profiles(id)
-- - RLS et trigger de création automatique de profil à l'inscription

-- 1) Renommer user_id → id sur les tables d'identité si nécessaire
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'user_id'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'id'
  ) THEN
    ALTER TABLE public.profiles RENAME COLUMN user_id TO id;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'wallets' AND column_name = 'user_id'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'wallets' AND column_name = 'id'
  ) THEN
    ALTER TABLE public.wallets RENAME COLUMN user_id TO id;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'crypto_holdings' AND column_name = 'user_id'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'crypto_holdings' AND column_name = 'id'
  ) THEN
    ALTER TABLE public.crypto_holdings RENAME COLUMN user_id TO id;
  END IF;
END $$;

-- 2) S'assurer que id est PK et référence auth.users
DO $$
BEGIN
  -- profiles
  IF to_regclass('public.profiles') IS NOT NULL THEN
    BEGIN
      ALTER TABLE public.profiles
        ALTER COLUMN id SET NOT NULL;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
    BEGIN
      ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_pkey;
      ALTER TABLE public.profiles ADD PRIMARY KEY (id);
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
    BEGIN
      ALTER TABLE public.profiles
        DROP CONSTRAINT IF EXISTS profiles_id_fkey;
      ALTER TABLE public.profiles
        ADD CONSTRAINT profiles_id_fkey
        FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END IF;

  -- wallets
  IF to_regclass('public.wallets') IS NOT NULL THEN
    BEGIN
      ALTER TABLE public.wallets DROP CONSTRAINT IF EXISTS wallets_pkey;
      ALTER TABLE public.wallets ADD PRIMARY KEY (id);
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
    BEGIN
      ALTER TABLE public.wallets
        DROP CONSTRAINT IF EXISTS wallets_id_fkey;
      ALTER TABLE public.wallets
        ADD CONSTRAINT wallets_id_fkey
        FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END IF;
END $$;

-- 3) Corriger les FKs qui pointaient encore vers profiles(user_id)
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT con.conname, rel.relname AS table_name
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname = 'public'
      AND con.contype = 'f'
      AND pg_get_constraintdef(con.oid) ILIKE '%profiles%user_id%'
  LOOP
    EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT IF EXISTS %I', r.table_name, r.conname);
  END LOOP;
END $$;

-- Recréer les FKs principales vers profiles(id)
DO $$
BEGIN
  IF to_regclass('public.shops') IS NOT NULL THEN
    BEGIN
      ALTER TABLE public.shops
        DROP CONSTRAINT IF EXISTS shops_owner_id_fkey;
      ALTER TABLE public.shops
        ADD CONSTRAINT shops_owner_id_fkey
        FOREIGN KEY (owner_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END IF;

  IF to_regclass('public.orders') IS NOT NULL THEN
    BEGIN
      ALTER TABLE public.orders
        DROP CONSTRAINT IF EXISTS orders_buyer_id_fkey;
      ALTER TABLE public.orders
        ADD CONSTRAINT orders_buyer_id_fkey
        FOREIGN KEY (buyer_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END IF;

  IF to_regclass('public.companies') IS NOT NULL THEN
    BEGIN
      ALTER TABLE public.companies
        DROP CONSTRAINT IF EXISTS companies_owner_id_fkey;
      ALTER TABLE public.companies
        ADD CONSTRAINT companies_owner_id_fkey
        FOREIGN KEY (owner_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END IF;

  IF to_regclass('public.company_reviews') IS NOT NULL THEN
    BEGIN
      ALTER TABLE public.company_reviews
        DROP CONSTRAINT IF EXISTS company_reviews_user_id_fkey;
      ALTER TABLE public.company_reviews
        ADD CONSTRAINT company_reviews_user_id_fkey
        FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END IF;
END $$;

-- 4) RLS : identité = id
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_read" ON public.profiles;
CREATE POLICY "profiles_read" ON public.profiles FOR SELECT USING (true);

DROP POLICY IF EXISTS "profiles_insert" ON public.profiles;
CREATE POLICY "profiles_insert" ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "profiles_update" ON public.profiles;
CREATE POLICY "profiles_update" ON public.profiles
  FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "profiles_delete" ON public.profiles;
CREATE POLICY "profiles_delete" ON public.profiles
  FOR DELETE USING (auth.uid() = id);

-- wallets
DO $$
BEGIN
  IF to_regclass('public.wallets') IS NOT NULL THEN
    ALTER TABLE public.wallets ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "wallet_own" ON public.wallets;
    CREATE POLICY "wallet_own" ON public.wallets
      FOR ALL USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
  END IF;
END $$;

-- crypto_holdings
DO $$
BEGIN
  IF to_regclass('public.crypto_holdings') IS NOT NULL THEN
    ALTER TABLE public.crypto_holdings ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "crypto_own" ON public.crypto_holdings;
    CREATE POLICY "crypto_own" ON public.crypto_holdings
      FOR ALL USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
  END IF;
END $$;

-- 5) Trigger : créer le profil automatiquement à l'inscription (persistance)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, handle, flag, bio, created_at, updated_at)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'display_name', 'Membre BAARO'),
    COALESCE(
      NULLIF(NEW.raw_user_meta_data->>'handle', ''),
      '@user_' || left(NEW.id::text, 8)
    ),
    COALESCE(NEW.raw_user_meta_data->>'flag', '🌍'),
    '',
    now(),
    now()
  )
  ON CONFLICT (id) DO NOTHING;

  -- Wallet de base
  BEGIN
    INSERT INTO public.wallets (id, balance, updated_at)
    VALUES (NEW.id, 0, now())
    ON CONFLICT (id) DO NOTHING;
  EXCEPTION WHEN undefined_table OR undefined_column THEN
    BEGIN
      INSERT INTO public.wallets (id, updated_at)
      VALUES (NEW.id, now())
      ON CONFLICT (id) DO NOTHING;
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE PROCEDURE public.handle_new_user();

-- 6) Colonne updated_at si absente
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

COMMENT ON COLUMN public.profiles.id IS 'Identifiant utilisateur unique = auth.users.id (UUID). Plus de user_id.';

-- Colonne clé publique E2E (messagerie)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS public_key jsonb;

-- Colonne language (utilisée par l'API chat)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS language text;

-- Colonnes métier utilisées par les API
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS restricted boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS referral_code text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_referral_code
  ON public.profiles (referral_code)
  WHERE referral_code IS NOT NULL;


-- ============================================================
-- SOURCE: 0037_clean.sql
-- ============================================================
-- BAARO 039: fonctions wallet alignées sur wallets.id (plus de wallets.user_id)
-- transactions.user_id reste une FK relationnelle (correct).
-- À exécuter APRÈS 038_identity_id_only_and_profile_persistence.sql

-- Colonnes attendues
ALTER TABLE public.wallets
  ADD COLUMN IF NOT EXISTS balance numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- DROP obligatoire : CREATE OR REPLACE ne peut pas changer les défauts de paramètres
DROP FUNCTION IF EXISTS public.wallet_ensure(uuid, numeric);
DROP FUNCTION IF EXISTS public.wallet_earn(uuid, numeric, text, text, numeric, boolean);
DROP FUNCTION IF EXISTS public.wallet_earn(uuid, numeric, text, text, numeric, boolean, uuid);
DROP FUNCTION IF EXISTS public.wallet_redeem(uuid, numeric, text, text);
DROP FUNCTION IF EXISTS public.wallet_convert(uuid, numeric);

-- wallet_ensure
CREATE OR REPLACE FUNCTION public.wallet_ensure(p_user_id uuid, p_welcome_bonus numeric DEFAULT 50)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  w public.wallets%rowtype;
  bonus numeric := greatest(coalesce(p_welcome_bonus, 0), 0);
BEGIN
  INSERT INTO public.wallets(id, balance, updated_at)
  VALUES (p_user_id, 0, now())
  ON CONFLICT (id) DO NOTHING;

  SELECT * INTO w FROM public.wallets WHERE id = p_user_id FOR UPDATE;

  IF bonus > 0 AND NOT EXISTS (
    SELECT 1 FROM public.transactions
    WHERE user_id = p_user_id AND action_key = 'welcome_bonus'
  ) THEN
    UPDATE public.wallets
      SET balance = balance + bonus, updated_at = now()
    WHERE id = p_user_id
    RETURNING * INTO w;

    INSERT INTO public.transactions(user_id, label, pts, action_key, day_key)
    VALUES (p_user_id, 'Bonus de bienvenue', bonus, 'welcome_bonus', current_date);
  END IF;

  RETURN jsonb_build_object('id', w.id, 'user_id', w.id, 'balance', w.balance, 'updated_at', w.updated_at);
END;
$$;

-- wallet_earn (anti-farming + reference_id)
CREATE OR REPLACE FUNCTION public.wallet_earn(
  p_user_id uuid,
  p_pts numeric,
  p_label text,
  p_action_key text,
  p_daily_cap numeric DEFAULT 100,
  p_daily_bonus boolean DEFAULT false,
  p_reference_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  w public.wallets%rowtype;
  earned numeric := 0;
  actual_pts numeric;
  tx public.transactions%rowtype;
  event_exists boolean := false;
BEGIN
  IF p_pts IS NULL OR p_pts <= 0 THEN RAISE EXCEPTION 'INVALID_POINTS'; END IF;
  IF length(coalesce(p_label,'')) = 0 THEN RAISE EXCEPTION 'INVALID_LABEL'; END IF;

  IF NOT p_daily_bonus THEN
    IF p_reference_id IS NULL THEN RAISE EXCEPTION 'REWARD_REFERENCE_REQUIRED'; END IF;

    CASE p_action_key
      WHEN 'publish_post' THEN
        SELECT EXISTS(SELECT 1 FROM public.posts WHERE id = p_reference_id AND author_id = p_user_id) INTO event_exists;
      WHEN 'publish_post_media' THEN
        SELECT EXISTS(SELECT 1 FROM public.posts WHERE id = p_reference_id AND author_id = p_user_id AND media_url IS NOT NULL) INTO event_exists;
      WHEN 'like_post' THEN
        SELECT EXISTS(SELECT 1 FROM public.post_likes WHERE post_id = p_reference_id AND user_id = p_user_id) INTO event_exists;
      WHEN 'comment' THEN
        SELECT EXISTS(SELECT 1 FROM public.comments WHERE id = p_reference_id AND author_id = p_user_id) INTO event_exists;
      WHEN 'subscribe' THEN
        SELECT EXISTS(SELECT 1 FROM public.follows WHERE follower_id = p_user_id AND followed_id = p_reference_id) INTO event_exists;
      WHEN 'like_video' THEN
        SELECT EXISTS(SELECT 1 FROM public.video_likes WHERE video_id = p_reference_id AND user_id = p_user_id) INTO event_exists;
      WHEN 'comment_video' THEN
        SELECT EXISTS(SELECT 1 FROM public.video_comments WHERE id = p_reference_id AND author_id = p_user_id) INTO event_exists;
      WHEN 'publish_video' THEN
        SELECT EXISTS(SELECT 1 FROM public.videos WHERE id = p_reference_id AND author_id = p_user_id) INTO event_exists;
      WHEN 'repost_video' THEN
        SELECT EXISTS(SELECT 1 FROM public.videos WHERE id = p_reference_id AND author_id = p_user_id) INTO event_exists;
      WHEN 'publish_story' THEN
      ELSE
        RAISE EXCEPTION 'UNVERIFIABLE_REWARD_ACTION';
    END CASE;

    IF NOT event_exists THEN RAISE EXCEPTION 'REWARD_EVENT_NOT_FOUND'; END IF;

    IF EXISTS (
      SELECT 1 FROM public.transactions
      WHERE user_id = p_user_id AND action_key = p_action_key AND reference_id = p_reference_id AND pts > 0
    ) THEN
      RAISE EXCEPTION 'REWARD_ALREADY_CLAIMED';
    END IF;
  ELSE
    IF p_action_key <> 'daily_bonus' THEN RAISE EXCEPTION 'INVALID_DAILY_BONUS'; END IF;
    IF EXISTS (
      SELECT 1 FROM public.transactions
      WHERE user_id = p_user_id AND action_key = 'daily_bonus' AND day_key = current_date
    ) THEN
      RAISE EXCEPTION 'DAILY_BONUS_ALREADY_CLAIMED';
    END IF;
  END IF;

  PERFORM public.wallet_ensure(p_user_id, 0);
  SELECT * INTO w FROM public.wallets WHERE id = p_user_id FOR UPDATE;

  SELECT coalesce(sum(pts), 0) INTO earned
  FROM public.transactions
  WHERE user_id = p_user_id AND pts > 0 AND created_at >= date_trunc('day', now());

  IF earned >= p_daily_cap THEN RAISE EXCEPTION 'DAILY_CAP_REACHED'; END IF;
  actual_pts := least(p_pts, p_daily_cap - earned);

  UPDATE public.wallets
    SET balance = balance + actual_pts, updated_at = now()
  WHERE id = p_user_id
  RETURNING * INTO w;

  INSERT INTO public.transactions(user_id, label, pts, action_key, day_key, reference_id)
  VALUES (p_user_id, left(p_label, 120), actual_pts, p_action_key, current_date, p_reference_id)
  RETURNING * INTO tx;

  RETURN jsonb_build_object(
    'balance', w.balance,
    'earned_today', earned + actual_pts,
    'remaining_today', greatest(0, p_daily_cap - earned - actual_pts),
    'transaction', to_jsonb(tx)
  );
END;
$$;

-- wallet_redeem
CREATE OR REPLACE FUNCTION public.wallet_redeem(
  p_user_id uuid,
  p_cost numeric,
  p_label text,
  p_action_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  w public.wallets%rowtype;
  tx public.transactions%rowtype;
BEGIN
  IF p_cost IS NULL OR p_cost <= 0 THEN RAISE EXCEPTION 'INVALID_COST'; END IF;
  PERFORM public.wallet_ensure(p_user_id, 0);
  SELECT * INTO w FROM public.wallets WHERE id = p_user_id FOR UPDATE;
  IF w.balance < p_cost THEN RAISE EXCEPTION 'INSUFFICIENT_BALANCE'; END IF;

  UPDATE public.wallets SET balance = balance - p_cost, updated_at = now()
  WHERE id = p_user_id RETURNING * INTO w;

  INSERT INTO public.transactions(user_id, label, pts, action_key, day_key)
  VALUES (p_user_id, left(p_label, 120), -p_cost, p_action_key, current_date)
  RETURNING * INTO tx;

  RETURN jsonb_build_object('balance', w.balance, 'transaction', to_jsonb(tx));
END;
$$;

-- wallet_convert (points → holdings)
CREATE OR REPLACE FUNCTION public.wallet_convert(
  p_user_id uuid,
  p_pts numeric
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  w public.wallets%rowtype;
  h public.crypto_holdings%rowtype;
  tx public.transactions%rowtype;
BEGIN
  IF p_pts IS NULL OR p_pts <= 0 THEN RAISE EXCEPTION 'INVALID_POINTS'; END IF;
  PERFORM public.wallet_ensure(p_user_id, 0);
  SELECT * INTO w FROM public.wallets WHERE id = p_user_id FOR UPDATE;
  IF w.balance < p_pts THEN RAISE EXCEPTION 'INSUFFICIENT_BALANCE'; END IF;

  INSERT INTO public.crypto_holdings(id, holdings, updated_at)
  VALUES (p_user_id, 0, now())
  ON CONFLICT (id) DO NOTHING;

  UPDATE public.wallets SET balance = balance - p_pts, updated_at = now()
  WHERE id = p_user_id RETURNING * INTO w;

  UPDATE public.crypto_holdings
    SET holdings = holdings + p_pts, updated_at = now()
  WHERE id = p_user_id
  RETURNING * INTO h;

  INSERT INTO public.transactions(user_id, label, pts, action_key, day_key)
  VALUES (p_user_id, 'Conversion points → BAARO', -p_pts, 'convert_to_baro', current_date)
  RETURNING * INTO tx;

  RETURN jsonb_build_object('balance', w.balance, 'holdings', h.holdings, 'transaction', to_jsonb(tx));
END;
$$;

-- Grants
REVOKE ALL ON FUNCTION public.wallet_ensure(uuid, numeric) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.wallet_earn(uuid, numeric, text, text, numeric, boolean, uuid) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.wallet_redeem(uuid, numeric, text, text) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.wallet_convert(uuid, numeric) FROM public, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.wallet_ensure(uuid, numeric) TO service_role;
GRANT EXECUTE ON FUNCTION public.wallet_earn(uuid, numeric, text, text, numeric, boolean, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.wallet_redeem(uuid, numeric, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.wallet_convert(uuid, numeric) TO service_role;


-- ============================================================
-- SOURCE: 0038_profile_social_fix.sql
-- ============================================================
-- 1. Adaptation dynamique de la table 'follows' existante
DO $$ 
BEGIN
    -- Si la table n'existe pas, on la crée
    IF NOT EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'follows') THEN
        CREATE TABLE public.follows (
            follower_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
            following_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
            PRIMARY KEY (follower_id, following_id)
        );
    ELSE
        -- Renommer 'followed_id' en 'following_id' si la colonne s'appelait ainsi
        IF EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'follows' AND column_name = 'followed_id') THEN
            ALTER TABLE public.follows RENAME COLUMN followed_id TO following_id;
        -- Renommer 'target_id' en 'following_id' si la colonne s'appelait ainsi
        ELSIF EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'follows' AND column_name = 'target_id') THEN
            ALTER TABLE public.follows RENAME COLUMN target_id TO following_id;
        -- Si 'following_id' n'existe toujours pas, on l'ajoute
        ELSIF NOT EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'follows' AND column_name = 'following_id') THEN
            ALTER TABLE public.follows ADD COLUMN following_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE;
        END IF;
    END IF;
END $$;

-- 2. Indexation pour optimiser les performances
CREATE INDEX IF NOT EXISTS idx_follows_follower ON public.follows(follower_id);
CREATE INDEX IF NOT EXISTS idx_follows_following ON public.follows(following_id);

-- 3. Activation et réinitialisation des politiques RLS
ALTER TABLE public.follows ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Lecture publique des abonnements" ON public.follows;
DROP POLICY IF EXISTS "Création par l'utilisateur connecté" ON public.follows;
DROP POLICY IF EXISTS "Suppression par l'utilisateur connecté" ON public.follows;

CREATE POLICY "Lecture publique des abonnements" ON public.follows
    FOR SELECT USING (true);

CREATE POLICY "Création par l'utilisateur connecté" ON public.follows
    FOR INSERT WITH CHECK (auth.uid() = follower_id);

CREATE POLICY "Suppression par l'utilisateur connecté" ON public.follows
    FOR DELETE USING (auth.uid() = follower_id);

-- 4. Fonction RPC pour récupérer les amis réciproques[span_3](start_span)[span_3](end_span)
CREATE OR REPLACE FUNCTION public.get_user_friends(user_id_param UUID)
RETURNS TABLE (friend_id UUID) AS $$
BEGIN
  RETURN QUERY
  SELECT f1.following_id AS friend_id
  FROM public.follows f1
  INNER JOIN public.follows f2 
    ON f1.following_id = f2.follower_id 
   AND f1.follower_id = f2.following_id
  WHERE f1.follower_id = user_id_param;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;


-- ============================================================
-- SOURCE: 0039_canonical_identity_unique.sql
-- ============================================================
-- BAARO 041: identité canonique unique + identifiant public unique
--
-- Règle définitive :
--   auth.users.id = profiles.id = wallets.id = crypto_holdings.id
--   => un seul UUID canonique pour l'identité d'un compte.
--
-- Les colonnes user_id des tables relationnelles restent des FK vers profiles.id.
-- Elles ne sont PAS des identifiants concurrents : elles désignent l'utilisateur
-- associé à une ligne de relation (like, vote, membre, notification, etc.).

DO $$
BEGIN
  IF to_regclass('public.profiles') IS NOT NULL THEN
    -- L'identité technique BAARO est exactement auth.users.id.
    ALTER TABLE public.profiles
      ALTER COLUMN id SET NOT NULL;

    ALTER TABLE public.profiles
      DROP CONSTRAINT IF EXISTS profiles_id_fkey;
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_id_fkey
      FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;

    -- Chaque compte doit avoir un identifiant public unique.
    -- Les anciens profils sans handle reçoivent un identifiant déterministe.
    UPDATE public.profiles
       SET handle = '@user_' || replace(left(id::text, 12), '-', '')
     WHERE handle IS NULL OR length(trim(handle)) = 0;

    -- Normalisation minimale des handles existants.
    UPDATE public.profiles
       SET handle = lower(trim(handle))
     WHERE handle IS NOT NULL
       AND handle <> lower(trim(handle));

    -- Un seul handle, insensible à la casse.
    DROP INDEX IF EXISTS public.profiles_handle_unique;
    CREATE UNIQUE INDEX profiles_handle_unique
      ON public.profiles (lower(handle));

    ALTER TABLE public.profiles
      ALTER COLUMN handle SET NOT NULL;
  END IF;

  IF to_regclass('public.wallets') IS NOT NULL THEN
    ALTER TABLE public.wallets ALTER COLUMN id SET NOT NULL;
    ALTER TABLE public.wallets DROP CONSTRAINT IF EXISTS wallets_id_fkey;
    ALTER TABLE public.wallets
      ADD CONSTRAINT wallets_id_fkey
      FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;

  IF to_regclass('public.crypto_holdings') IS NOT NULL THEN
    ALTER TABLE public.crypto_holdings ALTER COLUMN id SET NOT NULL;
    ALTER TABLE public.crypto_holdings DROP CONSTRAINT IF EXISTS crypto_holdings_id_fkey;
    ALTER TABLE public.crypto_holdings
      ADD CONSTRAINT crypto_holdings_id_fkey
      FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Vérification finale : aucune table d'identité ne doit avoir user_id.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['profiles','wallets','crypto_holdings'] LOOP
    IF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = t
        AND column_name = 'user_id'
    ) THEN
      RAISE EXCEPTION 'BAARO: %.user_id interdit — utiliser %.id', t, t;
    END IF;
  END LOOP;
END $$;

COMMENT ON COLUMN public.profiles.id IS
  'Identifiant technique canonique unique BAARO = auth.users.id';
COMMENT ON COLUMN public.profiles.handle IS
  'Identifiant public unique BAARO, insensible à la casse';

-- Recréer le trigger d'inscription avec profiles.id (et non profiles.user_id).

-- Recréer le trigger d'inscription avec profiles.id et un fallback handle garanti unique.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  base_name text;
  base_handle text;
  fallback_handle text;
BEGIN
  base_name := coalesce(
    nullif(new.raw_user_meta_data ->> 'display_name', ''),
    nullif(new.raw_user_meta_data ->> 'full_name', ''),
    nullif(new.raw_user_meta_data ->> 'name', ''),
    nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
    nullif(new.phone, ''),
    'Membre BAARO'
  );

  base_handle := lower(trim(coalesce(
    nullif(new.raw_user_meta_data ->> 'handle', ''),
    '@user_' || substr(replace(new.id::text, '-', ''), 1, 8)
  )));
  IF left(base_handle, 1) <> '@' THEN
    base_handle := '@' || base_handle;
  END IF;
  base_handle := left(base_handle, 40);
  fallback_handle := '@user_' || substr(replace(new.id::text, '-', ''), 1, 12);

  BEGIN
    INSERT INTO public.profiles (id, display_name, handle, flag)
    VALUES (new.id, left(base_name, 80), base_handle, '🌍')
    ON CONFLICT (id) DO NOTHING;
  EXCEPTION WHEN unique_violation THEN
    INSERT INTO public.profiles (id, display_name, handle, flag)
    VALUES (new.id, left(base_name, 80), fallback_handle, '🌍')
    ON CONFLICT (id) DO NOTHING;
  END;

  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- Réparer les comptes créés avant l'activation du trigger canonique.
INSERT INTO public.profiles (id, display_name, handle, flag)
SELECT
  u.id,
  left(coalesce(
    nullif(u.raw_user_meta_data ->> 'display_name', ''),
    nullif(u.raw_user_meta_data ->> 'full_name', ''),
    nullif(u.raw_user_meta_data ->> 'name', ''),
    nullif(split_part(coalesce(u.email, ''), '@', 1), ''),
    nullif(u.phone, ''),
    'Membre BAARO'
  ), 80),
  left('@user_' || substr(replace(u.id::text, '-', ''), 1, 12), 40),
  '🌍'
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE p.id IS NULL;


-- ============================================================
-- SOURCE: 0040_notifications_final.sql
-- ============================================================
-- ============================================================
-- BAARO 043 — SCHEMA FINAL DES NOTIFICATIONS
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. Table notifications
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.notifications (
  notification_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  actor_id UUID NULL,
  type TEXT NULL DEFAULT 'general',
  message TEXT NOT NULL DEFAULT '',
  source_id UUID NULL,
  read BOOLEAN NOT NULL DEFAULT false,
  read_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- 2. Normalisation des anciennes colonnes
-- ------------------------------------------------------------

DO $$
BEGIN
  -- Ancien schéma : id = identifiant notification
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'notifications'
      AND column_name = 'id'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'notifications'
      AND column_name = 'notification_id'
  ) THEN
    ALTER TABLE public.notifications
      RENAME COLUMN id TO notification_id;
  END IF;
END $$;

-- Ajouter les colonnes finales si elles manquent.

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS notification_id UUID;

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS user_id UUID;

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS actor_id UUID;

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS type TEXT;

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS message TEXT;

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS source_id UUID;

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS read BOOLEAN;

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ;

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ;

-- ------------------------------------------------------------
-- 3. Valeurs par défaut
-- ------------------------------------------------------------

ALTER TABLE public.notifications
  ALTER COLUMN notification_id SET DEFAULT gen_random_uuid();

ALTER TABLE public.notifications
  ALTER COLUMN type SET DEFAULT 'general';

ALTER TABLE public.notifications
  ALTER COLUMN message SET DEFAULT '';

ALTER TABLE public.notifications
  ALTER COLUMN read SET DEFAULT false;

ALTER TABLE public.notifications
  ALTER COLUMN created_at SET DEFAULT now();

-- ------------------------------------------------------------
-- 4. Nettoyage des anciennes valeurs NULL
-- ------------------------------------------------------------

UPDATE public.notifications
SET notification_id = gen_random_uuid()
WHERE notification_id IS NULL;

UPDATE public.notifications
SET type = 'general'
WHERE type IS NULL;

UPDATE public.notifications
SET message = ''
WHERE message IS NULL;

UPDATE public.notifications
SET read = false
WHERE read IS NULL;

UPDATE public.notifications
SET created_at = now()
WHERE created_at IS NULL;

-- ------------------------------------------------------------
-- 5. Contraintes
-- ------------------------------------------------------------

ALTER TABLE public.notifications
  ALTER COLUMN notification_id SET NOT NULL;

ALTER TABLE public.notifications
  ALTER COLUMN user_id SET NOT NULL;

ALTER TABLE public.notifications
  ALTER COLUMN message SET NOT NULL;

ALTER TABLE public.notifications
  ALTER COLUMN read SET NOT NULL;

ALTER TABLE public.notifications
  ALTER COLUMN created_at SET NOT NULL;

-- Supprimer les anciennes contraintes FK.

ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS notifications_user_id_fkey;

ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS notifications_actor_id_fkey;

-- Recréer les FK.

ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_user_id_fkey
  FOREIGN KEY (user_id)
  REFERENCES public.profiles(id)
  ON DELETE CASCADE;

ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_actor_id_fkey
  FOREIGN KEY (actor_id)
  REFERENCES public.profiles(id)
  ON DELETE SET NULL;

-- ------------------------------------------------------------
-- 6. Clé primaire notification_id
-- ------------------------------------------------------------

DO $$
DECLARE
  pk_name TEXT;
BEGIN
  SELECT conname
  INTO pk_name
  FROM pg_constraint
  WHERE conrelid = 'public.notifications'::regclass
    AND contype = 'p'
  LIMIT 1;

  IF pk_name IS NOT NULL
     AND pk_name <> 'notifications_pkey' THEN

    EXECUTE format(
      'ALTER TABLE public.notifications DROP CONSTRAINT %I',
      pk_name
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.notifications'::regclass
      AND contype = 'p'
  ) THEN
    ALTER TABLE public.notifications
      ADD CONSTRAINT notifications_pkey
      PRIMARY KEY (notification_id);
  END IF;
END $$;

-- ------------------------------------------------------------
-- 7. Index
-- ------------------------------------------------------------

CREATE INDEX IF NOT EXISTS
  idx_notifications_user_created
ON public.notifications(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS
  idx_notifications_user_read
ON public.notifications(user_id, read);

CREATE INDEX IF NOT EXISTS
  idx_notifications_actor
ON public.notifications(actor_id);

-- ------------------------------------------------------------
-- 8. RLS
-- ------------------------------------------------------------

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notifications_read"
  ON public.notifications;

DROP POLICY IF EXISTS "notifications_insert"
  ON public.notifications;

DROP POLICY IF EXISTS "notifications_select_own"
  ON public.notifications;

DROP POLICY IF EXISTS "notifications_update_own"
  ON public.notifications;

DROP POLICY IF EXISTS "notifications_delete_own"
  ON public.notifications;

DROP POLICY IF EXISTS "notif_own"
  ON public.notifications;

CREATE POLICY "notifications_select_own"
ON public.notifications
FOR SELECT
USING (auth.uid() = id);

CREATE POLICY "notifications_update_own"
ON public.notifications
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = id);

CREATE POLICY "notifications_delete_own"
ON public.notifications
FOR DELETE
USING (auth.uid() = id);

-- ------------------------------------------------------------
-- 9. Compteur notifications non lues
-- ------------------------------------------------------------

DROP VIEW IF EXISTS public.notification_unread_counts;

CREATE VIEW public.notification_unread_counts AS
SELECT
  user_id,
  COUNT(*)::BIGINT AS unread_count
FROM public.notifications
WHERE read = false
GROUP BY user_id;

-- ------------------------------------------------------------
-- 10. Notification automatique lors d'un follow
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_follow_notification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN

  IF TG_OP = 'INSERT' THEN

    INSERT INTO public.notifications (
      user_id,
      actor_id,
      type,
      message,
      source_id
    )
    VALUES (
      NEW.followed_id,
      NEW.follower_id,
      'follow',
      'a commencé à vous suivre',
      NEW.follower_id
    );

  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_follow_created
ON public.follows;

CREATE TRIGGER on_follow_created
AFTER INSERT ON public.follows
FOR EACH ROW
EXECUTE FUNCTION public.create_follow_notification();

-- ------------------------------------------------------------
-- 11. Realtime
-- ------------------------------------------------------------

ALTER TABLE public.notifications
REPLICA IDENTITY FULL;

DO $$
BEGIN

  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'notifications'
  ) THEN

    ALTER PUBLICATION supabase_realtime
      ADD TABLE public.notifications;

  END IF;

END $$;

COMMIT;


-- ============================================================
-- SOURCE: 0041_stable_user_accounts.sql
-- ============================================================
-- BAARO — comptes utilisateurs stables et profils persistants
-- Migration historique rendue compatible avec l'identité canonique introduite par 038.
-- Aucun nouvel endpoint API.

alter table public.profiles
  add column if not exists updated_at timestamptz not null default now();

alter table public.profiles
  add column if not exists last_seen_at timestamptz;

alter table public.profiles
  add column if not exists phone text;

-- Création automatique du profil lors de la création d'un compte Supabase.
-- Cela évite les comptes authentifiés sans ligne profiles.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
  v_handle text;
  v_flag text;
  v_bio text;
begin
  v_name := nullif(left(coalesce(
    new.raw_user_meta_data->>'display_name',
    split_part(coalesce(new.email, 'membre'), '@', 1),
    'Membre BAARO'
  ), 60), '');

  v_handle := nullif(left(coalesce(
    new.raw_user_meta_data->>'handle',
    '@user_' || left(replace(new.id::text, '-', ''), 12)
  ), 40), '');

  if left(v_handle, 1) <> '@' then
    v_handle := '@' || v_handle;
  end if;

  v_flag := coalesce(nullif(new.raw_user_meta_data->>'flag', ''), '🌍');
  v_bio := left(coalesce(new.raw_user_meta_data->>'bio', ''), 1000);

  begin
    insert into public.profiles (id, display_name, handle, flag, bio, updated_at)
    values (new.id, v_name, v_handle, v_flag, v_bio, now())
    on conflict (id) do nothing;
  exception when unique_violation then
    insert into public.profiles (id, display_name, handle, flag, bio, updated_at)
    values (
      new.id, v_name,
      '@user_' || left(replace(new.id::text, '-', ''), 12),
      v_flag, v_bio, now()
    )
    on conflict (id) do nothing;
  end;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Mise à jour fiable de la date de modification du profil.
create or replace function public.touch_profile_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function public.touch_profile_updated_at();

create index if not exists idx_profiles_updated_at on public.profiles(updated_at desc);
create index if not exists idx_profiles_last_seen_at on public.profiles(last_seen_at desc);

-- Persistance d'un compte invité: les sessions sont conservées côté client
-- par Supabase. La conversion en compte permanent continue d'utiliser
-- supabase.auth.updateUser({email,password}) depuis Settings.


-- ============================================================
-- SOURCE: 0042_fix_friends_identity.sql
-- ============================================================
-- BAARO 045: Correction fonction get_user_friends
-- Exécuter dans Supabase > SQL Editor

-- 1. S'assurer que la colonne s'appelle followed_id (pas following_id)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'follows' 
    AND column_name = 'following_id'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'follows' 
    AND column_name = 'followed_id'
  ) THEN
    ALTER TABLE public.follows RENAME COLUMN following_id TO followed_id;
  END IF;
  
  ALTER TABLE public.follows 
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'accepted',
  ADD COLUMN IF NOT EXISTS is_friend BOOLEAN DEFAULT false;
END $$;

-- 2. Supprimer les anciennes fonctions
DROP FUNCTION IF EXISTS public.get_user_friends(UUID);
DROP FUNCTION IF EXISTS public.get_user_friends(user_id_param UUID);

-- 3. Créer la fonction avec le bon paramètre (id, pas user_id)
CREATE OR REPLACE FUNCTION public.get_user_friends(user_id UUID)
RETURNS TABLE (friend_id UUID) AS $$
BEGIN
  RETURN QUERY
  SELECT DISTINCT f1.followed_id
  FROM public.follows f1
  INNER JOIN public.follows f2 
    ON f1.followed_id = f2.follower_id 
    AND f1.follower_id = f2.followed_id
  WHERE f1.follower_id = user_id
    AND (f1.status = 'accepted' OR f1.status IS NULL)
    AND (f1.is_friend = true OR f1.is_friend IS NULL);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;

-- 4. Index de performance
CREATE INDEX IF NOT EXISTS idx_follows_reciprocal 
ON public.follows(follower_id, followed_id) 
WHERE status = 'accepted' OR status IS NULL;


-- ============================================================
-- SOURCE: 0043_systeme_abonnement_et_amis.sql
-- ============================================================
-- ============================================================
-- BAARO — 046 Friend System
-- Abonnements + demandes d'amis
--
-- IMPORTANT :
-- - Ne supprime aucune donnée existante.
-- - Conserve follower_id / followed_id.
-- - Compatible avec le système actuel de follows.
-- ============================================================

BEGIN;

-- ============================================================
-- 1. Vérification de la table follows
-- ============================================================

CREATE TABLE IF NOT EXISTS public.follows (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    follower_id uuid NOT NULL,
    created_at timestamptz DEFAULT now(),
    followed_id uuid NOT NULL,
    status text NOT NULL DEFAULT 'accepted',
    is_friend boolean NOT NULL DEFAULT false
);

-- ============================================================
-- 2. Colonnes manquantes
-- ============================================================

ALTER TABLE public.follows
    ADD COLUMN IF NOT EXISTS status text;

ALTER TABLE public.follows
    ADD COLUMN IF NOT EXISTS is_friend boolean;

ALTER TABLE public.follows
    ADD COLUMN IF NOT EXISTS created_at timestamptz;

-- Valeurs par défaut pour les anciennes lignes
UPDATE public.follows
SET status = 'accepted'
WHERE status IS NULL;

UPDATE public.follows
SET is_friend = false
WHERE is_friend IS NULL;

UPDATE public.follows
SET created_at = now()
WHERE created_at IS NULL;

ALTER TABLE public.follows
    ALTER COLUMN status SET DEFAULT 'accepted';

ALTER TABLE public.follows
    ALTER COLUMN status SET NOT NULL;

ALTER TABLE public.follows
    ALTER COLUMN is_friend SET DEFAULT false;

ALTER TABLE public.follows
    ALTER COLUMN is_friend SET NOT NULL;

ALTER TABLE public.follows
    ALTER COLUMN created_at SET DEFAULT now();

-- ============================================================
-- 3. Contraintes sur status
-- ============================================================

ALTER TABLE public.follows
DROP CONSTRAINT IF EXISTS follows_status_check;

ALTER TABLE public.follows
ADD CONSTRAINT follows_status_check
CHECK (
    status IN ('pending', 'accepted', 'rejected')
);

-- ============================================================
-- 4. Empêcher de se suivre soi-même
-- ============================================================

ALTER TABLE public.follows
DROP CONSTRAINT IF EXISTS follows_no_self;

ALTER TABLE public.follows
ADD CONSTRAINT follows_no_self
CHECK (follower_id <> followed_id);

-- ============================================================
-- 5. Un seul lien A → B
-- ============================================================

CREATE UNIQUE INDEX IF NOT EXISTS uq_follows_user_pair
ON public.follows (follower_id, followed_id);

-- ============================================================
-- 6. Index pour les abonnements
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_follows_follower
ON public.follows (follower_id);

CREATE INDEX IF NOT EXISTS idx_follows_followed
ON public.follows (followed_id);

CREATE INDEX IF NOT EXISTS idx_follows_follower_status
ON public.follows (follower_id, status);

CREATE INDEX IF NOT EXISTS idx_follows_followed_status
ON public.follows (followed_id, status);

CREATE INDEX IF NOT EXISTS idx_follows_friends
ON public.follows (follower_id, followed_id)
WHERE is_friend = true
  AND status = 'accepted';

-- ============================================================
-- 7. RLS
-- ============================================================

ALTER TABLE public.follows ENABLE ROW LEVEL SECURITY;

-- Lecture publique des relations
DROP POLICY IF EXISTS follows_select_public ON public.follows;

CREATE POLICY follows_select_public
ON public.follows
FOR SELECT
USING (true);

-- Création d'un abonnement / demande par l'utilisateur
DROP POLICY IF EXISTS follows_insert_own ON public.follows;

CREATE POLICY follows_insert_own
ON public.follows
FOR INSERT
WITH CHECK (
    auth.uid() = follower_id
);

-- Suppression de son propre abonnement
DROP POLICY IF EXISTS follows_delete_own ON public.follows;

CREATE POLICY follows_delete_own
ON public.follows
FOR DELETE
USING (
    auth.uid() = follower_id
);

-- Modification de sa propre relation
DROP POLICY IF EXISTS follows_update_own ON public.follows;

CREATE POLICY follows_update_own
ON public.follows
FOR UPDATE
USING (
    auth.uid() = follower_id
)
WITH CHECK (
    auth.uid() = follower_id
);

-- Le destinataire peut accepter/refuser une demande d'ami
DROP POLICY IF EXISTS follows_request_receiver ON public.follows;

CREATE POLICY follows_request_receiver
ON public.follows
FOR UPDATE
USING (
    auth.uid() = followed_id
    AND status = 'pending'
    AND is_friend = true
)
WITH CHECK (
    auth.uid() = followed_id
    AND follower_id <> followed_id
);

-- ============================================================
-- 8. Fonction : envoyer une demande d'ami
-- ============================================================

CREATE OR REPLACE FUNCTION public.send_friend_request(
    p_target uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
    v_user uuid := auth.uid();
BEGIN
    IF v_user IS NULL THEN
        RAISE EXCEPTION 'NOT_AUTHENTICATED';
    END IF;

    IF p_target IS NULL THEN
        RAISE EXCEPTION 'INVALID_TARGET';
    END IF;

    IF v_user = p_target THEN
        RAISE EXCEPTION 'CANNOT_FRIEND_SELF';
    END IF;

    INSERT INTO public.follows (
        follower_id,
        followed_id,
        status,
        is_friend
    )
    VALUES (
        v_user,
        p_target,
        'pending',
        true
    )
    ON CONFLICT (follower_id, followed_id)
    DO UPDATE SET
        status = 'pending',
        is_friend = true;

    RETURN true;
END;
$function$;

-- ============================================================
-- 9. Fonction : accepter une demande d'ami
-- ============================================================

CREATE OR REPLACE FUNCTION public.accept_friend_request(
    p_follow_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
    v_user uuid := auth.uid();
    v_follower uuid;
BEGIN
    SELECT follower_id
    INTO v_follower
    FROM public.follows
    WHERE id = p_follow_id
      AND followed_id = v_user
      AND status = 'pending'
      AND is_friend = true
    FOR UPDATE;

    IF v_follower IS NULL THEN
        RAISE EXCEPTION 'FRIEND_REQUEST_NOT_FOUND';
    END IF;

    UPDATE public.follows
    SET
        status = 'accepted',
        is_friend = true
    WHERE id = p_follow_id;

    -- Crée également la relation inverse.
    INSERT INTO public.follows (
        follower_id,
        followed_id,
        status,
        is_friend
    )
    VALUES (
        v_user,
        v_follower,
        'accepted',
        true
    )
    ON CONFLICT (follower_id, followed_id)
    DO UPDATE SET
        status = 'accepted',
        is_friend = true;

    RETURN true;
END;
$function$;

-- ============================================================
-- 10. Fonction : refuser une demande
-- ============================================================

CREATE OR REPLACE FUNCTION public.reject_friend_request(
    p_follow_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
    UPDATE public.follows
    SET
        status = 'rejected',
        is_friend = false
    WHERE id = p_follow_id
      AND followed_id = auth.uid()
      AND status = 'pending'
      AND is_friend = true;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'FRIEND_REQUEST_NOT_FOUND';
    END IF;

    RETURN true;
END;
$function$;

-- ============================================================
-- 11. Fonction : supprimer un ami
-- ============================================================

CREATE OR REPLACE FUNCTION public.remove_friend(
    p_user uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
    v_user uuid := auth.uid();
BEGIN
    IF v_user IS NULL THEN
        RAISE EXCEPTION 'NOT_AUTHENTICATED';
    END IF;

    DELETE FROM public.follows
    WHERE (
        follower_id = v_user
        AND followed_id = p_user
    )
    OR (
        follower_id = p_user
        AND followed_id = v_user
    )
    AND is_friend = true;

    RETURN true;
END;
$function$;

-- ============================================================
-- 12. Fonction : obtenir les amis
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_user_friends(
    p_user_id uuid
)
RETURNS TABLE (
    friend_id uuid
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
    SELECT DISTINCT
        f1.followed_id AS friend_id
    FROM public.follows f1
    INNER JOIN public.follows f2
        ON f1.follower_id = f2.followed_id
       AND f1.followed_id = f2.follower_id
    WHERE f1.follower_id = p_user_id
      AND f1.status = 'accepted'
      AND f1.is_friend = true
      AND f2.status = 'accepted'
      AND f2.is_friend = true;
$function$;

-- ============================================================
-- 13. Permissions RPC
-- ============================================================

GRANT EXECUTE ON FUNCTION public.send_friend_request(uuid)
TO authenticated;

GRANT EXECUTE ON FUNCTION public.accept_friend_request(uuid)
TO authenticated;

GRANT EXECUTE ON FUNCTION public.reject_friend_request(uuid)
TO authenticated;

GRANT EXECUTE ON FUNCTION public.remove_friend(uuid)
TO authenticated;

GRANT EXECUTE ON FUNCTION public.get_user_friends(uuid)
TO authenticated;

COMMIT;


-- ============================================================
-- SOURCE: 0044_add_messaging_improvements.sql
-- ============================================================
-- ============================================================
-- BAARO — Amélioration messagerie (sans régression)
-- À exécuter dans Supabase > SQL Editor, après les scripts existants
-- ============================================================

-- 1) Statut en ligne / "vu"
alter table profiles
  add column if not exists last_seen_at timestamptz;

alter table messages
  add column if not exists read_at timestamptz;

-- 2) Modification / suppression de message (soft delete)
alter table messages
  add column if not exists edited_at timestamptz;

alter table messages
  add column if not exists deleted_at timestamptz;

-- RLS : autoriser l'expéditeur à modifier/supprimer (soft) son propre message
drop policy if exists "messages_update_own" on messages;
create policy "messages_update_own"
  on messages for update
  using (auth.uid() = sender_id)
  with check (auth.uid() = sender_id);

-- RLS : autoriser un utilisateur à mettre à jour read_at sur les messages
-- qu'il reçoit (pour marquer "vu")
drop policy if exists "messages_mark_read" on messages;
create policy "messages_mark_read"
  on messages for update
  using (auth.uid() = recipient_id)
  with check (auth.uid() = recipient_id);

-- RLS : autoriser chaque utilisateur à mettre à jour son propre last_seen_at
drop policy if exists "profiles_update_last_seen" on profiles;
create policy "profiles_update_last_seen"
  on profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- 3) Réactions sur les messages
create table if not exists message_reactions (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references messages(id) on delete cascade,
  conversation_id uuid not null references conversations(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  emoji text not null,
  created_at timestamptz not null default now(),
  unique (message_id, user_id, emoji)
);

alter table message_reactions enable row level security;

drop policy if exists "reactions_select_participants" on message_reactions;
create policy "reactions_select_participants"
  on message_reactions for select
  using (
    exists (
      select 1 from conversations c
      where c.id = message_reactions.conversation_id
        and (c.user1_id = auth.uid() or c.user2_id = auth.uid())
    )
  );

drop policy if exists "reactions_insert_own" on message_reactions;
create policy "reactions_insert_own"
  on message_reactions for insert
  with check (auth.uid() = id);

drop policy if exists "reactions_delete_own" on message_reactions;
create policy "reactions_delete_own"
  on message_reactions for delete
  using (auth.uid() = id);

-- 4) Activer le Realtime sur les nouvelles tables / colonnes suivies
-- (Database > Replication dans Supabase, ou via SQL si la publication existe déjà) :
alter publication supabase_realtime add table message_reactions;
alter publication supabase_realtime add table profiles;

-- NB: la table "messages" est déjà en Realtime (utilisée pour les INSERT) ;
-- ce script ne fait qu'ajouter les UPDATE nécessaires aux accusés de
-- lecture, à l'édition et à la suppression, qui passent par le même canal.


-- ============================================================
-- SOURCE: 0045_device_accounts_id_only.sql
-- ============================================================
-- BAARO 047: device_accounts — identité = id (auth.users.id), plus de user_id
-- Clés étrangères métier (author_id, sender_id, etc.) non concernées.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'device_accounts'
      AND column_name = 'user_id'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'device_accounts'
      AND column_name = 'id'
  ) THEN
    ALTER TABLE public.device_accounts RENAME COLUMN user_id TO id;
  END IF;
END $$;

-- PK (device_id, id)
DO $$
BEGIN
  IF to_regclass('public.device_accounts') IS NOT NULL THEN
    ALTER TABLE public.device_accounts DROP CONSTRAINT IF EXISTS device_accounts_pkey;
    ALTER TABLE public.device_accounts
      ALTER COLUMN id SET NOT NULL,
      ALTER COLUMN device_id SET NOT NULL;
    BEGIN
      ALTER TABLE public.device_accounts
        ADD PRIMARY KEY (device_id, id);
    EXCEPTION WHEN OTHERS THEN
      -- déjà en place
      NULL;
    END;

    ALTER TABLE public.device_accounts DROP CONSTRAINT IF EXISTS device_accounts_id_fkey;
    ALTER TABLE public.device_accounts
      ADD CONSTRAINT device_accounts_id_fkey
      FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;

    COMMENT ON COLUMN public.device_accounts.id IS
      'Identifiant utilisateur = auth.users.id (plus de user_id)';
  END IF;
END $$;


-- ============================================================
-- SOURCE: 0046_join_debate_code_case.sql
-- ============================================================
-- Codes d'invitation : comparaison insensible à la casse
create or replace function public.join_debate_by_code(p_code text)
returns public.debate_rooms
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.debate_rooms;
  v_count int;
begin
  select * into v_room from public.debate_rooms
    where lower(trim(invite_code)) = lower(trim(p_code))
      and status in ('active', 'paused');

  if not found then
    raise exception 'Aucun live actif avec ce code.';
  end if;

  select count(*) into v_count from public.debate_participants
    where room_id = v_room.id and (left_at is null);

  if v_count >= coalesce(v_room.max_participants, 12) then
    raise exception 'Ce live est complet.';
  end if;

  insert into public.debate_participants (room_id, user_id, joined_at, left_at)
  values (v_room.id, auth.uid(), now(), null)
  on conflict (room_id, user_id) do update set left_at = null, joined_at = now();

  return v_room;
end;
$$;

grant execute on function public.join_debate_by_code(text) to authenticated, anon;


-- ============================================================
-- SOURCE: 0047_fix_phone_auth_id_only.sql
-- ============================================================
-- ============================================================
-- BAARO 049
-- Correction définitive de l'authentification téléphone
--
-- Architecture BAARO :
--
--   auth.users.id
--          =
--      profiles.id
--
-- Aucun autre identifiant technique de compte n'est créé ici.
-- ============================================================


-- ============================================================
-- 1. Colonnes nécessaires dans profiles
-- ============================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS phone text;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS bio text;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS flag text;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS created_at timestamptz
  DEFAULT now();

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS updated_at timestamptz
  DEFAULT now();


-- ============================================================
-- 2. Identifiant canonique
-- ============================================================

ALTER TABLE public.profiles
  ALTER COLUMN id SET NOT NULL;


-- ============================================================
-- 3. Relation profiles -> auth.users
-- ============================================================

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_id_fkey;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_id_fkey
  FOREIGN KEY (id)
  REFERENCES auth.users(id)
  ON DELETE CASCADE;


-- ============================================================
-- 4. Réparer les anciens profils sans handle
-- ============================================================

UPDATE public.profiles
SET
  handle =
    '@user_' ||
    substr(
      replace(id::text, '-', ''),
      1,
      12
    )
WHERE handle IS NULL
   OR length(trim(handle)) = 0;


-- ============================================================
-- 5. Normaliser les handles
-- ============================================================

UPDATE public.profiles
SET handle = lower(trim(handle))
WHERE handle IS NOT NULL
  AND handle <> lower(trim(handle));


UPDATE public.profiles
SET handle = '@' || handle
WHERE handle IS NOT NULL
  AND left(handle, 1) <> '@';


-- ============================================================
-- 6. Index unique des handles
-- ============================================================

DROP INDEX IF EXISTS public.profiles_handle_unique;

CREATE UNIQUE INDEX IF NOT EXISTS
  profiles_handle_unique
ON public.profiles (lower(handle));


-- ============================================================
-- 7. handle obligatoire
-- ============================================================

ALTER TABLE public.profiles
  ALTER COLUMN handle SET NOT NULL;


-- ============================================================
-- 8. Fonction automatique de création du profil
--
-- IMPORTANT :
-- l'identifiant utilisé est NEW.id.
-- ============================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name text;
  v_handle text;
  v_fallback_handle text;
  v_flag text;
  v_bio text;
  v_phone text;
BEGIN

  -- ----------------------------------------------------------
  -- Nom affiché
  -- ----------------------------------------------------------

  v_name := left(
    coalesce(
      nullif(
        new.raw_user_meta_data ->> 'display_name',
        ''
      ),

      nullif(
        new.raw_user_meta_data ->> 'full_name',
        ''
      ),

      nullif(
        new.raw_user_meta_data ->> 'name',
        ''
      ),

      nullif(
        split_part(
          coalesce(new.email, ''),
          '@',
          1
        ),
        ''
      ),

      nullif(new.phone, ''),

      'Membre BAARO'
    ),
    80
  );


  -- ----------------------------------------------------------
  -- Téléphone
  -- ----------------------------------------------------------

  v_phone := nullif(
    trim(coalesce(new.phone, '')),
    ''
  );


  -- ----------------------------------------------------------
  -- Drapeau
  -- ----------------------------------------------------------

  v_flag := coalesce(
    nullif(
      new.raw_user_meta_data ->> 'flag',
      ''
    ),
    '🌍'
  );


  -- ----------------------------------------------------------
  -- Biographie
  -- ----------------------------------------------------------

  v_bio := coalesce(
    new.raw_user_meta_data ->> 'bio',
    ''
  );


  -- ----------------------------------------------------------
  -- Handle demandé par les métadonnées
  -- ----------------------------------------------------------

  v_handle := lower(
    trim(
      coalesce(
        nullif(
          new.raw_user_meta_data ->> 'handle',
          ''
        ),

        '@user_' ||
        substr(
          replace(new.id::text, '-', ''),
          1,
          12
        )
      )
    )
  );


  -- Ajouter @ si nécessaire
  IF left(v_handle, 1) <> '@' THEN
    v_handle := '@' || v_handle;
  END IF;


  -- Limiter la longueur
  v_handle := left(v_handle, 40);


  -- ----------------------------------------------------------
  -- Handle garanti unique
  -- ----------------------------------------------------------

  v_fallback_handle :=
    '@user_' ||
    substr(
      replace(new.id::text, '-', ''),
      1,
      12
    );


  -- ----------------------------------------------------------
  -- Création du profil
  -- ----------------------------------------------------------

  BEGIN

    INSERT INTO public.profiles (
      id,
      display_name,
      handle,
      flag,
      bio,
      phone,
      created_at,
      updated_at
    )

    VALUES (
      new.id,
      v_name,
      v_handle,
      v_flag,
      v_bio,
      v_phone,
      now(),
      now()
    )

    ON CONFLICT (id)
    DO UPDATE SET
      phone =
        coalesce(
          excluded.phone,
          public.profiles.phone
        ),

      display_name =
        coalesce(
          nullif(
            excluded.display_name,
            ''
          ),
          public.profiles.display_name
        ),

      flag =
        coalesce(
          nullif(
            excluded.flag,
            ''
          ),
          public.profiles.flag
        ),

      updated_at = now();


  EXCEPTION
    WHEN unique_violation THEN

      -- Le handle demandé existe déjà.
      -- Utilisation d'un handle déterministe basé sur id.

      INSERT INTO public.profiles (
        id,
        display_name,
        handle,
        flag,
        bio,
        phone,
        created_at,
        updated_at
      )

      VALUES (
        new.id,
        v_name,
        v_fallback_handle,
        v_flag,
        v_bio,
        v_phone,
        now(),
        now()
      )

      ON CONFLICT (id)
      DO UPDATE SET
        phone =
          coalesce(
            excluded.phone,
            public.profiles.phone
          ),

        updated_at = now();

  END;


  RETURN new;

END;
$$;


-- ============================================================
-- 9. Recréer le trigger auth
-- ============================================================

DROP TRIGGER IF EXISTS
  on_auth_user_created
ON auth.users;


CREATE TRIGGER
  on_auth_user_created

AFTER INSERT ON auth.users

FOR EACH ROW

EXECUTE FUNCTION
  public.handle_new_user();


-- ============================================================
-- 10. Réparer les comptes déjà créés
-- ============================================================

INSERT INTO public.profiles (
  id,
  display_name,
  handle,
  flag,
  bio,
  phone,
  created_at,
  updated_at
)

SELECT
  u.id,

  left(
    coalesce(
      nullif(
        u.raw_user_meta_data ->> 'display_name',
        ''
      ),

      nullif(
        u.raw_user_meta_data ->> 'full_name',
        ''
      ),

      nullif(
        u.raw_user_meta_data ->> 'name',
        ''
      ),

      nullif(
        split_part(
          coalesce(u.email, ''),
          '@',
          1
        ),
        ''
      ),

      nullif(u.phone, ''),

      'Membre BAARO'
    ),
    80
  ),

  '@user_' ||
  substr(
    replace(u.id::text, '-', ''),
    1,
    12
  ),

  '🌍',

  '',

  nullif(
    trim(coalesce(u.phone, '')),
    ''
  ),

  now(),

  now()

FROM auth.users AS u

LEFT JOIN public.profiles AS p
  ON p.id = u.id

WHERE p.id IS NULL

ON CONFLICT (id) DO NOTHING;


-- ============================================================
-- 11. Trigger updated_at
-- ============================================================

CREATE OR REPLACE FUNCTION
  public.touch_profile_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN

  NEW.updated_at := now();

  RETURN NEW;

END;
$$;


DROP TRIGGER IF EXISTS
  profiles_touch_updated_at
ON public.profiles;


CREATE TRIGGER
  profiles_touch_updated_at

BEFORE UPDATE ON public.profiles

FOR EACH ROW

EXECUTE FUNCTION
  public.touch_profile_updated_at();


-- ============================================================
-- 12. Index téléphone
-- ============================================================

CREATE INDEX IF NOT EXISTS
  idx_profiles_phone
ON public.profiles(phone);


-- ============================================================
-- 13. Index updated_at
-- ============================================================

CREATE INDEX IF NOT EXISTS
  idx_profiles_updated_at
ON public.profiles(updated_at DESC);


-- ============================================================
-- 14. Commentaire d'architecture
-- ============================================================

COMMENT ON COLUMN public.profiles.id IS
  'Identifiant unique du compte BAARO = auth.users.id';


-- ============================================================
-- SOURCE: 0048_repair_comment_counters.sql
-- ============================================================
-- ============================================================
-- BAARO
-- Réparation définitive des compteurs de commentaires
-- Feed + Vidéos
--
-- Ne modifie PAS le modèle d'identité.
-- Ne modifie PAS follows / friends / notifications.
-- Migration idempotente.
-- ============================================================


-- ============================================================
-- 1. POSTS : compteur exact des commentaires
-- ============================================================

create or replace function public.baaro_sync_post_comment_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_post_id uuid;
begin
  target_post_id :=
    case
      when tg_op = 'DELETE' then old.post_id
      else new.post_id
    end;

  update public.posts p
  set comments_count = (
    select count(*)
    from public.comments c
    where c.post_id = target_post_id
  )
  where p.id = target_post_id;

  return case
    when tg_op = 'DELETE' then old
    else new
  end;
end;
$$;


drop trigger if exists trg_baaro_post_comment_count
on public.comments;


create trigger trg_baaro_post_comment_count
after insert or delete
on public.comments
for each row
execute function public.baaro_sync_post_comment_count();


-- ============================================================
-- 2. VIDEOS : compteur exact des commentaires
-- ============================================================

create or replace function public.baaro_sync_video_comment_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_video_id uuid;
begin
  target_video_id :=
    case
      when tg_op = 'DELETE' then old.video_id
      else new.video_id
    end;

  update public.videos v
  set comments_count = (
    select count(*)
    from public.video_comments c
    where c.video_id = target_video_id
  )
  where v.id = target_video_id;

  return case
    when tg_op = 'DELETE' then old
    else new
  end;
end;
$$;


drop trigger if exists trg_baaro_video_comment_count
on public.video_comments;


create trigger trg_baaro_video_comment_count
after insert or delete
on public.video_comments
for each row
execute function public.baaro_sync_video_comment_count();


-- ============================================================
-- 3. RECALCUL INITIAL DES COMPTEURS POSTS
-- ============================================================

update public.posts p
set comments_count = coalesce(
  (
    select count(*)
    from public.comments c
    where c.post_id = p.id
  ),
  0
);


-- ============================================================
-- 4. RECALCUL INITIAL DES COMPTEURS VIDÉOS
-- ============================================================

update public.videos v
set comments_count = coalesce(
  (
    select count(*)
    from public.video_comments c
    where c.video_id = v.id
  ),
  0
);


-- ============================================================
-- FIN
-- ============================================================


-- ============================================================
-- SOURCE: 0049_repair_post_like_counters.sql
-- ============================================================
-- ============================================================
-- BAARO
-- Réparation définitive du compteur de likes des publications
--
-- Source de vérité :
--   public.post_likes(post_id, user_id)
--
-- Compteur :
--   public.posts.likes_count
--
-- Ne modifie PAS :
--   - identité
--   - profiles
--   - follows / friends
--   - notifications
--   - commentaires
-- ============================================================

-- ------------------------------------------------------------
-- 1. Garantir l'existence du compteur
-- ------------------------------------------------------------

alter table public.posts
add column if not exists likes_count integer not null default 0;


-- ------------------------------------------------------------
-- 2. Fonction de synchronisation
-- ------------------------------------------------------------

create or replace function public.baaro_sync_post_like_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_post_id uuid;
begin

  target_post_id :=
    case
      when tg_op = 'DELETE' then old.post_id
      else new.post_id
    end;

  update public.posts
  set likes_count = (
    select count(*)
    from public.post_likes
    where post_id = target_post_id
  )
  where id = target_post_id;

  return case
    when tg_op = 'DELETE' then old
    else new
  end;

end;
$$;


-- ------------------------------------------------------------
-- 3. Remplacer proprement l'ancien trigger éventuel
-- ------------------------------------------------------------

drop trigger if exists trg_baaro_post_like_count
on public.post_likes;


-- ------------------------------------------------------------
-- 4. Trigger INSERT / DELETE
-- ------------------------------------------------------------

create trigger trg_baaro_post_like_count
after insert or delete
on public.post_likes
for each row
execute function public.baaro_sync_post_like_count();


-- ------------------------------------------------------------
-- 5. Recalcul initial de TOUS les compteurs
-- ------------------------------------------------------------

update public.posts p
set likes_count = (
  select count(*)
  from public.post_likes l
  where l.post_id = p.id
);


-- ------------------------------------------------------------
-- 6. Sécurité : empêcher un compteur négatif
-- ------------------------------------------------------------

update public.posts
set likes_count = 0
where likes_count < 0;


-- ============================================================
-- SOURCE: 0050_identity_profile_final_hardening.sql
-- ============================================================
-- BAARO 052 — identité/profil final hardening
-- Règle unique : auth.users.id = profiles.id
-- Cette migration est idempotente et répare aussi les comptes créés avant le
-- trigger canonique.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS last_seen_at timestamptz,
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS bio text,
  ADD COLUMN IF NOT EXISTS flag text,
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.profiles
  ALTER COLUMN id SET NOT NULL;

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_id_fkey;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_id_fkey
  FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- Toute ligne de profil doit avoir un handle déterministe avant l'index unique.
UPDATE public.profiles
SET handle = '@user_' || substr(replace(id::text, '-', ''), 1, 12)
WHERE handle IS NULL OR length(trim(handle)) = 0;

UPDATE public.profiles
SET handle = lower(trim(handle))
WHERE handle IS NOT NULL AND handle <> lower(trim(handle));

UPDATE public.profiles
SET handle = '@' || handle
WHERE handle IS NOT NULL AND left(handle, 1) <> '@';

DROP INDEX IF EXISTS public.profiles_handle_unique;
CREATE UNIQUE INDEX profiles_handle_unique
  ON public.profiles (lower(handle));

ALTER TABLE public.profiles
  ALTER COLUMN handle SET NOT NULL;

-- Trigger unique de création de profil : jamais de profiles.user_id.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name text;
  v_handle text;
  v_fallback text;
  v_flag text;
  v_bio text;
BEGIN
  v_name := left(coalesce(
    nullif(new.raw_user_meta_data ->> 'display_name', ''),
    nullif(new.raw_user_meta_data ->> 'full_name', ''),
    nullif(new.raw_user_meta_data ->> 'name', ''),
    nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
    nullif(new.phone, ''),
    'Membre BAARO'
  ), 80);

  v_handle := lower(trim(coalesce(
    nullif(new.raw_user_meta_data ->> 'handle', ''),
    '@user_' || substr(replace(new.id::text, '-', ''), 1, 12)
  )));
  IF left(v_handle, 1) <> '@' THEN v_handle := '@' || v_handle; END IF;
  v_handle := left(v_handle, 40);
  v_fallback := '@user_' || substr(replace(new.id::text, '-', ''), 1, 12);
  v_flag := coalesce(nullif(new.raw_user_meta_data ->> 'flag', ''), '🌍');
  v_bio := left(coalesce(new.raw_user_meta_data ->> 'bio', ''), 1000);

  BEGIN
    INSERT INTO public.profiles (id, display_name, handle, flag, bio, created_at, updated_at, phone)
    VALUES (new.id, v_name, v_handle, v_flag, v_bio, now(), now(), nullif(new.phone, ''))
    ON CONFLICT (id) DO NOTHING;
  EXCEPTION WHEN unique_violation THEN
    INSERT INTO public.profiles (id, display_name, handle, flag, bio, created_at, updated_at, phone)
    VALUES (new.id, v_name, v_fallback, v_flag, v_bio, now(), now(), nullif(new.phone, ''))
    ON CONFLICT (id) DO NOTHING;
  END;

  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE OR REPLACE FUNCTION public.touch_profile_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_touch_updated_at ON public.profiles;
CREATE TRIGGER profiles_touch_updated_at
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.touch_profile_updated_at();

-- Réparer les comptes sans profil, sans écraser les profils existants.
INSERT INTO public.profiles (id, display_name, handle, flag, bio, created_at, updated_at, phone)
SELECT
  u.id,
  left(coalesce(
    nullif(u.raw_user_meta_data ->> 'display_name', ''),
    nullif(u.raw_user_meta_data ->> 'full_name', ''),
    nullif(u.raw_user_meta_data ->> 'name', ''),
    nullif(split_part(coalesce(u.email, ''), '@', 1), ''),
    nullif(u.phone, ''),
    'Membre BAARO'
  ), 80),
  '@user_' || substr(replace(u.id::text, '-', ''), 1, 12),
  '🌍',
  '', now(), now(), nullif(u.phone, '')
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE p.id IS NULL
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_read" ON public.profiles;
CREATE POLICY "profiles_read" ON public.profiles
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "profiles_insert" ON public.profiles;
CREATE POLICY "profiles_insert" ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "profiles_update" ON public.profiles;
CREATE POLICY "profiles_update" ON public.profiles
  FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "profiles_delete" ON public.profiles;
CREATE POLICY "profiles_delete" ON public.profiles
  FOR DELETE USING (auth.uid() = id);

CREATE INDEX IF NOT EXISTS idx_profiles_updated_at
  ON public.profiles(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_profiles_last_seen_at
  ON public.profiles(last_seen_at DESC);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'user_id'
  ) THEN
    RAISE EXCEPTION 'BAARO identity violation: public.profiles.user_id still exists; profiles.id is canonical';
  END IF;
END $$;


-- ============================================================
-- SOURCE: 0051_baaro_community_final.sql
-- ============================================================
-- ============================================================
-- BAARO COMMUNAUTE — FINAL (invites + canaux style Telegram)
-- Pre-requis: script communaute v4 deja applique
-- (group_role, is_banned, tables groups/channels/group_members)
-- ============================================================

alter table public.channels drop constraint if exists channels_type_check;

alter table public.channels
  add constraint channels_type_check
  check (type in ('text', 'voice', 'announce'));

create table if not exists public.group_invites (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  code text not null,
  created_by uuid not null references auth.users(id) on delete cascade,
  max_uses int default 0,
  uses int not null default 0,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  unique (group_id, code)
);

create index if not exists idx_group_invites_code
  on public.group_invites (upper(code));

alter table public.group_invites enable row level security;

drop policy if exists invites_select on public.group_invites;
create policy invites_select on public.group_invites
  for select to authenticated
  using (public.group_role(group_id) in ('owner', 'admin'));

drop policy if exists invites_insert on public.group_invites;
create policy invites_insert on public.group_invites
  for insert to authenticated
  with check (
    created_by = auth.uid()
    and public.group_role(group_id) in ('owner', 'admin')
  );

drop policy if exists invites_delete on public.group_invites;
create policy invites_delete on public.group_invites
  for delete to authenticated
  using (public.group_role(group_id) in ('owner', 'admin'));

create or replace function public.can_post_in_channel(p_channel uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.channels c
    where c.id = p_channel
      and public.group_role(c.group_id) is not null
      and not public.is_banned(c.group_id, auth.uid())
      and (
        c.type in ('text', 'voice')
        or public.group_role(c.group_id) in ('owner', 'admin', 'moderator')
      )
  );
$$;

drop policy if exists messages_insert on public.channel_messages;
create policy messages_insert on public.channel_messages
  for insert to authenticated
  with check (
    sender_id = auth.uid()
    and public.can_post_in_channel(channel_id)
  );

create or replace function public.create_community_channel(
  p_group_id uuid,
  p_name text,
  p_type text default 'text',
  p_description text default null
)
returns public.channels
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
  v_type text;
  v_channel public.channels;
  v_role text := public.group_role(p_group_id);
begin
  if auth.uid() is null then
    raise exception 'Non authentifie';
  end if;

  if coalesce(v_role, '') not in ('owner', 'admin') then
    raise exception 'Seuls les admins peuvent creer un canal';
  end if;

  v_type := case
    when p_type in ('voice', 'announce') then p_type
    else 'text'
  end;

  v_name := lower(regexp_replace(trim(coalesce(p_name, '')), '\s+', '-', 'g'));
  v_name := regexp_replace(
    v_name,
    '[<>"''`&/\\?#%@:;,.!$^*()+=\[\]{}|~]',
    '',
    'g'
  );
  v_name := left(v_name, 40);

  if length(v_name) < 1 then
    raise exception 'Nom de canal invalide';
  end if;

  insert into public.channels (group_id, name, type, description)
  values (
    p_group_id,
    v_name,
    v_type,
    nullif(left(trim(coalesce(p_description, '')), 200), '')
  )
  returning * into v_channel;

  return v_channel;
end;
$$;

create or replace function public.create_group_invite(
  p_group uuid,
  p_max_uses int default 0,
  p_expires_hours int default null
)
returns public.group_invites
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_code text;
  v_row public.group_invites;
begin
  if v_uid is null then
    raise exception 'Non authentifie';
  end if;

  if public.group_role(p_group) not in ('owner', 'admin') then
    raise exception 'Seuls les admins peuvent creer une invitation';
  end if;

  v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));

  insert into public.group_invites (
    group_id, code, created_by, max_uses, expires_at
  )
  values (
    p_group,
    v_code,
    v_uid,
    greatest(coalesce(p_max_uses, 0), 0),
    case
      when p_expires_hours is null or p_expires_hours <= 0 then null
      else now() + (p_expires_hours || ' hours')::interval
    end
  )
  returning * into v_row;

  return v_row;
end;
$$;

create or replace function public.list_group_invites(p_group uuid)
returns setof public.group_invites
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.group_role(p_group) not in ('owner', 'admin') then
    raise exception 'Droits insuffisants';
  end if;

  return query
  select *
  from public.group_invites
  where group_id = p_group
  order by created_at desc;
end;
$$;

create or replace function public.revoke_group_invite(p_invite_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group uuid;
begin
  select group_id into v_group
  from public.group_invites
  where id = p_invite_id;

  if v_group is null then
    raise exception 'Invitation introuvable';
  end if;

  if public.group_role(v_group) not in ('owner', 'admin') then
    raise exception 'Droits insuffisants';
  end if;

  delete from public.group_invites where id = p_invite_id;
end;
$$;

create or replace function public.peek_group_invite(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inv public.group_invites;
  v_g public.groups;
  v_count int;
begin
  select * into v_inv
  from public.group_invites
  where upper(code) = upper(trim(p_code))
    and (expires_at is null or expires_at > now())
    and (coalesce(max_uses, 0) = 0 or coalesce(uses, 0) < max_uses);

  if not found then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;

  select * into v_g from public.groups where id = v_inv.group_id;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'group_gone');
  end if;

  select count(*)::int into v_count
  from public.group_members
  where group_id = v_g.id;

  return jsonb_build_object(
    'ok', true,
    'group_id', v_g.id,
    'name', v_g.name,
    'description', v_g.description,
    'is_public', coalesce(v_g.is_public, true),
    'member_count', v_count,
    'code', v_inv.code
  );
end;
$$;

-- Ancienne version (v4) retournait void — DROP obligatoire avant changement de type
drop function if exists public.join_community_group(uuid, text);
drop function if exists public.join_community_group(uuid);

create or replace function public.join_community_group(
  p_group uuid default null,
  p_code text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_group_id uuid;
  v_public boolean;
  v_inv public.group_invites;
begin
  if v_uid is null then
    raise exception 'Non authentifie';
  end if;

  -- Mode 1: code d'invitation
  if p_code is not null and length(trim(p_code)) > 0 then
    select * into v_inv
    from public.group_invites
    where upper(code) = upper(trim(p_code))
      and (expires_at is null or expires_at > now())
      and (coalesce(max_uses, 0) = 0 or coalesce(uses, 0) < max_uses)
    for update;

    if not found then
      raise exception 'Invitation invalide ou expiree';
    end if;

    v_group_id := v_inv.group_id;

    if public.is_banned(v_group_id, v_uid) then
      raise exception 'Acces refuse';
    end if;

    if public.group_role(v_group_id) is not null then
      return jsonb_build_object(
        'ok', true,
        'group_id', v_group_id,
        'already_member', true
      );
    end if;

    update public.group_invites
    set uses = coalesce(uses, 0) + 1
    where id = v_inv.id;

    insert into public.group_members (group_id, user_id, role)
    values (v_group_id, v_uid, 'member')
    on conflict do nothing;

    return jsonb_build_object(
      'ok', true,
      'group_id', v_group_id,
      'via', 'invite'
    );
  end if;

  -- Mode 2: groupe public
  if p_group is null then
    raise exception 'Groupe ou code requis';
  end if;

  v_group_id := p_group;

  if public.is_banned(v_group_id, v_uid) then
    raise exception 'Acces refuse';
  end if;

  if public.group_role(v_group_id) is not null then
    return jsonb_build_object(
      'ok', true,
      'group_id', v_group_id,
      'already_member', true
    );
  end if;

  select coalesce(is_public, true) into v_public
  from public.groups
  where id = v_group_id;

  if not found then
    raise exception 'Groupe introuvable';
  end if;

  if not v_public then
    raise exception 'Groupe prive : code d''invitation requis';
  end if;

  insert into public.group_members (group_id, user_id, role)
  values (v_group_id, v_uid, 'member')
  on conflict do nothing;

  return jsonb_build_object(
    'ok', true,
    'group_id', v_group_id,
    'via', 'public'
  );
end;
$$;

grant execute on function public.can_post_in_channel(uuid) to authenticated;
grant execute on function public.create_community_channel(uuid, text, text, text) to authenticated;
grant execute on function public.create_group_invite(uuid, int, int) to authenticated;
grant execute on function public.list_group_invites(uuid) to authenticated;
grant execute on function public.revoke_group_invite(uuid) to authenticated;
grant execute on function public.peek_group_invite(text) to authenticated;
grant execute on function public.join_community_group(uuid, text) to authenticated;

push_subscriptions
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  token text not null,
  platform text not null check (platform in ('web', 'ios', 'android')),
  created_at timestamptz default now(),
  unique (user_id, token)
);

alter table public.push_subscriptions enable row level security;

create policy push_sub_insert on public.push_subscriptions
  for insert to authenticated with check (user_id = auth.uid());

create policy push_sub_delete on public.push_subscriptions
  for delete to authenticated using (user_id = auth.uid());


-- ============================================================
-- SOURCE: 0052_baaro_fix_comments_likes.sql
-- ============================================================
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
  with check (auth.uid() = id);

create policy post_likes_delete on public.post_likes
  for delete to authenticated
  using (auth.uid() = id);

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


-- ============================================================
-- SOURCE: 0053_baaro_shop_global.sql
-- ============================================================
-- ============================================
-- BAARO migration 020 : shops + delivery
-- Exécuter après les migrations 001–019
-- Idempotent partiel (IF NOT EXISTS où possible)
-- ============================================

-- Boutiques
create table if not exists public.shops (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  description text,
  category text,
  country text not null,
  city text,
  latitude double precision,
  longitude double precision,
  logo_url text,
  is_active boolean not null default false,
  subscription_expires_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.shop_products (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  name text not null,
  description text,
  price numeric(12,2) not null,
  currency text not null default 'XOF',
  type text not null default 'produit' check (type in ('produit', 'service')),
  image_url text,
  is_available boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.shop_subscriptions (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  amount numeric(12,2) not null,
  currency text not null,
  was_premium_rate boolean not null,
  provider text not null check (provider in ('stripe', 'paypal', 'cinetpay', 'paydunya')),
  payment_ref text unique,
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'failed')),
  period_start timestamptz,
  period_end timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.shop_pricing (
  currency text primary key,
  amount_normal numeric(12,2) not null,
  amount_premium numeric(12,2) not null,
  updated_at timestamptz not null default now()
);

insert into public.shop_pricing (currency, amount_normal, amount_premium) values
  ('XOF', 5000, 2500),
  ('EUR', 8, 4),
  ('USD', 9, 4.5)
on conflict (currency) do nothing;

create index if not exists idx_shops_country_city on public.shops(country, city) where is_active;
create index if not exists idx_shop_products_shop on public.shop_products(shop_id);

alter table public.shops enable row level security;
alter table public.shop_products enable row level security;
alter table public.shop_subscriptions enable row level security;
alter table public.shop_pricing enable row level security;

-- Policies (drop + recreate pour idempotence soft)
drop policy if exists "shops_select" on public.shops;
create policy "shops_select" on public.shops
  for select using (is_active = true or owner_id = auth.uid());

drop policy if exists "shops_insert_owner" on public.shops;
create policy "shops_insert_owner" on public.shops
  for insert with check (owner_id = auth.uid());

drop policy if exists "shops_update_owner" on public.shops;
create policy "shops_update_owner" on public.shops
  for update using (owner_id = auth.uid());

drop policy if exists "products_select" on public.shop_products;
create policy "products_select" on public.shop_products
  for select using (
    exists (
      select 1 from public.shops
      where id = shop_products.shop_id and (is_active or owner_id = auth.uid())
    )
  );

drop policy if exists "products_write_owner" on public.shop_products;
create policy "products_write_owner" on public.shop_products
  for all using (
    exists (
      select 1 from public.shops
      where id = shop_products.shop_id and owner_id = auth.uid()
    )
  );

drop policy if exists "subscriptions_select_owner" on public.shop_subscriptions;
create policy "subscriptions_select_owner" on public.shop_subscriptions
  for select using (
    exists (
      select 1 from public.shops
      where id = shop_subscriptions.shop_id and owner_id = auth.uid()
    )
  );

-- Insert subscription : owner only
drop policy if exists "subscriptions_insert_owner" on public.shop_subscriptions;
create policy "subscriptions_insert_owner" on public.shop_subscriptions
  for insert with check (
    exists (
      select 1 from public.shops
      where id = shop_subscriptions.shop_id and owner_id = auth.uid()
    )
  );

drop policy if exists "pricing_select_public" on public.shop_pricing;
create policy "pricing_select_public" on public.shop_pricing
  for select using (true);

-- Activation (service_role only)
create or replace function public.activate_shop_subscription(
  p_shop_id uuid,
  p_payment_ref text,
  p_amount numeric,
  p_currency text,
  p_provider text,
  p_was_premium boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.shop_subscriptions
  set status = 'confirmed',
      period_start = now(),
      period_end = now() + interval '1 year'
  where payment_ref = p_payment_ref
    and status = 'pending';

  update public.shops
  set is_active = true,
      subscription_expires_at = now() + interval '1 year'
  where id = p_shop_id;
end;
$$;

revoke all on function public.activate_shop_subscription(uuid, text, numeric, text, text, boolean) from public, anon, authenticated;
grant execute on function public.activate_shop_subscription(uuid, text, numeric, text, text, boolean) to service_role;

-- Delivery (dépend de shops / shop_products)
create table if not exists public.delivery_orders (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  buyer_id uuid not null references public.profiles(id) on delete cascade,
  shop_product_id uuid references public.shop_products(id) on delete set null,
  method text not null check (method in ('pickup', 'courier', 'drone')),
  provider text not null default 'mock',
  dropoff_lat double precision,
  dropoff_lng double precision,
  dropoff_address text,
  status text not null default 'pending' check (
    status in ('pending', 'dispatched', 'in_transit', 'delivered', 'cancelled', 'failed')
  ),
  current_lat double precision,
  current_lng double precision,
  estimated_delivery_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_delivery_orders_buyer on public.delivery_orders(buyer_id, created_at desc);
create index if not exists idx_delivery_orders_shop on public.delivery_orders(shop_id, created_at desc);

alter table public.delivery_orders enable row level security;

drop policy if exists "delivery_select_buyer_or_shop_owner" on public.delivery_orders;
create policy "delivery_select_buyer_or_shop_owner" on public.delivery_orders
  for select using (
    buyer_id = auth.uid()
    or exists (select 1 from public.shops where id = delivery_orders.shop_id and owner_id = auth.uid())
  );

drop policy if exists "delivery_insert_buyer" on public.delivery_orders;
create policy "delivery_insert_buyer" on public.delivery_orders
  for insert with check (buyer_id = auth.uid());

drop policy if exists "delivery_update_shop_owner" on public.delivery_orders;
create policy "delivery_update_shop_owner" on public.delivery_orders
  for update using (
    exists (select 1 from public.shops where id = delivery_orders.shop_id and owner_id = auth.uid())
  );


-- ============================================================
-- SOURCE: 0054_fix_social_interactions.sql
-- ============================================================
-- ============================================================
-- BAARO — Correction des interactions sociales (Feed & Sondages)
-- Fichier : 053_fix_social_interactions.sql
-- Date : 26 septembre 2026
-- 
-- Objectif : Aligner les fonctions SQL avec le schéma réel 
-- (user_id au lieu de id, display_name au lieu de full_name, 
-- et éviter les UPDATE sur les vues).
-- ============================================================

-- 1. Corriger vote_poll (ne pas UPDATE la vue poll_results, le COUNT est automatique)
CREATE OR REPLACE FUNCTION public.vote_poll(p_poll_id uuid, p_option_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
DECLARE
  v_post_id uuid;
  v_user_id uuid;
  v_option_index integer;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'User not authenticated'; END IF;
  
  SELECT p.post_id, po.position INTO v_post_id, v_option_index
  FROM polls p
  JOIN poll_options po ON po.poll_id = p.id AND po.id = p_option_id
  WHERE p.id = p_poll_id;
  
  IF v_post_id IS NULL THEN RAISE EXCEPTION 'Poll or option not found'; END IF;
  
  DELETE FROM public.poll_votes WHERE poll_id = p_poll_id AND user_id = v_user_id;
  
  INSERT INTO public.poll_votes (poll_id, option_id, user_id, post_id, option_index)
  VALUES (p_poll_id, p_option_id, v_user_id, v_post_id, v_option_index);
END;
$function$;

-- 2. Corriger notify_on_poll_vote (utiliser user_id et display_name)
CREATE OR REPLACE FUNCTION public.notify_on_poll_vote()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
DECLARE
  v_post_id UUID;
  v_post_author UUID;
  v_actor_name TEXT;
  v_question TEXT;
BEGIN
  SELECT post_id INTO v_post_id FROM public.polls WHERE id = NEW.poll_id;
  SELECT author_id INTO v_post_author FROM public.posts WHERE id = v_post_id;
  SELECT question INTO v_question FROM public.polls WHERE id = NEW.poll_id;
  
  SELECT COALESCE(display_name, handle, 'Quelqu''un') INTO v_actor_name
    FROM public.profiles WHERE id = NEW.user_id;

  PERFORM public.create_notification(
    v_post_author, NEW.user_id, 'poll_vote',
    v_actor_name || ' a voté à votre sondage : ' || LEFT(v_question, 50),
    v_post_id
  );
  RETURN NEW;
END;
$function$;

-- 3. Corriger create_notification (utiliser notification_id et user_id)
CREATE OR REPLACE FUNCTION public.create_notification(
  p_target_id uuid, p_actor_id uuid, p_type text, p_message text, p_source_id uuid DEFAULT NULL::uuid
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
BEGIN
  IF p_target_id = p_actor_id THEN RETURN; END IF;
  
  IF p_source_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.notifications
    WHERE user_id = p_target_id AND type = p_type AND source_id = p_source_id
    AND created_at > NOW() - INTERVAL '5 minutes'
  ) THEN RETURN; END IF;

  INSERT INTO public.notifications (notification_id, user_id, actor_id, type, message, source_id, read, created_at)
  VALUES (gen_random_uuid(), p_target_id, p_actor_id, p_type, p_message, p_source_id, false, NOW());
END;
$function$;

-- 4. Corriger notify_on_comment (utiliser display_name)
CREATE OR REPLACE FUNCTION public.notify_on_comment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
DECLARE
  v_post_author UUID;
  v_actor_name TEXT;
BEGIN
  SELECT author_id INTO v_post_author FROM public.posts WHERE id = NEW.post_id;
  
  SELECT COALESCE(display_name, handle, 'Quelqu''un') INTO v_actor_name
    FROM public.profiles WHERE id = NEW.author_id;

  PERFORM public.create_notification(
    v_post_author, NEW.author_id, 'comment',
    v_actor_name || ' a commenté votre publication', NEW.post_id
  );
  RETURN NEW;
END;
$function$;

-- 5. Corriger get_poll_voters (joindre sur user_id, pas id)
CREATE OR REPLACE FUNCTION public.get_poll_voters(p_poll_id uuid)
RETURNS TABLE(option_id uuid, option_text text, voters jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.poll_votes WHERE poll_id = p_poll_id AND user_id = auth.uid()
  ) AND NOT EXISTS (
    SELECT 1 FROM public.polls p
    JOIN public.posts po ON po.id = p.post_id
    WHERE p.id = p_poll_id AND po.author_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'ACCESS_DENIED';
  END IF;

  RETURN QUERY
  SELECT 
    po.id AS option_id,
    po.option_text,
    COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'id', pv.user_id,
          'display_name', COALESCE(pr.display_name, pr.handle, 'Membre'),
          'avatar_url', pr.avatar_url,
          'handle', pr.handle
        )
        ORDER BY pv.created_at DESC
      ) FILTER (WHERE pv.id IS NOT NULL),
      '[]'::jsonb
    ) AS voters
  FROM public.poll_options po
  LEFT JOIN public.poll_votes pv ON po.id = pv.option_id
  LEFT JOIN public.profiles pr ON pv.user_id = pr.id
  WHERE po.poll_id = p_poll_id
  GROUP BY po.id, po.option_text, po.position
  ORDER BY po.position;
END;
$function$;


-- ============================================================
-- SOURCE: 0055_follows_status.sql
-- ============================================================
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


-- ============================================================
-- SOURCE: 0056_add_contacts.sql
-- ============================================================
-- Onglet "Contact" (Communauté) — v2, performance + fiabilité du matching.
-- Remplace l'approche "une colonne phone_hash/email_hash" par une table dédiée
-- contact_hashes : chaque personne peut avoir PLUSIEURS hachages (variantes de
-- formatage du même numéro : +223 70..., 22370..., 070..., 70...) sans qu'on
-- ait besoin de deviner un indicatif pays. Ça augmente nettement le taux de
-- correspondance avec un vrai répertoire de téléphone, pour un coût quasi nul
-- (quelques lignes de plus par utilisateur, PK sur le hash = recherche O(1)).

-- Nettoyage si vous aviez déjà exécuté l'ancienne version (v1) de ce fichier :
drop index if exists public.profiles_phone_hash_idx;
drop index if exists public.profiles_email_hash_idx;
alter table public.profiles drop column if exists phone_hash;
alter table public.profiles drop column if exists email_hash;

-- Le numéro en clair n'est gardé QUE pour l'affichage à son propriétaire dans
-- ses propres réglages — jamais exposé aux autres.
alter table public.profiles add column if not exists phone text;

create table if not exists public.contact_hashes (
  hash text primary key,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('phone', 'email')),
  created_at timestamptz not null default now()
);

create index if not exists contact_hashes_profile_idx on public.contact_hashes (profile_id);

alter table public.contact_hashes enable row level security;

drop policy if exists "contact_hashes_manage_own" on public.contact_hashes;
create policy "contact_hashes_manage_own"
  on public.contact_hashes for all
  using (auth.uid() = profile_id)
  with check (auth.uid() = profile_id);

drop policy if exists "profiles_update_own_contact_fields" on public.profiles;
create policy "profiles_update_own_contact_fields"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Fonction serveur : reçoit une liste de hachages (déjà calculés côté client,
-- variantes comprises) et renvoie les profils publics qui correspondent, avec
-- le hachage qui a matché (matched_hash) — ça permet au client de relier le
-- résultat au contact précis de son répertoire, pour ensuite proposer
-- d'inviter ceux qui n'ont pas matché. Jamais de numéro/e-mail en clair ni de
-- hachage de tiers renvoyé au-delà de ce qui matche la requête.
create or replace function public.find_users_by_contact_hashes(hashes text[])
returns table (
  id uuid,
  display_name text,
  handle text,
  avatar_url text,
  flag text,
  matched_via text,
  matched_hash text
)
language sql
security definer
set search_path = public
as $$
  select p.id, p.display_name, p.handle, p.avatar_url, p.flag,
         ch.kind as matched_via, ch.hash as matched_hash
  from public.contact_hashes ch
  join public.profiles p on p.id = ch.profile_id
  where ch.hash = any(hashes)
    and p.id <> auth.uid();
$$;

grant execute on function public.find_users_by_contact_hashes(text[]) to authenticated, anon;

-- Si votre table `follows` n'a pas déjà de contrainte unique (follower_id, followed_id),
-- décommentez la ligne suivante — elle évite les doublons de demandes d'ami/abonnement :
-- alter table public.follows add constraint follows_unique_pair unique (follower_id, followed_id);


-- ============================================================
-- SOURCE: 0057_innovation_platform_foundation.sql
-- ============================================================
-- BAARO Innovation Foundation
-- Supabase stores metadata/state. Binary media remains on Cloudflare R2.

create extension if not exists pgcrypto;

create table if not exists public.user_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  language text default 'fr',
  country text,
  city text,
  interests jsonb not null default '[]'::jsonb,
  notification_settings jsonb not null default '{}'::jsonb,
  discovery_settings jsonb not null default '{}'::jsonb,
  privacy_settings jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.content_bookmarks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  content_type text not null,
  content_id uuid not null,
  collection text,
  created_at timestamptz not null default now(),
  unique(user_id, content_type, content_id)
);

create table if not exists public.saved_searches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  query text not null,
  filters jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.creator_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  category text,
  bio text,
  verified boolean not null default false,
  subscriber_count bigint not null default 0,
  support_enabled boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.creator_subscriptions (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references auth.users(id) on delete cascade,
  subscriber_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'active' check (status in ('active','paused','cancelled')),
  tier text not null default 'free',
  created_at timestamptz not null default now(),
  unique(creator_id, subscriber_id)
);

create table if not exists public.learning_courses (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid references auth.users(id) on delete set null,
  title text not null,
  description text,
  language text default 'fr',
  level text,
  category text,
  cover_media_key text,
  published boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.learning_progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  course_id uuid not null references public.learning_courses(id) on delete cascade,
  progress numeric not null default 0 check (progress >= 0 and progress <= 100),
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key(user_id, course_id)
);

create table if not exists public.job_listings (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id) on delete set null,
  title text not null,
  description text,
  company_name text,
  location text,
  remote boolean not null default false,
  skills text[] not null default '{}',
  status text not null default 'open' check (status in ('draft','open','closed','filled')),
  created_at timestamptz not null default now(),
  expires_at timestamptz
);

create table if not exists public.service_listings (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id) on delete set null,
  title text not null,
  description text,
  category text,
  location text,
  price numeric,
  currency text default 'XOF',
  status text not null default 'active' check (status in ('draft','active','paused','closed')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.community_events (
  id uuid primary key default gen_random_uuid(),
  organizer_id uuid references auth.users(id) on delete set null,
  title text not null,
  description text,
  location text,
  starts_at timestamptz not null,
  ends_at timestamptz,
  online_url text,
  cover_media_key text,
  capacity integer,
  status text not null default 'published' check (status in ('draft','published','cancelled','finished')),
  created_at timestamptz not null default now()
);

create table if not exists public.event_attendees (
  event_id uuid not null references public.community_events(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'going' check (status in ('going','interested','cancelled')),
  created_at timestamptz not null default now(),
  primary key(event_id, user_id)
);

create table if not exists public.user_blocks (
  blocker_id uuid not null references auth.users(id) on delete cascade,
  blocked_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(blocker_id, blocked_id),
  check(blocker_id <> blocked_id)
);

create table if not exists public.safety_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users(id) on delete cascade,
  target_type text not null,
  target_id uuid not null,
  reason text not null,
  details text,
  status text not null default 'open' check (status in ('open','reviewing','resolved','dismissed')),
  created_at timestamptz not null default now()
);

create table if not exists public.reputation_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null,
  score integer not null default 0,
  reference_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_bookmarks_user_created on public.content_bookmarks(user_id, created_at desc);
create index if not exists idx_jobs_status_created on public.job_listings(status, created_at desc);
create index if not exists idx_services_status_created on public.service_listings(status, created_at desc);
create index if not exists idx_events_start on public.community_events(starts_at);
create index if not exists idx_reports_status_created on public.safety_reports(status, created_at desc);
create index if not exists idx_reputation_user_created on public.reputation_events(user_id, created_at desc);

alter table public.user_preferences enable row level security;
alter table public.content_bookmarks enable row level security;
alter table public.saved_searches enable row level security;
alter table public.creator_profiles enable row level security;
alter table public.creator_subscriptions enable row level security;
alter table public.learning_courses enable row level security;
alter table public.learning_progress enable row level security;
alter table public.job_listings enable row level security;
alter table public.service_listings enable row level security;
alter table public.community_events enable row level security;
alter table public.event_attendees enable row level security;
alter table public.user_blocks enable row level security;
alter table public.safety_reports enable row level security;
alter table public.reputation_events enable row level security;

-- User-owned data
create policy innovation_preferences_owner on public.user_preferences for all using (auth.uid() = id) with check (auth.uid() = id);
create policy innovation_bookmarks_owner on public.content_bookmarks for all using (auth.uid() = id) with check (auth.uid() = id);
create policy innovation_searches_owner on public.saved_searches for all using (auth.uid() = id) with check (auth.uid() = id);
create policy innovation_progress_owner on public.learning_progress for all using (auth.uid() = id) with check (auth.uid() = id);
create policy innovation_subscriptions_owner on public.creator_subscriptions for all using (auth.uid() = subscriber_id or auth.uid() = creator_id) with check (auth.uid() = subscriber_id or auth.uid() = creator_id);
create policy innovation_blocks_owner on public.user_blocks for all using (auth.uid() = blocker_id) with check (auth.uid() = blocker_id);
create policy innovation_reports_owner on public.safety_reports for insert with check (auth.uid() = reporter_id);
create policy innovation_reports_read_owner on public.safety_reports for select using (auth.uid() = reporter_id);

-- Public/discoverable records
create policy innovation_creator_public on public.creator_profiles for select using (true);
create policy innovation_creator_owner on public.creator_profiles for insert with check (auth.uid() = id);
create policy innovation_creator_update on public.creator_profiles for update using (auth.uid() = id) with check (auth.uid() = id);
create policy innovation_courses_public on public.learning_courses for select using (published = true or auth.uid() = creator_id);
create policy innovation_courses_owner on public.learning_courses for all using (auth.uid() = creator_id) with check (auth.uid() = creator_id);
create policy innovation_jobs_public on public.job_listings for select using (status = 'open' or auth.uid() = owner_id);
create policy innovation_jobs_owner on public.job_listings for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
create policy innovation_services_public on public.service_listings for select using (status = 'active' or auth.uid() = owner_id);
create policy innovation_services_owner on public.service_listings for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
create policy innovation_events_public on public.community_events for select using (status in ('published','finished') or auth.uid() = organizer_id);
create policy innovation_events_owner on public.community_events for all using (auth.uid() = organizer_id) with check (auth.uid() = organizer_id);
create policy innovation_attendees_owner on public.event_attendees for all using (auth.uid() = id) with check (auth.uid() = id);
create policy innovation_attendees_organizer_read on public.event_attendees for select using (exists (select 1 from public.community_events e where e.id = event_id and e.organizer_id = auth.uid()));
create policy innovation_reputation_public on public.reputation_events for select using (true);


-- ============================================================
-- SOURCE: 0058_video_module_global_fix.sql
-- ============================================================
-- ============================================================
-- BAARO — Correction globale du module vidéo
-- Fichier : 052_video_module_global_fix.sql
-- Date : 26 septembre 2026
-- 
-- Objectif :
--   1. Supprimer le trigger bloquant qui empêchait les compteurs de se mettre à jour
--   2. Corriger la fonction de comptage des vues (support des invités/anonymes)
--   3. Créer des triggers propres pour likes et commentaires
--   4. Recalculer les compteurs existants
--   5. S'assurer que les politiques RLS sont correctes
-- ============================================================

-- ============================================================
-- ÉTAPE 1 : NETTOYAGE DES TRIGGERS BLOQUANTS
-- ============================================================

-- Suppression du trigger qui bloquait toutes les mises à jour de la table videos
DROP TRIGGER IF EXISTS trg_protect_video_counters ON public.videos;
DROP FUNCTION IF EXISTS public.protect_video_counters();

-- Suppression des anciens triggers en doublon (nettoyage)
DROP TRIGGER IF EXISTS trg_video_comments_count ON public.video_comments;
DROP TRIGGER IF EXISTS trg_video_likes_count ON public.video_likes;
DROP TRIGGER IF EXISTS trg_baaro_video_comment_count ON public.video_comments;
DROP TRIGGER IF EXISTS trg_baaro_video_like_count ON public.video_likes;

-- Suppression des anciennes fonctions obsolètes
DROP FUNCTION IF EXISTS public.update_video_comments_count_trigger();
DROP FUNCTION IF EXISTS public.update_video_likes_count_trigger();
DROP FUNCTION IF EXISTS public.baaro_video_comment_count();
DROP FUNCTION IF EXISTS public.baaro_video_like_count();


-- ============================================================
-- ÉTAPE 2 : CORRECTION DE LA FONCTION DE VUES (SUPPORT INVITÉS)
-- ============================================================

-- Suppression forcée de l'ancienne fonction pour éviter l'erreur 42P13
DROP FUNCTION IF EXISTS public.register_video_view(uuid);

CREATE OR REPLACE FUNCTION public.register_video_view(p_video_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  -- Si l'utilisateur est anonyme (guest), on utilise un UUID générique pour éviter le crash
  uid uuid := coalesce(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid);
  inserted boolean := false;
  new_views integer := 0;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.videos WHERE id = p_video_id) THEN
    RAISE EXCEPTION 'VIDEO_NOT_FOUND';
  END IF;

  -- Insertion idempotente : une seule vue comptée par jour par utilisateur (ou UUID générique)
  INSERT INTO public.video_views(video_id, viewer_id, view_date)
  VALUES (p_video_id, uid, current_date)
  ON CONFLICT DO NOTHING;

  inserted := FOUND;
  
  IF inserted THEN
    UPDATE public.videos
      SET views = coalesce(views, 0) + 1
      WHERE id = p_video_id
      RETURNING views INTO new_views;
  ELSE
    SELECT coalesce(views, 0) INTO new_views FROM public.videos WHERE id = p_video_id;
  END IF;

  RETURN jsonb_build_object('counted', inserted, 'views', new_views);
END;
$$;

-- Autoriser les utilisateurs authentifiés ET anonymes (anon) à appeler cette fonction
REVOKE ALL ON FUNCTION public.register_video_view(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.register_video_view(uuid) TO authenticated, anon;


-- ============================================================
-- ÉTAPE 3 : TRIGGER POUR LES COMMENTAIRES
-- ============================================================

CREATE OR REPLACE FUNCTION public.update_video_comments_count()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.videos 
    SET comments_count = COALESCE(comments_count, 0) + 1
    WHERE id = NEW.video_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.videos 
    SET comments_count = GREATEST(COALESCE(comments_count, 0) - 1, 0)
    WHERE id = OLD.video_id;
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_video_comments_count
AFTER INSERT OR DELETE ON public.video_comments
FOR EACH ROW EXECUTE FUNCTION public.update_video_comments_count();


-- ============================================================
-- ÉTAPE 4 : TRIGGER POUR LES LIKES
-- ============================================================

CREATE OR REPLACE FUNCTION public.update_video_likes_count()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.videos 
    SET likes = COALESCE(likes, 0) + 1
    WHERE id = NEW.video_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.videos 
    SET likes = GREATEST(COALESCE(likes, 0) - 1, 0)
    WHERE id = OLD.video_id;
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_video_likes_count
AFTER INSERT OR DELETE ON public.video_likes
FOR EACH ROW EXECUTE FUNCTION public.update_likes_count();


-- ============================================================
-- ÉTAPE 5 : POLITIQUES RLS POUR VIDEOS
-- ============================================================

-- Permettre aux utilisateurs authentifiés de mettre à jour leurs propres vidéos
DROP POLICY IF EXISTS "videos_update_own" ON public.videos;
CREATE POLICY "videos_update_own" ON public.videos
FOR UPDATE TO authenticated
USING (auth.uid() = author_id)
WITH CHECK (auth.uid() = author_id);

-- Permettre au service_role de tout mettre à jour (pour les triggers et l'API)
DROP POLICY IF EXISTS "videos_update_service" ON public.videos;
CREATE POLICY "videos_update_service" ON public.videos
FOR UPDATE TO service_role
USING (true)
WITH CHECK (true);


-- ============================================================
-- ÉTAPE 6 : RECALCUL DES COMPTEURS EXISTANTS
-- ============================================================

-- Recalculer les vrais compteurs pour toutes les vidéos depuis les données existantes
UPDATE public.videos v
SET 
  likes = COALESCE(subquery.likes_count, 0),
  comments_count = COALESCE(subquery.comments_count, 0)
FROM (
  SELECT 
    v.id as video_id,
    (SELECT COUNT(*) FROM public.video_likes vl WHERE vl.video_id = v.id) as likes_count,
    (SELECT COUNT(*) FROM public.video_comments vc WHERE vc.video_id = v.id) as comments_count
  FROM public.videos v
) subquery
WHERE v.id = subquery.video_id;


-- ============================================================
-- ÉTAPE 7 : VÉRIFICATION FINALE
-- ============================================================

-- Afficher un résumé des compteurs après correction
SELECT 
  id,
  LEFT(title, 30) as title,
  COALESCE(views, 0) as views,
  COALESCE(likes, 0) as likes,
  COALESCE(comments_count, 0) as comments_count
FROM public.videos
ORDER BY created_at DESC
LIMIT 10;


-- ============================================================
-- SOURCE: 0059_community_schema_hardening.sql
-- ============================================================
-- BAARO community schema hardening
-- Converted from the former ad-hoc database patch.
-- No destructive cleanup is performed here.

-- ============================================================
-- BAARO — SCHÉMA COMPLET UNIFIÉ v1.0
-- Script idempotent — peut être relancé sans risque
-- Généré le : 2026-01-20
-- ============================================================


-- ============================================================
-- SECTION 1 : COMMUNAUTÉ (GROUPES, CANAUX, MEMBRES)
-- ============================================================

-- 1.1 Colonnes de visibilité
alter table public.groups add column if not exists is_public boolean default true;
alter table public.groups add column if not exists is_private boolean default false;
alter table public.groups add column if not exists category text default 'community';

-- Synchronisation is_public/is_private
update public.groups
set is_public = coalesce(is_public, true) and not coalesce(is_private, false);
update public.groups set is_private = not is_public;

-- Trigger guard pour groups
create or replace function public.groups_guard()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    new.is_public := coalesce(new.is_public, true) and not coalesce(new.is_private, false);
  else
    if new.owner_id is distinct from old.owner_id and auth.uid() is not null then
      raise exception 'Changement de propriétaire interdit';
    end if;
    if new.is_public is not distinct from old.is_public
       and new.is_private is distinct from old.is_private then
      new.is_public := not new.is_private;
    end if;
  end if;
  new.is_private := not coalesce(new.is_public, true);
  return new;
end $$;

drop trigger if exists trg_groups_guard on public.groups;
create trigger trg_groups_guard
before insert or update on public.groups
for each row execute function public.groups_guard();

-- 1.2 Tables de modération
create table if not exists public.group_bans (
  group_id uuid references public.groups(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  banned_by uuid references auth.users(id),
  reason text,
  created_at timestamptz default now(),
  primary key (group_id, user_id)
);

create table if not exists public.community_reports (
  id uuid primary key default gen_random_uuid(),
  group_id uuid references public.groups(id) on delete cascade,
  message_id uuid references public.channel_messages(id) on delete cascade,
  reporter_id uuid references auth.users(id) on delete cascade not null,
  reason text,
  status text not null default 'open',
  created_at timestamptz default now(),
  unique (message_id, reporter_id)
);

-- 1.3 Fonctions d'aide
create or replace function public.group_role(p_group uuid)
returns text language sql stable security definer set search_path = public as $$
  select case when g.owner_id = auth.uid() then 'owner' else gm.role end
  from public.groups g
  left join public.group_members gm
    on gm.group_id = g.id and gm.user_id = auth.uid()
  where g.id = p_group;
$$;

create or replace function public.role_rank(p_role text)
returns int language sql immutable as $$
  select case p_role
    when 'owner' then 3 when 'admin' then 2
    when 'moderator' then 1 when 'member' then 0 else -1 end;
$$;

create or replace function public.can_see_group(p_group uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.groups g
    where g.id = p_group and coalesce(g.is_public, true)
  ) or public.group_role(p_group) is not null;
$$;

create or replace function public.channel_group(p_channel uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select group_id from public.channels where id = p_channel;
$$;

create or replace function public.is_banned(p_group uuid, p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.group_bans
    where group_id = p_group and user_id = p_user
  );
$$;

create or replace function public.can_post_in_channel(p_channel uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.channels c
    where c.id = p_channel
      and public.group_role(c.group_id) is not null
      and not public.is_banned(c.group_id, auth.uid())
      and (
        c.type in ('text', 'voice')
        or public.group_role(c.group_id) in ('owner', 'admin', 'moderator')
      )
  );
$$;

-- 1.4 Contraintes et index
alter table public.channel_messages
  drop constraint if exists channel_messages_text_len;
alter table public.channel_messages
  add constraint channel_messages_text_len
  check (char_length(text) between 1 and 2000) not valid;

create index if not exists idx_msgs_channel_created
  on public.channel_messages (channel_id, created_at desc);
create index if not exists idx_msgs_sender_created
  on public.channel_messages (sender_id, created_at desc);

do $$ begin
  create unique index if not exists uq_channels_group_name
    on public.channels (group_id, name);
exception when unique_violation then
  raise notice 'Doublons de canaux : nettoie puis relance';
end $$;

-- 1.5 Anti-spam trigger
create or replace function public.messages_rate_limit()
returns trigger language plpgsql as $$
begin
  if (select count(*) from public.channel_messages
      where sender_id = new.sender_id
        and created_at > now() - interval '10 seconds') >= 10 then
    raise exception 'Trop de messages, ralentis';
  end if;
  return new;
end $$;

drop trigger if exists trg_messages_rate on public.channel_messages;
create trigger trg_messages_rate
before insert on public.channel_messages
for each row execute function public.messages_rate_limit();

-- 1.6 RLS activation
alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.channels enable row level security;
alter table public.channel_messages enable row level security;
alter table public.group_invites enable row level security;
alter table public.group_bans enable row level security;
alter table public.community_reports enable row level security;

-- 1.7 Policies
do $$
declare r record;
begin
  for r in
    select policyname, tablename from pg_policies
    where schemaname = 'public'
      and tablename in ('groups','group_members','channels','channel_messages',
                        'group_invites','group_bans','community_reports')
  loop
    execute format('drop policy if exists %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

-- GROUPES
create policy groups_select on public.groups for select to authenticated
  using (public.can_see_group(id));
create policy groups_insert on public.groups for insert to authenticated
  with check (owner_id = auth.uid());
create policy groups_update on public.groups for update to authenticated
  using (public.group_role(id) in ('owner','admin'))
  with check (public.group_role(id) in ('owner','admin'));
create policy groups_delete on public.groups for delete to authenticated
  using (owner_id = auth.uid());

-- MEMBRES
create policy members_select on public.group_members for select to authenticated
  using (public.can_see_group(group_id));
create policy members_join on public.group_members for insert to authenticated
  with check (
    user_id = auth.uid()
    and role = 'member'
    and not public.is_banned(group_id, user_id)
    and exists (
      select 1 from public.groups g
      where g.id = group_id and coalesce(g.is_public, true)
    )
  );
create policy members_leave on public.group_members for delete to authenticated
  using (user_id = auth.uid() and role is distinct from 'owner');

-- CANAUX
create policy channels_select on public.channels for select to authenticated
  using (public.can_see_group(group_id));
create policy channels_insert on public.channels for insert to authenticated
  with check (public.group_role(group_id) in ('owner','admin'));
create policy channels_update on public.channels for update to authenticated
  using (public.group_role(group_id) in ('owner','admin'))
  with check (public.group_role(group_id) in ('owner','admin'));
create policy channels_delete on public.channels for delete to authenticated
  using (public.group_role(group_id) in ('owner','admin'));

-- MESSAGES
create policy messages_select on public.channel_messages for select to authenticated
  using (public.can_see_group(public.channel_group(channel_id)));
drop policy if exists messages_insert on public.channel_messages;
create policy messages_insert on public.channel_messages for insert to authenticated
  with check (
    sender_id = auth.uid()
    and public.can_post_in_channel(channel_id)
  );
create policy messages_update on public.channel_messages for update to authenticated
  using (sender_id = auth.uid())
  with check (
    sender_id = auth.uid()
    and public.can_post_in_channel(channel_id)
  );
create policy messages_delete on public.channel_messages for delete to authenticated
  using (
    sender_id = auth.uid()
    or public.group_role(public.channel_group(channel_id))
       in ('owner','admin','moderator')
  );

-- INVITATIONS
drop policy if exists invites_select on public.group_invites;
create policy invites_select on public.group_invites for select to authenticated
  using (public.group_role(group_id) in ('owner','admin'));
drop policy if exists invites_insert on public.group_invites;
create policy invites_insert on public.group_invites for insert to authenticated
  with check (created_by = auth.uid()
              and public.group_role(group_id) in ('owner','admin'));
drop policy if exists invites_delete on public.group_invites;
create policy invites_delete on public.group_invites for delete to authenticated
  using (public.group_role(group_id) in ('owner','admin'));

-- BANS et SIGNALEMENTS
create policy bans_select on public.group_bans for select to authenticated
  using (public.group_role(group_id) in ('owner','admin','moderator'));
create policy reports_select on public.community_reports for select to authenticated
  using (public.group_role(group_id) in ('owner','admin','moderator'));
create policy reports_update on public.community_reports for update to authenticated
  using (public.group_role(group_id) in ('owner','admin','moderator'))
  with check (public.group_role(group_id) in ('owner','admin','moderator'));

-- 1.8 Fonctions RPC communauté
create or replace function public.create_community_group(
  p_name text,
  p_description text default null,
  p_is_public boolean default true,
  p_category text default 'community'
)
returns public.groups
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_group public.groups;
begin
  if v_uid is null then raise exception 'Non authentifié'; end if;
  if p_name is null or length(trim(p_name)) < 2 then
    raise exception 'Nom du groupe trop court';
  end if;

  insert into public.groups (name, description, owner_id, is_public, category)
  values (
    left(trim(p_name), 80),
    nullif(left(trim(coalesce(p_description, '')), 500), ''),
    v_uid,
    coalesce(p_is_public, true),
    coalesce(nullif(trim(p_category), ''), 'community')
  )
  returning * into v_group;

  insert into public.group_members (group_id, user_id, role)
  values (v_group.id, v_uid, 'owner')
  on conflict (group_id, user_id) do update set role = 'owner';

  insert into public.channels (group_id, name, type, description)
  values (v_group.id, 'general', 'text', 'Canal principal');

  return v_group;
end $$;

create or replace function public.create_community_channel(
  p_group_id uuid,
  p_name text,
  p_type text default 'text',
  p_description text default null
)
returns public.channels
language plpgsql security definer set search_path = public as $$
declare
  v_name text;
  v_type text;
  v_channel public.channels;
  v_role text := public.group_role(p_group_id);
begin
  if auth.uid() is null then
    raise exception 'Non authentifié';
  end if;

  if coalesce(v_role, '') not in ('owner', 'admin') then
    raise exception 'Seuls les admins peuvent créer un canal';
  end if;

  v_type := case
    when p_type in ('voice', 'announce') then p_type
    else 'text'
  end;

  v_name := lower(regexp_replace(trim(coalesce(p_name, '')), '\s+', '-', 'g'));
  v_name := regexp_replace(
    v_name,
    '[<>"''`&/\\?#%@:;,.!$^*()+=\[\]{}|~]',
    '',
    'g'
  );
  v_name := left(v_name, 40);

  if length(v_name) < 1 then
    raise exception 'Nom de canal invalide';
  end if;

  insert into public.channels (group_id, name, type, description)
  values (
    p_group_id,
    v_name,
    v_type,
    nullif(left(trim(coalesce(p_description, '')), 200), '')
  )
  returning * into v_channel;

  return v_channel;
end;
$$;

create or replace function public.join_community_group(
  p_group uuid default null,
  p_code text default null
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_group_id uuid;
  v_public boolean;
  v_inv public.group_invites;
begin
  if v_uid is null then
    raise exception 'Non authentifié';
  end if;

  -- Mode 1: code d'invitation
  if p_code is not null and length(trim(p_code)) > 0 then
    select * into v_inv
    from public.group_invites
    where upper(code) = upper(trim(p_code))
      and (expires_at is null or expires_at > now())
      and (coalesce(max_uses, 0) = 0 or coalesce(uses, 0) < max_uses)
    for update;

    if not found then
      raise exception 'Invitation invalide ou expirée';
    end if;

    v_group_id := v_inv.group_id;

    if public.is_banned(v_group_id, v_uid) then
      raise exception 'Accès refusé';
    end if;

    if public.group_role(v_group_id) is not null then
      return jsonb_build_object(
        'ok', true,
        'group_id', v_group_id,
        'already_member', true
      );
    end if;

    update public.group_invites
    set uses = coalesce(uses, 0) + 1
    where id = v_inv.id;

    insert into public.group_members (group_id, user_id, role)
    values (v_group_id, v_uid, 'member')
    on conflict do nothing;

    return jsonb_build_object(
      'ok', true,
      'group_id', v_group_id,
      'via', 'invite'
    );
  end if;

  -- Mode 2: groupe public
  if p_group is null then
    raise exception 'Groupe ou code requis';
  end if;

  v_group_id := p_group;

  if public.is_banned(v_group_id, v_uid) then
    raise exception 'Accès refusé';
  end if;

  if public.group_role(v_group_id) is not null then
    return jsonb_build_object(
      'ok', true,
      'group_id', v_group_id,
      'already_member', true
    );
  end if;

  select coalesce(is_public, true) into v_public
  from public.groups
  where id = v_group_id;

  if not found then
    raise exception 'Groupe introuvable';
  end if;

  if not v_public then
    raise exception 'Groupe privé : code d''invitation requis';
  end if;

  insert into public.group_members (group_id, user_id, role)
  values (v_group_id, v_uid, 'member')
  on conflict do nothing;

  return jsonb_build_object(
    'ok', true,
    'group_id', v_group_id,
    'via', 'public'
  );
end;
$$;

create or replace function public.ban_community_member(
  p_group uuid,
  p_user uuid,
  p_reason text default null
)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_actor text := public.group_role(p_group);
  v_target text;
begin
  if auth.uid() is null then raise exception 'Non authentifié'; end if;
  if p_user = auth.uid() then raise exception 'Action impossible sur soi-même'; end if;

  select case when g.owner_id = p_user then 'owner' else gm.role end
  into v_target
  from public.groups g
  left join public.group_members gm
    on gm.group_id = g.id and gm.user_id = p_user
  where g.id = p_group;

  if public.role_rank(v_actor) < 1
     or public.role_rank(v_actor) <= public.role_rank(v_target) then
    raise exception 'Droits insuffisants';
  end if;

  insert into public.group_bans (group_id, user_id, banned_by, reason)
  values (p_group, p_user, auth.uid(), left(p_reason, 300))
  on conflict do nothing;

  delete from public.group_members
  where group_id = p_group and user_id = p_user;
end $$;

create or replace function public.unban_community_member(
  p_group uuid,
  p_user uuid
)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if public.role_rank(public.group_role(p_group)) < 1 then
    raise exception 'Droits insuffisants';
  end if;
  delete from public.group_bans where group_id = p_group and user_id = p_user;
end $$;

create or replace function public.set_member_role(
  p_group uuid,
  p_user uuid,
  p_role text
)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_actor text := public.group_role(p_group);
  v_target text;
begin
  if coalesce(p_role, '') not in ('admin','moderator','member') then
    raise exception 'Rôle invalide';
  end if;

  select role into v_target from public.group_members
  where group_id = p_group and user_id = p_user;
  if v_target is null then raise exception 'Membre introuvable'; end if;
  if v_target = 'owner' then raise exception 'Le propriétaire ne peut pas changer'; end if;

  if v_actor = 'owner' then
    null;
  elsif v_actor = 'admin' and p_role <> 'admin' and v_target <> 'admin' then
    null;
  else
    raise exception 'Droits insuffisants';
  end if;

  update public.group_members set role = p_role
  where group_id = p_group and user_id = p_user;
end $$;

create or replace function public.report_community_message(
  p_message uuid,
  p_reason text default null
)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_group uuid;
begin
  select c.group_id into v_group
  from public.channel_messages m
  join public.channels c on c.id = m.channel_id
  where m.id = p_message;

  if v_group is null or not public.can_see_group(v_group) then
    raise exception 'Message introuvable ou accès refusé';
  end if;

  insert into public.community_reports (group_id, message_id, reporter_id, reason)
  values (v_group, p_message, auth.uid(), left(coalesce(p_reason, ''), 300))
  on conflict (message_id, reporter_id) do nothing;
end $$;

-- 1.9 Invitations
alter table public.channels drop constraint if exists channels_type_check;
alter table public.channels
  add constraint channels_type_check
  check (type in ('text', 'voice', 'announce'));

create table if not exists public.group_invites (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  code text not null,
  created_by uuid not null references auth.users(id) on delete cascade,
  max_uses int default 0,
  uses int not null default 0,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  unique (group_id, code)
);

create index if not exists idx_group_invites_code
  on public.group_invites (upper(code));

create or replace function public.create_group_invite(
  p_group uuid,
  p_max_uses int default 0,
  p_expires_hours int default null
)
returns public.group_invites
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_code text;
  v_row public.group_invites;
begin
  if v_uid is null then
    raise exception 'Non authentifié';
  end if;

  if public.group_role(p_group) not in ('owner', 'admin') then
    raise exception 'Seuls les admins peuvent créer une invitation';
  end if;

  v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));

  insert into public.group_invites (
    group_id, code, created_by, max_uses, expires_at
  )
  values (
    p_group,
    v_code,
    v_uid,
    greatest(coalesce(p_max_uses, 0), 0),
    case
      when p_expires_hours is null or p_expires_hours <= 0 then null
      else now() + (p_expires_hours || ' hours')::interval
    end
  )
  returning * into v_row;

  return v_row;
end;
$$;

create or replace function public.list_group_invites(p_group uuid)
returns setof public.group_invites
language plpgsql security definer set search_path = public as $$
begin
  if public.group_role(p_group) not in ('owner', 'admin') then
    raise exception 'Droits insuffisants';
  end if;

  return query
  select *
  from public.group_invites
  where group_id = p_group
  order by created_at desc;
end;
$$;

create or replace function public.revoke_group_invite(p_invite_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_group uuid;
begin
  select group_id into v_group
  from public.group_invites
  where id = p_invite_id;

  if v_group is null then
    raise exception 'Invitation introuvable';
  end if;

  if public.group_role(v_group) not in ('owner', 'admin') then
    raise exception 'Droits insuffisants';
  end if;

  delete from public.group_invites where id = p_invite_id;
end;
$$;

create or replace function public.peek_group_invite(p_code text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_inv public.group_invites;
  v_g public.groups;
  v_count int;
begin
  select * into v_inv
  from public.group_invites
  where upper(code) = upper(trim(p_code))
    and (expires_at is null or expires_at > now())
    and (coalesce(max_uses, 0) = 0 or coalesce(uses, 0) < max_uses);

  if not found then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;

  select * into v_g from public.groups where id = v_inv.group_id;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'group_gone');
  end if;

  select count(*)::int into v_count
  from public.group_members
  where group_id = v_g.id;

  return jsonb_build_object(
    'ok', true,
    'group_id', v_g.id,
    'name', v_g.name,
    'description', v_g.description,
    'is_public', coalesce(v_g.is_public, true),
    'member_count', v_count,
    'code', v_inv.code
  );
end;
$$;

-- ============================================================
-- SECTION 2 : NOTIFICATIONS
-- ============================================================

-- 2.1 Table notifications
CREATE TABLE IF NOT EXISTS public.notifications (
  notification_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  actor_id UUID NULL,
  type TEXT NULL DEFAULT 'general',
  message TEXT NOT NULL DEFAULT '',
  source_id UUID NULL,
  read BOOLEAN NOT NULL DEFAULT false,
  read_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Normalisation des anciennes colonnes
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'notifications' AND column_name = 'id'
  )
  AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'notifications' AND column_name = 'notification_id'
  ) THEN
    ALTER TABLE public.notifications RENAME COLUMN id TO notification_id;
  END IF;
END $$;

ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS notification_id UUID;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS user_id UUID;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS actor_id UUID;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS type TEXT;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS message TEXT;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS source_id UUID;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS read BOOLEAN;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

-- Valeurs par défaut
ALTER TABLE public.notifications ALTER COLUMN notification_id SET DEFAULT gen_random_uuid();
ALTER TABLE public.notifications ALTER COLUMN type SET DEFAULT 'general';
ALTER TABLE public.notifications ALTER COLUMN message SET DEFAULT '';
ALTER TABLE public.notifications ALTER COLUMN read SET DEFAULT false;
ALTER TABLE public.notifications ALTER COLUMN created_at SET DEFAULT now();
ALTER TABLE public.notifications ALTER COLUMN updated_at SET DEFAULT now();

-- Nettoyage des NULL
UPDATE public.notifications SET notification_id = gen_random_uuid() WHERE notification_id IS NULL;
UPDATE public.notifications SET type = 'general' WHERE type IS NULL;
UPDATE public.notifications SET message = '' WHERE message IS NULL;
UPDATE public.notifications SET read = false WHERE read IS NULL;
UPDATE public.notifications SET created_at = now() WHERE created_at IS NULL;
UPDATE public.notifications SET updated_at = now() WHERE updated_at IS NULL;

-- Contraintes NOT NULL
ALTER TABLE public.notifications ALTER COLUMN notification_id SET NOT NULL;
ALTER TABLE public.notifications ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE public.notifications ALTER COLUMN message SET NOT NULL;
ALTER TABLE public.notifications ALTER COLUMN read SET NOT NULL;
ALTER TABLE public.notifications ALTER COLUMN created_at SET NOT NULL;
ALTER TABLE public.notifications ALTER COLUMN updated_at SET NOT NULL;

-- FK vers auth.users
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_user_id_fkey;
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_actor_id_fkey;

ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_actor_id_fkey
  FOREIGN KEY (actor_id) REFERENCES auth.users(id) ON DELETE SET NULL;

-- Clé primaire
DO $$
DECLARE pk_name TEXT;
BEGIN
  SELECT conname INTO pk_name
  FROM pg_constraint
  WHERE conrelid = 'public.notifications'::regclass AND contype = 'p'
  LIMIT 1;

  IF pk_name IS NOT NULL AND pk_name <> 'notifications_pkey' THEN
    EXECUTE format('ALTER TABLE public.notifications DROP CONSTRAINT %I', pk_name);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.notifications'::regclass AND contype = 'p'
  ) THEN
    ALTER TABLE public.notifications ADD CONSTRAINT notifications_pkey PRIMARY KEY (notification_id);
  END IF;
END $$;

-- Index
CREATE INDEX IF NOT EXISTS idx_notifications_user_created ON public.notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON public.notifications(user_id, read);
CREATE INDEX IF NOT EXISTS idx_notifications_actor ON public.notifications(actor_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON public.notifications(user_id) WHERE read = false;
CREATE INDEX IF NOT EXISTS idx_notifications_type ON public.notifications(type) WHERE type IS NOT NULL;

-- RLS
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notifications_read" ON public.notifications;
DROP POLICY IF EXISTS "notifications_insert" ON public.notifications;
DROP POLICY IF EXISTS "notifications_select_own" ON public.notifications;
DROP POLICY IF EXISTS "notifications_update_own" ON public.notifications;
DROP POLICY IF EXISTS "notifications_delete_own" ON public.notifications;
DROP POLICY IF EXISTS "notif_own" ON public.notifications;
DROP POLICY IF EXISTS "notifications_insert_system" ON public.notifications;
DROP POLICY IF EXISTS "notifications_insert_authenticated" ON public.notifications;

CREATE POLICY "notifications_select_own" ON public.notifications FOR SELECT USING (auth.uid() = id);
CREATE POLICY "notifications_update_own" ON public.notifications FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = id);
CREATE POLICY "notifications_delete_own" ON public.notifications FOR DELETE USING (auth.uid() = id);
CREATE POLICY "notifications_insert_system" ON public.notifications FOR INSERT TO service_role WITH CHECK (true);
CREATE POLICY "notifications_insert_authenticated" ON public.notifications FOR INSERT TO authenticated WITH CHECK (auth.uid() = actor_id);

-- Trigger updated_at
create or replace function public.update_notifications_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists update_notifications_updated_at_trigger on public.notifications;
create trigger update_notifications_updated_at_trigger
before update on public.notifications
for each row execute function public.update_notifications_updated_at();

-- Vue compteur non-lus
DROP VIEW IF EXISTS public.notification_unread_counts;
CREATE VIEW public.notification_unread_counts AS
SELECT user_id, COUNT(*)::BIGINT AS unread_count
FROM public.notifications
WHERE read = false
GROUP BY user_id;

-- Trigger follow notification
CREATE OR REPLACE FUNCTION public.create_follow_notification()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.notifications (user_id, actor_id, type, message, source_id)
    VALUES (NEW.followed_id, NEW.follower_id, 'follow', 'a commencé à vous suivre', NEW.follower_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_follow_created ON public.follows;
CREATE TRIGGER on_follow_created
AFTER INSERT ON public.follows
FOR EACH ROW EXECUTE FUNCTION public.create_follow_notification();

-- Realtime
ALTER TABLE public.notifications REPLICA IDENTITY FULL;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'notifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
  END IF;
END $$;

-- 2.2 Préférences de notification
create table if not exists public.notification_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  push_enabled boolean not null default true,
  messages boolean not null default true,
  social boolean not null default true,
  live boolean not null default true,
  wallet boolean not null default true,
  marketing boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table public.notification_preferences enable row level security;
drop policy if exists notification_preferences_own on public.notification_preferences;
create policy notification_preferences_own on public.notification_preferences
  for all using (auth.uid() = id) with check (auth.uid() = id);

-- ============================================================
-- SECTION 3 : PUSH TOKENS
-- ============================================================

create table if not exists public.push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  token text not null,
  platform text not null check (platform in ('web', 'ios', 'android')),
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, token)
);

alter table public.push_tokens enable row level security;

drop policy if exists push_tokens_insert on public.push_tokens;
drop policy if exists push_tokens_delete on public.push_tokens;
drop policy if exists push_tokens_select on public.push_tokens;

create policy push_tokens_insert on public.push_tokens
  for insert to authenticated with check (user_id = auth.uid());
create policy push_tokens_delete on public.push_tokens
  for delete to authenticated using (user_id = auth.uid());
create policy push_tokens_select on public.push_tokens
  for select to authenticated using (user_id = auth.uid());

create index if not exists idx_push_tokens_platform on public.push_tokens(platform);
create index if not exists idx_push_tokens_updated on public.push_tokens(updated_at desc);
create index if not exists idx_push_tokens_user on public.push_tokens(user_id);

-- Fonction upsert_push_token
create or replace function public.upsert_push_token(
  p_user_id uuid,
  p_token text,
  p_platform text,
  p_user_agent text default null
)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or auth.uid() <> p_user_id then
    raise exception 'Non autorisé';
  end if;

  delete from public.push_tokens
  where user_id = p_user_id and platform = p_platform and token <> p_token;

  insert into public.push_tokens (user_id, token, platform, user_agent, updated_at)
  values (p_user_id, p_token, p_platform, p_user_agent, now())
  on conflict (user_id, token)
  do update set user_agent = excluded.user_agent, updated_at = now();
end;
$$;

revoke all on function public.upsert_push_token(uuid, text, text, text) from public, anon;
grant execute on function public.upsert_push_token(uuid, text, text, text) to authenticated;

-- Fonction prune_stale_push_tokens
create or replace function public.prune_stale_push_tokens(max_age interval default interval '180 days')
returns integer
language plpgsql security definer set search_path = public as $$
declare deleted_count integer;
begin
  delete from public.push_tokens where updated_at < now() - max_age;
  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

revoke all on function public.prune_stale_push_tokens(interval) from public, anon, authenticated;
grant execute on function public.prune_stale_push_tokens(interval) to service_role;

-- ============================================================
-- SECTION 4 : FOLLOWS ET PROFILES (RLS)
-- ============================================================

alter table public.follows enable row level security;
alter table public.profiles enable row level security;

-- Policies follows
drop policy if exists follows_select_own on public.follows;
create policy follows_select_own on public.follows
  for select to authenticated
  using (follower_id = auth.uid() or followed_id = auth.uid());

drop policy if exists follows_insert_own on public.follows;
create policy follows_insert_own on public.follows
  for insert to authenticated
  with check (follower_id = auth.uid());

drop policy if exists follows_update_own on public.follows;
create policy follows_update_own on public.follows
  for update to authenticated
  using (follower_id = auth.uid() or followed_id = auth.uid())
  with check (follower_id = auth.uid() or followed_id = auth.uid());

drop policy if exists follows_delete_own on public.follows;
create policy follows_delete_own on public.follows
  for delete to authenticated
  using (follower_id = auth.uid() or followed_id = auth.uid());

-- Policies profiles
drop policy if exists profiles_select_all on public.profiles;
create policy profiles_select_all on public.profiles
  for select to authenticated using (true);

drop policy if exists profiles_insert_own on public.profiles;
create policy profiles_insert_own on public.profiles
  for insert to authenticated with check (id = auth.uid());

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists profiles_delete_own on public.profiles;
create policy profiles_delete_own on public.profiles
  for delete to authenticated using (id = auth.uid());

-- ============================================================
-- SECTION 5 : DROITS D'EXÉCUTION
-- ============================================================

do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'group_role','can_see_group','channel_group','is_banned','can_post_in_channel',
        'create_community_group','create_community_channel','join_community_group',
        'ban_community_member','unban_community_member','set_member_role','report_community_message',
        'create_group_invite','list_group_invites','revoke_group_invite','peek_group_invite',
        'upsert_push_token'
      )
  loop
    execute format('revoke all on function %s from public, anon', f.sig);
    execute format('grant execute on function %s to authenticated', f.sig);
  end loop;
end $$;

-- ============================================================
-- BAARO — CLOUDflare R2 MEDIA METADATA
-- Binary files live in Cloudflare R2. Supabase stores metadata only.
-- ============================================================
create table if not exists public.media_assets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  provider text not null default 'cloudflare-r2' check (provider = 'cloudflare-r2'),
  bucket text not null,
  folder text not null check (folder in ('profiles','posts','videos','chat','shop','misc')),
  object_key text not null,
  public_url text not null,
  mime_type text not null,
  byte_size bigint not null check (byte_size > 0),
  original_name text,
  status text not null default 'ready' check (status in ('pending','ready','failed','deleted')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (bucket, object_key)
);
create index if not exists idx_media_assets_owner_created on public.media_assets(owner_id, created_at desc);
create index if not exists idx_media_assets_owner_folder on public.media_assets(owner_id, folder, created_at desc);
create index if not exists idx_media_assets_status on public.media_assets(status, created_at desc);
alter table public.media_assets enable row level security;
drop policy if exists media_assets_select_own on public.media_assets;
create policy media_assets_select_own on public.media_assets for select to authenticated using (auth.uid() = owner_id);

-- ============================================================
-- BAARO — UPDATED AT HELPER FOR MEDIA METADATA
-- ============================================================
create or replace function public.set_media_assets_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;
drop trigger if exists trg_media_assets_updated_at on public.media_assets;
create trigger trg_media_assets_updated_at before update on public.media_assets for each row execute function public.set_media_assets_updated_at();


-- ============================================================
-- BAARO — POST-DEPENDENCY FOREIGN KEYS
-- Added after all referenced commerce/community tables exist.
-- ============================================================
do $$ begin
  if to_regclass('public.conversations') is not null then
    alter table public.messages drop constraint if exists messages_conversation_id_fkey;
    alter table public.messages add constraint messages_conversation_id_fkey
      foreign key (conversation_id) references public.conversations(id) on delete cascade;
  end if;
exception when duplicate_object then null;
end $$;

do $$ begin
  if to_regclass('public.shops') is not null then
    alter table public.orders drop constraint if exists orders_shop_id_fkey;
    alter table public.orders add constraint orders_shop_id_fkey
      foreign key (shop_id) references public.shops(id) on delete set null;
  end if;
exception when duplicate_object then null;
end $$;

do $$ begin
  if to_regclass('public.shop_products') is not null then
    alter table public.order_items drop constraint if exists order_items_product_id_fkey;
    alter table public.order_items add constraint order_items_product_id_fkey
      foreign key (product_id) references public.shop_products(id) on delete set null;
  end if;
exception when duplicate_object then null;
end $$;



-- ===== SOURCE 0002_video_nextgen.sql =====
-- BAARO Video NextGen
-- Social video layer: remix/duet, collaborations, chapters, polls, Q&A,
-- challenges, bookmarks/collections, creator intelligence and personalization.

create table if not exists public.video_collections (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  description text,
  is_public boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(owner_id, name)
);

create table if not exists public.video_bookmarks (
  user_id uuid not null references public.profiles(id) on delete cascade,
  video_id uuid not null references public.videos(id) on delete cascade,
  collection_id uuid references public.video_collections(id) on delete set null,
  note text,
  created_at timestamptz not null default now(),
  primary key(user_id, video_id)
);

create table if not exists public.video_collaborations (
  id uuid primary key default gen_random_uuid(),
  video_id uuid not null references public.videos(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  collaborator_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'co_creator' check (role in ('co_creator','guest','editor','sponsor')),
  status text not null default 'pending' check (status in ('pending','accepted','declined','removed')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  unique(video_id, collaborator_id),
  check(owner_id <> collaborator_id)
);

create table if not exists public.video_remixes (
  id uuid primary key default gen_random_uuid(),
  video_id uuid not null references public.videos(id) on delete cascade,
  source_video_id uuid not null references public.videos(id) on delete cascade,
  creator_id uuid not null references public.profiles(id) on delete cascade,
  mode text not null check (mode in ('remix','duet','react','quote','green_screen','reply')),
  source_start_ms integer not null default 0 check (source_start_ms >= 0),
  source_end_ms integer check (source_end_ms is null or source_end_ms > source_start_ms),
  created_at timestamptz not null default now(),
  unique(video_id)
);

create table if not exists public.video_chapters (
  id uuid primary key default gen_random_uuid(),
  video_id uuid not null references public.videos(id) on delete cascade,
  position integer not null check (position >= 0),
  start_ms integer not null check (start_ms >= 0),
  title text not null check (char_length(title) between 1 and 120),
  created_at timestamptz not null default now(),
  unique(video_id, position)
);

create table if not exists public.video_polls (
  id uuid primary key default gen_random_uuid(),
  video_id uuid not null references public.videos(id) on delete cascade,
  question text not null check (char_length(question) between 1 and 240),
  options jsonb not null default '[]'::jsonb,
  duration_seconds integer check (duration_seconds is null or duration_seconds between 5 and 604800),
  allow_multiple boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.video_poll_votes (
  poll_id uuid not null references public.video_polls(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  option_key text not null,
  created_at timestamptz not null default now(),
  primary key(poll_id, user_id, option_key)
);

create table if not exists public.video_questions (
  id uuid primary key default gen_random_uuid(),
  video_id uuid not null references public.videos(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  question text not null check (char_length(question) between 1 and 500),
  answer_video_id uuid references public.videos(id) on delete set null,
  status text not null default 'open' check (status in ('open','answered','hidden')),
  created_at timestamptz not null default now(),
  answered_at timestamptz
);

create table if not exists public.video_challenges (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 100),
  description text,
  hashtag text not null check (hashtag ~ '^[a-zA-Z0-9_]{2,60}$'),
  cover_url text,
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  reward_label text,
  status text not null default 'active' check (status in ('draft','active','ended','paused')),
  created_at timestamptz not null default now(),
  unique(hashtag)
);

create table if not exists public.video_challenge_entries (
  challenge_id uuid not null references public.video_challenges(id) on delete cascade,
  video_id uuid not null references public.videos(id) on delete cascade,
  creator_id uuid not null references public.profiles(id) on delete cascade,
  score numeric not null default 0,
  rank integer,
  created_at timestamptz not null default now(),
  primary key(challenge_id, video_id)
);

-- Creator-side intelligence, kept as metadata rather than storing media.
alter table public.videos add column if not exists content_mode text not null default 'original'
  check (content_mode in ('original','remix','duet','react','reply','collab','challenge','tutorial','music','comedy','education'));
alter table public.videos add column if not exists language_code text;
alter table public.videos add column if not exists ai_caption text;
alter table public.videos add column if not exists ai_topics jsonb not null default '[]'::jsonb;
alter table public.videos add column if not exists ai_highlights jsonb not null default '[]'::jsonb;
alter table public.videos add column if not exists chapters jsonb not null default '[]'::jsonb;
alter table public.videos add column if not exists cover_frame_ms integer;
alter table public.videos add column if not exists visibility text not null default 'public'
  check (visibility in ('public','followers','private','unlisted'));
alter table public.videos add column if not exists allow_remix boolean not null default true;
alter table public.videos add column if not exists allow_duet boolean not null default true;
alter table public.videos add column if not exists allow_comments boolean not null default true;
alter table public.videos add column if not exists allow_download boolean not null default false;
alter table public.videos add column if not exists allow_tips boolean not null default true;
alter table public.videos add column if not exists challenge_id uuid references public.video_challenges(id) on delete set null;
alter table public.videos add column if not exists recommendation_score numeric not null default 0;
alter table public.videos add column if not exists completion_rate numeric not null default 0;
alter table public.videos add column if not exists rewatch_rate numeric not null default 0;

create index if not exists idx_videos_visibility_created on public.videos(visibility, created_at desc);
create index if not exists idx_videos_mode_created on public.videos(content_mode, created_at desc);
create index if not exists idx_video_bookmarks_user_created on public.video_bookmarks(user_id, created_at desc);
create index if not exists idx_video_remixes_source on public.video_remixes(source_video_id, created_at desc);
create index if not exists idx_video_chapters_video_start on public.video_chapters(video_id, start_ms);
create index if not exists idx_video_questions_video_created on public.video_questions(video_id, created_at desc);
create index if not exists idx_challenge_entries_challenge_score on public.video_challenge_entries(challenge_id, score desc);

alter table public.video_collections enable row level security;
alter table public.video_bookmarks enable row level security;
alter table public.video_collaborations enable row level security;
alter table public.video_remixes enable row level security;
alter table public.video_chapters enable row level security;
alter table public.video_polls enable row level security;
alter table public.video_poll_votes enable row level security;
alter table public.video_questions enable row level security;
alter table public.video_challenges enable row level security;
alter table public.video_challenge_entries enable row level security;

create policy video_collections_read on public.video_collections for select using (is_public or auth.uid() = owner_id);
create policy video_collections_write on public.video_collections for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

create policy video_bookmarks_own on public.video_bookmarks for all using (auth.uid() = id) with check (auth.uid() = id);

create policy video_collaborations_read on public.video_collaborations for select using (auth.uid() = owner_id or auth.uid() = collaborator_id);
create policy video_collaborations_insert on public.video_collaborations for insert with check (auth.uid() = owner_id);
create policy video_collaborations_update on public.video_collaborations for update using (auth.uid() = owner_id or auth.uid() = collaborator_id) with check (auth.uid() = owner_id or auth.uid() = collaborator_id);

create policy video_remixes_read on public.video_remixes for select using (true);
create policy video_remixes_insert on public.video_remixes for insert with check (auth.uid() = creator_id);
create policy video_remixes_delete on public.video_remixes for delete using (auth.uid() = creator_id);

create policy video_chapters_read on public.video_chapters for select using (true);
create policy video_chapters_write on public.video_chapters for all using (auth.uid() = (select author_id from public.videos where id = video_id)) with check (auth.uid() = (select author_id from public.videos where id = video_id));

create policy video_polls_read on public.video_polls for select using (true);
create policy video_polls_write on public.video_polls for all using (auth.uid() = (select author_id from public.videos where id = video_id)) with check (auth.uid() = (select author_id from public.videos where id = video_id));

create policy video_poll_votes_own on public.video_poll_votes for all using (auth.uid() = id) with check (auth.uid() = id);

create policy video_questions_read on public.video_questions for select using (status <> 'hidden' or auth.uid() = author_id or auth.uid() = (select author_id from public.videos where id = video_id));
create policy video_questions_insert on public.video_questions for insert with check (auth.uid() = author_id);
create policy video_questions_update on public.video_questions for update using (auth.uid() = author_id or auth.uid() = (select author_id from public.videos where id = video_id)) with check (auth.uid() = author_id or auth.uid() = (select author_id from public.videos where id = video_id));

create policy video_challenges_read on public.video_challenges for select using (true);
create policy video_challenges_write on public.video_challenges for all using (auth.uid() = creator_id) with check (auth.uid() = creator_id);

create policy video_challenge_entries_read on public.video_challenge_entries for select using (true);
create policy video_challenge_entries_insert on public.video_challenge_entries for insert with check (auth.uid() = creator_id);
create policy video_challenge_entries_delete on public.video_challenge_entries for delete using (auth.uid() = creator_id);

-- One RPC for a personalized discovery score. It intentionally stays deterministic and cheap;
-- a future ranking worker can replace the score without changing the mobile contract.
create or replace function public.video_discovery_score(
  p_video_id uuid,
  p_user_id uuid default auth.uid()
) returns numeric
language sql stable security definer set search_path = public
as $$
  select round(
    (coalesce(v.views,0)::numeric * 0.02)
    + (coalesce(v.likes,0)::numeric * 1.0)
    + (coalesce(v.comments_count,0)::numeric * 1.8)
    + (coalesce(v.completion_rate,0) * 100)
    + (coalesce(v.rewatch_rate,0) * 80)
    + case when v.author_id = p_user_id then -100 else 0 end
  , 4)
  from public.videos v
  where v.id = p_video_id;
$$;

revoke all on function public.video_discovery_score(uuid, uuid) from public;
grant execute on function public.video_discovery_score(uuid, uuid) to authenticated;

-- Realtime for collaborative features.
do $$ begin alter publication supabase_realtime add table public.video_collaborations; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.video_questions; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.video_polls; exception when duplicate_object then null; end $$;



-- ===== SOURCE 0003_nextgen_engines.sql =====
-- BAARO NextGen Engines v1
-- Async media jobs, recommendation signals, creator monetization and AI media metadata.

create table if not exists public.media_jobs (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid references public.media_assets(id) on delete cascade,
  video_id uuid references public.videos(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  job_type text not null check (job_type in ('transcode','thumbnail','captions','translate','dub','moderate','features','highlights','edit_plan')),
  status text not null default 'queued' check (status in ('queued','processing','completed','failed','dead')),
  attempts integer not null default 0,
  max_attempts integer not null default 5,
  priority integer not null default 50 check (priority between 0 and 100),
  payload jsonb not null default '{}'::jsonb,
  result jsonb,
  error text,
  available_at timestamptz not null default now(),
  locked_at timestamptz,
  locked_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_media_jobs_queue
  on public.media_jobs(status, priority desc, available_at asc, created_at asc);
create index if not exists idx_media_jobs_owner
  on public.media_jobs(owner_id, created_at desc);

create table if not exists public.video_watch_events (
  id uuid primary key default gen_random_uuid(),
  video_id uuid not null references public.videos(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete set null,
  session_id text,
  watch_ms integer not null default 0 check (watch_ms >= 0),
  duration_ms integer not null default 0 check (duration_ms >= 0),
  completed boolean not null default false,
  rewatched boolean not null default false,
  skipped boolean not null default false,
  liked boolean not null default false,
  shared boolean not null default false,
  negative_signal text check (negative_signal is null or negative_signal in ('not_interested','hide_creator','report')),
  created_at timestamptz not null default now()
);
create index if not exists idx_video_watch_video_created on public.video_watch_events(video_id, created_at desc);
create index if not exists idx_video_watch_user_created on public.video_watch_events(user_id, created_at desc);

create table if not exists public.video_recommendation_profiles (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  topics jsonb not null default '{}'::jsonb,
  creators jsonb not null default '{}'::jsonb,
  languages jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.creator_monetization (
  creator_id uuid primary key references public.profiles(id) on delete cascade,
  enabled boolean not null default false,
  revenue_share numeric not null default 0.55 check (revenue_share between 0 and 1),
  min_cashout numeric not null default 1000 check (min_cashout >= 0),
  currency text not null default 'XOF',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.creator_earnings (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references public.profiles(id) on delete cascade,
  source text not null check (source in ('ads','tips','subscriptions','gifts','marketplace','bonus')),
  reference_id uuid,
  gross_amount numeric not null default 0 check (gross_amount >= 0),
  platform_fee numeric not null default 0 check (platform_fee >= 0),
  net_amount numeric generated always as (gross_amount - platform_fee) stored,
  currency text not null default 'XOF',
  status text not null default 'pending' check (status in ('pending','available','paid','reversed')),
  created_at timestamptz not null default now()
);
create index if not exists idx_creator_earnings_creator_created on public.creator_earnings(creator_id, created_at desc);

alter table public.media_jobs enable row level security;
alter table public.video_watch_events enable row level security;
alter table public.video_recommendation_profiles enable row level security;
alter table public.creator_monetization enable row level security;
alter table public.creator_earnings enable row level security;

create policy media_jobs_owner_read on public.media_jobs for select using (auth.uid() = owner_id);
create policy watch_events_own on public.video_watch_events for all using (auth.uid() = id) with check (auth.uid() = id);
create policy recommendation_profile_own on public.video_recommendation_profiles for all using (auth.uid() = id) with check (auth.uid() = id);
create policy creator_monetization_own on public.creator_monetization for all using (auth.uid() = creator_id) with check (auth.uid() = creator_id);
create policy creator_earnings_own on public.creator_earnings for select using (auth.uid() = creator_id);

create or replace function public.claim_media_jobs(p_limit integer default 5, p_worker text default 'vercel')
returns setof public.media_jobs
language plpgsql security definer set search_path=public
as $$
begin
  return query
  with picked as (
    select id from public.media_jobs
    where status='queued' and available_at <= now()
    order by priority desc, created_at asc
    for update skip locked limit greatest(1, least(p_limit, 20))
  )
  update public.media_jobs j
  set status='processing', attempts=j.attempts+1, locked_at=now(), locked_by=p_worker, updated_at=now()
  from picked
  where j.id=picked.id
  returning j.*;
end;
$$;

revoke all on function public.claim_media_jobs(integer,text) from public;

create or replace function public.record_video_watch(
  p_video_id uuid, p_watch_ms integer, p_duration_ms integer,
  p_completed boolean default false, p_rewatched boolean default false,
  p_liked boolean default false, p_shared boolean default false,
  p_negative_signal text default null
) returns void
language plpgsql security definer set search_path=public
as $$
begin
  insert into public.video_watch_events(video_id,user_id,watch_ms,duration_ms,completed,rewatched,liked,shared,negative_signal)
  values (p_video_id,auth.uid(),greatest(p_watch_ms,0),greatest(p_duration_ms,0),p_completed,p_rewatched,p_liked,p_shared,p_negative_signal);
  update public.videos v set
    completion_rate = coalesce((select avg(case when completed then 1.0 else least(watch_ms::numeric/nullif(duration_ms,0),1) end) from public.video_watch_events e where e.video_id=v.id),0),
    rewatch_rate = coalesce((select avg(case when rewatched then 1.0 else 0 end) from public.video_watch_events e where e.video_id=v.id),0),
    recommendation_score = (
      coalesce(v.likes,0)*1.0 + coalesce(v.comments_count,0)*1.8 +
      coalesce(v.completion_rate,0)*100 + coalesce(v.rewatch_rate,0)*80 +
      greatest(0, extract(epoch from (now()-v.created_at))/3600 * -0.15)
    )
  where v.id=p_video_id;
end;
$$;
revoke all on function public.record_video_watch(uuid,integer,integer,boolean,boolean,boolean,boolean,text) from public;
grant execute on function public.record_video_watch(uuid,integer,integer,boolean,boolean,boolean,boolean,text) to authenticated;

create or replace function public.video_feed_candidates(p_user_id uuid, p_limit integer default 20)
returns table(
  id uuid, author_id uuid, video_url text, thumbnail_url text, title text, description text,
  duration text, views bigint, likes integer, comments_count integer, created_at timestamptz,
  score numeric
)
language sql stable security definer set search_path=public
as $$
  select v.id,v.author_id,v.video_url,v.thumbnail_url,v.title,v.description,v.duration,
         v.views,v.likes,v.comments_count,v.created_at,
         round(
           coalesce(v.recommendation_score,0)
           + case when v.author_id=p_user_id then -20 else 0 end
           + greatest(0, 30 - extract(epoch from (now()-v.created_at))/3600 * 0.25)
           + coalesce(v.completion_rate,0)*120
           + coalesce(v.rewatch_rate,0)*100
           - coalesce((select count(*)*8 from public.video_watch_events e where e.video_id=v.id and e.user_id=p_user_id and e.created_at > now()-interval '7 days'),0)
         ,4) as score
  from public.videos v
  where coalesce(v.visibility,'public')='public'
    and not exists(select 1 from public.blocks b where b.blocker_id=p_user_id and b.blocked_id=v.author_id)
  order by score desc, v.created_at desc
  limit greatest(1,least(p_limit,100));
$$;
revoke all on function public.video_feed_candidates(uuid,integer) from public;
grant execute on function public.video_feed_candidates(uuid,integer) to authenticated;



-- ===== SOURCE 0004_messaging_nextgen.sql =====
-- BAARO Next-Gen Messaging
-- Realtime state, reactions, receipts, edits, pins, stars, disappearing messages,
-- device/session metadata and abuse controls. Message body remains client-side E2E.

alter table public.messages add column if not exists client_message_id text;
alter table public.messages add column if not exists reply_to_id uuid references public.messages(id) on delete set null;
alter table public.messages add column if not exists edited_at timestamptz;
alter table public.messages add column if not exists expires_at timestamptz;
alter table public.messages add column if not exists delivered_at timestamptz;
alter table public.messages add column if not exists read_at timestamptz;
alter table public.messages add column if not exists metadata jsonb not null default '{}'::jsonb;
create unique index if not exists idx_messages_client_id on public.messages(sender_id, client_message_id) where client_message_id is not null;
create index if not exists idx_messages_reply on public.messages(reply_to_id);
create index if not exists idx_messages_expiry on public.messages(expires_at) where expires_at is not null;

create table if not exists public.message_reactions (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  reaction text not null check (reaction in ('❤️','😂','😮','😢','😡','👍','👎','🔥','🙏','🎉')),
  created_at timestamptz not null default now(),
  unique(message_id, user_id)
);
create index if not exists idx_message_reactions_message on public.message_reactions(message_id);

create table if not exists public.message_stars (
  message_id uuid not null references public.messages(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(message_id, user_id)
);

create table if not exists public.conversation_settings (
  conversation_id uuid primary key references public.conversations(id) on delete cascade,
  disappearing_seconds integer check (disappearing_seconds is null or disappearing_seconds in (0, 86400, 604800, 2592000)),
  read_receipts boolean not null default true,
  typing_indicators boolean not null default true,
  link_previews boolean not null default true,
  media_auto_download boolean not null default false,
  updated_at timestamptz not null default now()
);

create table if not exists public.chat_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  device_id text not null,
  public_key jsonb not null,
  label text,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  unique(user_id, device_id)
);
create index if not exists idx_chat_devices_user on public.chat_devices(user_id);

create table if not exists public.message_reports (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages(id) on delete cascade,
  reporter_id uuid not null references auth.users(id) on delete cascade,
  reason text not null check (reason in ('spam','harassment','scam','violence','sexual','other')),
  created_at timestamptz not null default now(),
  unique(message_id, reporter_id)
);

alter table public.message_reactions enable row level security;
alter table public.message_stars enable row level security;
alter table public.conversation_settings enable row level security;
alter table public.chat_devices enable row level security;
alter table public.message_reports enable row level security;

-- A reaction/star is visible only to participants of its conversation.
drop policy if exists message_reactions_read on public.message_reactions;
create policy message_reactions_read on public.message_reactions for select using (
  exists (select 1 from public.messages m join public.conversations c on c.id=m.conversation_id
          where m.id=message_reactions.message_id and (c.user1_id=auth.uid() or c.user2_id=auth.uid()))
);
drop policy if exists message_reactions_write on public.message_reactions;
create policy message_reactions_write on public.message_reactions for all using (user_id=auth.uid()) with check (user_id=auth.uid());

drop policy if exists message_stars_own on public.message_stars;
create policy message_stars_own on public.message_stars for all using (user_id=auth.uid()) with check (user_id=auth.uid());

drop policy if exists conversation_settings_read on public.conversation_settings;
create policy conversation_settings_read on public.conversation_settings for select using (
  exists (select 1 from public.conversations c where c.id=conversation_settings.conversation_id and (c.user1_id=auth.uid() or c.user2_id=auth.uid()))
);
drop policy if exists conversation_settings_write on public.conversation_settings;
create policy conversation_settings_write on public.conversation_settings for all using (
  exists (select 1 from public.conversations c where c.id=conversation_settings.conversation_id and (c.user1_id=auth.uid() or c.user2_id=auth.uid()))
) with check (
  exists (select 1 from public.conversations c where c.id=conversation_settings.conversation_id and (c.user1_id=auth.uid() or c.user2_id=auth.uid()))
);

drop policy if exists chat_devices_own on public.chat_devices;
create policy chat_devices_own on public.chat_devices for all using (user_id=auth.uid()) with check (user_id=auth.uid());

drop policy if exists message_reports_own on public.message_reports;
create policy message_reports_own on public.message_reports for insert with check (reporter_id=auth.uid());
create policy message_reports_read_own on public.message_reports for select using (reporter_id=auth.uid());

-- Realtime only for non-secret metadata/state tables; message text stays E2E.
do $$ begin alter publication supabase_realtime add table public.message_reactions; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.message_stars; exception when duplicate_object then null; end $$;

create or replace function public.touch_message_read(p_message_id uuid)
returns void language plpgsql security invoker set search_path=public as $$
begin
  update public.messages m
     set read_at = now(), delivered_at = coalesce(delivered_at, now())
   where m.id = p_message_id
     and m.recipient_id = auth.uid();
end;
$$;

create or replace function public.set_message_expiry(p_message_id uuid, p_seconds integer)
returns void language plpgsql security invoker set search_path=public as $$
begin
  update public.messages m
     set expires_at = case when p_seconds is null or p_seconds <= 0 then null else now() + make_interval(secs => p_seconds) end
   where m.id = p_message_id and m.sender_id = auth.uid();
end;
$$;

create table if not exists public.message_pins (
  message_id uuid primary key references public.messages(id) on delete cascade,
  pinned_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.message_pins enable row level security;
create policy message_pins_read on public.message_pins for select using (
  exists (select 1 from public.messages m join public.conversations c on c.id=m.conversation_id where m.id=message_pins.message_id and (c.user1_id=auth.uid() or c.user2_id=auth.uid()))
);
create policy message_pins_write on public.message_pins for all using (pinned_by=auth.uid()) with check (pinned_by=auth.uid());

alter table public.messages add column if not exists scheduled_for timestamptz;
create index if not exists idx_messages_scheduled on public.messages(scheduled_for) where scheduled_for is not null;

create table if not exists public.chat_ai_jobs (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  requested_by uuid not null references auth.users(id) on delete cascade,
  action text not null check (action in ('summary','smart_reply','translate','rewrite','tone','extract_tasks')),
  target_language text,
  status text not null default 'queued' check (status in ('queued','running','done','failed')),
  result jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
alter table public.chat_ai_jobs enable row level security;
create policy chat_ai_jobs_own on public.chat_ai_jobs for all using (requested_by=auth.uid()) with check (requested_by=auth.uid());



-- ===== SOURCE 0005_global_stories_community_nextgen.sql =====
-- BAARO NextGen: global search, stories, community capabilities
create extension if not exists pg_trgm;

create table if not exists public.stories (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references auth.users(id) on delete cascade,
  media_url text,
  media_type text not null default 'image' check (media_type in ('image','video','text')),
  caption text,
  background text,
  visibility text not null default 'followers' check (visibility in ('public','followers','close_friends')),
  expires_at timestamptz not null default (now() + interval '24 hours'),
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists stories_author_created_idx on public.stories(author_id, created_at desc);
create index if not exists stories_expires_idx on public.stories(expires_at);

create table if not exists public.story_views (
  story_id uuid not null references public.stories(id) on delete cascade,
  viewer_id uuid not null references auth.users(id) on delete cascade,
  viewed_at timestamptz not null default now(),
  primary key (story_id, viewer_id)
);
create table if not exists public.story_reactions (
  story_id uuid not null references public.stories(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  reaction text not null default '❤️',
  created_at timestamptz not null default now(),
  primary key (story_id, user_id)
);
create table if not exists public.story_replies (
  id uuid primary key default gen_random_uuid(),
  story_id uuid not null references public.stories(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);

alter table public.stories enable row level security;
alter table public.story_views enable row level security;
alter table public.story_reactions enable row level security;
alter table public.story_replies enable row level security;

drop policy if exists stories_read on public.stories;
create policy stories_read on public.stories for select to authenticated using (
  deleted_at is null and expires_at > now() and (
    visibility = 'public' or author_id = auth.uid() or
    visibility in ('followers','close_friends')
  )
);
drop policy if exists stories_insert on public.stories;
create policy stories_insert on public.stories for insert to authenticated with check (author_id = auth.uid());
drop policy if exists stories_update on public.stories;
create policy stories_update on public.stories for update to authenticated using (author_id = auth.uid()) with check (author_id = auth.uid());
drop policy if exists stories_delete on public.stories;
create policy stories_delete on public.stories for delete to authenticated using (author_id = auth.uid());

drop policy if exists story_views_owner on public.story_views;
create policy story_views_owner on public.story_views for all to authenticated using (viewer_id = auth.uid()) with check (viewer_id = auth.uid());
drop policy if exists story_reactions_owner on public.story_reactions;
create policy story_reactions_owner on public.story_reactions for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists story_replies_participant on public.story_replies;
create policy story_replies_participant on public.story_replies for all to authenticated using (sender_id = auth.uid() or exists (select 1 from public.stories s where s.id = story_id and s.author_id = auth.uid())) with check (sender_id = auth.uid());

create or replace function public.record_story_view(p_story_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.story_views(story_id, viewer_id) values (p_story_id, auth.uid())
  on conflict (story_id, viewer_id) do update set viewed_at = now();
end; $$;

grant execute on function public.record_story_view(uuid) to authenticated;

-- Search suggestions/history are private and never expose raw query history publicly.
create table if not exists public.search_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  query text not null check (char_length(query) between 1 and 200),
  created_at timestamptz not null default now()
);
create index if not exists search_history_user_idx on public.search_history(user_id, created_at desc);
alter table public.search_history enable row level security;
drop policy if exists search_history_owner on public.search_history;
create policy search_history_owner on public.search_history for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Community events, roles, moderation already exist in the base schema; these indexes improve discovery.
create index if not exists groups_name_trgm_idx on public.groups using gin (name gin_trgm_ops);
create index if not exists groups_category_idx on public.groups(category);
create index if not exists community_reports_status_idx on public.community_reports(status, created_at desc);

-- Safe, bounded global discovery over the core public entities already present in BAARO.
create or replace function public.global_discovery_search(p_query text, p_limit int default 8)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare q text := trim(coalesce(p_query,'')); lim int := least(greatest(coalesce(p_limit,8),1),20);
begin
  if char_length(q) < 2 then return jsonb_build_object('users','[]'::jsonb,'groups','[]'::jsonb,'debates','[]'::jsonb,'posts','[]'::jsonb); end if;
  return jsonb_build_object(
    'users', coalesce((select jsonb_agg(to_jsonb(x)) from (select id, display_name, handle, avatar_url, flag from profiles where display_name ilike '%'||q||'%' or handle ilike '%'||q||'%' order by display_name limit lim) x),'[]'::jsonb),
    'groups', coalesce((select jsonb_agg(to_jsonb(x)) from (select id, name, description, avatar_url, category from groups where is_public = true and (name ilike '%'||q||'%' or description ilike '%'||q||'%') order by created_at desc limit lim) x),'[]'::jsonb),
    'debates', coalesce((select jsonb_agg(to_jsonb(x)) from (select id, title, topic, status from debate_rooms where status = 'active' and (title ilike '%'||q||'%' or topic ilike '%'||q||'%') order by created_at desc limit lim) x),'[]'::jsonb),
    'posts', coalesce((select jsonb_agg(to_jsonb(x)) from (select id, author_id, content, media_url, created_at from posts where content ilike '%'||q||'%' order by created_at desc limit lim) x),'[]'::jsonb)
  );
end; $$;
grant execute on function public.global_discovery_search(text,int) to authenticated;



-- ===== SOURCE 0006_baaro_future_nexus.sql =====
-- BAARO Future Nexus: user-controlled intelligence, trust, goals and interoperable spaces.
-- No secret material is stored here. Sensitive AI memory is explicit, scoped and deletable by the owner.

create table if not exists public.nexus_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  ai_enabled boolean not null default true,
  personalization_enabled boolean not null default true,
  memory_enabled boolean not null default false,
  discovery_mode text not null default 'balanced' check (discovery_mode in ('balanced','chronological','serendipity','local')),
  data_export_enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

create table if not exists public.nexus_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 160),
  description text check (description is null or char_length(description) <= 2000),
  status text not null default 'active' check (status in ('active','paused','completed','archived')),
  progress numeric(5,2) not null default 0 check (progress >= 0 and progress <= 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists nexus_goals_user_idx on public.nexus_goals(user_id, status, updated_at desc);

create table if not exists public.nexus_memory_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  scope text not null default 'personal' check (scope in ('personal','conversation','community','project')),
  title text not null check (char_length(title) between 1 and 160),
  content text not null check (char_length(content) between 1 and 5000),
  source text not null default 'user' check (source in ('user','assistant','imported')),
  expires_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists nexus_memory_user_idx on public.nexus_memory_items(user_id, created_at desc);

create table if not exists public.nexus_trust_events (
  id uuid primary key default gen_random_uuid(),
  subject_id uuid not null references auth.users(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  kind text not null check (kind in ('verified_identity','successful_trade','community_contribution','reported_abuse','resolved_report','quality_content','spam_penalty')),
  weight integer not null default 0 check (weight between -100 and 100),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists nexus_trust_subject_idx on public.nexus_trust_events(subject_id, created_at desc);

create table if not exists public.nexus_actions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  action_type text not null check (action_type in ('recommend','remind','summarize','translate','learn','create','sell','connect')),
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'queued' check (status in ('queued','running','completed','failed','cancelled')),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create index if not exists nexus_actions_user_idx on public.nexus_actions(user_id, created_at desc);

alter table public.nexus_preferences enable row level security;
alter table public.nexus_goals enable row level security;
alter table public.nexus_memory_items enable row level security;
alter table public.nexus_trust_events enable row level security;
alter table public.nexus_actions enable row level security;

drop policy if exists nexus_preferences_owner on public.nexus_preferences;
create policy nexus_preferences_owner on public.nexus_preferences for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists nexus_goals_owner on public.nexus_goals;
create policy nexus_goals_owner on public.nexus_goals for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists nexus_memory_owner on public.nexus_memory_items;
create policy nexus_memory_owner on public.nexus_memory_items for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists nexus_actions_owner on public.nexus_actions;
create policy nexus_actions_owner on public.nexus_actions for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Trust is readable only for the subject; aggregation can later be exposed through a controlled RPC.
drop policy if exists nexus_trust_subject on public.nexus_trust_events;
create policy nexus_trust_subject on public.nexus_trust_events for select to authenticated using (subject_id = auth.uid());

create or replace function public.nexus_trust_score(p_user_id uuid)
returns integer language sql stable security definer set search_path = public as $$
  select greatest(0, least(100, 50 + coalesce(sum(weight),0)::integer)) from public.nexus_trust_events where subject_id = p_user_id;
$$;
grant execute on function public.nexus_trust_score(uuid) to authenticated;

create or replace function public.nexus_bootstrap()
returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  insert into public.nexus_preferences(user_id) values(uid) on conflict (user_id) do nothing;
  return jsonb_build_object(
    'trust_score', public.nexus_trust_score(uid),
    'goals', (select count(*) from public.nexus_goals where user_id = uid and status = 'active'),
    'memory_enabled', (select memory_enabled from public.nexus_preferences where user_id = uid)
  );
end; $$;
grant execute on function public.nexus_bootstrap() to authenticated;



-- ===== SOURCE 0007_future_modules_control.sql =====
-- BAARO Future Control Layer: durable controls for advanced modules.
create table if not exists public.module_preferences (
  user_id uuid not null references auth.users(id) on delete cascade,
  module_id text not null,
  settings jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, module_id)
);

create table if not exists public.ai_action_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  module_id text not null,
  action text not null,
  status text not null default 'requested' check (status in ('requested','approved','completed','rejected','failed')),
  consent_version text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.automation_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  module_id text not null,
  name text not null,
  trigger jsonb not null default '{}'::jsonb,
  action jsonb not null default '{}'::jsonb,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.data_export_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  scope text not null default 'all',
  status text not null default 'queued' check (status in ('queued','processing','ready','expired','failed')),
  object_key text,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_ai_action_log_user_time on public.ai_action_log(user_id, created_at desc);
create index if not exists idx_automation_rules_user on public.automation_rules(user_id, enabled);
create index if not exists idx_data_export_jobs_user on public.data_export_jobs(user_id, created_at desc);

alter table public.module_preferences enable row level security;
alter table public.ai_action_log enable row level security;
alter table public.automation_rules enable row level security;
alter table public.data_export_jobs enable row level security;

drop policy if exists module_preferences_owner on public.module_preferences;
create policy module_preferences_owner on public.module_preferences for all using (auth.uid() = id) with check (auth.uid() = id);
drop policy if exists ai_action_log_owner on public.ai_action_log;
create policy ai_action_log_owner on public.ai_action_log for select using (auth.uid() = id);
drop policy if exists automation_rules_owner on public.automation_rules;
create policy automation_rules_owner on public.automation_rules for all using (auth.uid() = id) with check (auth.uid() = id);
drop policy if exists data_export_jobs_owner on public.data_export_jobs;
create policy data_export_jobs_owner on public.data_export_jobs for select, insert using (auth.uid() = id) with check (auth.uid() = id);



-- ===== SOURCE 0008_future_core_intelligence.sql =====
-- BAARO Future Core: AI agents, Trust ID, anti-scam, offline sync, commerce and observability.
create extension if not exists pgcrypto;

create table if not exists public.future_preferences (
  user_id uuid not null references auth.users(id) on delete cascade,
  module_key text not null check (module_key in ('ai_agent','trust','anti_scam','translator','offline','commerce','creator','observability')),
  enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (user_id, module_key)
);

create table if not exists public.ai_agent_tasks (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  goal text not null check (char_length(goal) between 1 and 2000), status text not null default 'draft' check (status in ('draft','awaiting_confirmation','running','completed','failed','cancelled')),
  plan jsonb not null default '[]'::jsonb, result jsonb, requires_confirmation boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table if not exists public.trust_events (
  id uuid primary key default gen_random_uuid(), subject_user_id uuid not null references auth.users(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null, event_type text not null,
  evidence jsonb not null default '{}'::jsonb, weight numeric(8,3) not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.safety_signals (
  id uuid primary key default gen_random_uuid(), user_id uuid references auth.users(id) on delete cascade,
  target_type text not null check (target_type in ('account','message','link','post','transaction','seller')),
  target_id text not null, risk_level text not null check (risk_level in ('low','medium','high','critical')),
  reasons jsonb not null default '[]'::jsonb, action text check (action in ('allow','warn','block','review')),
  created_at timestamptz not null default now()
);

create table if not exists public.offline_sync_queue (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  client_id text not null, operation text not null, payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending','processing','done','failed')),
  attempts int not null default 0, next_attempt_at timestamptz not null default now(), created_at timestamptz not null default now(),
  unique(user_id, client_id)
);

create table if not exists public.creator_revenue_events (
  id uuid primary key default gen_random_uuid(), creator_id uuid not null references auth.users(id) on delete cascade,
  source text not null, gross_minor bigint not null default 0, creator_minor bigint not null default 0,
  currency text not null default 'USD', status text not null default 'pending', metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.observability_events (
  id bigint generated always as identity primary key, service text not null, event_type text not null,
  severity text not null default 'info' check (severity in ('debug','info','warn','error','critical')),
  duration_ms integer, request_id text, region text, metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
);

alter table public.future_preferences enable row level security;
alter table public.ai_agent_tasks enable row level security;
alter table public.trust_events enable row level security;
alter table public.safety_signals enable row level security;
alter table public.offline_sync_queue enable row level security;
alter table public.creator_revenue_events enable row level security;
alter table public.observability_events enable row level security;

drop policy if exists future_preferences_owner on public.future_preferences;
create policy future_preferences_owner on public.future_preferences for all using (auth.uid() = id) with check (auth.uid() = id);
drop policy if exists ai_agent_tasks_owner on public.ai_agent_tasks;
create policy ai_agent_tasks_owner on public.ai_agent_tasks for all using (auth.uid() = id) with check (auth.uid() = id);
drop policy if exists offline_sync_owner on public.offline_sync_queue;
create policy offline_sync_owner on public.offline_sync_queue for all using (auth.uid() = id) with check (auth.uid() = id);
drop policy if exists creator_revenue_owner on public.creator_revenue_events;
create policy creator_revenue_owner on public.creator_revenue_events for select using (auth.uid() = creator_id);
drop policy if exists safety_signal_owner on public.safety_signals;
create policy safety_signal_owner on public.safety_signals for select using (auth.uid() = id);

create or replace function public.future_export_user_data()
returns jsonb language plpgsql security invoker set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  return jsonb_build_object(
    'exported_at', now(),
    'future_preferences', coalesce((select jsonb_agg(to_jsonb(x)) from public.future_preferences x where x.user_id = uid), '[]'::jsonb),
    'ai_agent_tasks', coalesce((select jsonb_agg(to_jsonb(x)) from public.ai_agent_tasks x where x.user_id = uid), '[]'::jsonb),
    'offline_sync_queue', coalesce((select jsonb_agg(to_jsonb(x)) from public.offline_sync_queue x where x.user_id = uid), '[]'::jsonb),
    'creator_revenue_events', coalesce((select jsonb_agg(to_jsonb(x)) from public.creator_revenue_events x where x.creator_id = uid), '[]'::jsonb)
  );
end; $$;

create index if not exists idx_trust_events_subject_created on public.trust_events(subject_user_id, created_at desc);
create index if not exists idx_safety_signals_target on public.safety_signals(target_type, target_id, created_at desc);
create index if not exists idx_offline_queue_ready on public.offline_sync_queue(user_id, status, next_attempt_at);
create index if not exists idx_observability_created on public.observability_events(created_at desc);



-- ===== SOURCE 0009_hardened_security.sql =====
-- BAARO Security Hardening
-- Defense-in-depth: device registry, security events, session controls,
-- abuse throttling, safer server-only tables and strict ownership policies.

create extension if not exists pgcrypto;

create table if not exists public.security_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  device_id text not null check (char_length(device_id) between 16 and 200),
  label text,
  platform text check (platform in ('web','android','ios','desktop','unknown')),
  public_key jsonb,
  fingerprint text,
  trusted boolean not null default false,
  revoked_at timestamptz,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique(user_id, device_id)
);

create table if not exists public.security_events (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users(id) on delete set null,
  event_type text not null check (event_type in (
    'login','logout','password_change','mfa_change','device_added','device_revoked',
    'session_rejected','suspicious_login','rate_limited','report_created','data_exported',
    'security_setting_changed','key_rotated'
  )),
  device_id text,
  request_id text,
  ip_hash text,
  user_agent_hash text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.security_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  require_mfa boolean not null default false,
  login_alerts boolean not null default true,
  new_device_approval boolean not null default true,
  remote_logout_enabled boolean not null default true,
  ai_sensitive_action_confirmation boolean not null default true,
  updated_at timestamptz not null default now()
);

create table if not exists public.abuse_counters (
  bucket_key text primary key,
  window_started_at timestamptz not null,
  request_count integer not null default 0,
  blocked_until timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.security_devices enable row level security;
alter table public.security_events enable row level security;
alter table public.security_settings enable row level security;
alter table public.abuse_counters enable row level security;

revoke all on public.security_events from anon, authenticated;
revoke all on public.abuse_counters from anon, authenticated;

-- Device registry: users can see/revoke only their own devices.
drop policy if exists security_devices_owner on public.security_devices;
create policy security_devices_owner on public.security_devices
  for select using (auth.uid() = id);

drop policy if exists security_devices_insert on public.security_devices;
create policy security_devices_insert on public.security_devices
  for insert with check (auth.uid() = id);

drop policy if exists security_devices_update on public.security_devices;
create policy security_devices_update on public.security_devices
  for update using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists security_devices_delete on public.security_devices;
create policy security_devices_delete on public.security_devices
  for delete using (auth.uid() = id);

-- Settings are strictly owner-scoped.
drop policy if exists security_settings_owner on public.security_settings;
create policy security_settings_owner on public.security_settings
  for all using (auth.uid() = id) with check (auth.uid() = id);

create index if not exists idx_security_devices_user on public.security_devices(user_id, last_seen_at desc);
create index if not exists idx_security_devices_active on public.security_devices(user_id) where revoked_at is null;
create index if not exists idx_security_events_user_created on public.security_events(user_id, created_at desc);
create index if not exists idx_security_events_created on public.security_events(created_at desc);

-- Prevent clients from writing server-controlled risk/audit tables.
revoke all on public.trust_events from anon, authenticated;
revoke all on public.observability_events from anon, authenticated;

-- Safe owner-scoped helper; it exposes only the caller's device state.
create or replace function public.security_list_devices()
returns table (
  id uuid,
  device_id text,
  label text,
  platform text,
  fingerprint text,
  trusted boolean,
  revoked_at timestamptz,
  last_seen_at timestamptz,
  created_at timestamptz
)
language sql
security invoker
stable
set search_path = public
as $$
  select d.id, d.device_id, d.label, d.platform, d.fingerprint,
         d.trusted, d.revoked_at, d.last_seen_at, d.created_at
  from public.security_devices d
  where d.user_id = auth.uid()
  order by d.last_seen_at desc;
$$;

grant execute on function public.security_list_devices() to authenticated;

-- Owner-only remote revoke helper.
create or replace function public.security_revoke_device(target_device_id text)
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
begin
  update public.security_devices
     set revoked_at = now(), trusted = false
   where user_id = auth.uid()
     and device_id = target_device_id
     and revoked_at is null;
  return found;
end;
$$;

grant execute on function public.security_revoke_device(text) to authenticated;

-- Generic per-user security settings bootstrap.
insert into public.security_settings(user_id)
select id from auth.users
on conflict (user_id) do nothing;

-- Keep potentially sensitive free-form data from growing without bounds.
alter table public.security_events add constraint security_events_metadata_size
  check (pg_column_size(metadata) <= 32768);
alter table public.security_devices add constraint security_device_label_size
  check (label is null or char_length(label) <= 120);



-- ===== SOURCE 0010_security_final.sql =====
-- BAARO Security Finalization 0010
-- Tightens the previously identified privilege/visibility gaps without changing api/.
-- This migration is additive/idempotent and is intended to run AFTER 0009.

begin;

-- ---------------------------------------------------------------------------
-- 1) Story audience: explicit close-friends membership and real follower checks
-- ---------------------------------------------------------------------------
create table if not exists public.story_close_friends (
  owner_id uuid not null references auth.users(id) on delete cascade,
  member_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (owner_id, member_id),
  check (owner_id <> member_id)
);

alter table public.story_close_friends enable row level security;

drop policy if exists story_close_friends_owner on public.story_close_friends;
create policy story_close_friends_owner
on public.story_close_friends
for all to authenticated
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

create index if not exists idx_story_close_friends_member
  on public.story_close_friends(member_id, owner_id);

-- Replace the permissive Story policy with an actual audience check.
drop policy if exists stories_read on public.stories;
create policy stories_read
on public.stories
for select to authenticated
using (
  deleted_at is null
  and expires_at > now()
  and (
    author_id = auth.uid()
    or visibility = 'public'
    or (
      visibility = 'followers'
      and exists (
        select 1
        from public.follows f
        where f.follower_id = auth.uid()
          and f.followed_id = stories.author_id
          and f.status = 'accepted'
      )
    )
    or (
      visibility = 'close_friends'
      and exists (
        select 1
        from public.story_close_friends cf
        where cf.owner_id = stories.author_id
          and cf.member_id = auth.uid()
      )
    )
  )
);

-- Views/reactions/replies are additionally constrained by Story visibility.
drop policy if exists story_views_owner on public.story_views;
create policy story_views_owner
on public.story_views
for all to authenticated
using (
  viewer_id = auth.uid()
  and exists (select 1 from public.stories s where s.id = story_id and (
    s.author_id = auth.uid() or s.visibility = 'public'
    or (s.visibility = 'followers' and exists (
      select 1 from public.follows f where f.follower_id = auth.uid() and f.followed_id = s.author_id and f.status = 'accepted'))
    or (s.visibility = 'close_friends' and exists (
      select 1 from public.story_close_friends cf where cf.owner_id = s.author_id and cf.member_id = auth.uid()))
  ))
)
with check (
  viewer_id = auth.uid()
  and exists (select 1 from public.stories s where s.id = story_id and s.deleted_at is null and s.expires_at > now() and (
    s.author_id = auth.uid() or s.visibility = 'public'
    or (s.visibility = 'followers' and exists (
      select 1 from public.follows f where f.follower_id = auth.uid() and f.followed_id = s.author_id and f.status = 'accepted'))
    or (s.visibility = 'close_friends' and exists (
      select 1 from public.story_close_friends cf where cf.owner_id = s.author_id and cf.member_id = auth.uid()))
  ))
);

drop policy if exists story_reactions_owner on public.story_reactions;
create policy story_reactions_owner
on public.story_reactions
for all to authenticated
using (
  user_id = auth.uid()
  and exists (select 1 from public.stories s where s.id = story_id and (
    s.author_id = auth.uid() or s.visibility = 'public'
    or (s.visibility = 'followers' and exists (
      select 1 from public.follows f where f.follower_id = auth.uid() and f.followed_id = s.author_id and f.status = 'accepted'))
    or (s.visibility = 'close_friends' and exists (
      select 1 from public.story_close_friends cf where cf.owner_id = s.author_id and cf.member_id = auth.uid()))
  ))
)
with check (
  user_id = auth.uid()
  and exists (select 1 from public.stories s where s.id = story_id and s.deleted_at is null and s.expires_at > now() and (
    s.author_id = auth.uid() or s.visibility = 'public'
    or (s.visibility = 'followers' and exists (
      select 1 from public.follows f where f.follower_id = auth.uid() and f.followed_id = s.author_id and f.status = 'accepted'))
    or (s.visibility = 'close_friends' and exists (
      select 1 from public.story_close_friends cf where cf.owner_id = s.author_id and cf.member_id = auth.uid()))
  ))
);

drop policy if exists story_replies_participant on public.story_replies;
create policy story_replies_participant
on public.story_replies
for all to authenticated
using (
  sender_id = auth.uid()
  or exists (select 1 from public.stories s where s.id = story_id and s.author_id = auth.uid())
)
with check (
  sender_id = auth.uid()
  and exists (select 1 from public.stories s where s.id = story_id and s.deleted_at is null and s.expires_at > now() and (
    s.author_id = auth.uid() or s.visibility = 'public'
    or (s.visibility = 'followers' and exists (
      select 1 from public.follows f where f.follower_id = auth.uid() and f.followed_id = s.author_id and f.status = 'accepted'))
    or (s.visibility = 'close_friends' and exists (
      select 1 from public.story_close_friends cf where cf.owner_id = s.author_id and cf.member_id = auth.uid()))
  ))
);

-- ---------------------------------------------------------------------------
-- 2) Creator monetization: client cannot set revenue share/cashout rules
-- ---------------------------------------------------------------------------
drop policy if exists creator_monetization_own on public.creator_monetization;
create policy creator_monetization_read
on public.creator_monetization
for select to authenticated
using (creator_id = auth.uid());

-- Only a controlled toggle is exposed to the client. Financial terms remain server-owned.
create or replace function public.set_creator_monetization_enabled(p_enabled boolean)
returns public.creator_monetization
language plpgsql
security invoker
set search_path = public
as $$
declare r public.creator_monetization;
begin
  update public.creator_monetization
     set enabled = p_enabled, updated_at = now()
   where creator_id = auth.uid()
   returning * into r;
  if not found then
    insert into public.creator_monetization(creator_id, enabled)
    values (auth.uid(), p_enabled)
    returning * into r;
  end if;
  return r;
end;
$$;

revoke all on function public.set_creator_monetization_enabled(boolean) from public, anon;
grant execute on function public.set_creator_monetization_enabled(boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 3) Media job claiming: worker-only, never callable by normal clients
-- ---------------------------------------------------------------------------
revoke all on function public.claim_media_jobs(integer,text) from public, anon, authenticated;
grant execute on function public.claim_media_jobs(integer,text) to service_role;

-- ---------------------------------------------------------------------------
-- 4) Video watch/feed RPCs: validate caller identity and bound inputs
-- ---------------------------------------------------------------------------
create or replace function public.record_video_watch(
  p_video_id uuid, p_watch_ms integer, p_duration_ms integer,
  p_completed boolean default false, p_rewatched boolean default false,
  p_liked boolean default false, p_shared boolean default false,
  p_negative_signal text default null
) returns void
language plpgsql security definer set search_path=public
as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  if p_video_id is null or not exists (select 1 from public.videos where id = p_video_id) then raise exception 'video_not_found'; end if;
  if p_watch_ms is null or p_watch_ms < 0 or p_watch_ms > 86400000 then raise exception 'invalid_watch_ms'; end if;
  if p_duration_ms is null or p_duration_ms < 0 or p_duration_ms > 86400000 then raise exception 'invalid_duration_ms'; end if;
  if p_negative_signal is not null and p_negative_signal not in ('not_interested','hide_creator','report') then raise exception 'invalid_negative_signal'; end if;

  insert into public.video_watch_events(video_id,user_id,watch_ms,duration_ms,completed,rewatched,liked,shared,negative_signal)
  values (p_video_id,uid,p_watch_ms,p_duration_ms,p_completed,p_rewatched,p_liked,p_shared,p_negative_signal);

  update public.videos v set
    completion_rate = coalesce((select avg(case when completed then 1.0 else least(watch_ms::numeric/nullif(duration_ms,0),1) end) from public.video_watch_events e where e.video_id=v.id),0),
    rewatch_rate = coalesce((select avg(case when rewatched then 1.0 else 0 end) from public.video_watch_events e where e.video_id=v.id),0),
    recommendation_score = (
      coalesce(v.likes,0)*1.0 + coalesce(v.comments_count,0)*1.8 +
      coalesce(v.completion_rate,0)*100 + coalesce(v.rewatch_rate,0)*80 +
      greatest(0, extract(epoch from (now()-v.created_at))/3600 * -0.15)
    )
  where v.id=p_video_id;
end;
$$;
revoke all on function public.record_video_watch(uuid,integer,integer,boolean,boolean,boolean,boolean,text) from public, anon;
grant execute on function public.record_video_watch(uuid,integer,integer,boolean,boolean,boolean,boolean,text) to authenticated;

-- Feed candidates can only be requested for the current user.
create or replace function public.video_feed_candidates(p_user_id uuid, p_limit integer default 20)
returns table(id uuid, author_id uuid, video_url text, thumbnail_url text, title text, description text,
  duration text, views bigint, likes integer, comments_count integer, created_at timestamptz, score numeric)
language sql stable security definer set search_path=public
as $$
  select v.id,v.author_id,v.video_url,v.thumbnail_url,v.title,v.description,v.duration,
         v.views,v.likes,v.comments_count,v.created_at,
         round(coalesce(v.recommendation_score,0)
           + case when v.author_id=auth.uid() then -20 else 0 end
           + greatest(0, 30 - extract(epoch from (now()-v.created_at))/3600 * 0.25)
           + coalesce(v.completion_rate,0)*120 + coalesce(v.rewatch_rate,0)*100
           - coalesce((select count(*)*8 from public.video_watch_events e where e.video_id=v.id and e.user_id=auth.uid() and e.created_at > now()-interval '7 days'),0),4) as score
  from public.videos v
  where auth.uid() = p_user_id
    and coalesce(v.visibility,'public')='public'
    and not exists(select 1 from public.blocks b where b.blocker_id=auth.uid() and b.blocked_id=v.author_id)
    and not exists(select 1 from public.blocks b where b.blocker_id=v.author_id and b.blocked_id=auth.uid())
  order by score desc, v.created_at desc
  limit greatest(1,least(coalesce(p_limit,20),100));
$$;
revoke all on function public.video_feed_candidates(uuid,integer) from public, anon;
grant execute on function public.video_feed_candidates(uuid,integer) to authenticated;

-- ---------------------------------------------------------------------------
-- 5) Global search: explicit public visibility + block filtering
-- ---------------------------------------------------------------------------
create or replace function public.global_discovery_search(p_query text, p_limit int default 8)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare
  q text := left(trim(coalesce(p_query,'')),200);
  lim int := least(greatest(coalesce(p_limit,8),1),20);
  uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  if char_length(q) < 2 then return jsonb_build_object('users','[]'::jsonb,'groups','[]'::jsonb,'debates','[]'::jsonb,'posts','[]'::jsonb); end if;
  return jsonb_build_object(
    'users', coalesce((select jsonb_agg(to_jsonb(x)) from (
      select p.id,p.display_name,p.handle,p.avatar_url,p.flag from public.profiles p
      where (p.display_name ilike '%'||q||'%' or p.handle ilike '%'||q||'%')
        and p.id <> uid
        and not exists(select 1 from public.blocks b where b.blocker_id=uid and b.blocked_id=p.id)
        and not exists(select 1 from public.blocks b where b.blocker_id=p.id and b.blocked_id=uid)
      order by p.display_name limit lim) x),'[]'::jsonb),
    'groups', coalesce((select jsonb_agg(to_jsonb(x)) from (
      select g.id,g.name,g.description,g.avatar_url,g.category from public.groups g
      where g.is_public = true and (g.name ilike '%'||q||'%' or g.description ilike '%'||q||'%')
      order by g.created_at desc limit lim) x),'[]'::jsonb),
    'debates', coalesce((select jsonb_agg(to_jsonb(x)) from (
      select d.id,d.title,d.topic,d.status from public.debate_rooms d
      where d.status = 'active' and (d.title ilike '%'||q||'%' or d.topic ilike '%'||q||'%')
      order by d.created_at desc limit lim) x),'[]'::jsonb),
    'posts', coalesce((select jsonb_agg(to_jsonb(x)) from (
      select p.id,p.author_id,p.text as content,p.media_url,p.created_at from public.posts p
      where p.text ilike '%'||q||'%'
        and not exists(select 1 from public.blocks b where b.blocker_id=uid and b.blocked_id=p.author_id)
        and not exists(select 1 from public.blocks b where b.blocker_id=p.author_id and b.blocked_id=uid)
      order by p.created_at desc limit lim) x),'[]'::jsonb)
  );
end; $$;
revoke all on function public.global_discovery_search(text,int) from public, anon;
grant execute on function public.global_discovery_search(text,int) to authenticated;

-- ---------------------------------------------------------------------------
-- 6) Trust score: never expose another user's detailed score through RPC
-- ---------------------------------------------------------------------------
create or replace function public.nexus_trust_score(p_user_id uuid)
returns integer language plpgsql stable security definer set search_path=public as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if p_user_id <> auth.uid() then raise exception 'forbidden'; end if;
  return greatest(0, least(100, 50 + coalesce((select sum(weight) from public.nexus_trust_events where subject_id = auth.uid()),0)::integer));
end; $$;
revoke all on function public.nexus_trust_score(uuid) from public, anon;
grant execute on function public.nexus_trust_score(uuid) to authenticated;


-- Harden Story view recording: it must be an actually visible, live story.
create or replace function public.record_story_view(p_story_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  if not exists (
    select 1 from public.stories s
    where s.id = p_story_id and s.deleted_at is null and s.expires_at > now()
      and (
        s.author_id = uid or s.visibility = 'public'
        or (s.visibility = 'followers' and exists (
          select 1 from public.follows f where f.follower_id = uid and f.followed_id = s.author_id and f.status = 'accepted'))
        or (s.visibility = 'close_friends' and exists (
          select 1 from public.story_close_friends cf where cf.owner_id = s.author_id and cf.member_id = uid))
      )
  ) then raise exception 'forbidden'; end if;
  insert into public.story_views(story_id, viewer_id) values (p_story_id, uid)
  on conflict (story_id, viewer_id) do update set viewed_at = now();
end; $$;
revoke all on function public.record_story_view(uuid) from public, anon;
grant execute on function public.record_story_view(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 7) Message pins: must be a participant and the actor must own the pin
-- ---------------------------------------------------------------------------
drop policy if exists message_pins_write on public.message_pins;
create policy message_pins_write
on public.message_pins
for all to authenticated
using (
  pinned_by = auth.uid()
  and exists (
    select 1 from public.messages m
    join public.conversations c on c.id = m.conversation_id
    where m.id = message_id and (c.user1_id = auth.uid() or c.user2_id = auth.uid())
  )
)
with check (
  pinned_by = auth.uid()
  and exists (
    select 1 from public.messages m
    join public.conversations c on c.id = m.conversation_id
    where m.id = message_id and (c.user1_id = auth.uid() or c.user2_id = auth.uid())
  )
);

-- ---------------------------------------------------------------------------
-- 8) Server-owned financial/audit tables: clients may read only their own
-- ---------------------------------------------------------------------------
revoke insert, update, delete on public.creator_earnings from anon, authenticated;
revoke insert, update, delete on public.creator_revenue_events from anon, authenticated;
revoke insert, update, delete on public.observability_events from anon, authenticated;
revoke insert, update, delete on public.security_events from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 9) Bounds on user-controlled fields that can be abused for storage/DoS
-- ---------------------------------------------------------------------------
do $$ begin
  alter table public.stories add constraint stories_caption_size check (caption is null or char_length(caption) <= 5000);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.stories add constraint stories_media_url_size check (media_url is null or char_length(media_url) <= 4096);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.search_history add constraint search_history_query_size check (char_length(query) <= 200);
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- 10) Secure worker/server functions are not exposed to anonymous clients.
-- ---------------------------------------------------------------------------
revoke all on function public.security_list_devices() from public, anon;
revoke all on function public.security_revoke_device(text) from public, anon;
grant execute on function public.security_list_devices() to authenticated;
grant execute on function public.security_revoke_device(text) to authenticated;

commit;



-- ===== SOURCE 0011_engagement_names_and_post_views.sql =====
-- BAARO: engagement visibility for content owners
-- Shows names of viewers/likers to the owner only.
-- Adds post views and hardens video view RPC access.

-- ---------------------------------------------------------------------------
-- 1) Post views: one counted view per authenticated viewer per UTC day.
-- ---------------------------------------------------------------------------
alter table public.posts add column if not exists views_count bigint not null default 0;

create table if not exists public.post_views (
  post_id uuid not null references public.posts(id) on delete cascade,
  viewer_id uuid not null references auth.users(id) on delete cascade,
  view_date date not null default current_date,
  viewed_at timestamptz not null default now(),
  primary key (post_id, viewer_id, view_date)
);

create index if not exists idx_post_views_post_date
  on public.post_views(post_id, viewed_at desc);
create index if not exists idx_post_views_viewer_date
  on public.post_views(viewer_id, viewed_at desc);

alter table public.post_views enable row level security;
drop policy if exists post_views_owner_read on public.post_views;
create policy post_views_owner_read on public.post_views
  for select to authenticated
  using (exists (
    select 1 from public.posts p
    where p.id = post_id and p.author_id = auth.uid()
  ));

drop policy if exists post_views_client_insert on public.post_views;

create or replace function public.register_post_view(p_post_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  owner_id uuid;
  inserted boolean := false;
  new_views bigint := 0;
begin
  if uid is null then raise exception 'AUTH_REQUIRED'; end if;

  select author_id into owner_id from public.posts where id = p_post_id;
  if owner_id is null then raise exception 'POST_NOT_FOUND'; end if;

  -- A creator opening their own post does not create an artificial view.
  if owner_id = uid then
    select coalesce(views_count, 0) into new_views from public.posts where id = p_post_id;
    return jsonb_build_object('counted', false, 'views', new_views);
  end if;

  insert into public.post_views(post_id, viewer_id, view_date)
  values (p_post_id, uid, current_date)
  on conflict (post_id, viewer_id, view_date) do nothing;

  inserted := found;
  if inserted then
    update public.posts
       set views_count = coalesce(views_count, 0) + 1,
           updated_at = now()
     where id = p_post_id
     returning views_count into new_views;
  else
    select coalesce(views_count, 0) into new_views from public.posts where id = p_post_id;
  end if;

  return jsonb_build_object('counted', inserted, 'views', new_views);
end;
$$;

revoke all on function public.register_post_view(uuid) from public, anon;
grant execute on function public.register_post_view(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 2) Engagement-list RPCs. They expose identity data only to the content owner.
-- ---------------------------------------------------------------------------
create or replace function public.get_story_viewers(p_story_id uuid)
returns table(viewer_id uuid, display_name text, handle text, avatar_url text, flag text, viewed_at timestamptz)
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if not exists (select 1 from public.stories where id = p_story_id and author_id = auth.uid()) then raise exception 'ACCESS_DENIED'; end if;
  return query
    select v.viewer_id, p.display_name, p.handle, p.avatar_url, p.flag, v.viewed_at
    from public.story_views v
    left join public.profiles p on p.id = v.viewer_id
    where v.story_id = p_story_id
    order by v.viewed_at desc;
end;
$$;

create or replace function public.get_story_reactors(p_story_id uuid)
returns table(user_id uuid, display_name text, handle text, avatar_url text, flag text, reaction text, created_at timestamptz)
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if not exists (select 1 from public.stories where id = p_story_id and author_id = auth.uid()) then raise exception 'ACCESS_DENIED'; end if;
  return query
    select r.user_id, p.display_name, p.handle, p.avatar_url, p.flag, r.reaction, r.created_at
    from public.story_reactions r
    left join public.profiles p on p.id = r.user_id
    where r.story_id = p_story_id
    order by r.created_at desc;
end;
$$;

create or replace function public.get_video_viewers(p_video_id uuid)
returns table(viewer_id uuid, display_name text, handle text, avatar_url text, flag text, viewed_at timestamptz)
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if not exists (select 1 from public.videos where id = p_video_id and author_id = auth.uid()) then raise exception 'ACCESS_DENIED'; end if;
  return query
    select x.viewer_id, p.display_name, p.handle, p.avatar_url, p.flag, x.viewed_at
    from (
      select distinct on (v.viewer_id) v.viewer_id, v.viewed_at
      from public.video_views v
      where v.video_id = p_video_id
      order by v.viewer_id, v.viewed_at desc
    ) x
    left join public.profiles p on p.id = x.viewer_id
    order by x.viewed_at desc;
end;
$$;

create or replace function public.get_video_likers(p_video_id uuid)
returns table(user_id uuid, display_name text, handle text, avatar_url text, flag text, created_at timestamptz)
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if not exists (select 1 from public.videos where id = p_video_id and author_id = auth.uid()) then raise exception 'ACCESS_DENIED'; end if;
  return query
    select l.user_id, p.display_name, p.handle, p.avatar_url, p.flag, l.created_at
    from public.video_likes l
    left join public.profiles p on p.id = l.user_id
    where l.video_id = p_video_id
    order by l.created_at desc;
end;
$$;

create or replace function public.get_post_viewers(p_post_id uuid)
returns table(viewer_id uuid, display_name text, handle text, avatar_url text, flag text, viewed_at timestamptz)
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if not exists (select 1 from public.posts where id = p_post_id and author_id = auth.uid()) then raise exception 'ACCESS_DENIED'; end if;
  return query
    select x.viewer_id, p.display_name, p.handle, p.avatar_url, p.flag, x.viewed_at
    from (
      select distinct on (v.viewer_id) v.viewer_id, v.viewed_at
      from public.post_views v
      where v.post_id = p_post_id
      order by v.viewer_id, v.viewed_at desc
    ) x
    left join public.profiles p on p.id = x.viewer_id
    order by x.viewed_at desc;
end;
$$;

create or replace function public.get_post_likers(p_post_id uuid)
returns table(user_id uuid, display_name text, handle text, avatar_url text, flag text, created_at timestamptz)
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if not exists (select 1 from public.posts where id = p_post_id and author_id = auth.uid()) then raise exception 'ACCESS_DENIED'; end if;
  return query
    select l.user_id, p.display_name, p.handle, p.avatar_url, p.flag, l.created_at
    from public.post_likes l
    left join public.profiles p on p.id = l.user_id
    where l.post_id = p_post_id
    order by l.created_at desc;
end;
$$;

revoke all on function public.get_story_viewers(uuid) from public, anon;
revoke all on function public.get_story_reactors(uuid) from public, anon;
revoke all on function public.get_video_viewers(uuid) from public, anon;
revoke all on function public.get_video_likers(uuid) from public, anon;
revoke all on function public.get_post_viewers(uuid) from public, anon;
revoke all on function public.get_post_likers(uuid) from public, anon;
grant execute on function public.get_story_viewers(uuid) to authenticated;
grant execute on function public.get_story_reactors(uuid) to authenticated;
grant execute on function public.get_video_viewers(uuid) to authenticated;
grant execute on function public.get_video_likers(uuid) to authenticated;
grant execute on function public.get_post_viewers(uuid) to authenticated;
grant execute on function public.get_post_likers(uuid) to authenticated;

-- 3) Final correction: video views are authenticated-only, not anonymous.
revoke all on function public.register_video_view(uuid) from public, anon;
grant execute on function public.register_video_view(uuid) to authenticated;

-- Owners need aggregate counts for their own Story analytics, while writers
-- remain limited to their own rows. This does not expose another user's data.
drop policy if exists story_views_owner on public.story_views;
create policy story_views_owner on public.story_views
for select to authenticated
using (
  viewer_id = auth.uid()
  or exists (select 1 from public.stories s where s.id = story_id and s.author_id = auth.uid())
);

-- Keep mutation restricted to the reacting viewer.
drop policy if exists story_reactions_owner on public.story_reactions;
create policy story_reactions_read on public.story_reactions
for select to authenticated
using (
  user_id = auth.uid()
  or exists (select 1 from public.stories s where s.id = story_id and s.author_id = auth.uid())
);
create policy story_reactions_write on public.story_reactions
for insert to authenticated
with check (user_id = auth.uid());
create policy story_reactions_delete on public.story_reactions
for delete to authenticated
using (user_id = auth.uid());



-- ===== FINAL PROFILE / SETTINGS LAYER =====
create or replace function public.get_profile_stats(p_user_id uuid)
returns table(followers bigint, following bigint, friends bigint, posts bigint, likes bigint)
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_user_id is null then raise exception 'USER_REQUIRED'; end if;
  if not exists (select 1 from public.profiles where id = p_user_id) then raise exception 'PROFILE_NOT_FOUND'; end if;
  return query select
    (select count(*) from public.follows f where f.followed_id=p_user_id and f.status='accepted'),
    (select count(*) from public.follows f where f.follower_id=p_user_id and f.status='accepted'),
    (select count(*) from public.follows f where f.followed_id=p_user_id and f.status='accepted' and f.is_friend=true),
    (select count(*) from public.posts p where p.author_id=p_user_id),
    (select count(*) from public.post_likes l join public.posts p on p.id=l.post_id where p.author_id=p_user_id);
end; $$;
revoke all on function public.get_profile_stats(uuid) from public, anon;
grant execute on function public.get_profile_stats(uuid) to authenticated;

create table if not exists public.user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  id uuid generated always as (user_id) stored unique,
  theme text not null default 'midnight', lang text not null default 'fr', country text not null default 'ML', currency text not null default 'XOF',
  data_saver boolean not null default true, autoplay_video boolean not null default false, offline_sync boolean not null default true,
  ai_region text not null default 'auto', ai_suggest boolean not null default true, auto_translate boolean not null default true, translate_media boolean not null default true,
  hide_wallet boolean not null default false, show_earnings boolean not null default false, prefer_debates boolean not null default true, prefer_local boolean not null default true,
  private_profile boolean not null default false, block_screenshots boolean not null default true, biometric boolean not null default false, large_text boolean not null default false, reduce_motion boolean not null default false, notif_push boolean not null default true,
  smart_prefetch boolean not null default true, battery_saver boolean not null default false, low_bandwidth_mode boolean not null default false, local_cache boolean not null default true, privacy_ai boolean not null default true,
  updated_at timestamptz not null default now()
);
alter table public.user_settings enable row level security;
drop policy if exists user_settings_owner_read on public.user_settings; drop policy if exists user_settings_owner_insert on public.user_settings; drop policy if exists user_settings_owner_update on public.user_settings; drop policy if exists user_settings_owner_delete on public.user_settings;
create policy user_settings_owner_read on public.user_settings for select to authenticated using (user_id=auth.uid());
create policy user_settings_owner_insert on public.user_settings for insert to authenticated with check (user_id=auth.uid());
create policy user_settings_owner_update on public.user_settings for update to authenticated using (user_id=auth.uid()) with check (user_id=auth.uid());
create policy user_settings_owner_delete on public.user_settings for delete to authenticated using (user_id=auth.uid());
alter table public.user_settings drop constraint if exists user_settings_lang_check;
alter table public.user_settings add constraint user_settings_lang_check check (lang in ('fr','en','ar','bm','wo','ha','ff','sw','pt','es','nqo','boz','dog','snk'));

-- ============================================================
-- BAARO SOUNDS — bibliothèque audio et droits d'utilisation
-- Une seule migration unifiée : catalogue, licences, validation,
-- attribution et utilisation dans le Video Studio.
-- ============================================================

alter table public.sounds add column if not exists language text;
alter table public.sounds add column if not exists region text;
alter table public.sounds add column if not exists category text not null default 'original';
alter table public.sounds add column if not exists license_code text not null default 'baaro_original';
alter table public.sounds add column if not exists license_name text not null default 'BAARO Original';
alter table public.sounds add column if not exists rights_holder text;
alter table public.sounds add column if not exists attribution_required boolean not null default false;
alter table public.sounds add column if not exists commercial_use_allowed boolean not null default false;
alter table public.sounds add column if not exists remix_allowed boolean not null default false;
alter table public.sounds add column if not exists upload_to_baaro_allowed boolean not null default true;
alter table public.sounds add column if not exists territories text[] not null default array['world'];
alter table public.sounds add column if not exists status text not null default 'approved';
alter table public.sounds add column if not exists submitted_by uuid references auth.users(id) on delete set null;
alter table public.sounds add column if not exists source_url text;
alter table public.sounds add column if not exists rights_verified_at timestamptz;
alter table public.sounds add column if not exists rights_notes text;
alter table public.sounds add column if not exists created_at timestamptz not null default now();
alter table public.sounds add column if not exists updated_at timestamptz not null default now();

alter table public.sounds drop constraint if exists sounds_category_check;
alter table public.sounds add constraint sounds_category_check check (category in ('original','creator','traditional','licensed','public_domain','community'));
alter table public.sounds drop constraint if exists sounds_status_check;
alter table public.sounds add constraint sounds_status_check check (status in ('pending','approved','rejected','disabled'));
alter table public.sounds drop constraint if exists sounds_license_code_check;
alter table public.sounds add constraint sounds_license_code_check check (license_code in ('baaro_original','creator_license','traditional_cultural','public_domain','cc0','cc_by','custom'));

create index if not exists idx_sounds_status_category on public.sounds(status, category);
create index if not exists idx_sounds_language_region on public.sounds(language, region);
create index if not exists idx_sounds_usage_count on public.sounds(usage_count desc);

alter table public.sounds enable row level security;
drop policy if exists sounds_public_read on public.sounds;
create policy sounds_public_read on public.sounds
for select to authenticated
using (status = 'approved' and upload_to_baaro_allowed = true);

drop policy if exists sounds_submitter_read on public.sounds;
create policy sounds_submitter_read on public.sounds
for select to authenticated
using (submitted_by = auth.uid());

-- Catalogue writes are deliberately server/admin controlled. Clients cannot
-- silently change a licence or rights statement after approval.
revoke all on public.sounds from anon, authenticated;
grant select on public.sounds to authenticated;

create or replace function public.search_audio_library(
  p_query text default null,
  p_genre text default null,
  p_language text default null,
  p_region text default null,
  p_limit integer default 50
)
returns table (
  id text,
  title text,
  artist text,
  audio_url text,
  cover_url text,
  duration_seconds integer,
  usage_count integer,
  category text,
  license_code text,
  license_name text,
  rights_holder text,
  attribution_required boolean,
  commercial_use_allowed boolean,
  remix_allowed boolean,
  language text,
  region text,
  source_url text
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    s.id, s.title, s.artist, s.audio_url, s.cover_url,
    null::integer as duration_seconds,
    s.usage_count, s.category, s.license_code, s.license_name,
    s.rights_holder, s.attribution_required, s.commercial_use_allowed,
    s.remix_allowed, s.language, s.region, s.source_url
  from public.sounds s
  where s.status = 'approved'
    and s.upload_to_baaro_allowed = true
    and (p_genre is null or s.category = p_genre or s.category = 'original')
    and (p_language is null or s.language is null or s.language = p_language)
    and (p_region is null or s.region is null or s.region = p_region)
    and (
      nullif(trim(p_query), '') is null
      or s.title ilike '%' || trim(p_query) || '%'
      or coalesce(s.artist, '') ilike '%' || trim(p_query) || '%'
      or coalesce(s.rights_holder, '') ilike '%' || trim(p_query) || '%'
    )
  order by s.usage_count desc, s.created_at desc
  limit greatest(1, least(coalesce(p_limit, 50), 100));
$$;

revoke all on function public.search_audio_library(text,text,text,text,integer) from public, anon;
grant execute on function public.search_audio_library(text,text,text,text,integer) to authenticated;

-- Backward-compatible 3-argument RPC used by existing Video Studio builds.
drop function if exists public.search_audio_library(text,text,integer);
create or replace function public.search_audio_library(
  p_query text default null,
  p_genre text default null,
  p_limit integer default 50
)
returns table (
  id text, title text, artist text, audio_url text, cover_url text,
  duration_seconds integer, usage_count integer, category text,
  license_code text, license_name text, rights_holder text,
  attribution_required boolean, commercial_use_allowed boolean,
  remix_allowed boolean, language text, region text, source_url text
)
language sql stable security invoker set search_path = public
as $$
  select * from public.search_audio_library(p_query, p_genre, null, null, p_limit);
$$;
revoke all on function public.search_audio_library(text,text,integer) from public, anon;
grant execute on function public.search_audio_library(text,text,integer) to authenticated;

create or replace function public.record_sound_usage(p_sound_id text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_sound_id is null or length(trim(p_sound_id)) = 0 then raise exception 'SOUND_REQUIRED'; end if;
  update public.sounds
     set usage_count = usage_count + 1,
         updated_at = now()
   where id = p_sound_id and status = 'approved' and upload_to_baaro_allowed = true;
  return found;
end;
$$;
revoke all on function public.record_sound_usage(text) from public, anon;
grant execute on function public.record_sound_usage(text) to authenticated;

create table if not exists public.sound_submissions (
  id uuid primary key default gen_random_uuid(),
  submitted_by uuid not null references auth.users(id) on delete cascade,
  title text not null check (length(trim(title)) between 1 and 160),
  artist text,
  audio_url text not null,
  cover_url text,
  language text,
  region text,
  category text not null default 'creator',
  rights_holder text,
  license_code text not null default 'creator_license',
  license_name text not null default 'Licence créateur BAARO',
  attribution_required boolean not null default true,
  commercial_use_allowed boolean not null default false,
  remix_allowed boolean not null default false,
  territories text[] not null default array['world'],
  source_url text,
  rights_declaration text not null check (length(trim(rights_declaration)) between 10 and 2000),
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  reviewer_notes text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.sound_submissions enable row level security;
drop policy if exists sound_submissions_owner_read on public.sound_submissions;
create policy sound_submissions_owner_read on public.sound_submissions
for select to authenticated using (submitted_by = auth.uid());
drop policy if exists sound_submissions_owner_insert on public.sound_submissions;
create policy sound_submissions_owner_insert on public.sound_submissions
for insert to authenticated with check (submitted_by = auth.uid());
revoke update, delete on public.sound_submissions from authenticated;
grant select, insert on public.sound_submissions to authenticated;

create or replace function public.submit_baaro_sound(
  p_title text,
  p_artist text,
  p_audio_url text,
  p_language text,
  p_region text,
  p_rights_holder text,
  p_license_code text,
  p_license_name text,
  p_attribution_required boolean,
  p_commercial_use_allowed boolean,
  p_remix_allowed boolean,
  p_source_url text,
  p_rights_declaration text
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_license_code not in ('creator_license','traditional_cultural','public_domain','cc0','cc_by','custom') then
    raise exception 'INVALID_LICENSE';
  end if;
  insert into public.sound_submissions (
    submitted_by,title,artist,audio_url,language,region,rights_holder,
    license_code,license_name,attribution_required,commercial_use_allowed,
    remix_allowed,source_url,rights_declaration
  ) values (
    auth.uid(),trim(p_title),nullif(trim(p_artist),''),p_audio_url,
    nullif(trim(p_language),''),nullif(trim(p_region),''),nullif(trim(p_rights_holder),''),
    p_license_code,coalesce(nullif(trim(p_license_name),''),'Licence créateur BAARO'),
    coalesce(p_attribution_required,true),coalesce(p_commercial_use_allowed,false),
    coalesce(p_remix_allowed,false),nullif(trim(p_source_url),''),trim(p_rights_declaration)
  ) returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.submit_baaro_sound(text,text,text,text,text,text,text,text,boolean,boolean,boolean,text,text) from public, anon;
grant execute on function public.submit_baaro_sound(text,text,text,text,text,text,text,text,boolean,boolean,boolean,text,text) to authenticated;

-- Apply approved submissions to the public catalogue. This function is
-- intentionally service-role/admin-only; clients cannot approve their own work.
create or replace function public.publish_approved_sound(p_submission_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare s public.sound_submissions%rowtype; v_id text;
begin
  if auth.role() <> 'service_role' then raise exception 'FORBIDDEN'; end if;
  select * into s from public.sound_submissions where id = p_submission_id and status = 'approved';
  if not found then raise exception 'SUBMISSION_NOT_APPROVED'; end if;
  v_id := 'creator-' || replace(s.id::text,'-','');
  insert into public.sounds (
    id,title,artist,audio_url,cover_url,category,license_code,license_name,
    rights_holder,attribution_required,commercial_use_allowed,remix_allowed,
    upload_to_baaro_allowed,territories,status,submitted_by,source_url,rights_verified_at,rights_notes
  ) values (
    v_id,s.title,s.artist,s.audio_url,s.cover_url,s.category,s.license_code,s.license_name,
    s.rights_holder,s.attribution_required,s.commercial_use_allowed,s.remix_allowed,
    true,s.territories,'approved',s.submitted_by,s.source_url,now(),s.rights_declaration
  ) on conflict (id) do update set
    audio_url=excluded.audio_url, license_code=excluded.license_code,
    license_name=excluded.license_name, rights_holder=excluded.rights_holder,
    status='approved', rights_verified_at=now(), updated_at=now();
  return v_id;
end;
$$;
revoke all on function public.publish_approved_sound(uuid) from public, anon, authenticated;
grant execute on function public.publish_approved_sound(uuid) to service_role;


-- ==========================================================
-- BAARO — Wallet/Crypto feature permanently decommissioned
-- ==========================================================
-- The product no longer exposes wallet, BARO/crypto balances, or virtual gifts.
-- Keep this in the single coordinated migration so a fresh database never
-- leaves a live financial surface behind.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS signature
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND (p.proname LIKE 'wallet\_%' OR p.proname LIKE 'gift\_%')
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || r.signature || ' CASCADE';
  END LOOP;
END $$;

DROP TABLE IF EXISTS public.gifts_sent CASCADE;
DROP TABLE IF EXISTS public.gifts_catalog CASCADE;
DROP TABLE IF EXISTS public.wallet_ledger CASCADE;
DROP TABLE IF EXISTS public.crypto_holdings CASCADE;
DROP TABLE IF EXISTS public.wallets CASCADE;

ALTER TABLE IF EXISTS public.user_settings DROP COLUMN IF EXISTS wallet;
ALTER TABLE IF EXISTS public.user_settings DROP COLUMN IF EXISTS hide_wallet;
ALTER TABLE IF EXISTS public.user_settings DROP COLUMN IF EXISTS show_earnings;


-- ============================================================
-- BAARO ECONOMY — creator/business earnings without crypto
-- Server-authoritative ledger, payout holds and transparent split.
-- ============================================================

create table if not exists public.economy_policies (
  source text primary key,
  creator_share_bps integer not null check (creator_share_bps between 0 and 10000),
  enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

insert into public.economy_policies(source, creator_share_bps) values
  ('ads',8500),('tips',9000),('subscriptions',8500),('marketplace',9000),
  ('campaigns',8000),('referrals',7000),('bonus',10000)
on conflict (source) do nothing;

create table if not exists public.economy_platform_ledger (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  gross_minor bigint not null check (gross_minor >= 0),
  provider_fee_minor bigint not null default 0 check (provider_fee_minor >= 0),
  creator_minor bigint not null check (creator_minor >= 0),
  platform_minor bigint not null check (platform_minor >= 0),
  currency text not null default 'XOF',
  reference_id uuid,
  idempotency_key text unique,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_economy_platform_created on public.economy_platform_ledger(created_at desc);

create table if not exists public.economy_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  currency text not null default 'XOF',
  pending_minor bigint not null default 0 check (pending_minor >= 0),
  available_minor bigint not null default 0 check (available_minor >= 0),
  payout_hold_minor bigint not null default 0 check (payout_hold_minor >= 0),
  paid_out_minor bigint not null default 0 check (paid_out_minor >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.economy_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  entry_type text not null check (entry_type in ('earning','settlement','payout_hold','payout_paid','payout_reversed','adjustment')),
  bucket text not null check (bucket in ('pending','available','payout_hold','paid_out')),
  direction text not null check (direction in ('credit','debit')),
  source text not null,
  amount_minor bigint not null check (amount_minor > 0),
  currency text not null default 'XOF',
  reference_id uuid,
  idempotency_key text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create unique index if not exists idx_economy_ledger_idempotency on public.economy_ledger(idempotency_key) where idempotency_key is not null;
create index if not exists idx_economy_ledger_user_created on public.economy_ledger(user_id, created_at desc);
create index if not exists idx_economy_ledger_user_source on public.economy_ledger(user_id, source, created_at desc);

create table if not exists public.economy_payouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  amount_minor bigint not null check (amount_minor > 0),
  currency text not null default 'XOF',
  method text not null check (method in ('mobile_money','bank_transfer')),
  destination_token text,
  status text not null default 'pending' check (status in ('pending','processing','paid','failed','cancelled')),
  provider text,
  provider_reference text,
  failure_reason text,
  created_at timestamptz not null default now(),
  processed_at timestamptz
);
create index if not exists idx_economy_payouts_user_created on public.economy_payouts(user_id, created_at desc);

alter table public.economy_policies enable row level security;
alter table public.economy_accounts enable row level security;
alter table public.economy_ledger enable row level security;
alter table public.economy_payouts enable row level security;
alter table public.economy_platform_ledger enable row level security;

revoke all on public.economy_policies from anon, authenticated;
revoke all on public.economy_ledger from anon, authenticated;
revoke all on public.economy_platform_ledger from anon, authenticated;
revoke insert, update, delete on public.economy_accounts from anon, authenticated;

create policy economy_account_read_own on public.economy_accounts for select to authenticated using (user_id = auth.uid());
create policy economy_ledger_read_own on public.economy_ledger for select to authenticated using (user_id = auth.uid());
create policy economy_payout_read_own on public.economy_payouts for select to authenticated using (user_id = auth.uid());

create or replace function public.ensure_economy_account(p_user_id uuid, p_currency text default 'XOF')
returns public.economy_accounts
language plpgsql security definer set search_path=public
as $$
declare r public.economy_accounts;
begin
  if auth.role() <> 'service_role' and auth.uid() is distinct from p_user_id then raise exception 'FORBIDDEN'; end if;
  insert into public.economy_accounts(user_id,currency) values (p_user_id, upper(coalesce(nullif(trim(p_currency),''),'XOF')))
  on conflict (user_id) do nothing;
  select * into r from public.economy_accounts where user_id=p_user_id;
  return r;
end $$;
revoke all on function public.ensure_economy_account(uuid,text) from public, anon;
grant execute on function public.ensure_economy_account(uuid,text) to authenticated, service_role;

create or replace function public.record_economy_event(
  p_idempotency_key text,
  p_creator_id uuid,
  p_source text,
  p_gross_minor bigint,
  p_provider_fee_minor bigint default 0,
  p_currency text default 'XOF',
  p_reference_id uuid default null,
  p_metadata jsonb default '{}'::jsonb
) returns uuid
language plpgsql security definer set search_path=public
as $$
declare
  v_id uuid; v_net bigint; v_creator bigint; v_share integer;
begin
  if auth.role() <> 'service_role' then raise exception 'SERVICE_ROLE_REQUIRED'; end if;
  if p_gross_minor <= 0 or p_provider_fee_minor < 0 or p_provider_fee_minor > p_gross_minor then raise exception 'INVALID_AMOUNT'; end if;
  select creator_share_bps into v_share from public.economy_policies where source=lower(p_source) and enabled=true;
  if v_share is null then raise exception 'ECONOMY_SOURCE_DISABLED'; end if;
  select id into v_id from public.economy_ledger where idempotency_key=p_idempotency_key;
  if v_id is not null then return v_id; end if;
  perform public.ensure_economy_account(p_creator_id,p_currency);
  v_net := p_gross_minor-p_provider_fee_minor;
  v_creator := floor((v_net*v_share)::numeric/10000);
  if v_creator <= 0 then raise exception 'CREATOR_SHARE_ZERO'; end if;
  insert into public.economy_ledger(user_id,entry_type,bucket,direction,source,amount_minor,currency,reference_id,idempotency_key,metadata)
  values(p_creator_id,'earning','pending','credit',lower(p_source),v_creator,upper(p_currency),p_reference_id,p_idempotency_key,
    coalesce(p_metadata,'{}'::jsonb)||jsonb_build_object('gross_minor',p_gross_minor,'provider_fee_minor',p_provider_fee_minor,'creator_share_bps',v_share))
  returning id into v_id;
  insert into public.economy_platform_ledger(source,gross_minor,provider_fee_minor,creator_minor,platform_minor,currency,reference_id,idempotency_key,metadata)
  values(lower(p_source),p_gross_minor,p_provider_fee_minor,v_creator,v_net-v_creator,upper(p_currency),p_reference_id,p_idempotency_key,coalesce(p_metadata,'{}'::jsonb)||jsonb_build_object('creator_share_bps',v_share));
  update public.economy_accounts set pending_minor=pending_minor+v_creator,updated_at=now() where user_id=p_creator_id;
  insert into public.creator_revenue_events(creator_id,source,gross_minor,creator_minor,status,metadata)
  values(p_creator_id,lower(p_source),p_gross_minor,v_creator,'pending',coalesce(p_metadata,'{}'::jsonb))
  on conflict do nothing;
  return v_id;
end $$;
revoke all on function public.record_economy_event(text,uuid,text,bigint,bigint,text,uuid,jsonb) from public, anon, authenticated;
grant execute on function public.record_economy_event(text,uuid,text,bigint,bigint,text,uuid,jsonb) to service_role;

create or replace function public.settle_economy_event(p_ledger_id uuid)
returns boolean
language plpgsql security definer set search_path=public
as $$
declare r public.economy_ledger;
begin
  if auth.role() <> 'service_role' then raise exception 'SERVICE_ROLE_REQUIRED'; end if;
  select * into r from public.economy_ledger where id=p_ledger_id for update;
  if not found then raise exception 'LEDGER_NOT_FOUND'; end if;
  if r.entry_type <> 'earning' or r.bucket <> 'pending' or r.direction <> 'credit' then return true; end if;
  insert into public.economy_ledger(user_id,entry_type,bucket,direction,source,amount_minor,currency,reference_id,metadata)
  values(r.user_id,'settlement','available','credit',r.source,r.amount_minor,r.currency,r.reference_id,jsonb_build_object('from_ledger',r.id));
  update public.economy_accounts set pending_minor=pending_minor-r.amount_minor,available_minor=available_minor+r.amount_minor,updated_at=now() where user_id=r.user_id;
  update public.economy_ledger set metadata=metadata||jsonb_build_object('settled_at',now()) where id=r.id;
  return true;
end $$;
revoke all on function public.settle_economy_event(uuid) from public, anon, authenticated;
grant execute on function public.settle_economy_event(uuid) to service_role;

create or replace function public.request_economy_payout(p_amount_minor bigint,p_method text,p_destination_token text default null)
returns uuid
language plpgsql security invoker set search_path=public
as $$
declare uid uuid:=auth.uid(); a public.economy_accounts; p uuid; min_cash bigint;
begin
  if uid is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_amount_minor <= 0 then raise exception 'INVALID_AMOUNT'; end if;
  if p_method not in ('mobile_money','bank_transfer') then raise exception 'INVALID_PAYOUT_METHOD'; end if;
  select * into a from public.economy_accounts where user_id=uid for update;
  if not found then raise exception 'NO_EARNINGS_ACCOUNT'; end if;
  select round(min_cashout*100)::bigint into min_cash from public.creator_monetization where creator_id=uid;
  min_cash:=coalesce(min_cash,100000);
  if p_amount_minor < min_cash then raise exception 'MIN_CASHOUT'; end if;
  if p_amount_minor > a.available_minor then raise exception 'INSUFFICIENT_AVAILABLE'; end if;
  insert into public.economy_payouts(user_id,amount_minor,currency,method,destination_token) values(uid,p_amount_minor,a.currency,p_method,nullif(trim(p_destination_token),'')) returning id into p;
  insert into public.economy_ledger(user_id,entry_type,bucket,direction,source,amount_minor,currency,reference_id,metadata) values(uid,'payout_hold','payout_hold','credit','payout',p_amount_minor,a.currency,p,jsonb_build_object('status','reserved'));
  update public.economy_accounts set available_minor=available_minor-p_amount_minor,payout_hold_minor=payout_hold_minor+p_amount_minor,updated_at=now() where user_id=uid;
  return p;
end $$;
revoke all on function public.request_economy_payout(bigint,text,text) from public, anon;
grant execute on function public.request_economy_payout(bigint,text,text) to authenticated;

create or replace function public.complete_economy_payout(p_payout_id uuid,p_provider text,p_provider_reference text)
returns boolean
language plpgsql security definer set search_path=public
as $$
declare p public.economy_payouts;
begin
  if auth.role() <> 'service_role' then raise exception 'SERVICE_ROLE_REQUIRED'; end if;
  select * into p from public.economy_payouts where id=p_payout_id for update;
  if not found then raise exception 'PAYOUT_NOT_FOUND'; end if;
  if p.status='paid' then return true; end if;
  if p.status not in ('pending','processing') then raise exception 'PAYOUT_NOT_PAYABLE'; end if;
  update public.economy_payouts set status='paid',provider=p_provider,provider_reference=p_provider_reference,processed_at=now() where id=p.id;
  insert into public.economy_ledger(user_id,entry_type,bucket,direction,source,amount_minor,currency,reference_id,metadata) values(p.user_id,'payout_paid','paid_out','credit','payout',p.amount_minor,p.currency,p.id,jsonb_build_object('provider',p_provider,'provider_reference',p_provider_reference));
  update public.economy_accounts set payout_hold_minor=payout_hold_minor-p.amount_minor,paid_out_minor=paid_out_minor+p.amount_minor,updated_at=now() where user_id=p.user_id;
  return true;
end $$;
revoke all on function public.complete_economy_payout(uuid,text,text) from public, anon, authenticated;
grant execute on function public.complete_economy_payout(uuid,text,text) to service_role;

create or replace function public.cancel_economy_payout(p_payout_id uuid,p_reason text default null)
returns boolean
language plpgsql security definer set search_path=public
as $$
declare p public.economy_payouts;
begin
  if auth.role() <> 'service_role' then raise exception 'SERVICE_ROLE_REQUIRED'; end if;
  select * into p from public.economy_payouts where id=p_payout_id for update;
  if not found then raise exception 'PAYOUT_NOT_FOUND'; end if;
  if p.status in ('paid','cancelled') then return true; end if;
  update public.economy_payouts set status='cancelled',failure_reason=left(p_reason,500),processed_at=now() where id=p.id;
  insert into public.economy_ledger(user_id,entry_type,bucket,direction,source,amount_minor,currency,reference_id,metadata) values(p.user_id,'payout_reversed','available','credit','payout',p.amount_minor,p.currency,p.id,jsonb_build_object('reason',p_reason));
  update public.economy_accounts set payout_hold_minor=payout_hold_minor-p.amount_minor,available_minor=available_minor+p.amount_minor,updated_at=now() where user_id=p.user_id;
  return true;
end $$;
revoke all on function public.cancel_economy_payout(uuid,text) from public, anon, authenticated;
grant execute on function public.cancel_economy_payout(uuid,text) to service_role;

create or replace function public.get_economy_dashboard()
returns jsonb
language plpgsql security invoker set search_path=public
as $$
declare uid uuid:=auth.uid(); a public.economy_accounts; m public.creator_monetization; c text; result jsonb;
begin
  if uid is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into a from public.economy_accounts where user_id=uid;
  select * into m from public.creator_monetization where creator_id=uid;
  c:=coalesce(a.currency,coalesce(m.currency,'XOF'));
  select jsonb_build_object(
    'currency',c,
    'pending_minor',coalesce(a.pending_minor,0),
    'available_minor',coalesce(a.available_minor,0),
    'payout_hold_minor',coalesce(a.payout_hold_minor,0),
    'paid_out_minor',coalesce(a.paid_out_minor,0),
    'min_cashout_minor',round(coalesce(m.min_cashout,1000)*100)::bigint,
    'monetization',jsonb_build_object('enabled',coalesce(m.enabled,false)),
    'by_source',coalesce((select jsonb_agg(x order by x.net_minor desc) from (select source,sum(amount_minor) net_minor from public.economy_ledger where user_id=uid and entry_type='earning' and direction='credit' group by source) x),'[]'::jsonb),
    'recent',coalesce((select jsonb_agg(x order by x.created_at desc) from (select id,source,amount_minor net_minor,currency,created_at from public.economy_ledger where user_id=uid and entry_type='earning' and direction='credit' order by created_at desc limit 20) x),'[]'::jsonb)
  ) into result;
  return result;
end $$;
revoke all on function public.get_economy_dashboard() from public, anon;
grant execute on function public.get_economy_dashboard() to authenticated;

-- Existing creator earnings remain readable only by the owner; all financial writes stay server-side.
revoke insert, update, delete on public.economy_ledger from authenticated, anon;
revoke insert, update, delete on public.economy_accounts from authenticated, anon;
revoke update, delete on public.economy_payouts from authenticated, anon;

-- BAARO MONETIZATION V19
-- Adds the monetization product layer without changing /api.
-- Money is XOF/fiat ledger data; BAARO Credits are closed-loop feature units only.

create table if not exists public.monetization_products (
  code text primary key,
  name text not null,
  description text,
  category text not null,
  price_minor bigint not null check (price_minor >= 0),
  currency text not null default 'XOF',
  billing_period text,
  active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.monetization_products(code,name,description,category,price_minor,currency,billing_period,metadata) values
('premium_monthly','BAARO Premium','Badge Premium, priorité sociale, réactions et avantages exclusifs','premium',150000,'XOF','month','{"verification_independent":true,"feed_multiplier":1.5}'::jsonb),
('vip_group_monthly','Groupe VIP','Accès mensuel à un groupe VIP/close friends','vip',100000,'XOF','month','{"platform_share_bps":2000}'::jsonb),
('pro_merchant_monthly','BAARO Pro','Outils commerçant, statistiques, IA et mise en avant','merchant',500000,'XOF','month','{"platform_share_bps":2000}'::jsonb),
('ai_pack_10','IA — 10 générations','Pack de générations IA après le quota gratuit','ai',10000,'XOF','one_time','{"units":10}'::jsonb),
('cosmetics_pack_6','Pack 6 réactions/badges','Cosmétiques et réactions animées','cosmetics',25000,'XOF','one_time','{"units":6}'::jsonb),
('job_boost_7d','Boost profil emploi 7 jours','Mise en avant d’un profil/job pendant 7 jours','jobs',200000,'XOF','one_time','{"days":7}'::jsonb),
('live_ticket','Billet Live','Billet d’accès à un Live payant','live',100000,'XOF','one_time','{}'::jsonb),
('training_ticket','Formation Live','Accès à une formation en direct','training',300000,'XOF','one_time','{"platform_share_bps":3000}'::jsonb),
('training_replay','Replay formation','Accès au replay d’une formation','training',150000,'XOF','one_time','{"platform_share_bps":3000}'::jsonb),
('api_starter_monthly','BAARO API Starter','API/white-label avec quotas et facturation d’usage','api',490000,'XOF','month','{"usd_reference":49}'::jsonb)
on conflict (code) do update set name=excluded.name,description=excluded.description,price_minor=excluded.price_minor,currency=excluded.currency,billing_period=excluded.billing_period,metadata=excluded.metadata,updated_at=now();

create table if not exists public.monetization_checkout_intents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  product_code text not null references public.monetization_products(code),
  amount_minor bigint not null check (amount_minor > 0),
  currency text not null default 'XOF',
  provider text,
  provider_reference text,
  status text not null default 'pending' check (status in ('pending','processing','paid','failed','expired','cancelled')),
  metadata jsonb not null default '{}'::jsonb,
  expires_at timestamptz not null default (now() + interval '30 minutes'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, id)
);
create index if not exists idx_monetization_checkout_user on public.monetization_checkout_intents(user_id,created_at desc);
create index if not exists idx_monetization_checkout_provider on public.monetization_checkout_intents(provider,provider_reference);

create table if not exists public.premium_subscriptions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  status text not null default 'active' check (status in ('active','paused','cancelled','expired')),
  provider text,
  provider_reference text,
  started_at timestamptz not null default now(),
  current_period_start timestamptz not null default now(),
  current_period_end timestamptz not null,
  auto_renew boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.tips (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references auth.users(id) on delete cascade,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  post_id uuid references public.posts(id) on delete set null,
  live_id uuid,
  amount_minor bigint not null check (amount_minor > 0),
  currency text not null default 'XOF',
  status text not null default 'pending' check (status in ('pending','paid','refunded','failed')),
  provider text,
  provider_reference text,
  idempotency_key text not null unique,
  created_at timestamptz not null default now(),
  check (sender_id <> recipient_id)
);
create index if not exists idx_tips_recipient on public.tips(recipient_id,created_at desc);

create table if not exists public.post_boosts (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  buyer_id uuid not null references auth.users(id) on delete cascade,
  budget_minor bigint not null check (budget_minor > 0),
  duration_hours integer not null default 24 check (duration_hours between 1 and 168),
  status text not null default 'pending' check (status in ('pending','active','completed','cancelled')),
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_post_boost_active on public.post_boosts(post_id,status,ends_at);

create table if not exists public.sponsored_polls (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid,
  advertiser_id uuid not null references auth.users(id) on delete cascade,
  budget_minor bigint not null check (budget_minor > 0),
  target jsonb not null default '{}'::jsonb,
  objective text not null default 'reach' check (objective in ('reach','responses','clicks')),
  status text not null default 'draft' check (status in ('draft','pending','active','paused','completed','cancelled')),
  starts_at timestamptz,
  ends_at timestamptz,
  metrics jsonb not null default '{"impressions":0,"responses":0,"clicks":0}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.vip_group_subscriptions (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  subscriber_id uuid not null references auth.users(id) on delete cascade,
  price_minor bigint not null default 100000,
  currency text not null default 'XOF',
  status text not null default 'active' check (status in ('pending','active','cancelled','expired')),
  period_end timestamptz,
  created_at timestamptz not null default now(),
  unique(group_id,subscriber_id)
);

create table if not exists public.user_cosmetics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  cosmetic_code text not null,
  quantity integer not null default 1 check (quantity > 0),
  source text not null default 'purchase',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(user_id,cosmetic_code)
);

create table if not exists public.merchant_pro_subscriptions (
  merchant_id uuid primary key references auth.users(id) on delete cascade,
  status text not null default 'active' check (status in ('active','paused','cancelled','expired')),
  price_minor bigint not null default 500000,
  currency text not null default 'XOF',
  current_period_end timestamptz,
  features jsonb not null default '{"stats":true,"auto_boost":true,"ai_replies":true}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.local_ad_campaigns (
  id uuid primary key default gen_random_uuid(),
  advertiser_id uuid not null references auth.users(id) on delete cascade,
  budget_minor bigint not null check (budget_minor > 0),
  radius_km numeric not null default 5 check (radius_km > 0 and radius_km <= 100),
  target jsonb not null default '{}'::jsonb,
  objective text not null default 'reach' check (objective in ('reach','clicks','conversions')),
  status text not null default 'draft' check (status in ('draft','pending','active','paused','completed','cancelled')),
  starts_at timestamptz,
  ends_at timestamptz,
  metrics jsonb not null default '{"impressions":0,"clicks":0,"conversions":0}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_local_ads_status on public.local_ad_campaigns(status,starts_at,ends_at);

create table if not exists public.service_bookings (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references public.service_listings(id) on delete cascade,
  customer_id uuid not null references auth.users(id) on delete cascade,
  provider_id uuid not null references auth.users(id) on delete cascade,
  amount_minor bigint not null check (amount_minor >= 0),
  currency text not null default 'XOF',
  status text not null default 'pending' check (status in ('pending','confirmed','completed','cancelled','refunded','disputed','no_show')),
  scheduled_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.api_plans (
  code text primary key,
  name text not null,
  price_minor bigint not null,
  currency text not null default 'XOF',
  monthly_quota bigint not null default 10000,
  metadata jsonb not null default '{}'::jsonb
);
insert into public.api_plans(code,name,price_minor,currency,monthly_quota,metadata) values('starter','BAARO API Starter',490000,'XOF',10000,'{"usd_reference":49}'::jsonb) on conflict(code) do update set price_minor=excluded.price_minor,monthly_quota=excluded.monthly_quota,metadata=excluded.metadata;

create table if not exists public.api_subscriptions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  plan_code text not null references public.api_plans(code),
  status text not null default 'active' check (status in ('active','paused','cancelled','expired')),
  current_period_end timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.api_keys (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  label text not null,
  key_prefix text not null,
  secret_hash text not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index if not exists idx_api_keys_hash on public.api_keys(secret_hash);

create table if not exists public.api_usage_daily (
  owner_id uuid not null references auth.users(id) on delete cascade,
  usage_date date not null default current_date,
  requests bigint not null default 0,
  units bigint not null default 0,
  primary key(owner_id,usage_date)
);

create table if not exists public.live_tickets (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references public.community_events(id) on delete cascade,
  buyer_id uuid not null references auth.users(id) on delete cascade,
  organizer_id uuid not null references auth.users(id) on delete cascade,
  amount_minor bigint not null check (amount_minor > 0),
  currency text not null default 'XOF',
  status text not null default 'pending' check (status in ('pending','paid','refunded','cancelled')),
  provider text,
  provider_reference text,
  ticket_code text unique,
  created_at timestamptz not null default now()
);

create table if not exists public.baaro_credits_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  balance bigint not null default 0 check (balance >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists public.baaro_credits_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  direction text not null check (direction in ('credit','debit')),
  amount bigint not null check (amount > 0),
  source text not null,
  reference_id uuid,
  idempotency_key text not null unique,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.affiliate_attributions (
  id uuid primary key default gen_random_uuid(),
  affiliate_id uuid not null references auth.users(id) on delete cascade,
  product_reference text,
  order_id uuid references public.orders(id) on delete set null,
  sale_amount_minor bigint not null default 0,
  commission_minor bigint not null default 0,
  status text not null default 'pending' check (status in ('pending','approved','paid','reversed','blocked')),
  created_at timestamptz not null default now()
);

create table if not exists public.ai_usage_daily (
  user_id uuid not null references auth.users(id) on delete cascade,
  usage_date date not null default current_date,
  free_generations integer not null default 0,
  paid_generations integer not null default 0,
  units_used integer not null default 0,
  primary key(user_id,usage_date)
);

create table if not exists public.job_profile_boosts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  job_listing_id uuid references public.job_listings(id) on delete cascade,
  starts_at timestamptz not null default now(),
  ends_at timestamptz not null,
  status text not null default 'pending' check (status in ('pending','active','completed','cancelled')),
  created_at timestamptz not null default now()
);

create table if not exists public.profile_view_premium (
  user_id uuid primary key references auth.users(id) on delete cascade,
  enabled boolean not null default false,
  retention_days integer not null default 30 check (retention_days between 1 and 90),
  updated_at timestamptz not null default now()
);

create table if not exists public.live_trainings (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  description text,
  ticket_price_minor bigint not null default 300000,
  replay_price_minor bigint not null default 150000,
  currency text not null default 'XOF',
  starts_at timestamptz not null,
  replay_available boolean not null default false,
  replay_url text,
  status text not null default 'draft' check (status in ('draft','published','live','finished','cancelled')),
  created_at timestamptz not null default now()
);

create table if not exists public.b2b_insight_exports (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references auth.users(id) on delete cascade,
  dataset text not null,
  filters jsonb not null default '{}'::jsonb,
  min_group_size integer not null default 100,
  status text not null default 'requested' check (status in ('requested','approved','generated','expired','rejected')),
  artifact_url text,
  created_at timestamptz not null default now()
);

-- RLS: users can read their own commercial state; financial mutations stay server-side.
alter table public.monetization_products enable row level security;
alter table public.monetization_checkout_intents enable row level security;
alter table public.premium_subscriptions enable row level security;
alter table public.tips enable row level security;
alter table public.post_boosts enable row level security;
alter table public.sponsored_polls enable row level security;
alter table public.vip_group_subscriptions enable row level security;
alter table public.user_cosmetics enable row level security;
alter table public.merchant_pro_subscriptions enable row level security;
alter table public.local_ad_campaigns enable row level security;
alter table public.service_bookings enable row level security;
alter table public.api_plans enable row level security;
alter table public.api_subscriptions enable row level security;
alter table public.api_keys enable row level security;
alter table public.api_usage_daily enable row level security;
alter table public.live_tickets enable row level security;
alter table public.baaro_credits_accounts enable row level security;
alter table public.baaro_credits_ledger enable row level security;
alter table public.affiliate_attributions enable row level security;
alter table public.ai_usage_daily enable row level security;
alter table public.job_profile_boosts enable row level security;
alter table public.profile_view_premium enable row level security;
alter table public.live_trainings enable row level security;
alter table public.b2b_insight_exports enable row level security;

drop policy if exists monetization_products_read on public.monetization_products;
create policy monetization_products_read on public.monetization_products for select to authenticated using (active=true);
drop policy if exists api_plans_read on public.api_plans;
create policy api_plans_read on public.api_plans for select to authenticated using (true);

drop policy if exists checkout_own on public.monetization_checkout_intents;
create policy checkout_own on public.monetization_checkout_intents for select to authenticated using (auth.uid()=user_id);

drop policy if exists premium_own on public.premium_subscriptions;
create policy premium_own on public.premium_subscriptions for select to authenticated using (auth.uid()=user_id);
drop policy if exists tips_sender_recipient_read on public.tips;
create policy tips_sender_recipient_read on public.tips for select to authenticated using (auth.uid()=sender_id or auth.uid()=recipient_id);
drop policy if exists boosts_own on public.post_boosts;
create policy boosts_own on public.post_boosts for select to authenticated using (auth.uid()=buyer_id or exists(select 1 from public.posts p where p.id=post_id and p.author_id=auth.uid()));
drop policy if exists sponsored_own on public.sponsored_polls;
create policy sponsored_own on public.sponsored_polls for select to authenticated using (auth.uid()=advertiser_id);
drop policy if exists vip_own on public.vip_group_subscriptions;
create policy vip_own on public.vip_group_subscriptions for select to authenticated using (auth.uid()=subscriber_id or exists(select 1 from public.groups g where g.id=group_id and g.owner_id=auth.uid()));
drop policy if exists cosmetics_own on public.user_cosmetics;
create policy cosmetics_own on public.user_cosmetics for select to authenticated using (auth.uid()=user_id);
drop policy if exists merchant_pro_own on public.merchant_pro_subscriptions;
create policy merchant_pro_own on public.merchant_pro_subscriptions for select to authenticated using (auth.uid()=merchant_id);
drop policy if exists local_ads_own on public.local_ad_campaigns;
create policy local_ads_own on public.local_ad_campaigns for select to authenticated using (auth.uid()=advertiser_id);
drop policy if exists bookings_party on public.service_bookings;
create policy bookings_party on public.service_bookings for select to authenticated using (auth.uid()=customer_id or auth.uid()=provider_id);
drop policy if exists api_sub_own on public.api_subscriptions;
create policy api_sub_own on public.api_subscriptions for select to authenticated using (auth.uid()=owner_id);
drop policy if exists api_keys_own on public.api_keys;
create policy api_keys_own on public.api_keys for select to authenticated using (auth.uid()=owner_id);
drop policy if exists api_usage_own on public.api_usage_daily;
create policy api_usage_own on public.api_usage_daily for select to authenticated using (auth.uid()=owner_id);
drop policy if exists live_ticket_own on public.live_tickets;
create policy live_ticket_own on public.live_tickets for select to authenticated using (auth.uid()=buyer_id or auth.uid()=organizer_id);
drop policy if exists credits_account_own on public.baaro_credits_accounts;
create policy credits_account_own on public.baaro_credits_accounts for select to authenticated using (auth.uid()=user_id);
drop policy if exists credits_ledger_own on public.baaro_credits_ledger;
create policy credits_ledger_own on public.baaro_credits_ledger for select to authenticated using (auth.uid()=user_id);
drop policy if exists affiliate_own on public.affiliate_attributions;
create policy affiliate_own on public.affiliate_attributions for select to authenticated using (auth.uid()=affiliate_id);
drop policy if exists ai_usage_own on public.ai_usage_daily;
create policy ai_usage_own on public.ai_usage_daily for select to authenticated using (auth.uid()=user_id);
drop policy if exists job_boost_own on public.job_profile_boosts;
create policy job_boost_own on public.job_profile_boosts for select to authenticated using (auth.uid()=user_id);
drop policy if exists profile_view_own on public.profile_view_premium;
create policy profile_view_own on public.profile_view_premium for select to authenticated using (auth.uid()=user_id);
drop policy if exists training_public on public.live_trainings;
create policy training_public on public.live_trainings for select to authenticated using (status in ('published','live','finished') or auth.uid()=host_id);
drop policy if exists insight_own on public.b2b_insight_exports;
create policy insight_own on public.b2b_insight_exports for select to authenticated using (auth.uid()=requester_id);

-- No direct client writes to financial/entitlement tables.
revoke insert,update,delete on public.monetization_checkout_intents from authenticated,anon;
revoke insert,update,delete on public.premium_subscriptions from authenticated,anon;
revoke insert,update,delete on public.tips from authenticated,anon;
revoke insert,update,delete on public.post_boosts from authenticated,anon;
revoke insert,update,delete on public.sponsored_polls from authenticated,anon;
revoke insert,update,delete on public.vip_group_subscriptions from authenticated,anon;
revoke insert,update,delete on public.user_cosmetics from authenticated,anon;
revoke insert,update,delete on public.merchant_pro_subscriptions from authenticated,anon;
revoke insert,update,delete on public.local_ad_campaigns from authenticated,anon;
revoke insert,update,delete on public.service_bookings from authenticated,anon;
revoke insert,update,delete on public.api_subscriptions from authenticated,anon;
revoke insert,update,delete on public.api_keys from authenticated,anon;
revoke insert,update,delete on public.api_usage_daily from authenticated,anon;
revoke insert,update,delete on public.live_tickets from authenticated,anon;
revoke insert,update,delete on public.baaro_credits_accounts from authenticated,anon;
revoke insert,update,delete on public.baaro_credits_ledger from authenticated,anon;
revoke insert,update,delete on public.affiliate_attributions from authenticated,anon;
revoke insert,update,delete on public.ai_usage_daily from authenticated,anon;
revoke insert,update,delete on public.job_profile_boosts from authenticated,anon;
revoke insert,update,delete on public.profile_view_premium from authenticated,anon;
revoke insert,update,delete on public.b2b_insight_exports from authenticated,anon;

create or replace function public.start_monetization_checkout(p_product_code text,p_metadata jsonb default '{}'::jsonb)
returns jsonb
language plpgsql security invoker set search_path=public
as $$
declare uid uuid:=auth.uid(); p public.monetization_products; i public.monetization_checkout_intents;
begin
 if uid is null then raise exception 'AUTH_REQUIRED'; end if;
 select * into p from public.monetization_products where code=p_product_code and active=true;
 if not found then raise exception 'PRODUCT_NOT_FOUND'; end if;
 insert into public.monetization_checkout_intents(user_id,product_code,amount_minor,currency,metadata)
 values(uid,p.code,p.price_minor,p.currency,coalesce(p_metadata,'{}'::jsonb)) returning * into i;
 return jsonb_build_object('id',i.id,'product_code',i.product_code,'amount_minor',i.amount_minor,'currency',i.currency,'status',i.status,'expires_at',i.expires_at);
end $$;
revoke all on function public.start_monetization_checkout(text,jsonb) from public,anon;
grant execute on function public.start_monetization_checkout(text,jsonb) to authenticated;

create or replace function public.set_profile_view_premium(p_enabled boolean)
returns public.profile_view_premium
language plpgsql security invoker set search_path=public
as $$
declare uid uuid:=auth.uid(); r public.profile_view_premium;
begin
 if uid is null then raise exception 'AUTH_REQUIRED'; end if;
 insert into public.profile_view_premium(user_id,enabled) values(uid,p_enabled)
 on conflict(user_id) do update set enabled=excluded.enabled,updated_at=now()
 returning * into r;
 return r;
end $$;
revoke all on function public.set_profile_view_premium(boolean) from public,anon;
grant execute on function public.set_profile_view_premium(boolean) to authenticated;

create or replace function public.get_monetization_catalog()
returns jsonb
language sql security invoker set search_path=public
as $$
 select jsonb_build_object(
  'products',(select coalesce(jsonb_agg(to_jsonb(p) order by p.category,p.price_minor),'[]'::jsonb) from public.monetization_products p where p.active),
  'api_plans',(select coalesce(jsonb_agg(to_jsonb(a) order by a.price_minor),'[]'::jsonb) from public.api_plans a)
 );
$$;
revoke all on function public.get_monetization_catalog() from public,anon;
grant execute on function public.get_monetization_catalog() to authenticated;

-- Service-role fulfillment: provider webhooks call this function after independently verifying payment.
create or replace function public.fulfill_monetization_checkout(p_intent_id uuid,p_provider text,p_provider_reference text)
returns boolean
language plpgsql security definer set search_path=public
as $$
declare i public.monetization_checkout_intents; now_end timestamptz;
begin
 if auth.role() <> 'service_role' then raise exception 'SERVICE_ROLE_REQUIRED'; end if;
 select * into i from public.monetization_checkout_intents where id=p_intent_id for update;
 if not found then raise exception 'CHECKOUT_NOT_FOUND'; end if;
 if i.status='paid' then return true; end if;
 if i.status not in ('pending','processing') then raise exception 'CHECKOUT_NOT_PAYABLE'; end if;
 update public.monetization_checkout_intents set status='paid',provider=p_provider,provider_reference=p_provider_reference,updated_at=now() where id=i.id;
 if i.product_code='premium_monthly' then
   now_end:=now()+interval '30 days';
   insert into public.premium_subscriptions(user_id,status,provider,provider_reference,current_period_end) values(i.user_id,'active',p_provider,p_provider_reference,now_end)
   on conflict(user_id) do update set status='active',provider=excluded.provider,provider_reference=excluded.provider_reference,current_period_start=now(),current_period_end=excluded.current_period_end,updated_at=now();
 elsif i.product_code='pro_merchant_monthly' then
   insert into public.merchant_pro_subscriptions(merchant_id,status,current_period_end) values(i.user_id,'active',now()+interval '30 days')
   on conflict(merchant_id) do update set status='active',current_period_end=excluded.current_period_end,updated_at=now();
 elsif i.product_code='cosmetics_pack_6' then
   insert into public.user_cosmetics(user_id,cosmetic_code,quantity) values(i.user_id,'animated_pack',6)
   on conflict(user_id,cosmetic_code) do update set quantity=public.user_cosmetics.quantity+6;
 elsif i.product_code='ai_pack_10' then
   insert into public.ai_usage_daily(user_id,usage_date,paid_generations,units_used) values(i.user_id,current_date,10,10)
   on conflict(user_id,usage_date) do update set paid_generations=public.ai_usage_daily.paid_generations+10,units_used=public.ai_usage_daily.units_used+10;
 elsif i.product_code='job_boost_7d' then
   insert into public.job_profile_boosts(user_id,ends_at,status) values(i.user_id,now()+interval '7 days','active');
 elsif i.product_code='api_starter_monthly' then
   insert into public.api_subscriptions(owner_id,plan_code,status,current_period_end) values(i.user_id,'starter','active',now()+interval '30 days');
 end if;
 return true;
end $$;
revoke all on function public.fulfill_monetization_checkout(uuid,text,text) from public,anon,authenticated;
grant execute on function public.fulfill_monetization_checkout(uuid,text,text) to service_role;

create or replace function public.get_monetization_dashboard()
returns jsonb
language plpgsql security invoker set search_path=public
as $$
declare uid uuid:=auth.uid();
begin
 if uid is null then raise exception 'AUTH_REQUIRED'; end if;
 return jsonb_build_object(
  'premium', (select to_jsonb(p) from public.premium_subscriptions p where p.user_id=uid),
  'pro', (select to_jsonb(p) from public.merchant_pro_subscriptions p where p.merchant_id=uid),
  'profile_view_premium',(select to_jsonb(v) from public.profile_view_premium v where v.user_id=uid),
  'credits',(select to_jsonb(c) from public.baaro_credits_accounts c where c.user_id=uid),
  'ai_today',(select to_jsonb(a) from public.ai_usage_daily a where a.user_id=uid and a.usage_date=current_date),
  'pending_checkouts',(select coalesce(jsonb_agg(to_jsonb(i) order by i.created_at desc),'[]'::jsonb) from public.monetization_checkout_intents i where i.user_id=uid and i.status in ('pending','processing')),
  'products',(select coalesce(jsonb_agg(to_jsonb(p) order by p.category,p.price_minor),'[]'::jsonb) from public.monetization_products p where p.active)
 );
end $$;
revoke all on function public.get_monetization_dashboard() from public,anon;
grant execute on function public.get_monetization_dashboard() to authenticated;

-- ============================================================
-- BAARO V20 — Real payment settlement hardening
-- ============================================================
-- Provider callbacks are authoritative. Client amounts are never trusted.
insert into public.monetization_products(code,name,description,category,price_minor,currency,billing_period,metadata) values
('boost_post_24h','Boost publication 24h','Mise en avant d’une publication pendant 24 heures','boost',200000,'XOF','one_time','{"duration_hours":24,"target_required":"post_id"}'::jsonb),
('sponsored_poll_1000','Sondage sponsorisé','Campagne sponsorisée avec objectif de réponses/portée mesurable','campaign',1000000,'XOF','one_time','{"target_required":"poll_id","objective":"responses"}'::jsonb),
('local_ad_2000','Publicité locale','Campagne locale avec rayon et métriques réelles','advertising',500000,'XOF','one_time','{"radius_km":5,"target_required":"campaign_id"}'::jsonb),
('credits_120','BAARO Credits 120','120 unités fermées utilisables uniquement dans BAARO','credits',100000,'XOF','one_time','{"credits":120,"cashout":false,"transfer":false}'::jsonb)
on conflict (code) do update set name=excluded.name,description=excluded.description,category=excluded.category,price_minor=excluded.price_minor,currency=excluded.currency,billing_period=excluded.billing_period,metadata=excluded.metadata,updated_at=now();

create table if not exists public.training_purchases (
  id uuid primary key default gen_random_uuid(),
  training_id uuid not null references public.live_trainings(id) on delete cascade,
  buyer_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('live','replay')),
  amount_minor bigint not null check (amount_minor > 0),
  currency text not null default 'XOF',
  provider text,
  provider_reference text,
  created_at timestamptz not null default now(),
  unique(training_id,buyer_id,kind)
);
create index if not exists idx_training_purchases_buyer on public.training_purchases(buyer_id,created_at desc);
alter table public.training_purchases enable row level security;
drop policy if exists training_purchases_own on public.training_purchases;
create policy training_purchases_own on public.training_purchases for select to authenticated using (buyer_id=auth.uid());
revoke insert,update,delete on public.training_purchases from authenticated,anon;

create or replace function public.fulfill_monetization_checkout(p_intent_id uuid,p_provider text,p_provider_reference text)
returns boolean
language plpgsql security definer set search_path=public
as $$
declare
  i public.monetization_checkout_intents;
  product_meta jsonb;
  target_id uuid;
  group_id uuid;
  event_id uuid;
  poll_id uuid;
  campaign_id uuid;
  job_id uuid;
  organizer_id uuid;
  target_user_id uuid;
  now_end timestamptz;
begin
  if auth.role() <> 'service_role' then raise exception 'SERVICE_ROLE_REQUIRED'; end if;
  select * into i from public.monetization_checkout_intents where id=p_intent_id for update;
  if not found then raise exception 'CHECKOUT_NOT_FOUND'; end if;
  if i.status='paid' then return true; end if;
  if i.status not in ('pending','processing') then raise exception 'CHECKOUT_NOT_PAYABLE'; end if;
  if i.expires_at <= now() then raise exception 'CHECKOUT_EXPIRED'; end if;

  select metadata into product_meta from public.monetization_products where code=i.product_code and active=true;
  if product_meta is null then raise exception 'PRODUCT_NOT_FOUND'; end if;

  update public.monetization_checkout_intents
     set status='paid', provider=p_provider, provider_reference=p_provider_reference, updated_at=now()
   where id=i.id;

  if i.product_code='premium_monthly' then
    now_end:=now()+interval '30 days';
    insert into public.premium_subscriptions(user_id,status,provider,provider_reference,current_period_start,current_period_end)
    values(i.user_id,'active',p_provider,p_provider_reference,now(),now_end)
    on conflict(user_id) do update set status='active',provider=excluded.provider,provider_reference=excluded.provider_reference,current_period_start=now(),current_period_end=excluded.current_period_end,updated_at=now();

  elsif i.product_code='vip_group_monthly' then
    group_id := nullif(i.metadata->>'group_id','')::uuid;
    if group_id is null then raise exception 'GROUP_ID_REQUIRED'; end if;
    if not exists(select 1 from public.groups where id=group_id) then raise exception 'GROUP_NOT_FOUND'; end if;
    insert into public.vip_group_subscriptions(group_id,subscriber_id,price_minor,currency,status,period_end)
    values(group_id,i.user_id,i.amount_minor,i.currency,'active',now()+interval '30 days')
    on conflict(group_id,subscriber_id) do update set price_minor=excluded.price_minor,currency=excluded.currency,status='active',period_end=excluded.period_end;

  elsif i.product_code='pro_merchant_monthly' then
    insert into public.merchant_pro_subscriptions(merchant_id,status,price_minor,currency,current_period_end)
    values(i.user_id,'active',i.amount_minor,i.currency,now()+interval '30 days')
    on conflict(merchant_id) do update set status='active',price_minor=excluded.price_minor,currency=excluded.currency,current_period_end=excluded.current_period_end,updated_at=now();

  elsif i.product_code='cosmetics_pack_6' then
    insert into public.user_cosmetics(user_id,cosmetic_code,quantity,source)
    values(i.user_id,'animated_pack',6,'purchase')
    on conflict(user_id,cosmetic_code) do update set quantity=public.user_cosmetics.quantity+6;

  elsif i.product_code='ai_pack_10' then
    insert into public.ai_usage_daily(user_id,usage_date,paid_generations,units_used)
    values(i.user_id,current_date,10,10)
    on conflict(user_id,usage_date) do update set paid_generations=public.ai_usage_daily.paid_generations+10,units_used=public.ai_usage_daily.units_used+10;

  elsif i.product_code='job_boost_7d' then
    job_id := nullif(i.metadata->>'job_listing_id','')::uuid;
    if job_id is not null and not exists(select 1 from public.job_listings where id=job_id and owner_id=i.user_id) then raise exception 'JOB_NOT_OWNED'; end if;
    insert into public.job_profile_boosts(user_id,job_listing_id,starts_at,ends_at,status)
    values(i.user_id,job_id,now(),now()+interval '7 days','active');

  elsif i.product_code='api_starter_monthly' then
    insert into public.api_subscriptions(owner_id,plan_code,status,current_period_end)
    values(i.user_id,'starter','active',now()+interval '30 days');

  elsif i.product_code='boost_post_24h' then
    target_id := nullif(i.metadata->>'post_id','')::uuid;
    if target_id is null then raise exception 'POST_ID_REQUIRED'; end if;
    if not exists(select 1 from public.posts where id=target_id and author_id=i.user_id) then raise exception 'POST_NOT_OWNED'; end if;
    insert into public.post_boosts(post_id,buyer_id,budget_minor,duration_hours,status,starts_at,ends_at)
    values(target_id,i.user_id,i.amount_minor,24,'active',now(),now()+interval '24 hours');

  elsif i.product_code='sponsored_poll_1000' then
    poll_id := nullif(i.metadata->>'poll_id','')::uuid;
    if poll_id is null then raise exception 'POLL_ID_REQUIRED'; end if;
    if not exists(select 1 from public.polls p join public.posts po on po.id=p.post_id where p.id=poll_id and po.author_id=i.user_id) then raise exception 'POLL_NOT_OWNED'; end if;
    insert into public.sponsored_polls(poll_id,advertiser_id,budget_minor,target,objective,status,starts_at,ends_at)
    values(poll_id,i.user_id,i.amount_minor,coalesce(i.metadata->'target','{}'::jsonb),coalesce(i.metadata->>'objective','responses'),'active',now(),now()+interval '24 hours');

  elsif i.product_code='local_ad_2000' then
    campaign_id := nullif(i.metadata->>'campaign_id','')::uuid;
    if campaign_id is null then raise exception 'CAMPAIGN_ID_REQUIRED'; end if;
    update public.local_ad_campaigns set status='active',starts_at=coalesce(starts_at,now()),ends_at=coalesce(ends_at,now()+interval '24 hours') where id=campaign_id and advertiser_id=i.user_id and status in ('draft','pending');
    if not found then raise exception 'LOCAL_AD_NOT_FOUND_OR_NOT_OWNED'; end if;

  elsif i.product_code='credits_120' then
    insert into public.baaro_credits_accounts(user_id,balance)
    values(i.user_id,120)
    on conflict(user_id) do update set balance=public.baaro_credits_accounts.balance+120,updated_at=now();
    insert into public.baaro_credits_ledger(user_id,direction,amount,source,reference_id,idempotency_key,metadata)
    values(i.user_id,'credit',120,'purchase',i.id,concat('checkout:',i.id),jsonb_build_object('cashout_allowed',false,'transfer_allowed',false));

  elsif i.product_code='live_ticket' then
    event_id := nullif(i.metadata->>'event_id','')::uuid;
    if event_id is null then raise exception 'EVENT_ID_REQUIRED'; end if;
    select organizer_id into organizer_id from public.community_events where id=event_id and status='published';
    if organizer_id is null then raise exception 'EVENT_NOT_FOUND'; end if;
    insert into public.live_tickets(event_id,buyer_id,organizer_id,amount_minor,currency,status,provider,provider_reference,ticket_code)
    values(event_id,i.user_id,organizer_id,i.amount_minor,i.currency,'paid',p_provider,p_provider_reference,encode(gen_random_bytes(9),'hex'));

  elsif i.product_code in ('training_ticket','training_replay') then
    target_id := nullif(i.metadata->>'training_id','')::uuid;
    if target_id is null then raise exception 'TRAINING_ID_REQUIRED'; end if;
    if not exists(select 1 from public.live_trainings where id=target_id and status in ('published','live','finished')) then raise exception 'TRAINING_NOT_FOUND'; end if;
    insert into public.training_purchases(training_id,buyer_id,kind,amount_minor,currency,provider,provider_reference)
    values(target_id,i.user_id,case when i.product_code='training_ticket' then 'live' else 'replay' end,i.amount_minor,i.currency,p_provider,p_provider_reference)
    on conflict(training_id,buyer_id,kind) do update set provider=excluded.provider,provider_reference=excluded.provider_reference,amount_minor=excluded.amount_minor;
  end if;

  return true;
end $$;
revoke all on function public.fulfill_monetization_checkout(uuid,text,text) from public,anon,authenticated;
grant execute on function public.fulfill_monetization_checkout(uuid,text,text) to service_role;

-- ============================================================
-- BAARO v20 — REAL-MONEY HARDENING
-- Tips, creator subscriptions, payout KYC gate, revenue wiring.
-- All financial writes remain server-authoritative.
-- ============================================================

alter table public.monetization_checkout_intents
  add column if not exists provider_amount_minor bigint;

create table if not exists public.creator_payout_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  kyc_status text not null default 'pending' check (kyc_status in ('pending','submitted','verified','rejected','suspended')),
  payout_verified boolean not null default false,
  country_code text,
  legal_name text,
  verified_at timestamptz,
  risk_level text not null default 'normal' check (risk_level in ('normal','review','blocked')),
  metadata jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.creator_payout_profiles enable row level security;
drop policy if exists creator_payout_profile_own on public.creator_payout_profiles;
create policy creator_payout_profile_own on public.creator_payout_profiles for select to authenticated using (auth.uid()=user_id);
revoke insert,update,delete on public.creator_payout_profiles from authenticated,anon;

-- Closed-loop tip checkout: 100 / 500 / 1000 FCFA are represented as
-- 10,000 / 50,000 / 100,000 internal minor units.
insert into public.monetization_products(code,name,description,category,price_minor,currency,billing_period,metadata) values
('tip_100','Pourboire 100 FCFA','Pourboire créateur','tips',10000,'XOF','one_time','{"tip_fcfa":100}'::jsonb),
('tip_500','Pourboire 500 FCFA','Pourboire créateur','tips',50000,'XOF','one_time','{"tip_fcfa":500}'::jsonb),
('tip_1000','Pourboire 1000 FCFA','Pourboire créateur','tips',100000,'XOF','one_time','{"tip_fcfa":1000}'::jsonb),
('creator_subscription','Abonnement créateur','Abonnement mensuel à un créateur','creator_subscription',50000,'XOF','month','{"min_fcfa":500,"platform_share_bps":1500}'::jsonb)
on conflict (code) do update set name=excluded.name,description=excluded.description,category=excluded.category,price_minor=excluded.price_minor,currency=excluded.currency,billing_period=excluded.billing_period,metadata=excluded.metadata,updated_at=now();

create or replace function public.send_tip(
  p_recipient_id uuid,
  p_amount_minor bigint,
  p_post_id uuid default null,
  p_live_id uuid default null
) returns jsonb
language plpgsql security invoker set search_path=public
as $$
declare
  uid uuid := auth.uid();
  i public.monetization_checkout_intents;
  code text;
begin
  if uid is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_recipient_id is null or p_recipient_id=uid then raise exception 'INVALID_RECIPIENT'; end if;
  if p_amount_minor not in (10000,50000,100000) then raise exception 'INVALID_TIP_AMOUNT'; end if;
  if not exists(select 1 from auth.users where id=p_recipient_id) then raise exception 'RECIPIENT_NOT_FOUND'; end if;
  code := case p_amount_minor when 10000 then 'tip_100' when 50000 then 'tip_500' else 'tip_1000' end;
  insert into public.monetization_checkout_intents(user_id,product_code,amount_minor,currency,metadata)
  values(uid,code,p_amount_minor,'XOF',jsonb_build_object('recipient_id',p_recipient_id,'post_id',p_post_id,'live_id',p_live_id,'source','tip'))
  returning * into i;
  return jsonb_build_object('id',i.id,'product_code',i.product_code,'amount_minor',i.amount_minor,'currency',i.currency,'status',i.status,'expires_at',i.expires_at);
end $$;
revoke all on function public.send_tip(uuid,bigint,uuid,uuid) from public,anon;
grant execute on function public.send_tip(uuid,bigint,uuid,uuid) to authenticated;

create or replace function public.start_creator_subscription_checkout(
  p_creator_id uuid,
  p_amount_minor bigint default 50000
) returns jsonb
language plpgsql security invoker set search_path=public
as $$
declare uid uuid:=auth.uid(); i public.monetization_checkout_intents;
begin
  if uid is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_creator_id is null or p_creator_id=uid then raise exception 'INVALID_CREATOR'; end if;
  if p_amount_minor < 50000 or p_amount_minor > 1000000 or mod(p_amount_minor,10000)<>0 then raise exception 'INVALID_CREATOR_SUBSCRIPTION_PRICE'; end if;
  if not exists(select 1 from auth.users where id=p_creator_id) then raise exception 'CREATOR_NOT_FOUND'; end if;
  insert into public.monetization_checkout_intents(user_id,product_code,amount_minor,currency,metadata)
  values(uid,'creator_subscription',p_amount_minor,'XOF',jsonb_build_object('creator_id',p_creator_id,'source','creator_subscription'))
  returning * into i;
  return jsonb_build_object('id',i.id,'product_code',i.product_code,'amount_minor',i.amount_minor,'currency',i.currency,'status',i.status,'expires_at',i.expires_at);
end $$;
revoke all on function public.start_creator_subscription_checkout(uuid,bigint) from public,anon;
grant execute on function public.start_creator_subscription_checkout(uuid,bigint) to authenticated;

-- Replace checkout fulfillment with the complete product matrix and revenue wiring.
create or replace function public.fulfill_monetization_checkout(p_intent_id uuid,p_provider text,p_provider_reference text)
returns boolean
language plpgsql security definer set search_path=public
as $$
declare
  i public.monetization_checkout_intents;
  product_meta jsonb;
  target_id uuid;
  group_id uuid;
  event_id uuid;
  poll_id uuid;
  campaign_id uuid;
  job_id uuid;
  organizer_id uuid;
  creator_id uuid;
  tip_id uuid;
  now_end timestamptz;
  ledger_id uuid;
begin
  if auth.role() <> 'service_role' then raise exception 'SERVICE_ROLE_REQUIRED'; end if;
  select * into i from public.monetization_checkout_intents where id=p_intent_id for update;
  if not found then raise exception 'CHECKOUT_NOT_FOUND'; end if;
  if i.status='paid' then return true; end if;
  if i.status not in ('pending','processing') then raise exception 'CHECKOUT_NOT_PAYABLE'; end if;
  if i.expires_at <= now() then raise exception 'CHECKOUT_EXPIRED'; end if;
  select metadata into product_meta from public.monetization_products where code=i.product_code and active=true;
  if product_meta is null then raise exception 'PRODUCT_NOT_FOUND'; end if;

  update public.monetization_checkout_intents set status='paid',provider=p_provider,provider_reference=p_provider_reference,updated_at=now() where id=i.id;

  if i.product_code='premium_monthly' then
    insert into public.premium_subscriptions(user_id,status,provider,provider_reference,current_period_start,current_period_end)
    values(i.user_id,'active',p_provider,p_provider_reference,now(),now()+interval '30 days')
    on conflict(user_id) do update set status='active',provider=excluded.provider,provider_reference=excluded.provider_reference,current_period_start=now(),current_period_end=excluded.current_period_end,updated_at=now();

  elsif i.product_code='creator_subscription' then
    creator_id:=nullif(i.metadata->>'creator_id','')::uuid;
    if creator_id is null or creator_id=i.user_id then raise exception 'INVALID_CREATOR'; end if;
    insert into public.creator_subscriptions(creator_id,subscriber_id,status,tier)
    values(creator_id,i.user_id,'active','paid')
    on conflict(creator_id,subscriber_id) do update set status='active',tier='paid';
    ledger_id:=public.record_economy_event('creator-subscription:'||i.id,creator_id,'subscriptions',i.amount_minor,0,i.currency,i.id,jsonb_build_object('subscriber_id',i.user_id,'provider',p_provider));

  elsif i.product_code in ('tip_100','tip_500','tip_1000') then
    creator_id:=nullif(i.metadata->>'recipient_id','')::uuid;
    if creator_id is null or creator_id=i.user_id then raise exception 'INVALID_RECIPIENT'; end if;
    insert into public.tips(sender_id,recipient_id,post_id,live_id,amount_minor,currency,status,provider,provider_reference,idempotency_key)
    values(i.user_id,creator_id,nullif(i.metadata->>'post_id','')::uuid,nullif(i.metadata->>'live_id','')::uuid,i.amount_minor,i.currency,'paid',p_provider,p_provider_reference,'tip:'||i.id)
    on conflict(idempotency_key) do nothing returning id into tip_id;
    if tip_id is not null then
      ledger_id:=public.record_economy_event('tip:'||i.id,creator_id,'tips',i.amount_minor,0,i.currency,tip_id,jsonb_build_object('sender_id',i.user_id,'provider',p_provider,'checkout_intent_id',i.id));
    end if;

  elsif i.product_code='vip_group_monthly' then
    group_id := nullif(i.metadata->>'group_id','')::uuid;
    if group_id is null or not exists(select 1 from public.groups where id=group_id) then raise exception 'GROUP_NOT_FOUND'; end if;
    insert into public.vip_group_subscriptions(group_id,subscriber_id,price_minor,currency,status,period_end)
    values(group_id,i.user_id,i.amount_minor,i.currency,'active',now()+interval '30 days')
    on conflict(group_id,subscriber_id) do update set price_minor=excluded.price_minor,currency=excluded.currency,status='active',period_end=excluded.period_end;

  elsif i.product_code='pro_merchant_monthly' then
    insert into public.merchant_pro_subscriptions(merchant_id,status,price_minor,currency,current_period_end)
    values(i.user_id,'active',i.amount_minor,i.currency,now()+interval '30 days')
    on conflict(merchant_id) do update set status='active',price_minor=excluded.price_minor,currency=excluded.currency,current_period_end=excluded.current_period_end,updated_at=now();

  elsif i.product_code='cosmetics_pack_6' then
    insert into public.user_cosmetics(user_id,cosmetic_code,quantity,source) values(i.user_id,'animated_pack',6,'purchase')
    on conflict(user_id,cosmetic_code) do update set quantity=public.user_cosmetics.quantity+6;

  elsif i.product_code='ai_pack_10' then
    insert into public.ai_usage_daily(user_id,usage_date,paid_generations,units_used) values(i.user_id,current_date,10,10)
    on conflict(user_id,usage_date) do update set paid_generations=public.ai_usage_daily.paid_generations+10,units_used=public.ai_usage_daily.units_used+10;

  elsif i.product_code='job_boost_7d' then
    job_id:=nullif(i.metadata->>'job_listing_id','')::uuid;
    if job_id is not null and not exists(select 1 from public.job_listings where id=job_id and owner_id=i.user_id) then raise exception 'JOB_NOT_OWNED'; end if;
    insert into public.job_profile_boosts(user_id,job_listing_id,starts_at,ends_at,status) values(i.user_id,job_id,now(),now()+interval '7 days','active');

  elsif i.product_code='api_starter_monthly' then
    insert into public.api_subscriptions(owner_id,plan_code,status,current_period_end) values(i.user_id,'starter','active',now()+interval '30 days');

  elsif i.product_code='boost_post_24h' then
    target_id:=nullif(i.metadata->>'post_id','')::uuid;
    if target_id is null or not exists(select 1 from public.posts where id=target_id and author_id=i.user_id) then raise exception 'POST_NOT_OWNED'; end if;
    insert into public.post_boosts(post_id,buyer_id,budget_minor,duration_hours,status,starts_at,ends_at) values(target_id,i.user_id,i.amount_minor,24,'active',now(),now()+interval '24 hours');

  elsif i.product_code='sponsored_poll_1000' then
    poll_id:=nullif(i.metadata->>'poll_id','')::uuid;
    if poll_id is null or not exists(select 1 from public.polls p join public.posts po on po.id=p.post_id where p.id=poll_id and po.author_id=i.user_id) then raise exception 'POLL_NOT_OWNED'; end if;
    insert into public.sponsored_polls(poll_id,advertiser_id,budget_minor,target,objective,status,starts_at,ends_at) values(poll_id,i.user_id,i.amount_minor,coalesce(i.metadata->'target','{}'::jsonb),coalesce(i.metadata->>'objective','responses'),'active',now(),now()+interval '24 hours');

  elsif i.product_code='local_ad_2000' then
    campaign_id:=nullif(i.metadata->>'campaign_id','')::uuid;
    if campaign_id is null then raise exception 'CAMPAIGN_ID_REQUIRED'; end if;
    update public.local_ad_campaigns set status='active',starts_at=coalesce(starts_at,now()),ends_at=coalesce(ends_at,now()+interval '24 hours') where id=campaign_id and advertiser_id=i.user_id and status in ('draft','pending');
    if not found then raise exception 'LOCAL_AD_NOT_FOUND_OR_NOT_OWNED'; end if;

  elsif i.product_code='credits_120' then
    insert into public.baaro_credits_accounts(user_id,balance) values(i.user_id,120)
    on conflict(user_id) do update set balance=public.baaro_credits_accounts.balance+120,updated_at=now();
    insert into public.baaro_credits_ledger(user_id,direction,amount,source,reference_id,idempotency_key,metadata) values(i.user_id,'credit',120,'purchase',i.id,'checkout:'||i.id,jsonb_build_object('cashout_allowed',false,'transfer_allowed',false)) on conflict(idempotency_key) do nothing;

  elsif i.product_code='live_ticket' then
    event_id:=nullif(i.metadata->>'event_id','')::uuid;
    if event_id is null then raise exception 'EVENT_ID_REQUIRED'; end if;
    select organizer_id into organizer_id from public.community_events where id=event_id and status='published';
    if organizer_id is null then raise exception 'EVENT_NOT_FOUND'; end if;
    insert into public.live_tickets(event_id,buyer_id,organizer_id,amount_minor,currency,status,provider,provider_reference,ticket_code) values(event_id,i.user_id,organizer_id,i.amount_minor,i.currency,'paid',p_provider,p_provider_reference,encode(gen_random_bytes(9),'hex'));
    ledger_id:=public.record_economy_event('live-ticket:'||i.id,organizer_id,'campaigns',i.amount_minor,0,i.currency,i.id,jsonb_build_object('buyer_id',i.user_id,'provider',p_provider));

  elsif i.product_code in ('training_ticket','training_replay') then
    target_id:=nullif(i.metadata->>'training_id','')::uuid;
    if target_id is null or not exists(select 1 from public.live_trainings where id=target_id and status in ('published','live','finished')) then raise exception 'TRAINING_NOT_FOUND'; end if;
    insert into public.training_purchases(training_id,buyer_id,kind,amount_minor,currency,provider,provider_reference) values(target_id,i.user_id,case when i.product_code='training_ticket' then 'live' else 'replay' end,i.amount_minor,i.currency,p_provider,p_provider_reference)
    on conflict(training_id,buyer_id,kind) do update set provider=excluded.provider,provider_reference=excluded.provider_reference,amount_minor=excluded.amount_minor;
    select host_id into creator_id from public.live_trainings where id=target_id;
    if creator_id is not null then ledger_id:=public.record_economy_event('training:'||i.id,creator_id,'campaigns',i.amount_minor,0,i.currency,i.id,jsonb_build_object('buyer_id',i.user_id,'provider',p_provider)); end if;
  end if;

  return true;
end $$;
revoke all on function public.fulfill_monetization_checkout(uuid,text,text) from public,anon,authenticated;
grant execute on function public.fulfill_monetization_checkout(uuid,text,text) to service_role;

-- Marketplace sales now create creator/merchant earnings exactly once when an order is paid.
create or replace function public.mark_order_paid(p_order_id uuid,p_payment_ref text,p_provider text default null)
returns void language plpgsql security definer set search_path=public as $$
declare o public.orders; ledger_id uuid; merchant_id uuid;
begin
  if auth.role()<>'service_role' then raise exception 'SERVICE_ROLE_REQUIRED'; end if;
  select * into o from public.orders where id=p_order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if o.payment_status='paid' then return; end if;
  update public.orders set payment_status='paid',paid_at=coalesce(paid_at,now()),status=case when status='pending' then 'confirmed' else status end,payment_reference=p_payment_ref,updated_at=now() where id=o.id;
  if o.shop_id is not null then
    select owner_id into merchant_id from public.shops where id=o.shop_id;
    if merchant_id is not null then
      ledger_id:=public.record_economy_event('marketplace-order:'||o.id,merchant_id,'marketplace',round(o.total_amount*100)::bigint,0,o.currency,o.id,jsonb_build_object('provider',p_provider,'payment_ref',p_payment_ref));
    end if;
  end if;
end $$;
revoke all on function public.mark_order_paid(uuid,text,text) from public,anon,authenticated;
grant execute on function public.mark_order_paid(uuid,text,text) to service_role;

-- Payouts require a verified payout profile; this is the anti-fraud/KYC gate.
create or replace function public.request_economy_payout(p_amount_minor bigint,p_method text,p_destination_token text default null)
returns uuid language plpgsql security invoker set search_path=public as $$
declare uid uuid:=auth.uid(); a public.economy_accounts; p uuid; min_cash bigint; k public.creator_payout_profiles;
begin
  if uid is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_amount_minor<=0 then raise exception 'INVALID_AMOUNT'; end if;
  if p_method not in ('mobile_money','bank_transfer') then raise exception 'INVALID_PAYOUT_METHOD'; end if;
  select * into k from public.creator_payout_profiles where user_id=uid;
  if not found or k.kyc_status<>'verified' or not k.payout_verified then raise exception 'PAYOUT_KYC_REQUIRED'; end if;
  if k.risk_level='blocked' then raise exception 'PAYOUT_BLOCKED_FOR_RISK'; end if;
  if p_destination_token is null or length(trim(p_destination_token))<8 then raise exception 'PAYOUT_DESTINATION_REQUIRED'; end if;
  select * into a from public.economy_accounts where user_id=uid for update;
  if not found then raise exception 'NO_EARNINGS_ACCOUNT'; end if;
  select round(min_cashout*100)::bigint into min_cash from public.creator_monetization where creator_id=uid;
  min_cash:=coalesce(min_cash,100000);
  if p_amount_minor<min_cash then raise exception 'MIN_CASHOUT'; end if;
  if p_amount_minor>a.available_minor then raise exception 'INSUFFICIENT_AVAILABLE'; end if;
  insert into public.economy_payouts(user_id,amount_minor,currency,method,destination_token) values(uid,p_amount_minor,a.currency,p_method,nullif(trim(p_destination_token),'')) returning id into p;
  insert into public.economy_ledger(user_id,entry_type,bucket,direction,source,amount_minor,currency,reference_id,metadata) values(uid,'payout_hold','payout_hold','credit','payout',p_amount_minor,a.currency,p,jsonb_build_object('status','reserved'));
  update public.economy_accounts set available_minor=available_minor-p_amount_minor,payout_hold_minor=payout_hold_minor+p_amount_minor,updated_at=now() where user_id=uid;
  return p;
end $$;
revoke all on function public.request_economy_payout(bigint,text,text) from public,anon;
grant execute on function public.request_economy_payout(bigint,text,text) to authenticated;

-- Server-side ad revenue entry point. The ad delivery service is the only caller.
create or replace function public.record_ad_creator_revenue(p_idempotency_key text,p_creator_id uuid,p_gross_minor bigint,p_provider_fee_minor bigint default 0,p_reference_id uuid default null,p_metadata jsonb default '{}'::jsonb)
returns uuid language plpgsql security definer set search_path=public as $$
begin
  if auth.role()<>'service_role' then raise exception 'SERVICE_ROLE_REQUIRED'; end if;
  return public.record_economy_event(p_idempotency_key,p_creator_id,'ads',p_gross_minor,p_provider_fee_minor,'XOF',p_reference_id,p_metadata);
end $$;
revoke all on function public.record_ad_creator_revenue(text,uuid,bigint,bigint,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.record_ad_creator_revenue(text,uuid,bigint,bigint,uuid,jsonb) to service_role;



-- FINAL MONEY HARDENING: payout request must execute server-side with the caller identity.
-- SECURITY DEFINER is safe here because auth.uid() is captured before privileged writes,
-- search_path is fixed, and every authorization/KYC/risk/amount check remains explicit.
create or replace function public.request_economy_payout(
  p_amount_minor bigint,
  p_method text,
  p_destination_token text default null
) returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  uid uuid := auth.uid();
  a public.economy_accounts;
  p uuid;
  min_cash bigint;
  k public.creator_payout_profiles;
begin
  if uid is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_amount_minor <= 0 then raise exception 'INVALID_AMOUNT'; end if;
  if p_method not in ('mobile_money','bank_transfer') then raise exception 'INVALID_PAYOUT_METHOD'; end if;
  select * into k from public.creator_payout_profiles where user_id=uid for update;
  if not found or k.kyc_status <> 'verified' or not k.payout_verified then raise exception 'PAYOUT_KYC_REQUIRED'; end if;
  if k.risk_level <> 'normal' then raise exception 'PAYOUT_BLOCKED_FOR_RISK'; end if;
  if p_destination_token is null or length(trim(p_destination_token)) < 8 then raise exception 'PAYOUT_DESTINATION_REQUIRED'; end if;
  select * into a from public.economy_accounts where user_id=uid for update;
  if not found then raise exception 'NO_EARNINGS_ACCOUNT'; end if;
  select round(min_cashout*100)::bigint into min_cash from public.creator_monetization where creator_id=uid;
  min_cash := coalesce(min_cash,100000);
  if p_amount_minor < min_cash then raise exception 'MIN_CASHOUT'; end if;
  if p_amount_minor > a.available_minor then raise exception 'INSUFFICIENT_AVAILABLE'; end if;
  insert into public.economy_payouts(user_id,amount_minor,currency,method,destination_token)
    values(uid,p_amount_minor,a.currency,p_method,nullif(trim(p_destination_token),'')) returning id into p;
  insert into public.economy_ledger(user_id,entry_type,bucket,direction,source,amount_minor,currency,reference_id,metadata)
    values(uid,'payout_hold','payout_hold','credit','payout',p_amount_minor,a.currency,p,jsonb_build_object('status','reserved'));
  update public.economy_accounts
    set available_minor=available_minor-p_amount_minor,
        payout_hold_minor=payout_hold_minor+p_amount_minor,
        updated_at=now()
    where user_id=uid;
  return p;
end $$;
revoke all on function public.request_economy_payout(bigint,text,text) from public,anon;
grant execute on function public.request_economy_payout(bigint,text,text) to authenticated;

-- Creator Rewards / Points: non-cash engagement rewards inspired by creator programs.
-- Points never represent money, cannot be cashed out, transferred or converted to currency.
create table if not exists public.creator_reward_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  points bigint not null default 0 check(points>=0),
  lifetime_points bigint not null default 0 check(lifetime_points>=0),
  tier text not null default 'starter' check(tier in ('starter','rising','creator','pro','elite')),
  updated_at timestamptz not null default now()
);
create table if not exists public.creator_reward_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source text not null,
  points bigint not null check(points>0),
  reference_id uuid,
  idempotency_key text unique,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_creator_reward_events_user_created on public.creator_reward_events(user_id,created_at desc);
alter table public.creator_reward_accounts enable row level security;
alter table public.creator_reward_events enable row level security;
drop policy if exists creator_rewards_read_own on public.creator_reward_accounts;
create policy creator_rewards_read_own on public.creator_reward_accounts for select to authenticated using(user_id=auth.uid());
drop policy if exists creator_reward_events_read_own on public.creator_reward_events;
create policy creator_reward_events_read_own on public.creator_reward_events for select to authenticated using(user_id=auth.uid());
revoke insert,update,delete on public.creator_reward_accounts from anon,authenticated;
revoke insert,update,delete on public.creator_reward_events from anon,authenticated;

create or replace function public.award_creator_points(
  p_user_id uuid,
  p_source text,
  p_points bigint,
  p_reference_id uuid default null,
  p_idempotency_key text default null,
  p_metadata jsonb default '{}'::jsonb
) returns bigint
language plpgsql security definer set search_path=public
as $$
declare current_points bigint; new_points bigint; new_tier text;
begin
  if auth.role()<>'service_role' then raise exception 'SERVICE_ROLE_REQUIRED'; end if;
  if p_user_id is null or p_points<=0 or p_points>1000000 then raise exception 'INVALID_REWARD'; end if;
  if p_idempotency_key is not null and exists(select 1 from public.creator_reward_events where idempotency_key=p_idempotency_key) then
    select points into current_points from public.creator_reward_accounts where user_id=p_user_id;
    return coalesce(current_points,0);
  end if;
  insert into public.creator_reward_accounts(user_id) values(p_user_id) on conflict(user_id) do nothing;
  insert into public.creator_reward_events(user_id,source,points,reference_id,idempotency_key,metadata)
    values(p_user_id,lower(trim(p_source)),p_points,p_reference_id,p_idempotency_key,coalesce(p_metadata,'{}'::jsonb));
  update public.creator_reward_accounts set
    points=points+p_points,
    lifetime_points=lifetime_points+p_points,
    updated_at=now()
    where user_id=p_user_id
    returning points into new_points;
  new_tier:=case when new_points>=100000 then 'elite' when new_points>=50000 then 'pro' when new_points>=20000 then 'creator' when new_points>=5000 then 'rising' else 'starter' end;
  update public.creator_reward_accounts set tier=new_tier where user_id=p_user_id;
  return new_points;
end $$;
revoke all on function public.award_creator_points(uuid,text,bigint,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.award_creator_points(uuid,text,bigint,uuid,text,jsonb) to service_role;

create or replace function public.get_creator_rewards_summary()
returns jsonb language sql security definer set search_path=public
as $$
  select jsonb_build_object(
    'points',coalesce(a.points,0),
    'lifetime_points',coalesce(a.lifetime_points,0),
    'tier',coalesce(a.tier,'starter'),
    'next_tier',case when coalesce(a.points,0)<5000 then 'rising' when a.points<20000 then 'creator' when a.points<50000 then 'pro' when a.points<100000 then 'elite' else 'max' end,
    'next_threshold',case when coalesce(a.points,0)<5000 then 5000 when a.points<20000 then 20000 when a.points<50000 then 50000 when a.points<100000 then 100000 else 100000 end
  ) from (select auth.uid() as uid) u left join public.creator_reward_accounts a on a.user_id=u.uid;
$$;
revoke all on function public.get_creator_rewards_summary() from public,anon;
grant execute on function public.get_creator_rewards_summary() to authenticated;


-- Versioned legal consent. Store acceptance metadata, never the full document text.
create table if not exists public.legal_consents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  document_type text not null check(document_type in ('terms','privacy','community','creator','merchant','refund','cookies')),
  version text not null,
  accepted_at timestamptz not null default now(),
  ip_hash text,
  user_agent_hash text,
  unique(user_id, document_type, version)
);
alter table public.legal_consents enable row level security;
drop policy if exists legal_consents_read_own on public.legal_consents;
create policy legal_consents_read_own on public.legal_consents for select to authenticated using(user_id=auth.uid());
revoke insert,update,delete on public.legal_consents from anon,authenticated;
create or replace function public.record_legal_consent(p_document_type text,p_version text,p_ip_hash text default null,p_user_agent_hash text default null)
returns uuid language plpgsql security definer set search_path=public
as $$
declare v_id uuid; v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_document_type not in ('terms','privacy','community','creator','merchant','refund','cookies') then raise exception 'INVALID_DOCUMENT'; end if;
  if p_version is null or length(trim(p_version))=0 then raise exception 'INVALID_VERSION'; end if;
  insert into public.legal_consents(user_id,document_type,version,ip_hash,user_agent_hash)
  values(v_uid,lower(trim(p_document_type)),trim(p_version),p_ip_hash,p_user_agent_hash)
  on conflict(user_id,document_type,version) do update set accepted_at=now()
  returning id into v_id;
  return v_id;
end $$;
revoke all on function public.record_legal_consent(text,text,text,text) from public,anon;
grant execute on function public.record_legal_consent(text,text,text,text) to authenticated;


-- ============================================================
-- BAARO FRESH SCHEMA INVARIANTS
-- ============================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='profiles' AND column_name='user_id') THEN
    RAISE EXCEPTION 'BAARO_SCHEMA_INVALID: profiles.user_id must not exist; profiles.id is canonical';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='wallets' AND column_name='user_id') THEN
    RAISE EXCEPTION 'BAARO_SCHEMA_INVALID: wallets.user_id must not exist; wallets.id is canonical';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='crypto_holdings' AND column_name='user_id') THEN
    RAISE EXCEPTION 'BAARO_SCHEMA_INVALID: crypto_holdings.user_id must not exist; crypto_holdings.id is canonical';
  END IF;
END $$;
