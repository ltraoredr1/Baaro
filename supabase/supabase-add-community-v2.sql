-- Extension communauté V2 : rôles + modération + voice
-- À exécuter APRÈS supabase-add-community.sql

-- Ajouter colonnes modération
alter table public.groups add column if not exists banned_user_ids uuid[] default '{}';
alter table public.channels add column if not exists is_locked boolean default false;

-- Table pour rôles personnalisés
create table if not exists public.group_roles (
  id uuid primary key default gen_random_uuid(),
  group_id uuid references public.groups(id) on delete cascade,
  name text not null,
  color text default '#FF6B00',
  permissions jsonb default '{"manage_channels": false, "manage_members": false, "ban_members": false, "mute_members": false}',
  created_at timestamptz default now()
);

-- Roles par défaut à créer pour chaque groupe (à faire dans createGroup via code)
-- owner = tout, admin = manage_channels + manage_members + ban, moderator = mute, member = rien

-- Table pour voice participants (qui est dans quel vocal maintenant)
create table if not exists public.voice_participants (
  channel_id uuid references public.channels(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  joined_at timestamptz default now(),
  is_muted boolean default false,
  is_deafened boolean default false,
  primary key (channel_id, user_id)
);

alter table public.group_roles enable row level security;
alter table public.voice_participants enable row level security;

create policy "group_roles_read" on public.group_roles for select using (auth.role() = 'authenticated');
create policy "group_roles_write" on public.group_roles for all using (auth.role() = 'authenticated');
create policy "voice_participants_all" on public.voice_participants for all using (auth.role() = 'authenticated');

alter publication supabase_realtime add table public.voice_participants;
