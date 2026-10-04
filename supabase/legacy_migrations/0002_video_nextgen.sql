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
