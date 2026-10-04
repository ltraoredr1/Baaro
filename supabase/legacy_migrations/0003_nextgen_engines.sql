-- BAARO NextGen Engines v1
-- Async media jobs, recommendation signals, creator monetization and AI media metadata.

create table if not exists public.media_jobs (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid references public.media_assets(id) on delete cascade,
  video_id uuid references public.videos(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  job_type text not null check (job_type in ('transcode','thumbnail','captions','translate','dub','moderate','features','highlights','edit_plan')),
  status text not null default 'queued' check (status in ('queued','processing','completed','failed','dead')),
  attempts integer not null default 0,
  max_attempts integer not null default 5,
  priority integer not null default 50 check (priority between 0 and 100),
  payload jsonb not null default '{}'::jsonb,
  result jsonb,
  error text,
  available_at timestamptz not null default now(),
  locked_at timestamptz,
  locked_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_media_jobs_queue
  on public.media_jobs(status, priority desc, available_at asc, created_at asc);
create index if not exists idx_media_jobs_owner
  on public.media_jobs(owner_id, created_at desc);

create table if not exists public.video_watch_events (
  id uuid primary key default gen_random_uuid(),
  video_id uuid not null references public.videos(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete set null,
  session_id text,
  watch_ms integer not null default 0 check (watch_ms >= 0),
  duration_ms integer not null default 0 check (duration_ms >= 0),
  completed boolean not null default false,
  rewatched boolean not null default false,
  skipped boolean not null default false,
  liked boolean not null default false,
  shared boolean not null default false,
  negative_signal text check (negative_signal is null or negative_signal in ('not_interested','hide_creator','report')),
  created_at timestamptz not null default now()
);
create index if not exists idx_video_watch_video_created on public.video_watch_events(video_id, created_at desc);
create index if not exists idx_video_watch_user_created on public.video_watch_events(user_id, created_at desc);

create table if not exists public.video_recommendation_profiles (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  topics jsonb not null default '{}'::jsonb,
  creators jsonb not null default '{}'::jsonb,
  languages jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.creator_monetization (
  creator_id uuid primary key references public.profiles(id) on delete cascade,
  enabled boolean not null default false,
  revenue_share numeric not null default 0.55 check (revenue_share between 0 and 1),
  min_cashout numeric not null default 1000 check (min_cashout >= 0),
  currency text not null default 'XOF',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.creator_earnings (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references public.profiles(id) on delete cascade,
  source text not null check (source in ('ads','tips','subscriptions','gifts','marketplace','bonus')),
  reference_id uuid,
  gross_amount numeric not null default 0 check (gross_amount >= 0),
  platform_fee numeric not null default 0 check (platform_fee >= 0),
  net_amount numeric generated always as (gross_amount - platform_fee) stored,
  currency text not null default 'XOF',
  status text not null default 'pending' check (status in ('pending','available','paid','reversed')),
  created_at timestamptz not null default now()
);
create index if not exists idx_creator_earnings_creator_created on public.creator_earnings(creator_id, created_at desc);

alter table public.media_jobs enable row level security;
alter table public.video_watch_events enable row level security;
alter table public.video_recommendation_profiles enable row level security;
alter table public.creator_monetization enable row level security;
alter table public.creator_earnings enable row level security;

create policy media_jobs_owner_read on public.media_jobs for select using (auth.uid() = owner_id);
create policy watch_events_own on public.video_watch_events for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy recommendation_profile_own on public.video_recommendation_profiles for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy creator_monetization_own on public.creator_monetization for all using (auth.uid() = creator_id) with check (auth.uid() = creator_id);
create policy creator_earnings_own on public.creator_earnings for select using (auth.uid() = creator_id);

create or replace function public.claim_media_jobs(p_limit integer default 5, p_worker text default 'vercel')
returns setof public.media_jobs
language plpgsql security definer set search_path=public
as $$
begin
  return query
  with picked as (
    select id from public.media_jobs
    where status='queued' and available_at <= now()
    order by priority desc, created_at asc
    for update skip locked limit greatest(1, least(p_limit, 20))
  )
  update public.media_jobs j
  set status='processing', attempts=j.attempts+1, locked_at=now(), locked_by=p_worker, updated_at=now()
  from picked
  where j.id=picked.id
  returning j.*;
end;
$$;

revoke all on function public.claim_media_jobs(integer,text) from public;

create or replace function public.record_video_watch(
  p_video_id uuid, p_watch_ms integer, p_duration_ms integer,
  p_completed boolean default false, p_rewatched boolean default false,
  p_liked boolean default false, p_shared boolean default false,
  p_negative_signal text default null
) returns void
language plpgsql security definer set search_path=public
as $$
begin
  insert into public.video_watch_events(video_id,user_id,watch_ms,duration_ms,completed,rewatched,liked,shared,negative_signal)
  values (p_video_id,auth.uid(),greatest(p_watch_ms,0),greatest(p_duration_ms,0),p_completed,p_rewatched,p_liked,p_shared,p_negative_signal);
  update public.videos v set
    completion_rate = coalesce((select avg(case when completed then 1.0 else least(watch_ms::numeric/nullif(duration_ms,0),1) end) from public.video_watch_events e where e.video_id=v.id),0),
    rewatch_rate = coalesce((select avg(case when rewatched then 1.0 else 0 end) from public.video_watch_events e where e.video_id=v.id),0),
    recommendation_score = (
      coalesce(v.likes,0)*1.0 + coalesce(v.comments_count,0)*1.8 +
      coalesce(v.completion_rate,0)*100 + coalesce(v.rewatch_rate,0)*80 +
      greatest(0, extract(epoch from (now()-v.created_at))/3600 * -0.15)
    )
  where v.id=p_video_id;
end;
$$;
revoke all on function public.record_video_watch(uuid,integer,integer,boolean,boolean,boolean,boolean,text) from public;
grant execute on function public.record_video_watch(uuid,integer,integer,boolean,boolean,boolean,boolean,text) to authenticated;

create or replace function public.video_feed_candidates(p_user_id uuid, p_limit integer default 20)
returns table(
  id uuid, author_id uuid, video_url text, thumbnail_url text, title text, description text,
  duration text, views bigint, likes integer, comments_count integer, created_at timestamptz,
  score numeric
)
language sql stable security definer set search_path=public
as $$
  select v.id,v.author_id,v.video_url,v.thumbnail_url,v.title,v.description,v.duration,
         v.views,v.likes,v.comments_count,v.created_at,
         round(
           coalesce(v.recommendation_score,0)
           + case when v.author_id=p_user_id then -20 else 0 end
           + greatest(0, 30 - extract(epoch from (now()-v.created_at))/3600 * 0.25)
           + coalesce(v.completion_rate,0)*120
           + coalesce(v.rewatch_rate,0)*100
           - coalesce((select count(*)*8 from public.video_watch_events e where e.video_id=v.id and e.user_id=p_user_id and e.created_at > now()-interval '7 days'),0)
         ,4) as score
  from public.videos v
  where coalesce(v.visibility,'public')='public'
    and not exists(select 1 from public.blocks b where b.blocker_id=p_user_id and b.blocked_id=v.author_id)
  order by score desc, v.created_at desc
  limit greatest(1,least(p_limit,100));
$$;
revoke all on function public.video_feed_candidates(uuid,integer) from public;
grant execute on function public.video_feed_candidates(uuid,integer) to authenticated;
