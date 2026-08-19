-- ============================================================
-- BAARO 2.0 — Core media/social/device/call schema
-- Idempotent. Execute after 001..010.
-- ============================================================

-- Profiles used by the current frontend
alter table public.profiles add column if not exists avatar_url text;
alter table public.profiles add column if not exists country text;
alter table public.profiles add column if not exists points numeric not null default 0;
alter table public.profiles add column if not exists is_verified boolean not null default false;
alter table public.profiles add column if not exists referral_code text;
alter table public.profiles add column if not exists referred_by uuid references auth.users(id) on delete set null;
create unique index if not exists idx_profiles_referral_code on public.profiles(referral_code) where referral_code is not null;

-- Posts counters used by the feed
alter table public.posts add column if not exists likes_count integer not null default 0;
alter table public.posts add column if not exists comments_count integer not null default 0;

-- Videos: complete contract used by VideosTab
alter table public.videos add column if not exists description text;
alter table public.videos add column if not exists video_url text;
alter table public.videos add column if not exists thumbnail_url text;
alter table public.videos add column if not exists likes integer not null default 0;
alter table public.videos add column if not exists comments_count integer not null default 0;
alter table public.videos add column if not exists is_repost boolean not null default false;
alter table public.videos add column if not exists original_author_id uuid references auth.users(id) on delete set null;
alter table public.videos add column if not exists sound_id text;

create table if not exists public.sounds (
  id text primary key,
  title text not null,
  artist text,
  audio_url text,
  cover_url text,
  usage_count integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.video_likes (
  video_id uuid not null references public.videos(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (video_id, user_id)
);

create table if not exists public.video_comments (
  id uuid primary key default gen_random_uuid(),
  video_id uuid not null references public.videos(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  content text not null check (length(trim(content)) between 1 and 2000),
  created_at timestamptz not null default now()
);

create index if not exists idx_video_likes_user on public.video_likes(user_id);
create index if not exists idx_video_comments_video_created on public.video_comments(video_id, created_at asc);

-- Stories: media contract used by StoriesBar/StoryViewer
alter table public.stories add column if not exists media_url text;
alter table public.stories add column if not exists media_type text;
alter table public.stories add column if not exists text_overlay text;
alter table public.stories alter column text drop not null;
alter table public.stories add constraint stories_media_type_check check (media_type is null or media_type in ('image','video'));

create table if not exists public.story_views (
  story_id uuid not null references public.stories(id) on delete cascade,
  viewer_id uuid not null references auth.users(id) on delete cascade,
  viewed_at timestamptz not null default now(),
  primary key (story_id, viewer_id)
);
create index if not exists idx_story_views_viewer on public.story_views(viewer_id, viewed_at desc);

-- Push subscriptions
create table if not exists public.push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  token text not null,
  platform text not null default 'web',
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, token)
);
create index if not exists idx_push_tokens_user on public.push_tokens(user_id);

-- 1-to-1 calls
create table if not exists public.calls (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references public.conversations(id) on delete set null,
  caller_id uuid not null references auth.users(id) on delete cascade,
  callee_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (type in ('voice','video')),
  status text not null default 'ringing' check (status in ('ringing','accepted','rejected','missed','ended','cancelled')),
  daily_room_name text,
  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_calls_caller_created on public.calls(caller_id, created_at desc);
create index if not exists idx_calls_callee_created on public.calls(callee_id, created_at desc);

-- Debate role requests used by the live UI
create table if not exists public.debate_role_requests (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.debate_rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  requested_role text not null default 'co_host' check (requested_role in ('co_host','host')),
  status text not null default 'pending' check (status in ('pending','approved','rejected','cancelled')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  unique(room_id, user_id, status)
);
create index if not exists idx_role_requests_room_status on public.debate_role_requests(room_id, status, created_at desc);

-- Referral rewards
create table if not exists public.referral_rewards (
  id uuid primary key default gen_random_uuid(),
  referrer_id uuid not null references auth.users(id) on delete cascade,
  referred_id uuid not null references auth.users(id) on delete cascade,
  pts_referrer integer not null check (pts_referrer > 0),
  pts_referred integer not null check (pts_referred > 0),
  created_at timestamptz not null default now(),
  unique(referred_id),
  check (referrer_id <> referred_id)
);
create index if not exists idx_referral_rewards_referrer on public.referral_rewards(referrer_id, created_at desc);

-- Message media fields used by MessagesTab
alter table public.messages add column if not exists type text not null default 'text';
alter table public.messages add column if not exists media_url text;
alter table public.messages add column if not exists media_mime text;
alter table public.messages add column if not exists media_size bigint;
alter table public.messages add column if not exists media_duration numeric;
alter table public.messages add column if not exists file_name text;
alter table public.messages add column if not exists thumbnail_url text;

-- Debate fields used by Daily live management
alter table public.debate_rooms add column if not exists daily_room_name text;
alter table public.debate_rooms add column if not exists ended_at timestamptz;
alter table public.debate_rooms add column if not exists status text not null default 'active';
alter table public.debate_rooms add column if not exists max_participants integer not null default 10;
alter table public.debate_participants add column if not exists role text not null default 'viewer';

-- RLS for newly added tables
alter table public.sounds enable row level security;
alter table public.video_likes enable row level security;
alter table public.video_comments enable row level security;
alter table public.story_views enable row level security;
alter table public.push_tokens enable row level security;
alter table public.calls enable row level security;
alter table public.debate_role_requests enable row level security;
alter table public.referral_rewards enable row level security;

-- Idempotent policies
 drop policy if exists sounds_read on public.sounds;
create policy sounds_read on public.sounds for select using (true);

drop policy if exists video_likes_read on public.video_likes;
create policy video_likes_read on public.video_likes for select using (auth.uid() is not null);
drop policy if exists video_likes_own on public.video_likes;
create policy video_likes_own on public.video_likes for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists video_comments_read on public.video_comments;
create policy video_comments_read on public.video_comments for select using (true);
drop policy if exists video_comments_insert on public.video_comments;
create policy video_comments_insert on public.video_comments for insert with check (auth.uid() = author_id);
drop policy if exists video_comments_update_own on public.video_comments;
create policy video_comments_update_own on public.video_comments for update using (auth.uid() = author_id) with check (auth.uid() = author_id);
drop policy if exists video_comments_delete_own on public.video_comments;
create policy video_comments_delete_own on public.video_comments for delete using (auth.uid() = author_id);

drop policy if exists story_views_read on public.story_views;
create policy story_views_read on public.story_views for select using (auth.uid() = viewer_id or exists (select 1 from public.stories s where s.id = story_views.story_id and s.author_id = auth.uid()));
drop policy if exists story_views_insert_own on public.story_views;
create policy story_views_insert_own on public.story_views for insert with check (auth.uid() = viewer_id);

drop policy if exists push_tokens_own on public.push_tokens;
create policy push_tokens_own on public.push_tokens for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists calls_participant_read on public.calls;
create policy calls_participant_read on public.calls for select using (auth.uid() = caller_id or auth.uid() = callee_id);
drop policy if exists calls_caller_insert on public.calls;
create policy calls_caller_insert on public.calls for insert with check (auth.uid() = caller_id);
drop policy if exists calls_participant_update on public.calls;
create policy calls_participant_update on public.calls for update using (auth.uid() = caller_id or auth.uid() = callee_id) with check (auth.uid() = caller_id or auth.uid() = callee_id);

drop policy if exists role_requests_read on public.debate_role_requests;
create policy role_requests_read on public.debate_role_requests for select using (auth.uid() = user_id or exists (select 1 from public.debate_rooms r where r.id = debate_role_requests.room_id and r.host_id = auth.uid()));
drop policy if exists role_requests_insert on public.debate_role_requests;
create policy role_requests_insert on public.debate_role_requests for insert with check (auth.uid() = user_id);
drop policy if exists role_requests_update on public.debate_role_requests;
create policy role_requests_update on public.debate_role_requests for update using (exists (select 1 from public.debate_rooms r where r.id = debate_role_requests.room_id and r.host_id = auth.uid()) or auth.uid() = user_id) with check (exists (select 1 from public.debate_rooms r where r.id = debate_role_requests.room_id and r.host_id = auth.uid()) or auth.uid() = user_id);

drop policy if exists referral_rewards_read_own on public.referral_rewards;
create policy referral_rewards_read_own on public.referral_rewards for select using (auth.uid() = referrer_id or auth.uid() = referred_id);

-- Video/story policies: replace unsafe/duplicate legacy policies
 drop policy if exists videos_insert on public.videos;
 drop policy if exists "Créer vidéo" on public.videos;
 drop policy if exists "Users can upload videos" on public.videos;
 drop policy if exists videos_update_own on public.videos;
 drop policy if exists "Users can update own videos" on public.videos;
 drop policy if exists videos_delete_own on public.videos;
 drop policy if exists "Users can delete own videos" on public.videos;
create policy videos_insert on public.videos for insert with check (auth.uid() = author_id);
create policy videos_update_own on public.videos for update using (auth.uid() = author_id) with check (auth.uid() = author_id);
create policy videos_delete_own on public.videos for delete using (auth.uid() = author_id);

drop policy if exists stories_read on public.stories;
create policy stories_read on public.stories for select using (expires_at > now());
drop policy if exists stories_insert on public.stories;
create policy stories_insert on public.stories for insert with check (auth.uid() = author_id);
drop policy if exists stories_update_own on public.stories;
create policy stories_update_own on public.stories for update using (auth.uid() = author_id) with check (auth.uid() = author_id);
drop policy if exists stories_delete_own on public.stories;
create policy stories_delete_own on public.stories for delete using (auth.uid() = author_id);

-- Useful indexes
create index if not exists idx_videos_created on public.videos(created_at desc);
create index if not exists idx_videos_author_created on public.videos(author_id, created_at desc);
create index if not exists idx_stories_active on public.stories(expires_at desc, created_at desc);
create index if not exists idx_story_views_story on public.story_views(story_id, viewed_at desc);

-- Realtime (safe to repeat)
do $$ begin alter publication supabase_realtime add table public.videos; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.stories; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.video_likes; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.video_comments; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.calls; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.push_tokens; exception when duplicate_object then null; end $$;

-- Counter triggers
create or replace function public.baaro_sync_video_like_count()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    update public.videos set likes = likes + 1 where id = new.video_id;
    return new;
  elsif tg_op = 'DELETE' then
    update public.videos set likes = greatest(0, likes - 1) where id = old.video_id;
    return old;
  end if;
  return null;
end $$;
drop trigger if exists trg_baaro_video_like_count on public.video_likes;
create trigger trg_baaro_video_like_count after insert or delete on public.video_likes for each row execute function public.baaro_sync_video_like_count();

create or replace function public.baaro_sync_video_comment_count()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    update public.videos set comments_count = comments_count + 1 where id = new.video_id;
    return new;
  elsif tg_op = 'DELETE' then
    update public.videos set comments_count = greatest(0, comments_count - 1) where id = old.video_id;
    return old;
  end if;
  return null;
end $$;
drop trigger if exists trg_baaro_video_comment_count on public.video_comments;
create trigger trg_baaro_video_comment_count after insert or delete on public.video_comments for each row execute function public.baaro_sync_video_comment_count();

-- Storage buckets. Public read is intentional for feed media; writes remain authenticated and owner-scoped.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values ('media','media',true, 50*1024*1024, ARRAY['image/*','video/*']) on conflict (id) do update set public = true, file_size_limit = 50*1024*1024, allowed_mime_types = ARRAY['image/*','video/*'];
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values ('videos','videos',true, 500*1024*1024, ARRAY['video/*','image/*']) on conflict (id) do update set public = true, file_size_limit = 500*1024*1024, allowed_mime_types = ARRAY['video/*','image/*'];
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values ('stories','stories',true, 100*1024*1024, ARRAY['image/*','video/*']) on conflict (id) do update set public = true, file_size_limit = 100*1024*1024, allowed_mime_types = ARRAY['image/*','video/*'];
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values ('chat-media','chat-media',false, 80*1024*1024, ARRAY['image/*','video/*','audio/*','application/pdf','text/plain']) on conflict (id) do update set public = false, file_size_limit = 80*1024*1024, allowed_mime_types = ARRAY['image/*','video/*','audio/*','application/pdf','text/plain'];

-- Storage policies
 drop policy if exists baaro_media_insert on storage.objects;
create policy baaro_media_insert on storage.objects for insert to authenticated with check (bucket_id in ('media','videos','stories','chat-media') and (storage.foldername(name))[1] = auth.uid()::text);
 drop policy if exists baaro_media_update on storage.objects;
create policy baaro_media_update on storage.objects for update to authenticated using (bucket_id in ('media','videos','stories','chat-media') and owner_id = auth.uid()) with check (bucket_id in ('media','videos','stories','chat-media') and owner_id = auth.uid());
 drop policy if exists baaro_media_delete on storage.objects;
create policy baaro_media_delete on storage.objects for delete to authenticated using (bucket_id in ('media','videos','stories','chat-media') and owner_id = auth.uid());
 drop policy if exists baaro_media_public_read on storage.objects;
create policy baaro_public_media_read on storage.objects for select using (bucket_id in ('media','videos','stories'));

-- chat-media doit rester privé. La lecture des pièces jointes doit passer par une URL signée
-- délivrée après vérification de l'accès à la conversation côté serveur.
drop policy if exists baaro_media_public_read on storage.objects;

-- ============================================================
-- FIN
-- ============================================================

-- Backfill counters for databases that already contain data.
update public.videos v
set likes = coalesce((select count(*) from public.video_likes l where l.video_id = v.id), 0),
    comments_count = coalesce((select count(*) from public.video_comments c where c.video_id = v.id), 0);
update public.posts p
set likes_count = coalesce((select count(*) from public.post_likes l where l.post_id = p.id), 0),
    comments_count = coalesce((select count(*) from public.comments c where c.post_id = p.id), 0);
