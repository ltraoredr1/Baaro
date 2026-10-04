-- BAARO: engagement visibility for content owners
-- Shows names of viewers/likers to the owner only.
-- Adds post views and hardens video view RPC access.

-- ---------------------------------------------------------------------------
-- 1) Post views: one counted view per authenticated viewer per UTC day.
-- ---------------------------------------------------------------------------
alter table public.posts add column if not exists views_count bigint not null default 0;

create table if not exists public.post_views (
  post_id uuid not null references public.posts(id) on delete cascade,
  viewer_id uuid not null references auth.users(id) on delete cascade,
  view_date date not null default current_date,
  viewed_at timestamptz not null default now(),
  primary key (post_id, viewer_id, view_date)
);

create index if not exists idx_post_views_post_date
  on public.post_views(post_id, viewed_at desc);
create index if not exists idx_post_views_viewer_date
  on public.post_views(viewer_id, viewed_at desc);

alter table public.post_views enable row level security;
drop policy if exists post_views_owner_read on public.post_views;
create policy post_views_owner_read on public.post_views
  for select to authenticated
  using (exists (
    select 1 from public.posts p
    where p.id = post_id and p.author_id = auth.uid()
  ));

drop policy if exists post_views_client_insert on public.post_views;

create or replace function public.register_post_view(p_post_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  owner_id uuid;
  inserted boolean := false;
  new_views bigint := 0;
begin
  if uid is null then raise exception 'AUTH_REQUIRED'; end if;

  select author_id into owner_id from public.posts where id = p_post_id;
  if owner_id is null then raise exception 'POST_NOT_FOUND'; end if;

  -- A creator opening their own post does not create an artificial view.
  if owner_id = uid then
    select coalesce(views_count, 0) into new_views from public.posts where id = p_post_id;
    return jsonb_build_object('counted', false, 'views', new_views);
  end if;

  insert into public.post_views(post_id, viewer_id, view_date)
  values (p_post_id, uid, current_date)
  on conflict (post_id, viewer_id, view_date) do nothing;

  inserted := found;
  if inserted then
    update public.posts
       set views_count = coalesce(views_count, 0) + 1,
           updated_at = now()
     where id = p_post_id
     returning views_count into new_views;
  else
    select coalesce(views_count, 0) into new_views from public.posts where id = p_post_id;
  end if;

  return jsonb_build_object('counted', inserted, 'views', new_views);
end;
$$;

revoke all on function public.register_post_view(uuid) from public, anon;
grant execute on function public.register_post_view(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 2) Engagement-list RPCs. They expose identity data only to the content owner.
-- ---------------------------------------------------------------------------
create or replace function public.get_story_viewers(p_story_id uuid)
returns table(viewer_id uuid, display_name text, handle text, avatar_url text, flag text, viewed_at timestamptz)
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if not exists (select 1 from public.stories where id = p_story_id and author_id = auth.uid()) then raise exception 'ACCESS_DENIED'; end if;
  return query
    select v.viewer_id, p.display_name, p.handle, p.avatar_url, p.flag, v.viewed_at
    from public.story_views v
    left join public.profiles p on p.id = v.viewer_id
    where v.story_id = p_story_id
    order by v.viewed_at desc;
end;
$$;

create or replace function public.get_story_reactors(p_story_id uuid)
returns table(user_id uuid, display_name text, handle text, avatar_url text, flag text, reaction text, created_at timestamptz)
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if not exists (select 1 from public.stories where id = p_story_id and author_id = auth.uid()) then raise exception 'ACCESS_DENIED'; end if;
  return query
    select r.user_id, p.display_name, p.handle, p.avatar_url, p.flag, r.reaction, r.created_at
    from public.story_reactions r
    left join public.profiles p on p.id = r.user_id
    where r.story_id = p_story_id
    order by r.created_at desc;
end;
$$;

create or replace function public.get_video_viewers(p_video_id uuid)
returns table(viewer_id uuid, display_name text, handle text, avatar_url text, flag text, viewed_at timestamptz)
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if not exists (select 1 from public.videos where id = p_video_id and author_id = auth.uid()) then raise exception 'ACCESS_DENIED'; end if;
  return query
    select x.viewer_id, p.display_name, p.handle, p.avatar_url, p.flag, x.viewed_at
    from (
      select distinct on (v.viewer_id) v.viewer_id, v.viewed_at
      from public.video_views v
      where v.video_id = p_video_id
      order by v.viewer_id, v.viewed_at desc
    ) x
    left join public.profiles p on p.id = x.viewer_id
    order by x.viewed_at desc;
end;
$$;

create or replace function public.get_video_likers(p_video_id uuid)
returns table(user_id uuid, display_name text, handle text, avatar_url text, flag text, created_at timestamptz)
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if not exists (select 1 from public.videos where id = p_video_id and author_id = auth.uid()) then raise exception 'ACCESS_DENIED'; end if;
  return query
    select l.user_id, p.display_name, p.handle, p.avatar_url, p.flag, l.created_at
    from public.video_likes l
    left join public.profiles p on p.id = l.user_id
    where l.video_id = p_video_id
    order by l.created_at desc;
end;
$$;

create or replace function public.get_post_viewers(p_post_id uuid)
returns table(viewer_id uuid, display_name text, handle text, avatar_url text, flag text, viewed_at timestamptz)
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if not exists (select 1 from public.posts where id = p_post_id and author_id = auth.uid()) then raise exception 'ACCESS_DENIED'; end if;
  return query
    select x.viewer_id, p.display_name, p.handle, p.avatar_url, p.flag, x.viewed_at
    from (
      select distinct on (v.viewer_id) v.viewer_id, v.viewed_at
      from public.post_views v
      where v.post_id = p_post_id
      order by v.viewer_id, v.viewed_at desc
    ) x
    left join public.profiles p on p.id = x.viewer_id
    order by x.viewed_at desc;
end;
$$;

create or replace function public.get_post_likers(p_post_id uuid)
returns table(user_id uuid, display_name text, handle text, avatar_url text, flag text, created_at timestamptz)
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if not exists (select 1 from public.posts where id = p_post_id and author_id = auth.uid()) then raise exception 'ACCESS_DENIED'; end if;
  return query
    select l.user_id, p.display_name, p.handle, p.avatar_url, p.flag, l.created_at
    from public.post_likes l
    left join public.profiles p on p.id = l.user_id
    where l.post_id = p_post_id
    order by l.created_at desc;
end;
$$;

revoke all on function public.get_story_viewers(uuid) from public, anon;
revoke all on function public.get_story_reactors(uuid) from public, anon;
revoke all on function public.get_video_viewers(uuid) from public, anon;
revoke all on function public.get_video_likers(uuid) from public, anon;
revoke all on function public.get_post_viewers(uuid) from public, anon;
revoke all on function public.get_post_likers(uuid) from public, anon;
grant execute on function public.get_story_viewers(uuid) to authenticated;
grant execute on function public.get_story_reactors(uuid) to authenticated;
grant execute on function public.get_video_viewers(uuid) to authenticated;
grant execute on function public.get_video_likers(uuid) to authenticated;
grant execute on function public.get_post_viewers(uuid) to authenticated;
grant execute on function public.get_post_likers(uuid) to authenticated;

-- 3) Final correction: video views are authenticated-only, not anonymous.
revoke all on function public.register_video_view(uuid) from public, anon;
grant execute on function public.register_video_view(uuid) to authenticated;

-- Owners need aggregate counts for their own Story analytics, while writers
-- remain limited to their own rows. This does not expose another user's data.
drop policy if exists story_views_owner on public.story_views;
create policy story_views_owner on public.story_views
for select to authenticated
using (
  viewer_id = auth.uid()
  or exists (select 1 from public.stories s where s.id = story_id and s.author_id = auth.uid())
);

-- Keep mutation restricted to the reacting viewer.
drop policy if exists story_reactions_owner on public.story_reactions;
create policy story_reactions_read on public.story_reactions
for select to authenticated
using (
  user_id = auth.uid()
  or exists (select 1 from public.stories s where s.id = story_id and s.author_id = auth.uid())
);
create policy story_reactions_write on public.story_reactions
for insert to authenticated
with check (user_id = auth.uid());
create policy story_reactions_delete on public.story_reactions
for delete to authenticated
using (user_id = auth.uid());
