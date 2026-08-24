-- V3 Communauté : Invitations + Notifications + Récompenses BARO

-- 1. Invitations par lien
create table if not exists public.group_invites (
  id uuid primary key default gen_random_uuid(),
  group_id uuid references public.groups(id) on delete cascade,
  code text unique not null, -- ex: X7K9P2
  created_by uuid references auth.users(id),
  max_uses int default 0, -- 0 = illimité
  uses int default 0,
  expires_at timestamptz,
  created_at timestamptz default now()
);

-- 2. Notifications communauté
create table if not exists public.community_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  type text not null, -- group_invite, group_join, role_change, mention, new_channel
  title text not null,
  body text,
  group_id uuid references public.groups(id) on delete cascade,
  channel_id uuid references public.channels(id) on delete cascade,
  is_read boolean default false,
  created_at timestamptz default now()
);

-- 3. Index
create index if not exists idx_invites_code on public.group_invites(code);
create index if not exists idx_notifications_user on public.community_notifications(user_id, is_read);

-- RLS
alter table public.group_invites enable row level security;
alter table public.community_notifications enable row level security;

create policy "invites_read" on public.group_invites for select using (auth.role()='authenticated');
create policy "invites_write" on public.group_invites for all using (auth.role()='authenticated');
create policy "notif_own" on public.community_notifications for all using (auth.uid() = user_id);

-- Realtime pour notifs
alter publication supabase_realtime add table public.community_notifications;
alter publication supabase_realtime add table public.group_invites;

-- 4. Fonction récompense BARO pour communauté (à appeler depuis api/wallet.js)
-- Ex: +10 points création groupe, +2 points création canal, +1 message
-- Cette table log les actions pour éviter double crédit (idempotence comme ta migration 015)
create table if not exists public.community_rewards_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id),
  action text not null, -- create_group, create_channel, send_message, daily_streak
  reference_id text not null, -- group_id ou channel_id ou message_id
  points int not null,
  created_at timestamptz default now(),
  unique(user_id, action, reference_id)
);
