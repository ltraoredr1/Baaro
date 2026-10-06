begin;

alter table public.story_views enable row level security;
alter table public.story_reactions enable row level security;
alter table public.story_replies enable row level security;

drop policy if exists story_views_owner_read on public.story_views;
create policy story_views_owner_read
on public.story_views
for select
to authenticated
using (
  exists (
    select 1
    from public.stories s
    where s.id = story_views.story_id
      and s.author_id = auth.uid()
  )
);

drop policy if exists story_reactions_owner_read on public.story_reactions;
create policy story_reactions_owner_read
on public.story_reactions
for select
to authenticated
using (
  exists (
    select 1
    from public.stories s
    where s.id = story_reactions.story_id
      and s.author_id = auth.uid()
  )
);

drop policy if exists story_reactions_insert on public.story_reactions;
create policy story_reactions_insert
on public.story_reactions
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists story_reactions_update on public.story_reactions;
create policy story_reactions_update
on public.story_reactions
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists story_reactions_delete on public.story_reactions;
create policy story_reactions_delete
on public.story_reactions
for delete
to authenticated
using (user_id = auth.uid());

create or replace function public.record_story_view(p_story_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  if not exists (
    select 1
    from public.stories
    where id = p_story_id
      and deleted_at is null
      and expires_at > now()
  ) then
    raise exception 'STORY_NOT_FOUND';
  end if;

  insert into public.story_views(story_id, viewer_id)
  values (p_story_id, uid)
  on conflict (story_id, viewer_id)
  do update set viewed_at = now();
end;
$$;

revoke all on function public.record_story_view(uuid) from public, anon;
grant execute on function public.record_story_view(uuid) to authenticated;

create or replace function public.get_story_viewers(p_story_id uuid)
returns table(
  viewer_id uuid,
  display_name text,
  handle text,
  avatar_url text,
  flag text,
  viewed_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  if not exists (
    select 1
    from public.stories
    where id = p_story_id
      and author_id = auth.uid()
  ) then
    raise exception 'ACCESS_DENIED';
  end if;

  return query
  select
    v.viewer_id,
    p.display_name,
    p.handle,
    p.avatar_url,
    p.flag,
    v.viewed_at
  from public.story_views v
  left join public.profiles p on p.id = v.viewer_id
  where v.story_id = p_story_id
  order by v.viewed_at desc;
end;
$$;

create or replace function public.get_story_reactors(p_story_id uuid)
returns table(
  user_id uuid,
  display_name text,
  handle text,
  avatar_url text,
  flag text,
  reaction text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  if not exists (
    select 1
    from public.stories
    where id = p_story_id
      and author_id = auth.uid()
  ) then
    raise exception 'ACCESS_DENIED';
  end if;

  return query
  select
    r.user_id,
    p.display_name,
    p.handle,
    p.avatar_url,
    p.flag,
    r.reaction,
    r.created_at
  from public.story_reactions r
  left join public.profiles p on p.id = r.user_id
  where r.story_id = p_story_id
  order by r.created_at desc;
end;
$$;

revoke all on function public.get_story_viewers(uuid) from public, anon;
revoke all on function public.get_story_reactors(uuid) from public, anon;

grant execute on function public.get_story_viewers(uuid) to authenticated;
grant execute on function public.get_story_reactors(uuid) to authenticated;

commit;
