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
