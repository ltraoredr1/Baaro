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
create policy module_preferences_owner on public.module_preferences for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists ai_action_log_owner on public.ai_action_log;
create policy ai_action_log_owner on public.ai_action_log for select using (auth.uid() = user_id);
drop policy if exists automation_rules_owner on public.automation_rules;
create policy automation_rules_owner on public.automation_rules for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists data_export_jobs_owner on public.data_export_jobs;
create policy data_export_jobs_owner on public.data_export_jobs for select, insert using (auth.uid() = user_id) with check (auth.uid() = user_id);
