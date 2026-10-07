-- ============================================================
-- BAARO-FND-003B complet et corrigé — Intelligence, Sécurité & Engagement
-- ============================================================

begin;

-- 1. Tables de base et index pour l'export et l'automatisation
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
drop policy if exists data_export_jobs_owner_select on public.data_export_jobs;
drop policy if exists data_export_jobs_owner_insert on public.data_export_jobs;

create policy data_export_jobs_owner_select on public.data_export_jobs for select using (auth.uid() = user_id);
create policy data_export_jobs_owner_insert on public.data_export_jobs for insert with check (auth.uid() = user_id);


-- ============================================================
-- SOURCE 0008_future_core_intelligence.sql
-- ============================================================
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


-- ============================================================
-- SOURCE 0009_hardened_security.sql
-- ============================================================
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

drop policy if exists security_devices_owner on public.security_devices;
create policy security_devices_owner on public.security_devices for select using (auth.uid() = user_id);

drop policy if exists security_devices_insert on public.security_devices;
create policy security_devices_insert on public.security_devices for insert with check (auth.uid() = user_id);

drop policy if exists security_devices_update on public.security_devices;
create policy security_devices_update on public.security_devices for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists security_devices_delete on public.security_devices;
create policy security_devices_delete on public.security_devices for delete using (auth.uid() = user_id);

drop policy if exists security_settings_owner on public.security_settings;
create policy security_settings_owner on public.security_settings for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index if not exists idx_security_devices_user on public.security_devices(user_id, last_seen_at desc);
create index if not exists idx_security_devices_active on public.security_devices(user_id) where revoked_at is null;
create index if not exists idx_security_events_user_created on public.security_events(user_id, created_at desc);
create index if not exists idx_security_events_created on public.security_events(created_at desc);

revoke all on public.trust_events from anon, authenticated;
revoke all on public.observability_events from anon, authenticated;

create or replace function public.security_list_devices()
returns table (
  id uuid, device_id text, label text, platform text, fingerprint text,
  trusted boolean, revoked_at timestamptz, last_seen_at timestamptz, created_at timestamptz
)
language sql security invoker stable set search_path = public
as $$
  select d.id, d.device_id, d.label, d.platform, d.fingerprint,
         d.trusted, d.revoked_at, d.last_seen_at, d.created_at
  from public.security_devices d
  where d.user_id = auth.uid()
  order by d.last_seen_at desc;
$$;

grant execute on function public.security_list_devices() to authenticated;

create or replace function public.security_revoke_device(target_device_id text)
returns boolean
language plpgsql security invoker set search_path = public
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

insert into public.security_settings(user_id)
select id from auth.users
on conflict (user_id) do nothing;


-- ============================================================
-- SOURCE 0010_security_final.sql
-- ============================================================
create table if not exists public.story_close_friends (
  owner_id uuid not null references auth.users(id) on delete cascade,
  member_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (owner_id, member_id),
  check (owner_id <> member_id)
);

alter table public.story_close_friends enable row level security;

drop policy if exists story_close_friends_owner on public.story_close_friends;
create policy story_close_friends_owner on public.story_close_friends for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create index if not exists idx_story_close_friends_member on public.story_close_friends(member_id, owner_id);

drop policy if exists stories_read on public.stories;
create policy stories_read on public.stories for select to authenticated using (
  deleted_at is null and expires_at > now() and (
    author_id = auth.uid() or visibility = 'public'
    or (visibility = 'followers' and exists (select 1 from public.follows f where f.follower_id = auth.uid() and f.followed_id = stories.author_id and f.status = 'accepted'))
    or (visibility = 'close_friends' and exists (select 1 from public.story_close_friends cf where cf.owner_id = stories.author_id and cf.member_id = auth.uid()))
  )
);

drop policy if exists story_reactions_owner on public.story_reactions;
drop policy if exists story_views_owner on public.story_views;

drop policy if exists creator_monetization_read on public.creator_monetization;
create policy creator_monetization_read on public.creator_monetization for select to authenticated using (creator_id = auth.uid());

create or replace function public.set_creator_monetization_enabled(p_enabled boolean)
returns public.creator_monetization
language plpgsql security invoker set search_path = public
as $$
declare r public.creator_monetization;
begin
  update public.creator_monetization set enabled = p_enabled, updated_at = now() where creator_id = auth.uid() returning * into r;
  if not found then
    insert into public.creator_monetization(creator_id, enabled) values (auth.uid(), p_enabled) returning * into r;
  end if;
  return r;
end; $$;

revoke all on function public.set_creator_monetization_enabled(boolean) from public, anon;
grant execute on function public.set_creator_monetization_enabled(boolean) to authenticated;

revoke all on function public.claim_media_jobs(integer,text) from public, anon, authenticated;
grant execute on function public.claim_media_jobs(integer,text) to service_role;


-- ============================================================
-- SOURCE 0011_engagement_names_and_post_views.sql
-- ============================================================
alter table public.posts add column if not exists views_count bigint not null default 0;

create table if not exists public.post_views (
  post_id uuid not null references public.posts(id) on delete cascade,
  viewer_id uuid not null references auth.users(id) on delete cascade,
  view_date date not null default current_date,
  viewed_at timestamptz not null default now(),
  primary key (post_id, viewer_id, view_date)
);

create index if not exists idx_post_views_post_date on public.post_views(post_id, viewed_at desc);
create index if not exists idx_post_views_viewer_date on public.post_views(viewer_id, viewed_at desc);

alter table public.post_views enable row level security;
drop policy if exists post_views_owner_read on public.post_views;
create policy post_views_owner_read on public.post_views for select to authenticated using (exists (select 1 from public.posts p where p.id = post_id and p.author_id = auth.uid()));

create or replace function public.register_post_view(p_post_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  owner_id uuid;
  inserted boolean := false;
  new_views bigint := 0;
begin
  if uid is null then raise exception 'AUTH_REQUIRED'; end if;
  select author_id into owner_id from public.posts where id = p_post_id;
  if owner_id is null then raise exception 'POST_NOT_FOUND'; end if;
  if owner_id = uid then
    select coalesce(views_count, 0) into new_views from public.posts where id = p_post_id;
    return jsonb_build_object('counted', false, 'views', new_views);
  end if;
  insert into public.post_views(post_id, viewer_id, view_date) values (p_post_id, uid, current_date) on conflict (post_id, viewer_id, view_date) do nothing;
  inserted := found;
  if inserted then
    update public.posts set views_count = coalesce(views_count, 0) + 1, updated_at = now() where id = p_post_id returning views_count into new_views;
  else
    select coalesce(views_count, 0) into new_views from public.posts where id = p_post_id;
  end if;
  return jsonb_build_object('counted', inserted, 'views', new_views);
end; $$;

revoke all on function public.register_post_view(uuid) from public, anon;
grant execute on function public.register_post_view(uuid) to authenticated;

-- Fonctions d'engagement et statistiques
create or replace function public.get_story_viewers(p_story_id uuid)
returns table(viewer_id uuid, display_name text, handle text, avatar_url text, flag text, viewed_at timestamptz)
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if not exists (select 1 from public.stories where id = p_story_id and author_id = auth.uid()) then raise exception 'ACCESS_DENIED'; end if;
  return query select v.viewer_id, p.display_name, p.handle, p.avatar_url, p.flag, v.viewed_at from public.story_views v left join public.profiles p on p.id = v.viewer_id where v.story_id = p_story_id order by v.viewed_at desc;
end; $$;

create or replace function public.get_profile_stats(p_user_id uuid)
returns table(followers bigint, following bigint, friends bigint, posts bigint, likes bigint)
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_user_id is null then raise exception 'USER_REQUIRED'; end if;
  if not exists (select 1 from public.profiles where id = p_user_id) then raise exception 'PROFILE_NOT_FOUND'; end if;
  return query select
    (select count(*) from public.follows f where f.followed_id=p_user_id and f.status='accepted'),
    (select count(*) from public.follows f where f.follower_id=p_user_id and f.status='accepted'),
    (select count(*) from public.follows f where f.followed_id=p_user_id and f.status='accepted' and f.is_friend=true),
    (select count(*) from public.posts p where p.author_id=p_user_id),
    (select count(*) from public.post_likes l join public.posts p on p.id=l.post_id where p.author_id=p_user_id);
end; $$;

revoke all on function public.get_story_viewers(uuid) from public, anon;
revoke all on function public.get_profile_stats(uuid) from public, anon;
grant execute on function public.get_story_viewers(uuid) to authenticated;
grant execute on function public.get_profile_stats(uuid) to authenticated;

-- Paramètres utilisateur
create table if not exists public.user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  id uuid generated always as (user_id) stored unique,
  theme text not null default 'midnight', lang text not null default 'fr', country text not null default 'ML', currency text not null default 'XOF',
  data_saver boolean not null default true, autoplay_video boolean not null default false, offline_sync boolean not null default true,
  ai_region text not null default 'auto', ai_suggest boolean not null default true, auto_translate boolean not null default true, translate_media boolean not null default true,
  show_earnings boolean not null default false, prefer_debates boolean not null default true, prefer_local boolean not null default true,
  private_profile boolean not null default false, block_screenshots boolean not null default true, biometric boolean not null default false, large_text boolean not null default false, reduce_motion boolean not null default false, notif_push boolean not null default true,
  smart_prefetch boolean not null default true, battery_saver boolean not null default false, low_bandwidth_mode boolean not null default false, local_cache boolean not null default true, privacy_ai boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table public.user_settings enable row level security;
drop policy if exists user_settings_owner_read on public.user_settings; 
drop policy if exists user_settings_owner_insert on public.user_settings; 
drop policy if exists user_settings_owner_update on public.user_settings; 
drop policy if exists user_settings_owner_delete on public.user_settings;

create policy user_settings_owner_read on public.user_settings for select to authenticated using (user_id=auth.uid());
create policy user_settings_owner_insert on public.user_settings for insert to authenticated with check (user_id=auth.uid());
create policy user_settings_owner_update on public.user_settings for update to authenticated using (user_id=auth.uid()) with check (user_id=auth.uid());
create policy user_settings_owner_delete on public.user_settings for delete to authenticated using (user_id=auth.uid());

alter table public.user_settings drop constraint if exists user_settings_lang_check;
alter table public.user_settings add constraint user_settings_lang_check check (lang in ('fr','en','ar','bm','wo','ha','ff','sw','pt','es','nqo','boz','dog','snk'));

commit;
