-- BAARO 2.0 v12 — Live/Debates integrity, role requests and realtime
-- Execute after 017_messaging_calls_integrity.sql.

-- 1. Normalize role request schema used by the current API/UI.
alter table public.debate_role_requests
  add column if not exists from_user_id uuid references auth.users(id) on delete cascade;
alter table public.debate_role_requests
  add column if not exists to_user_id uuid references auth.users(id) on delete cascade;
alter table public.debate_role_requests
  add column if not exists responded_at timestamptz;

-- Keep legacy user_id as a compatibility alias for installations created by 011.
alter table public.debate_role_requests alter column user_id drop not null;

-- Backfill legacy rows when the old schema had only user_id.
update public.debate_role_requests r
set to_user_id = coalesce(r.to_user_id, r.user_id)
where r.to_user_id is null and r.user_id is not null;

update public.debate_role_requests r
set user_id = coalesce(r.user_id, r.to_user_id),
    from_user_id = coalesce(r.from_user_id, dr.host_id)
from public.debate_rooms dr
where r.room_id = dr.id and r.from_user_id is null;

-- Current API statuses are pending/accepted/refused/cancelled.
alter table public.debate_role_requests drop constraint if exists debate_role_requests_status_check;
alter table public.debate_role_requests
  add constraint debate_role_requests_status_check
  check (status in ('pending','accepted','refused','cancelled','approved','rejected'));

create unique index if not exists uq_role_request_pending_target
  on public.debate_role_requests(room_id, to_user_id)
  where status = 'pending';
create index if not exists idx_role_requests_target_status
  on public.debate_role_requests(to_user_id, status, created_at desc);

alter table public.debate_role_requests enable row level security;
drop policy if exists role_requests_read on public.debate_role_requests;
create policy role_requests_read on public.debate_role_requests
  for select using (
    auth.uid() = to_user_id
    or auth.uid() = from_user_id
    or exists (select 1 from public.debate_rooms r where r.id = debate_role_requests.room_id and r.host_id = auth.uid())
  );

drop policy if exists role_requests_insert on public.debate_role_requests;
create policy role_requests_insert on public.debate_role_requests
  for insert with check (
    auth.uid() = from_user_id
    and exists (
      select 1 from public.debate_rooms r
      where r.id = room_id and r.host_id = auth.uid() and r.status = 'active'
    )
  );

-- Server-only mutation: prevents a client from changing status/target directly.
drop policy if exists role_requests_update on public.debate_role_requests;
create policy role_requests_update on public.debate_role_requests
  for update using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- 2. Atomic join with row lock to prevent concurrent capacity bypass.
create or replace function public.join_debate_room(p_room_id uuid, p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  room public.debate_rooms%rowtype;
  participant public.debate_participants%rowtype;
  active_count integer;
begin
  if p_room_id is null or p_user_id is null then raise exception 'INVALID_JOIN_REQUEST'; end if;

  select * into room from public.debate_rooms where id = p_room_id for update;
  if not found or room.status not in ('active','paused') then raise exception 'LIVE_NOT_FOUND'; end if;

  select * into participant
  from public.debate_participants
  where room_id = p_room_id and user_id = p_user_id
  for update;

  if found then
    update public.debate_participants set left_at = null, joined_at = now()
    where room_id = p_room_id and user_id = p_user_id;
  else
    select count(*) into active_count from public.debate_participants
    where room_id = p_room_id and left_at is null;
    if active_count >= room.max_participants then raise exception 'LIVE_FULL'; end if;

    insert into public.debate_participants(room_id,user_id,role)
    values (p_room_id,p_user_id,case when room.host_id = p_user_id then 'host' else 'viewer' end);
  end if;

  select * into participant from public.debate_participants
  where room_id = p_room_id and user_id = p_user_id;

  return jsonb_build_object(
    'room_id', room.id,
    'daily_room_name', room.daily_room_name,
    'host_id', room.host_id,
    'status', room.status,
    'max_participants', room.max_participants,
    'role', participant.role
  );
end;
$$;
revoke all on function public.join_debate_room(uuid,uuid) from public, anon, authenticated;
grant execute on function public.join_debate_room(uuid,uuid) to service_role;

-- 3. Secure join-by-code: authenticated users only, uppercase comparison, locked capacity.
create or replace function public.join_debate_by_code(p_code text)
returns public.debate_rooms
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.debate_rooms;
  v_count int;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into v_room from public.debate_rooms
  where invite_code = upper(trim(p_code)) and status in ('active','paused')
  for update;
  if not found then raise exception 'LIVE_NOT_FOUND'; end if;

  if exists (select 1 from public.debate_participants where room_id = v_room.id and user_id = auth.uid()) then
    update public.debate_participants set left_at = null, joined_at = now()
    where room_id = v_room.id and user_id = auth.uid();
    return v_room;
  end if;

  select count(*) into v_count from public.debate_participants
  where room_id = v_room.id and left_at is null;
  if v_count >= v_room.max_participants then raise exception 'LIVE_FULL'; end if;

  insert into public.debate_participants(room_id,user_id,role)
  values(v_room.id,auth.uid(),'viewer');
  return v_room;
end;
$$;
revoke all on function public.join_debate_by_code(text) from public, anon;
grant execute on function public.join_debate_by_code(text) to authenticated;

-- 4. Atomic role request response. Only the intended recipient may accept/refuse.
create or replace function public.respond_debate_role_request(
  p_request_id uuid,
  p_user_id uuid,
  p_accept boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  req public.debate_role_requests%rowtype;
  room public.debate_rooms%rowtype;
  participant public.debate_participants%rowtype;
begin
  select * into req from public.debate_role_requests where id = p_request_id for update;
  if not found or req.status <> 'pending' then raise exception 'ROLE_REQUEST_NOT_FOUND'; end if;
  if req.to_user_id <> p_user_id then raise exception 'ROLE_REQUEST_FORBIDDEN'; end if;

  select * into room from public.debate_rooms where id = req.room_id for update;
  if not found or room.status <> 'active' then
    update public.debate_role_requests set status='cancelled', responded_at=now() where id=req.id;
    raise exception 'LIVE_NOT_FOUND';
  end if;

  if not p_accept then
    update public.debate_role_requests set status='refused', responded_at=now() where id=req.id;
    return jsonb_build_object('status','refused','daily_room_name',room.daily_room_name);
  end if;

  select * into participant from public.debate_participants
  where room_id=req.room_id and user_id=p_user_id and left_at is null for update;
  if not found then raise exception 'ROLE_REQUEST_FORBIDDEN'; end if;

  update public.debate_participants set role='co_host'
  where room_id=req.room_id and user_id=p_user_id;
  update public.debate_role_requests set status='accepted', responded_at=now() where id=req.id;

  return jsonb_build_object('status','accepted','role','co_host','daily_room_name',room.daily_room_name);
end;
$$;
revoke all on function public.respond_debate_role_request(uuid,uuid,boolean) from public, anon, authenticated;
grant execute on function public.respond_debate_role_request(uuid,uuid,boolean) to service_role;

-- 5. Prevent direct client role-request insertion/update through old permissive policies.
drop policy if exists role_requests_insert on public.debate_role_requests;
drop policy if exists role_requests_update on public.debate_role_requests;

-- 6. Realtime for live gifts/roles.
do $$ begin alter publication supabase_realtime add table public.gifts_sent; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.debate_role_requests; exception when duplicate_object then null; end $$;

-- 7. Gift feed is visible only to participants of the room or the sender/recipient.
drop policy if exists gifts_sent_public_read on public.gifts_sent;
create policy gifts_sent_read_participants on public.gifts_sent for select using (
  auth.uid() = from_user_id or auth.uid() = to_user_id or exists (
    select 1 from public.debate_participants dp
    where dp.room_id = gifts_sent.room_id and dp.user_id = auth.uid() and dp.left_at is null
  )
);
