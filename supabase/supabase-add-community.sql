-- Groupes
create table public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  avatar_url text,
  owner_id uuid references auth.users(id) not null,
  is_private boolean default false,
  created_at timestamptz default now()
);
create table public.group_members (
  group_id uuid references public.groups(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  role text default 'member',
  joined_at timestamptz default now(),
  primary key (group_id, user_id)
);
create table public.channels (
  id uuid primary key default gen_random_uuid(),
  group_id uuid references public.groups(id) on delete cascade,
  name text not null,
  type text default 'text',
  description text,
  created_at timestamptz default now()
);
create table public.channel_messages (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid references public.channels(id) on delete cascade,
  sender_id uuid references auth.users(id) not null,
  text text not null,
  created_at timestamptz default now()
);
alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.channels enable row level security;
alter table public.channel_messages enable row level security;
create policy "public_groups_read" on public.groups for select using (not is_private or auth.role() = 'authenticated');
create policy "groups_insert" on public.groups for insert with check (auth.role() = 'authenticated');
create policy "members_read" on public.group_members for select using (auth.role() = 'authenticated');
create policy "members_insert" on public.group_members for insert with check (auth.role() = 'authenticated');
create policy "channels_read" on public.channels for select using (auth.role() = 'authenticated');
create policy "channels_insert" on public.channels for insert with check (auth.role() = 'authenticated');
create policy "channel_messages_read" on public.channel_messages for select using (auth.role() = 'authenticated');
create policy "channel_messages_insert" on public.channel_messages for insert with check (auth.role() = 'authenticated');
alter publication supabase_realtime add table public.channel_messages;
alter publication supabase_realtime add table public.group_members;
