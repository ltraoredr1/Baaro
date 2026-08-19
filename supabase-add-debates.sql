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
