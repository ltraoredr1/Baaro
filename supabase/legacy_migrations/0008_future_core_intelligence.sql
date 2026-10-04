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
create policy future_preferences_owner on public.future_preferences for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists ai_agent_tasks_owner on public.ai_agent_tasks;
create policy ai_agent_tasks_owner on public.ai_agent_tasks for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists offline_sync_owner on public.offline_sync_queue;
create policy offline_sync_owner on public.offline_sync_queue for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists creator_revenue_owner on public.creator_revenue_events;
create policy creator_revenue_owner on public.creator_revenue_events for select using (auth.uid() = creator_id);
drop policy if exists safety_signal_owner on public.safety_signals;
create policy safety_signal_owner on public.safety_signals for select using (auth.uid() = user_id);

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
