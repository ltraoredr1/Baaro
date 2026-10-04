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
create policy stories_read on public.stories for select to authenticated using (
  deleted_at is null and expires_at > now() and (
    visibility = 'public' or author_id = auth.uid() or
    visibility in ('followers','close_friends')
  )
);
drop policy if exists stories_insert on public.stories;
create policy stories_insert on public.stories for insert to authenticated with check (author_id = auth.uid());
drop policy if exists stories_update on public.stories;
create policy stories_update on public.stories for update to authenticated using (author_id = auth.uid()) with check (author_id = auth.uid());
drop policy if exists stories_delete on public.stories;
create policy stories_delete on public.stories for delete to authenticated using (author_id = auth.uid());

drop policy if exists story_views_owner on public.story_views;
create policy story_views_owner on public.story_views for all to authenticated using (viewer_id = auth.uid()) with check (viewer_id = auth.uid());
drop policy if exists story_reactions_owner on public.story_reactions;
create policy story_reactions_owner on public.story_reactions for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists story_replies_participant on public.story_replies;
create policy story_replies_participant on public.story_replies for all to authenticated using (sender_id = auth.uid() or exists (select 1 from public.stories s where s.id = story_id and s.author_id = auth.uid())) with check (sender_id = auth.uid());

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
