-- BAARO Security Finalization 0010
-- Tightens the previously identified privilege/visibility gaps without changing api/.
-- This migration is additive/idempotent and is intended to run AFTER 0009.

begin;

-- ---------------------------------------------------------------------------
-- 1) Story audience: explicit close-friends membership and real follower checks
-- ---------------------------------------------------------------------------
create table if not exists public.story_close_friends (
  owner_id uuid not null references auth.users(id) on delete cascade,
  member_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (owner_id, member_id),
  check (owner_id <> member_id)
);

alter table public.story_close_friends enable row level security;

drop policy if exists story_close_friends_owner on public.story_close_friends;
create policy story_close_friends_owner
on public.story_close_friends
for all to authenticated
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

create index if not exists idx_story_close_friends_member
  on public.story_close_friends(member_id, owner_id);

-- Replace the permissive Story policy with an actual audience check.
drop policy if exists stories_read on public.stories;
create policy stories_read
on public.stories
for select to authenticated
using (
  deleted_at is null
  and expires_at > now()
  and (
    author_id = auth.uid()
    or visibility = 'public'
    or (
      visibility = 'followers'
      and exists (
        select 1
        from public.follows f
        where f.follower_id = auth.uid()
          and f.followed_id = stories.author_id
          and f.status = 'accepted'
      )
    )
    or (
      visibility = 'close_friends'
      and exists (
        select 1
        from public.story_close_friends cf
        where cf.owner_id = stories.author_id
          and cf.member_id = auth.uid()
      )
    )
  )
);

-- Views/reactions/replies are additionally constrained by Story visibility.
drop policy if exists story_views_owner on public.story_views;
create policy story_views_owner
on public.story_views
for all to authenticated
using (
  viewer_id = auth.uid()
  and exists (select 1 from public.stories s where s.id = story_id and (
    s.author_id = auth.uid() or s.visibility = 'public'
    or (s.visibility = 'followers' and exists (
      select 1 from public.follows f where f.follower_id = auth.uid() and f.followed_id = s.author_id and f.status = 'accepted'))
    or (s.visibility = 'close_friends' and exists (
      select 1 from public.story_close_friends cf where cf.owner_id = s.author_id and cf.member_id = auth.uid()))
  ))
)
with check (
  viewer_id = auth.uid()
  and exists (select 1 from public.stories s where s.id = story_id and s.deleted_at is null and s.expires_at > now() and (
    s.author_id = auth.uid() or s.visibility = 'public'
    or (s.visibility = 'followers' and exists (
      select 1 from public.follows f where f.follower_id = auth.uid() and f.followed_id = s.author_id and f.status = 'accepted'))
    or (s.visibility = 'close_friends' and exists (
      select 1 from public.story_close_friends cf where cf.owner_id = s.author_id and cf.member_id = auth.uid()))
  ))
);

drop policy if exists story_reactions_owner on public.story_reactions;
create policy story_reactions_owner
on public.story_reactions
for all to authenticated
using (
  user_id = auth.uid()
  and exists (select 1 from public.stories s where s.id = story_id and (
    s.author_id = auth.uid() or s.visibility = 'public'
    or (s.visibility = 'followers' and exists (
      select 1 from public.follows f where f.follower_id = auth.uid() and f.followed_id = s.author_id and f.status = 'accepted'))
    or (s.visibility = 'close_friends' and exists (
      select 1 from public.story_close_friends cf where cf.owner_id = s.author_id and cf.member_id = auth.uid()))
  ))
)
with check (
  user_id = auth.uid()
  and exists (select 1 from public.stories s where s.id = story_id and s.deleted_at is null and s.expires_at > now() and (
    s.author_id = auth.uid() or s.visibility = 'public'
    or (s.visibility = 'followers' and exists (
      select 1 from public.follows f where f.follower_id = auth.uid() and f.followed_id = s.author_id and f.status = 'accepted'))
    or (s.visibility = 'close_friends' and exists (
      select 1 from public.story_close_friends cf where cf.owner_id = s.author_id and cf.member_id = auth.uid()))
  ))
);

drop policy if exists story_replies_participant on public.story_replies;
create policy story_replies_participant
on public.story_replies
for all to authenticated
using (
  sender_id = auth.uid()
  or exists (select 1 from public.stories s where s.id = story_id and s.author_id = auth.uid())
)
with check (
  sender_id = auth.uid()
  and exists (select 1 from public.stories s where s.id = story_id and s.deleted_at is null and s.expires_at > now() and (
    s.author_id = auth.uid() or s.visibility = 'public'
    or (s.visibility = 'followers' and exists (
      select 1 from public.follows f where f.follower_id = auth.uid() and f.followed_id = s.author_id and f.status = 'accepted'))
    or (s.visibility = 'close_friends' and exists (
      select 1 from public.story_close_friends cf where cf.owner_id = s.author_id and cf.member_id = auth.uid()))
  ))
);

-- ---------------------------------------------------------------------------
-- 2) Creator monetization: client cannot set revenue share/cashout rules
-- ---------------------------------------------------------------------------
drop policy if exists creator_monetization_own on public.creator_monetization;
create policy creator_monetization_read
on public.creator_monetization
for select to authenticated
using (creator_id = auth.uid());

-- Only a controlled toggle is exposed to the client. Financial terms remain server-owned.
create or replace function public.set_creator_monetization_enabled(p_enabled boolean)
returns public.creator_monetization
language plpgsql
security invoker
set search_path = public
as $$
declare r public.creator_monetization;
begin
  update public.creator_monetization
     set enabled = p_enabled, updated_at = now()
   where creator_id = auth.uid()
   returning * into r;
  if not found then
    insert into public.creator_monetization(creator_id, enabled)
    values (auth.uid(), p_enabled)
    returning * into r;
  end if;
  return r;
end;
$$;

revoke all on function public.set_creator_monetization_enabled(boolean) from public, anon;
grant execute on function public.set_creator_monetization_enabled(boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 3) Media job claiming: worker-only, never callable by normal clients
-- ---------------------------------------------------------------------------
revoke all on function public.claim_media_jobs(integer,text) from public, anon, authenticated;
grant execute on function public.claim_media_jobs(integer,text) to service_role;

-- ---------------------------------------------------------------------------
-- 4) Video watch/feed RPCs: validate caller identity and bound inputs
-- ---------------------------------------------------------------------------
create or replace function public.record_video_watch(
  p_video_id uuid, p_watch_ms integer, p_duration_ms integer,
  p_completed boolean default false, p_rewatched boolean default false,
  p_liked boolean default false, p_shared boolean default false,
  p_negative_signal text default null
) returns void
language plpgsql security definer set search_path=public
as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  if p_video_id is null or not exists (select 1 from public.videos where id = p_video_id) then raise exception 'video_not_found'; end if;
  if p_watch_ms is null or p_watch_ms < 0 or p_watch_ms > 86400000 then raise exception 'invalid_watch_ms'; end if;
  if p_duration_ms is null or p_duration_ms < 0 or p_duration_ms > 86400000 then raise exception 'invalid_duration_ms'; end if;
  if p_negative_signal is not null and p_negative_signal not in ('not_interested','hide_creator','report') then raise exception 'invalid_negative_signal'; end if;

  insert into public.video_watch_events(video_id,user_id,watch_ms,duration_ms,completed,rewatched,liked,shared,negative_signal)
  values (p_video_id,uid,p_watch_ms,p_duration_ms,p_completed,p_rewatched,p_liked,p_shared,p_negative_signal);

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
revoke all on function public.record_video_watch(uuid,integer,integer,boolean,boolean,boolean,boolean,text) from public, anon;
grant execute on function public.record_video_watch(uuid,integer,integer,boolean,boolean,boolean,boolean,text) to authenticated;

-- Feed candidates can only be requested for the current user.
create or replace function public.video_feed_candidates(p_user_id uuid, p_limit integer default 20)
returns table(id uuid, author_id uuid, video_url text, thumbnail_url text, title text, description text,
  duration text, views bigint, likes integer, comments_count integer, created_at timestamptz, score numeric)
language sql stable security definer set search_path=public
as $$
  select v.id,v.author_id,v.video_url,v.thumbnail_url,v.title,v.description,v.duration,
         v.views,v.likes,v.comments_count,v.created_at,
         round(coalesce(v.recommendation_score,0)
           + case when v.author_id=auth.uid() then -20 else 0 end
           + greatest(0, 30 - extract(epoch from (now()-v.created_at))/3600 * 0.25)
           + coalesce(v.completion_rate,0)*120 + coalesce(v.rewatch_rate,0)*100
           - coalesce((select count(*)*8 from public.video_watch_events e where e.video_id=v.id and e.user_id=auth.uid() and e.created_at > now()-interval '7 days'),0),4) as score
  from public.videos v
  where auth.uid() = p_user_id
    and coalesce(v.visibility,'public')='public'
    and not exists(select 1 from public.blocks b where b.blocker_id=auth.uid() and b.blocked_id=v.author_id)
    and not exists(select 1 from public.blocks b where b.blocker_id=v.author_id and b.blocked_id=auth.uid())
  order by score desc, v.created_at desc
  limit greatest(1,least(coalesce(p_limit,20),100));
$$;
revoke all on function public.video_feed_candidates(uuid,integer) from public, anon;
grant execute on function public.video_feed_candidates(uuid,integer) to authenticated;

-- ---------------------------------------------------------------------------
-- 5) Global search: explicit public visibility + block filtering
-- ---------------------------------------------------------------------------
create or replace function public.global_discovery_search(p_query text, p_limit int default 8)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare
  q text := left(trim(coalesce(p_query,'')),200);
  lim int := least(greatest(coalesce(p_limit,8),1),20);
  uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  if char_length(q) < 2 then return jsonb_build_object('users','[]'::jsonb,'groups','[]'::jsonb,'debates','[]'::jsonb,'posts','[]'::jsonb); end if;
  return jsonb_build_object(
    'users', coalesce((select jsonb_agg(to_jsonb(x)) from (
      select p.id,p.display_name,p.handle,p.avatar_url,p.flag from public.profiles p
      where (p.display_name ilike '%'||q||'%' or p.handle ilike '%'||q||'%')
        and p.id <> uid
        and not exists(select 1 from public.blocks b where b.blocker_id=uid and b.blocked_id=p.id)
        and not exists(select 1 from public.blocks b where b.blocker_id=p.id and b.blocked_id=uid)
      order by p.display_name limit lim) x),'[]'::jsonb),
    'groups', coalesce((select jsonb_agg(to_jsonb(x)) from (
      select g.id,g.name,g.description,g.avatar_url,g.category from public.groups g
      where g.is_public = true and (g.name ilike '%'||q||'%' or g.description ilike '%'||q||'%')
      order by g.created_at desc limit lim) x),'[]'::jsonb),
    'debates', coalesce((select jsonb_agg(to_jsonb(x)) from (
      select d.id,d.title,d.topic,d.status from public.debate_rooms d
      where d.status = 'active' and (d.title ilike '%'||q||'%' or d.topic ilike '%'||q||'%')
      order by d.created_at desc limit lim) x),'[]'::jsonb),
    'posts', coalesce((select jsonb_agg(to_jsonb(x)) from (
      select p.id,p.author_id,p.text as content,p.media_url,p.created_at from public.posts p
      where p.text ilike '%'||q||'%'
        and not exists(select 1 from public.blocks b where b.blocker_id=uid and b.blocked_id=p.author_id)
        and not exists(select 1 from public.blocks b where b.blocker_id=p.author_id and b.blocked_id=uid)
      order by p.created_at desc limit lim) x),'[]'::jsonb)
  );
end; $$;
revoke all on function public.global_discovery_search(text,int) from public, anon;
grant execute on function public.global_discovery_search(text,int) to authenticated;

-- ---------------------------------------------------------------------------
-- 6) Trust score: never expose another user's detailed score through RPC
-- ---------------------------------------------------------------------------
create or replace function public.nexus_trust_score(p_user_id uuid)
returns integer language plpgsql stable security definer set search_path=public as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if p_user_id <> auth.uid() then raise exception 'forbidden'; end if;
  return greatest(0, least(100, 50 + coalesce((select sum(weight) from public.nexus_trust_events where subject_id = auth.uid()),0)::integer));
end; $$;
revoke all on function public.nexus_trust_score(uuid) from public, anon;
grant execute on function public.nexus_trust_score(uuid) to authenticated;


-- Harden Story view recording: it must be an actually visible, live story.
create or replace function public.record_story_view(p_story_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  if not exists (
    select 1 from public.stories s
    where s.id = p_story_id and s.deleted_at is null and s.expires_at > now()
      and (
        s.author_id = uid or s.visibility = 'public'
        or (s.visibility = 'followers' and exists (
          select 1 from public.follows f where f.follower_id = uid and f.followed_id = s.author_id and f.status = 'accepted'))
        or (s.visibility = 'close_friends' and exists (
          select 1 from public.story_close_friends cf where cf.owner_id = s.author_id and cf.member_id = uid))
      )
  ) then raise exception 'forbidden'; end if;
  insert into public.story_views(story_id, viewer_id) values (p_story_id, uid)
  on conflict (story_id, viewer_id) do update set viewed_at = now();
end; $$;
revoke all on function public.record_story_view(uuid) from public, anon;
grant execute on function public.record_story_view(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 7) Message pins: must be a participant and the actor must own the pin
-- ---------------------------------------------------------------------------
drop policy if exists message_pins_write on public.message_pins;
create policy message_pins_write
on public.message_pins
for all to authenticated
using (
  pinned_by = auth.uid()
  and exists (
    select 1 from public.messages m
    join public.conversations c on c.id = m.conversation_id
    where m.id = message_id and (c.user1_id = auth.uid() or c.user2_id = auth.uid())
  )
)
with check (
  pinned_by = auth.uid()
  and exists (
    select 1 from public.messages m
    join public.conversations c on c.id = m.conversation_id
    where m.id = message_id and (c.user1_id = auth.uid() or c.user2_id = auth.uid())
  )
);

-- ---------------------------------------------------------------------------
-- 8) Server-owned financial/audit tables: clients may read only their own
-- ---------------------------------------------------------------------------
revoke insert, update, delete on public.creator_earnings from anon, authenticated;
revoke insert, update, delete on public.creator_revenue_events from anon, authenticated;
revoke insert, update, delete on public.observability_events from anon, authenticated;
revoke insert, update, delete on public.security_events from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 9) Bounds on user-controlled fields that can be abused for storage/DoS
-- ---------------------------------------------------------------------------
do $$ begin
  alter table public.stories add constraint stories_caption_size check (caption is null or char_length(caption) <= 5000);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.stories add constraint stories_media_url_size check (media_url is null or char_length(media_url) <= 4096);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.search_history add constraint search_history_query_size check (char_length(query) <= 200);
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- 10) Secure worker/server functions are not exposed to anonymous clients.
-- ---------------------------------------------------------------------------
revoke all on function public.security_list_devices() from public, anon;
revoke all on function public.security_revoke_device(text) from public, anon;
grant execute on function public.security_list_devices() to authenticated;
grant execute on function public.security_revoke_device(text) to authenticated;

commit;
