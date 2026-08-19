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

-- ===== 001_security_fix.sql =====
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

create policy "wallet_read_own" on wallets for select using (auth.uid() = user_id);
create policy "crypto_read_own" on crypto_holdings for select using (auth.uid() = user_id);
create policy "tx_read_own" on transactions for select using (auth.uid() = user_id);
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

-- ===== 002_add_media.sql =====
-- À exécuter en plus du schéma existant, dans une nouvelle requête SQL Supabase.
alter table posts add column if not exists media_url text;
alter table posts add column if not exists media_type text;

-- ===== 003_add_debates.sql =====
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
alter publication supabase_realtime add table debate_messages;
alter publication supabase_realtime add table debate_participants;

-- ===== 004_add_social_features.sql =====
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

-- ===== 005_add_profile_bio.sql =====
-- À exécuter en plus du schéma existant, dans une nouvelle requête SQL Supabase.
alter table profiles add column if not exists bio text default '';

-- ===== 006_add_messages_security.sql =====
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

-- ===== 007_add_multihost_gifts.sql =====
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
$$ language plpgsql security definer;

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

-- ===== 008_fix_chat_friends.sql =====
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

-- ===== 009_fix_debates_security.sql =====
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

-- ===== 010_performance.sql =====
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
-- 9. STORIES
-- ------------------------------------------------------------
create index if not exists idx_stories_author
  on public.stories (author_id);

create index if not exists idx_stories_expires
  on public.stories (expires_at);

-- ------------------------------------------------------------
-- 10. DEBATES
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

-- ===== 011_baaro_core_media_security.sql =====
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

-- Stories: media contract used by StoriesBar/StoryViewer
alter table public.stories add column if not exists media_url text;
alter table public.stories add column if not exists media_type text;
alter table public.stories add column if not exists text_overlay text;
alter table public.stories alter column text drop not null;
do $$ begin
  alter table public.stories add constraint stories_media_type_check check (media_type is null or media_type in ('image','video'));
exception when duplicate_object then null;
end $$;

create table if not exists public.story_views (
  story_id uuid not null references public.stories(id) on delete cascade,
  viewer_id uuid not null references auth.users(id) on delete cascade,
  viewed_at timestamptz not null default now(),
  primary key (story_id, viewer_id)
);
create index if not exists idx_story_views_viewer on public.story_views(viewer_id, viewed_at desc);

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
alter table public.story_views enable row level security;
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
create policy video_likes_own on public.video_likes for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists video_comments_read on public.video_comments;
create policy video_comments_read on public.video_comments for select using (true);
drop policy if exists video_comments_insert on public.video_comments;
create policy video_comments_insert on public.video_comments for insert with check (auth.uid() = author_id);
drop policy if exists video_comments_update_own on public.video_comments;
create policy video_comments_update_own on public.video_comments for update using (auth.uid() = author_id) with check (auth.uid() = author_id);
drop policy if exists video_comments_delete_own on public.video_comments;
create policy video_comments_delete_own on public.video_comments for delete using (auth.uid() = author_id);

drop policy if exists story_views_read on public.story_views;
create policy story_views_read on public.story_views for select using (auth.uid() = viewer_id or exists (select 1 from public.stories s where s.id = story_views.story_id and s.author_id = auth.uid()));
drop policy if exists story_views_insert_own on public.story_views;
create policy story_views_insert_own on public.story_views for insert with check (auth.uid() = viewer_id);

drop policy if exists push_tokens_own on public.push_tokens;
create policy push_tokens_own on public.push_tokens for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists calls_participant_read on public.calls;
create policy calls_participant_read on public.calls for select using (auth.uid() = caller_id or auth.uid() = callee_id);
drop policy if exists calls_caller_insert on public.calls;
create policy calls_caller_insert on public.calls for insert with check (auth.uid() = caller_id);
drop policy if exists calls_participant_update on public.calls;
create policy calls_participant_update on public.calls for update using (auth.uid() = caller_id or auth.uid() = callee_id) with check (auth.uid() = caller_id or auth.uid() = callee_id);

drop policy if exists role_requests_read on public.debate_role_requests;
create policy role_requests_read on public.debate_role_requests for select using (auth.uid() = user_id or exists (select 1 from public.debate_rooms r where r.id = debate_role_requests.room_id and r.host_id = auth.uid()));
drop policy if exists role_requests_insert on public.debate_role_requests;
create policy role_requests_insert on public.debate_role_requests for insert with check (auth.uid() = user_id);
drop policy if exists role_requests_update on public.debate_role_requests;
create policy role_requests_update on public.debate_role_requests for update using (exists (select 1 from public.debate_rooms r where r.id = debate_role_requests.room_id and r.host_id = auth.uid()) or auth.uid() = user_id) with check (exists (select 1 from public.debate_rooms r where r.id = debate_role_requests.room_id and r.host_id = auth.uid()) or auth.uid() = user_id);

drop policy if exists referral_rewards_read_own on public.referral_rewards;
create policy referral_rewards_read_own on public.referral_rewards for select using (auth.uid() = referrer_id or auth.uid() = referred_id);

-- Video/story policies: replace unsafe/duplicate legacy policies
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

drop policy if exists stories_read on public.stories;
create policy stories_read on public.stories for select using (expires_at > now());
drop policy if exists stories_insert on public.stories;
create policy stories_insert on public.stories for insert with check (auth.uid() = author_id);
drop policy if exists stories_update_own on public.stories;
create policy stories_update_own on public.stories for update using (auth.uid() = author_id) with check (auth.uid() = author_id);
drop policy if exists stories_delete_own on public.stories;
create policy stories_delete_own on public.stories for delete using (auth.uid() = author_id);

-- Useful indexes
create index if not exists idx_videos_created on public.videos(created_at desc);
create index if not exists idx_videos_author_created on public.videos(author_id, created_at desc);
create index if not exists idx_stories_active on public.stories(expires_at desc, created_at desc);
create index if not exists idx_story_views_story on public.story_views(story_id, viewed_at desc);

-- Realtime (safe to repeat)
do $$ begin alter publication supabase_realtime add table public.videos; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.stories; exception when duplicate_object then null; end $$;
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

-- Storage buckets. Public read is intentional for feed media; writes remain authenticated and owner-scoped.
insert into storage.buckets (id, name, public) values ('media','media',true) on conflict (id) do update set public = true;
insert into storage.buckets (id, name, public) values ('videos','videos',true) on conflict (id) do update set public = true;
insert into storage.buckets (id, name, public) values ('stories','stories',true) on conflict (id) do update set public = true;
insert into storage.buckets (id, name, public) values ('chat-media','chat-media',true) on conflict (id) do update set public = true;

-- Storage policies
 drop policy if exists baaro_media_insert on storage.objects;
create policy baaro_media_insert on storage.objects for insert to authenticated with check (bucket_id in ('media','videos','stories','chat-media') and (storage.foldername(name))[1] = auth.uid()::text);
 drop policy if exists baaro_media_update on storage.objects;
create policy baaro_media_update on storage.objects for update to authenticated using (bucket_id in ('media','videos','stories','chat-media') and owner_id = auth.uid()) with check (bucket_id in ('media','videos','stories','chat-media') and owner_id = auth.uid());
 drop policy if exists baaro_media_delete on storage.objects;
create policy baaro_media_delete on storage.objects for delete to authenticated using (bucket_id in ('media','videos','stories','chat-media') and owner_id = auth.uid());
 drop policy if exists baaro_media_public_read on storage.objects;
create policy baaro_media_public_read on storage.objects for select using (bucket_id in ('media','videos','stories','chat-media'));

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
  insert into public.wallets(user_id, balance)
  values (p_user_id, bonus)
  on conflict (user_id) do nothing;

  select * into w from public.wallets where user_id = p_user_id for update;

  if bonus > 0 and not exists (
    select 1 from public.transactions
    where user_id = p_user_id and action_key = 'welcome_bonus'
  ) then
    insert into public.transactions(user_id, label, pts, action_key, day_key)
    values (p_user_id, 'Bonus de bienvenue', bonus, 'welcome_bonus', current_date);
  end if;

  return jsonb_build_object('user_id', w.user_id, 'balance', w.balance, 'updated_at', w.updated_at);
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
  select * into w from public.wallets where user_id = p_user_id for update;

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
  select * into w from public.wallets where user_id = p_user_id for update;
  if w.balance < p_cost then raise exception 'INSUFFICIENT_BALANCE'; end if;

  update public.wallets set balance = balance - p_cost, updated_at = now()
  where user_id = p_user_id returning * into w;

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
  select * into w from public.wallets where user_id = p_user_id for update;
  if w.balance < p_pts then raise exception 'INSUFFICIENT_BALANCE'; end if;
  baro := round((p_pts / p_points_per_baro)::numeric, 3);

  insert into public.crypto_holdings(user_id, holdings)
  values (p_user_id, 0)
  on conflict (user_id) do nothing;
  select * into h from public.crypto_holdings where user_id = p_user_id for update;

  update public.wallets set balance = balance - p_pts, updated_at = now()
  where user_id = p_user_id returning * into w;
  update public.crypto_holdings set holdings = holdings + baro, updated_at = now()
  where user_id = p_user_id returning * into h;

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

-- RLS hardening: expired stories are never exposed through the database API.
drop policy if exists stories_read on public.stories;
create policy stories_read on public.stories
  for select using (expires_at > now());

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


-- ===== 015_reward_integrity_security.sql =====
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
        select exists(select 1 from public.stories where id = p_reference_id and author_id = p_user_id) into event_exists;
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
  select * into w from public.wallets where user_id = p_user_id for update;

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
    select * into sender from public.wallets where user_id = p_sender_id for update;
    select * into host from public.wallets where user_id = room.host_id for update;
  else
    perform public.wallet_ensure(room.host_id, 0); perform public.wallet_ensure(p_sender_id, 0);
    select * into host from public.wallets where user_id = room.host_id for update;
    select * into sender from public.wallets where user_id = p_sender_id for update;
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
  select * into sender from public.wallets where user_id = p_sender_id;
  return jsonb_build_object('balance', sender.balance, 'gift', to_jsonb(gift_row));
end;
$$;
revoke all on function public.wallet_send_gift(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.wallet_send_gift(uuid, uuid, text) to service_role;
