-- BAARO 2.0 v14 — notification preferences and push hygiene
create table if not exists public.notification_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  push_enabled boolean not null default true,
  messages boolean not null default true,
  social boolean not null default true,
  live boolean not null default true,
  wallet boolean not null default true,
  marketing boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table public.notification_preferences enable row level security;
drop policy if exists notification_preferences_own on public.notification_preferences;
create policy notification_preferences_own
on public.notification_preferences
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create index if not exists idx_push_tokens_platform on public.push_tokens(platform);
create index if not exists idx_push_tokens_updated on public.push_tokens(updated_at desc);

-- Remove stale browser/device subscriptions without touching active tokens.
create or replace function public.prune_stale_push_tokens(max_age interval default interval '180 days')
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare deleted_count integer;
begin
  delete from public.push_tokens
  where updated_at < now() - max_age;
  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

revoke all on function public.prune_stale_push_tokens(interval) from public, anon, authenticated;
grant execute on function public.prune_stale_push_tokens(interval) to service_role;
