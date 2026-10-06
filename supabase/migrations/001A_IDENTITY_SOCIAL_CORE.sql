-- ============================================================
-- BAARO FOUNDATION 001: IDENTITY_SOCIAL_CORE
-- UNIQUE FOUNDATION ID: BAARO-FND-001
-- Apply in order: BAARO-FND-001 -> 002 -> 003 -> 004
-- Target: fresh/empty Supabase database.
-- This block is part of the four-block canonical foundation.
-- ============================================================

-- ============================================================
-- BAARO — VERIFIED FRESH SUPABASE MIGRATION
-- ============================================================
-- Built directly from the original project migration.
-- One canonical top-level definition per table/index/policy/trigger/view.
-- Obsolete wallet/transactions table operations removed.
-- Legacy follows fallback removed; canonical follows = follower_id -> followed_id.
-- Target: NEW / EMPTY Supabase database.
-- ============================================================

-- ============================================================
-- BAARO — Single clean unified migration (fresh database)
-- ============================================================
-- Apply ONCE on empty public schema.
-- Financial model = Economy + Monetization (real FCFA).
-- Legacy points wallet / BARO crypto / virtual gifts NEVER created.
-- Messaging E2E crypto is client-side only (not these tables).
-- ============================================================


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

-- FIX: tables comments et post_likes creees ici car referencees par des index
-- plus bas (avant leur definition d'origine). "if not exists" => sans conflit.
create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  text text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.post_likes (
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

-- FIX: notifications creee ici car referencee par des index (section 7) avant
-- sa definition d'origine (migration notifications). "if not exists" => sans conflit.
create table if not exists public.notifications (
  notification_id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  actor_id uuid null,
  type text null default 'general',
  message text not null default '',
  source_id uuid null,
  read boolean not null default false,
  read_at timestamptz null,
  created_at timestamptz not null default now()
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


-- [removed CREATE TABLE wallets]



-- [removed CREATE TABLE transactions]


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
-- [skip index]
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
-- [removed alter wallets]
-- [removed transactions rls]
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

-- 3. FOLLOWS / FRIENDS - 4 FK vers profiles.id
DROP TABLE IF EXISTS public.follows CASCADE;
create table if not exists public.follows (
  follower_id uuid not null references public.profiles(id) on delete cascade,
  followed_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'accepted' check (status in ('pending','accepted','rejected')),
  is_friend boolean not null default false,
  created_at timestamptz default now(),
  primary key (follower_id, followed_id),
  check (follower_id != followed_id)
);


-- 4. NOTIFICATIONS PREFERENCES - user_id = profiles.id
create table if not exists public.notification_preferences (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  push_enabled boolean default true,
  messages boolean default true,
  social boolean default true,
  live boolean default true,
  marketing boolean default false,
  updated_at timestamptz default now()
);

-- 5. GIFTS CATALOG + GIFTS SENT

-- [removed CREATE TABLE gifts_catalog]



-- [removed CREATE TABLE gifts_sent]


-- 6. RLS
alter table public.profiles enable row level security;
alter table public.follows enable row level security;
alter table public.notification_preferences enable row level security;
-- [skip alter]

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
-- [skip]
-- [skip policy]

-- [skip]
-- [skip policy]

-- RPC record_feed_event doit utiliser auth.uid() dedans


-- ============================================================
-- SOURCE: 0002_security_fix.sql
-- ============================================================
-- BAARO — correctif de sécurité du portefeuille + fonctionnalités
-- anti faux-comptes. À coller dans le SQL Editor de Supabase et exécuter
-- APRÈS supabase-schema.sql (et les autres migrations déjà appliquées).

-- 1) Le portefeuille et l'historique ne doivent plus
--    jamais être modifiables directement depuis le navigateur : jusqu'ici,
--    la policy vérifiait seulement "auth.uid() = user_id", pas que la
--    valeur écrite était légitime — n'importe qui pouvait donc se créer
--    un solde arbitraire via la console. Désormais, seule la lecture de
--    ses propres lignes reste autorisée ; toutes les écritures passent par
--    /api/wallet, avec la clé de service (qui ignore RLS).
-- [removed wallet policy]
-- [skip]

-- [removed wallet policy]
-- [skip policy]
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
create policy "debate_participants_insert" on debate_participants for insert with check (auth.uid() = user_id);
create policy "debate_participants_update_own" on debate_participants for update using (auth.uid() = user_id);

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
do $$ begin alter publication supabase_realtime add table public.debate_messages; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.debate_participants; exception when duplicate_object then null; end $$;


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


-- [removed CREATE TABLE gift_types]


-- [skip] -- [skip entire insert gift_types]
-- FIX: une 1re version de gifts_sent (sender_id/receiver_id/gift_id) est creee plus haut.
-- "create table if not exists" ne la remplacerait pas : on la supprime pour obtenir
-- le schema attendu par la suite (from_user_id/to_user_id/gift_type_id/points_spent).
-- Sans risque : la fonctionnalite cadeaux est supprimee en fin de migration.


-- [removed CREATE TABLE gifts_sent]


-- [skip index]

-- [skip] alter table gift_types enable row level security;
-- [skip] alter table gifts_sent enable row level security;

-- [skip] drop policy if exists "gift_types_public_read" on gift_types;
-- [skip] create policy "gift_types_public_read" on gift_types for select using (true);

-- [skip]
-- [skip policy]

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
-- 2. Indexation pour optimiser les performances
CREATE INDEX IF NOT EXISTS idx_follows_followed ON public.follows(followed_id);

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
DROP FUNCTION IF EXISTS public.get_user_friends(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.get_user_friends(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.get_user_friends(uuid) CASCADE;
CREATE OR REPLACE FUNCTION public.get_user_friends(user_id_param UUID)
RETURNS TABLE (friend_id UUID) AS $$
BEGIN
  RETURN QUERY
  SELECT f1.followed_id AS friend_id
  FROM public.follows f1
  INNER JOIN public.follows f2 
    ON f1.followed_id = f2.follower_id 
   AND f1.follower_id = f2.followed_id
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
--   auth.users.id = profiles.id = wallets.id
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
    -- [removed alter wallets]
    -- [removed alter wallets]
    -- [removed alter wallets]
  END IF;
END $$;

-- Vérification finale : aucune table d'identité ne doit avoir user_id.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['profiles','wallets'] LOOP
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
USING (auth.uid() = user_id);

CREATE POLICY "notifications_update_own"
ON public.notifications
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "notifications_delete_own"
ON public.notifications
FOR DELETE
USING (auth.uid() = user_id);

-- ------------------------------------------------------------
-- 9. Compteur notifications non lues
-- ------------------------------------------------------------

DROP VIEW IF EXISTS public.notification_unread_counts;


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
DROP FUNCTION IF EXISTS public.get_user_friends(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.get_user_friends(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.get_user_friends(uuid) CASCADE;
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

-- (DROP TABLE public.follows retiré ici : la table est créée plus haut et ne doit pas être supprimée)

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
