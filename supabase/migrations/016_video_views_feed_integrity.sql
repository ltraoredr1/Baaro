-- BAARO 2.0 v10 — Engagement integrity / video views / active stories

-- One authenticated view per video per user per UTC day. The client may call
-- register_video_view repeatedly; the unique constraint makes it idempotent.
create table if not exists public.video_views (
  video_id uuid not null references public.videos(id) on delete cascade,
  viewer_id uuid not null references auth.users(id) on delete cascade,
  view_date date not null default current_date,
  viewed_at timestamptz not null default now(),
  primary key (video_id, viewer_id, view_date)
);

create index if not exists idx_video_views_video_date
  on public.video_views(video_id, view_date desc);
create index if not exists idx_video_views_viewer_date
  on public.video_views(viewer_id, viewed_at desc);

alter table public.video_views enable row level security;
drop policy if exists video_views_own_read on public.video_views;
create policy video_views_own_read on public.video_views
  for select using (auth.uid() = viewer_id);

-- Views are registered through the RPC only; clients cannot insert arbitrary
-- viewer identities.
drop policy if exists video_views_own_insert on public.video_views;

create or replace function public.register_video_view(p_video_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  inserted boolean := false;
  new_views integer := 0;
begin
  if uid is null then raise exception 'AUTH_REQUIRED'; end if;
  if not exists (select 1 from public.videos where id = p_video_id) then
    raise exception 'VIDEO_NOT_FOUND';
  end if;

  insert into public.video_views(video_id, viewer_id, view_date)
  values (p_video_id, uid, current_date)
  on conflict do nothing;

  inserted := found;
  if inserted then
    update public.videos
      set views = coalesce(views, 0) + 1
      where id = p_video_id
      returning views into new_views;
  else
    select coalesce(views, 0) into new_views
    from public.videos where id = p_video_id;
  end if;

  return jsonb_build_object('counted', inserted, 'views', new_views);
end;
$$;

revoke all on function public.register_video_view(uuid) from public, anon;
grant execute on function public.register_video_view(uuid) to authenticated;

-- Keep counters consistent after likes/comments on existing databases.
update public.videos v
set views = greatest(coalesce(v.views, 0), 0);

-- Expired stories must not be exposed through the normal public read policy.
drop policy if exists stories_read on public.stories;
create policy stories_read on public.stories
  for select using (expires_at > now());

create index if not exists idx_posts_created_id
  on public.posts(created_at desc, id desc);
create index if not exists idx_posts_author_created
  on public.posts(author_id, created_at desc, id desc);
create index if not exists idx_follows_followed_status
  on public.follows(followed_id, status, created_at desc);
