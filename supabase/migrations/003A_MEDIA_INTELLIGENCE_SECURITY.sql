-- ============================================================
-- BAARO FOUNDATION 003: MEDIA_INTELLIGENCE_SECURITY
-- UNIQUE FOUNDATION ID: BAARO-FND-003
-- Apply in order: BAARO-FND-001 -> 002 -> 003 -> 004
-- Target: fresh/empty Supabase database.
-- This block is part of the four-block canonical foundation.
-- ============================================================

-- BAARO — CLOUDflare R2 MEDIA METADATA
-- Binary files live in Cloudflare R2. Supabase stores metadata only.
-- ============================================================
create table if not exists public.media_assets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  provider text not null default 'cloudflare-r2' check (provider = 'cloudflare-r2'),
  bucket text not null,
  folder text not null check (folder in ('profiles','posts','videos','chat','shop','misc')),
  object_key text not null,
  public_url text not null,
  mime_type text not null,
  byte_size bigint not null check (byte_size > 0),
  original_name text,
  status text not null default 'ready' check (status in ('pending','ready','failed','deleted')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (bucket, object_key)
);
create index if not exists idx_media_assets_owner_created on public.media_assets(owner_id, created_at desc);
create index if not exists idx_media_assets_owner_folder on public.media_assets(owner_id, folder, created_at desc);
create index if not exists idx_media_assets_status on public.media_assets(status, created_at desc);
alter table public.media_assets enable row level security;
drop policy if exists media_assets_select_own on public.media_assets;
create policy media_assets_select_own on public.media_assets for select to authenticated using (auth.uid() = owner_id);

-- ============================================================
-- BAARO — UPDATED AT HELPER FOR MEDIA METADATA
-- ============================================================
create or replace function public.set_media_assets_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;
drop trigger if exists trg_media_assets_updated_at on public.media_assets;
create trigger trg_media_assets_updated_at before update on public.media_assets for each row execute function public.set_media_assets_updated_at();


-- ============================================================
-- BAARO — POST-DEPENDENCY FOREIGN KEYS
-- Added after all referenced commerce/community tables exist.
-- ============================================================
do $$ begin
  if to_regclass('public.conversations') is not null then
    alter table public.messages drop constraint if exists messages_conversation_id_fkey;
    alter table public.messages add constraint messages_conversation_id_fkey
      foreign key (conversation_id) references public.conversations(id) on delete cascade;
  end if;
exception when duplicate_object then null;
end $$;

do $$ begin
  if to_regclass('public.shops') is not null then
    alter table public.orders drop constraint if exists orders_shop_id_fkey;
    alter table public.orders add constraint orders_shop_id_fkey
      foreign key (shop_id) references public.shops(id) on delete set null;
  end if;
exception when duplicate_object then null;
end $$;

do $$ begin
  if to_regclass('public.shop_products') is not null then
    alter table public.order_items drop constraint if exists order_items_product_id_fkey;
    alter table public.order_items add constraint order_items_product_id_fkey
      foreign key (product_id) references public.shop_products(id) on delete set null;
  end if;
exception when duplicate_object then null;
end $$;



-- ===== SOURCE 0002_video_nextgen.sql =====
-- BAARO Video NextGen
-- Social video layer: remix/duet, collaborations, chapters, polls, Q&A,
-- challenges, bookmarks/collections, creator intelligence and personalization.

create table if not exists public.video_collections (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  description text,
  is_public boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(owner_id, name)
);

create table if not exists public.video_bookmarks (
  user_id uuid not null references public.profiles(id) on delete cascade,
  video_id uuid not null references public.videos(id) on delete cascade,
  collection_id uuid references public.video_collections(id) on delete set null,
  note text,
  created_at timestamptz not null default now(),
  primary key(user_id, video_id)
);

create table if not exists public.video_collaborations (
  id uuid primary key default gen_random_uuid(),
  video_id uuid not null references public.videos(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  collaborator_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'co_creator' check (role in ('co_creator','guest','editor','sponsor')),
  status text not null default 'pending' check (status in ('pending','accepted','declined','removed')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  unique(video_id, collaborator_id),
  check(owner_id <> collaborator_id)
);

create table if not exists public.video_remixes (
  id uuid primary key default gen_random_uuid(),
  video_id uuid not null references public.videos(id) on delete cascade,
  source_video_id uuid not null references public.videos(id) on delete cascade,
  creator_id uuid not null references public.profiles(id) on delete cascade,
  mode text not null check (mode in ('remix','duet','react','quote','green_screen','reply')),
  source_start_ms integer not null default 0 check (source_start_ms >= 0),
  source_end_ms integer check (source_end_ms is null or source_end_ms > source_start_ms),
  created_at timestamptz not null default now(),
  unique(video_id)
);

create table if not exists public.video_chapters (
  id uuid primary key default gen_random_uuid(),
  video_id uuid not null references public.videos(id) on delete cascade,
  position integer not null check (position >= 0),
  start_ms integer not null check (start_ms >= 0),
  title text not null check (char_length(title) between 1 and 120),
  created_at timestamptz not null default now(),
  unique(video_id, position)
);

create table if not exists public.video_polls (
  id uuid primary key default gen_random_uuid(),
  video_id uuid not null references public.videos(id) on delete cascade,
  question text not null check (char_length(question) between 1 and 240),
  options jsonb not null default '[]'::jsonb,
  duration_seconds integer check (duration_seconds is null or duration_seconds between 5 and 604800),
  allow_multiple boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.video_poll_votes (
  poll_id uuid not null references public.video_polls(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  option_key text not null,
  created_at timestamptz not null default now(),
  primary key(poll_id, user_id, option_key)
);

create table if not exists public.video_questions (
  id uuid primary key default gen_random_uuid(),
  video_id uuid not null references public.videos(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  question text not null check (char_length(question) between 1 and 500),
  answer_video_id uuid references public.videos(id) on delete set null,
  status text not null default 'open' check (status in ('open','answered','hidden')),
  created_at timestamptz not null default now(),
  answered_at timestamptz
);

create table if not exists public.video_challenges (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 100),
  description text,
  hashtag text not null check (hashtag ~ '^[a-zA-Z0-9_]{2,60}$'),
  cover_url text,
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  reward_label text,
  status text not null default 'active' check (status in ('draft','active','ended','paused')),
  created_at timestamptz not null default now(),
  unique(hashtag)
);

create table if not exists public.video_challenge_entries (
  challenge_id uuid not null references public.video_challenges(id) on delete cascade,
  video_id uuid not null references public.videos(id) on delete cascade,
  creator_id uuid not null references public.profiles(id) on delete cascade,
  score numeric not null default 0,
  rank integer,
  created_at timestamptz not null default now(),
  primary key(challenge_id, video_id)
);

-- Creator-side intelligence, kept as metadata rather than storing media.
alter table public.videos add column if not exists content_mode text not null default 'original'
  check (content_mode in ('original','remix','duet','react','reply','collab','challenge','tutorial','music','comedy','education'));
alter table public.videos add column if not exists language_code text;
alter table public.videos add column if not exists ai_caption text;
alter table public.videos add column if not exists ai_topics jsonb not null default '[]'::jsonb;
alter table public.videos add column if not exists ai_highlights jsonb not null default '[]'::jsonb;
alter table public.videos add column if not exists chapters jsonb not null default '[]'::jsonb;
alter table public.videos add column if not exists cover_frame_ms integer;
alter table public.videos add column if not exists visibility text not null default 'public'
  check (visibility in ('public','followers','private','unlisted'));
alter table public.videos add column if not exists allow_remix boolean not null default true;
alter table public.videos add column if not exists allow_duet boolean not null default true;
alter table public.videos add column if not exists allow_comments boolean not null default true;
alter table public.videos add column if not exists allow_download boolean not null default false;
alter table public.videos add column if not exists allow_tips boolean not null default true;
alter table public.videos add column if not exists challenge_id uuid references public.video_challenges(id) on delete set null;
alter table public.videos add column if not exists recommendation_score numeric not null default 0;
alter table public.videos add column if not exists completion_rate numeric not null default 0;
alter table public.videos add column if not exists rewatch_rate numeric not null default 0;

create index if not exists idx_videos_visibility_created on public.videos(visibility, created_at desc);
create index if not exists idx_videos_mode_created on public.videos(content_mode, created_at desc);
create index if not exists idx_video_bookmarks_user_created on public.video_bookmarks(user_id, created_at desc);
create index if not exists idx_video_remixes_source on public.video_remixes(source_video_id, created_at desc);
create index if not exists idx_video_chapters_video_start on public.video_chapters(video_id, start_ms);
create index if not exists idx_video_questions_video_created on public.video_questions(video_id, created_at desc);
create index if not exists idx_challenge_entries_challenge_score on public.video_challenge_entries(challenge_id, score desc);

alter table public.video_collections enable row level security;
alter table public.video_bookmarks enable row level security;
alter table public.video_collaborations enable row level security;
alter table public.video_remixes enable row level security;
alter table public.video_chapters enable row level security;
alter table public.video_polls enable row level security;
alter table public.video_poll_votes enable row level security;
alter table public.video_questions enable row level security;
alter table public.video_challenges enable row level security;
alter table public.video_challenge_entries enable row level security;

create policy video_collections_read on public.video_collections for select using (is_public or auth.uid() = owner_id);
create policy video_collections_write on public.video_collections for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

create policy video_bookmarks_own on public.video_bookmarks for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy video_collaborations_read on public.video_collaborations for select using (auth.uid() = owner_id or auth.uid() = collaborator_id);
create policy video_collaborations_insert on public.video_collaborations for insert with check (auth.uid() = owner_id);
create policy video_collaborations_update on public.video_collaborations for update using (auth.uid() = owner_id or auth.uid() = collaborator_id) with check (auth.uid() = owner_id or auth.uid() = collaborator_id);

create policy video_remixes_read on public.video_remixes for select using (true);
create policy video_remixes_insert on public.video_remixes for insert with check (auth.uid() = creator_id);
create policy video_remixes_delete on public.video_remixes for delete using (auth.uid() = creator_id);

create policy video_chapters_read on public.video_chapters for select using (true);
create policy video_chapters_write on public.video_chapters for all using (auth.uid() = (select author_id from public.videos where id = video_id)) with check (auth.uid() = (select author_id from public.videos where id = video_id));

create policy video_polls_read on public.video_polls for select using (true);
create policy video_polls_write on public.video_polls for all using (auth.uid() = (select author_id from public.videos where id = video_id)) with check (auth.uid() = (select author_id from public.videos where id = video_id));

create policy video_poll_votes_own on public.video_poll_votes for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy video_questions_read on public.video_questions for select using (status <> 'hidden' or auth.uid() = author_id or auth.uid() = (select author_id from public.videos where id = video_id));
create policy video_questions_insert on public.video_questions for insert with check (auth.uid() = author_id);
create policy video_questions_update on public.video_questions for update using (auth.uid() = author_id or auth.uid() = (select author_id from public.videos where id = video_id)) with check (auth.uid() = author_id or auth.uid() = (select author_id from public.videos where id = video_id));

create policy video_challenges_read on public.video_challenges for select using (true);
create policy video_challenges_write on public.video_challenges for all using (auth.uid() = creator_id) with check (auth.uid() = creator_id);

create policy video_challenge_entries_read on public.video_challenge_entries for select using (true);
create policy video_challenge_entries_insert on public.video_challenge_entries for insert with check (auth.uid() = creator_id);
create policy video_challenge_entries_delete on public.video_challenge_entries for delete using (auth.uid() = creator_id);

-- One RPC for a personalized discovery score. It intentionally stays deterministic and cheap;
-- a future ranking worker can replace the score without changing the mobile contract.
create or replace function public.video_discovery_score(
  p_video_id uuid,
  p_user_id uuid default auth.uid()
) returns numeric
language sql stable security definer set search_path = public
as $$
  select round(
    (coalesce(v.views,0)::numeric * 0.02)
    + (coalesce(v.likes,0)::numeric * 1.0)
    + (coalesce(v.comments_count,0)::numeric * 1.8)
    + (coalesce(v.completion_rate,0) * 100)
    + (coalesce(v.rewatch_rate,0) * 80)
    + case when v.author_id = p_user_id then -100 else 0 end
  , 4)
  from public.videos v
  where v.id = p_video_id;
$$;

revoke all on function public.video_discovery_score(uuid, uuid) from public;
grant execute on function public.video_discovery_score(uuid, uuid) to authenticated;

-- Realtime for collaborative features.
do $$ begin alter publication supabase_realtime add table public.video_collaborations; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.video_questions; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.video_polls; exception when duplicate_object then null; end $$;



-- ===== SOURCE 0003_nextgen_engines.sql =====
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



-- ===== SOURCE 0004_messaging_nextgen.sql =====
-- BAARO Next-Gen Messaging
-- Realtime state, reactions, receipts, edits, pins, stars, disappearing messages,
-- device/session metadata and abuse controls. Message body remains client-side E2E.

alter table public.messages add column if not exists client_message_id text;
alter table public.messages add column if not exists reply_to_id uuid references public.messages(id) on delete set null;
alter table public.messages add column if not exists edited_at timestamptz;
alter table public.messages add column if not exists expires_at timestamptz;
alter table public.messages add column if not exists delivered_at timestamptz;
alter table public.messages add column if not exists read_at timestamptz;
alter table public.messages add column if not exists metadata jsonb not null default '{}'::jsonb;
create unique index if not exists idx_messages_client_id on public.messages(sender_id, client_message_id) where client_message_id is not null;
create index if not exists idx_messages_reply on public.messages(reply_to_id);
create index if not exists idx_messages_expiry on public.messages(expires_at) where expires_at is not null;

create index if not exists idx_message_reactions_message on public.message_reactions(message_id);

create table if not exists public.message_stars (
  message_id uuid not null references public.messages(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(message_id, user_id)
);

create table if not exists public.conversation_settings (
  conversation_id uuid primary key references public.conversations(id) on delete cascade,
  disappearing_seconds integer check (disappearing_seconds is null or disappearing_seconds in (0, 86400, 604800, 2592000)),
  read_receipts boolean not null default true,
  typing_indicators boolean not null default true,
  link_previews boolean not null default true,
  media_auto_download boolean not null default false,
  updated_at timestamptz not null default now()
);

create table if not exists public.chat_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  device_id text not null,
  public_key jsonb not null,
  label text,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  unique(user_id, device_id)
);
create index if not exists idx_chat_devices_user on public.chat_devices(user_id);

create table if not exists public.message_reports (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages(id) on delete cascade,
  reporter_id uuid not null references auth.users(id) on delete cascade,
  reason text not null check (reason in ('spam','harassment','scam','violence','sexual','other')),
  created_at timestamptz not null default now(),
  unique(message_id, reporter_id)
);

alter table public.message_reactions enable row level security;
alter table public.message_stars enable row level security;
alter table public.conversation_settings enable row level security;
alter table public.chat_devices enable row level security;
alter table public.message_reports enable row level security;

-- A reaction/star is visible only to participants of its conversation.
drop policy if exists message_reactions_read on public.message_reactions;
create policy message_reactions_read on public.message_reactions for select using (
  exists (select 1 from public.messages m join public.conversations c on c.id=m.conversation_id
          where m.id=message_reactions.message_id and (c.user1_id=auth.uid() or c.user2_id=auth.uid()))
);
drop policy if exists message_reactions_write on public.message_reactions;
create policy message_reactions_write on public.message_reactions for all using (user_id=auth.uid()) with check (user_id=auth.uid());

drop policy if exists message_stars_own on public.message_stars;
create policy message_stars_own on public.message_stars for all using (user_id=auth.uid()) with check (user_id=auth.uid());

drop policy if exists conversation_settings_read on public.conversation_settings;
create policy conversation_settings_read on public.conversation_settings for select using (
  exists (select 1 from public.conversations c where c.id=conversation_settings.conversation_id and (c.user1_id=auth.uid() or c.user2_id=auth.uid()))
);
drop policy if exists conversation_settings_write on public.conversation_settings;
create policy conversation_settings_write on public.conversation_settings for all using (
  exists (select 1 from public.conversations c where c.id=conversation_settings.conversation_id and (c.user1_id=auth.uid() or c.user2_id=auth.uid()))
) with check (
  exists (select 1 from public.conversations c where c.id=conversation_settings.conversation_id and (c.user1_id=auth.uid() or c.user2_id=auth.uid()))
);

drop policy if exists chat_devices_own on public.chat_devices;
create policy chat_devices_own on public.chat_devices for all using (user_id=auth.uid()) with check (user_id=auth.uid());

drop policy if exists message_reports_own on public.message_reports;
create policy message_reports_own on public.message_reports for insert with check (reporter_id=auth.uid());
create policy message_reports_read_own on public.message_reports for select using (reporter_id=auth.uid());

-- Realtime only for non-secret metadata/state tables; message text stays E2E.
do $$ begin alter publication supabase_realtime add table public.message_reactions; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.message_stars; exception when duplicate_object then null; end $$;

create or replace function public.touch_message_read(p_message_id uuid)
returns void language plpgsql security invoker set search_path=public as $$
begin
  update public.messages m
     set read_at = now(), delivered_at = coalesce(delivered_at, now())
   where m.id = p_message_id
     and m.recipient_id = auth.uid();
end;
$$;

create or replace function public.set_message_expiry(p_message_id uuid, p_seconds integer)
returns void language plpgsql security invoker set search_path=public as $$
begin
  update public.messages m
     set expires_at = case when p_seconds is null or p_seconds <= 0 then null else now() + make_interval(secs => p_seconds) end
   where m.id = p_message_id and m.sender_id = auth.uid();
end;
$$;

create table if not exists public.message_pins (
  message_id uuid primary key references public.messages(id) on delete cascade,
  pinned_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.message_pins enable row level security;
create policy message_pins_read on public.message_pins for select using (
  exists (select 1 from public.messages m join public.conversations c on c.id=m.conversation_id where m.id=message_pins.message_id and (c.user1_id=auth.uid() or c.user2_id=auth.uid()))
);

alter table public.messages add column if not exists scheduled_for timestamptz;
create index if not exists idx_messages_scheduled on public.messages(scheduled_for) where scheduled_for is not null;

create table if not exists public.chat_ai_jobs (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  requested_by uuid not null references auth.users(id) on delete cascade,
  action text not null check (action in ('summary','smart_reply','translate','rewrite','tone','extract_tasks')),
  target_language text,
  status text not null default 'queued' check (status in ('queued','running','done','failed')),
  result jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
alter table public.chat_ai_jobs enable row level security;
create policy chat_ai_jobs_own on public.chat_ai_jobs for all using (requested_by=auth.uid()) with check (requested_by=auth.uid());



-- ===== SOURCE 0005_global_stories_community_nextgen.sql =====
-- BAARO NextGen: global search, stories, community capabilities
create extension if not exists pg_trgm;

create table if not exists public.stories (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references auth.users(id) on delete cascade,
  media_url text,
  media_type text not null default 'image' check (media_type in ('image','video','text')),
  caption text,
  background text,
  visibility text not null default 'followers' check (visibility in ('public','followers','close_friends')),
  expires_at timestamptz not null default (now() + interval '24 hours'),
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists stories_author_created_idx on public.stories(author_id, created_at desc);
create index if not exists stories_expires_idx on public.stories(expires_at);

create table if not exists public.story_views (
  story_id uuid not null references public.stories(id) on delete cascade,
  viewer_id uuid not null references auth.users(id) on delete cascade,
  viewed_at timestamptz not null default now(),
  primary key (story_id, viewer_id)
);
create table if not exists public.story_reactions (
  story_id uuid not null references public.stories(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  reaction text not null default '❤️',
  created_at timestamptz not null default now(),
  primary key (story_id, user_id)
);
create table if not exists public.story_replies (
  id uuid primary key default gen_random_uuid(),
  story_id uuid not null references public.stories(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);

alter table public.stories enable row level security;
alter table public.story_views enable row level security;
alter table public.story_reactions enable row level security;
alter table public.story_replies enable row level security;

drop policy if exists stories_read on public.stories;
drop policy if exists stories_insert on public.stories;
create policy stories_insert on public.stories for insert to authenticated with check (author_id = auth.uid());
drop policy if exists stories_update on public.stories;
create policy stories_update on public.stories for update to authenticated using (author_id = auth.uid()) with check (author_id = auth.uid());
drop policy if exists stories_delete on public.stories;
create policy stories_delete on public.stories for delete to authenticated using (author_id = auth.uid());

drop policy if exists story_views_owner on public.story_views;
drop policy if exists story_reactions_owner on public.story_reactions;
drop policy if exists story_replies_participant on public.story_replies;

create or replace function public.record_story_view(p_story_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.story_views(story_id, viewer_id) values (p_story_id, auth.uid())
  on conflict (story_id, viewer_id) do update set viewed_at = now();
end; $$;

grant execute on function public.record_story_view(uuid) to authenticated;

-- Search suggestions/history are private and never expose raw query history publicly.
create table if not exists public.search_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  query text not null check (char_length(query) between 1 and 200),
  created_at timestamptz not null default now()
);
create index if not exists search_history_user_idx on public.search_history(user_id, created_at desc);
alter table public.search_history enable row level security;
drop policy if exists search_history_owner on public.search_history;
create policy search_history_owner on public.search_history for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Community events, roles, moderation already exist in the base schema; these indexes improve discovery.
create index if not exists groups_name_trgm_idx on public.groups using gin (name gin_trgm_ops);
create index if not exists groups_category_idx on public.groups(category);
create index if not exists community_reports_status_idx on public.community_reports(status, created_at desc);

-- Safe, bounded global discovery over the core public entities already present in BAARO.
create or replace function public.global_discovery_search(p_query text, p_limit int default 8)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare q text := trim(coalesce(p_query,'')); lim int := least(greatest(coalesce(p_limit,8),1),20);
begin
  if char_length(q) < 2 then return jsonb_build_object('users','[]'::jsonb,'groups','[]'::jsonb,'debates','[]'::jsonb,'posts','[]'::jsonb); end if;
  return jsonb_build_object(
    'users', coalesce((select jsonb_agg(to_jsonb(x)) from (select id, display_name, handle, avatar_url, flag from profiles where display_name ilike '%'||q||'%' or handle ilike '%'||q||'%' order by display_name limit lim) x),'[]'::jsonb),
    'groups', coalesce((select jsonb_agg(to_jsonb(x)) from (select id, name, description, avatar_url, category from groups where is_public = true and (name ilike '%'||q||'%' or description ilike '%'||q||'%') order by created_at desc limit lim) x),'[]'::jsonb),
    'debates', coalesce((select jsonb_agg(to_jsonb(x)) from (select id, title, topic, status from debate_rooms where status = 'active' and (title ilike '%'||q||'%' or topic ilike '%'||q||'%') order by created_at desc limit lim) x),'[]'::jsonb),
    'posts', coalesce((select jsonb_agg(to_jsonb(x)) from (select id, author_id, content, media_url, created_at from posts where content ilike '%'||q||'%' order by created_at desc limit lim) x),'[]'::jsonb)
  );
end; $$;
grant execute on function public.global_discovery_search(text,int) to authenticated;



-- ===== SOURCE 0006_baaro_future_nexus.sql =====
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



-- ===== SOURCE 0007_future_modules_control.sql =====
-- BAARO Future Control Layer: durable controls for advanced modules.
create table if not exists public.module_preferences (
  user_id uuid not null references auth.users(id) on delete cascade,
  module_id text not null,
  settings jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, module_id)
);
