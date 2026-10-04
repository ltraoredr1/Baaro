-- BAARO Security Hardening
-- Defense-in-depth: device registry, security events, session controls,
-- abuse throttling, safer server-only tables and strict ownership policies.

create extension if not exists pgcrypto;

create table if not exists public.security_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  device_id text not null check (char_length(device_id) between 16 and 200),
  label text,
  platform text check (platform in ('web','android','ios','desktop','unknown')),
  public_key jsonb,
  fingerprint text,
  trusted boolean not null default false,
  revoked_at timestamptz,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique(user_id, device_id)
);

create table if not exists public.security_events (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users(id) on delete set null,
  event_type text not null check (event_type in (
    'login','logout','password_change','mfa_change','device_added','device_revoked',
    'session_rejected','suspicious_login','rate_limited','report_created','data_exported',
    'security_setting_changed','key_rotated'
  )),
  device_id text,
  request_id text,
  ip_hash text,
  user_agent_hash text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.security_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  require_mfa boolean not null default false,
  login_alerts boolean not null default true,
  new_device_approval boolean not null default true,
  remote_logout_enabled boolean not null default true,
  ai_sensitive_action_confirmation boolean not null default true,
  updated_at timestamptz not null default now()
);

create table if not exists public.abuse_counters (
  bucket_key text primary key,
  window_started_at timestamptz not null,
  request_count integer not null default 0,
  blocked_until timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.security_devices enable row level security;
alter table public.security_events enable row level security;
alter table public.security_settings enable row level security;
alter table public.abuse_counters enable row level security;

revoke all on public.security_events from anon, authenticated;
revoke all on public.abuse_counters from anon, authenticated;

-- Device registry: users can see/revoke only their own devices.
drop policy if exists security_devices_owner on public.security_devices;
create policy security_devices_owner on public.security_devices
  for select using (auth.uid() = user_id);

drop policy if exists security_devices_insert on public.security_devices;
create policy security_devices_insert on public.security_devices
  for insert with check (auth.uid() = user_id);

drop policy if exists security_devices_update on public.security_devices;
create policy security_devices_update on public.security_devices
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists security_devices_delete on public.security_devices;
create policy security_devices_delete on public.security_devices
  for delete using (auth.uid() = user_id);

-- Settings are strictly owner-scoped.
drop policy if exists security_settings_owner on public.security_settings;
create policy security_settings_owner on public.security_settings
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index if not exists idx_security_devices_user on public.security_devices(user_id, last_seen_at desc);
create index if not exists idx_security_devices_active on public.security_devices(user_id) where revoked_at is null;
create index if not exists idx_security_events_user_created on public.security_events(user_id, created_at desc);
create index if not exists idx_security_events_created on public.security_events(created_at desc);

-- Prevent clients from writing server-controlled risk/audit tables.
revoke all on public.trust_events from anon, authenticated;
revoke all on public.observability_events from anon, authenticated;

-- Safe owner-scoped helper; it exposes only the caller's device state.
create or replace function public.security_list_devices()
returns table (
  id uuid,
  device_id text,
  label text,
  platform text,
  fingerprint text,
  trusted boolean,
  revoked_at timestamptz,
  last_seen_at timestamptz,
  created_at timestamptz
)
language sql
security invoker
stable
set search_path = public
as $$
  select d.id, d.device_id, d.label, d.platform, d.fingerprint,
         d.trusted, d.revoked_at, d.last_seen_at, d.created_at
  from public.security_devices d
  where d.user_id = auth.uid()
  order by d.last_seen_at desc;
$$;

grant execute on function public.security_list_devices() to authenticated;

-- Owner-only remote revoke helper.
create or replace function public.security_revoke_device(target_device_id text)
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
begin
  update public.security_devices
     set revoked_at = now(), trusted = false
   where user_id = auth.uid()
     and device_id = target_device_id
     and revoked_at is null;
  return found;
end;
$$;

grant execute on function public.security_revoke_device(text) to authenticated;

-- Generic per-user security settings bootstrap.
insert into public.security_settings(user_id)
select id from auth.users
on conflict (user_id) do nothing;

-- Keep potentially sensitive free-form data from growing without bounds.
alter table public.security_events add constraint security_events_metadata_size
  check (pg_column_size(metadata) <= 32768);
alter table public.security_devices add constraint security_device_label_size
  check (label is null or char_length(label) <= 120);
