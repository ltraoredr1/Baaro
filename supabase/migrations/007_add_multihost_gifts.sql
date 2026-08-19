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
