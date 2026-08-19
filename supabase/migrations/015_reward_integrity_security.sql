-- BAARO 2.0 — Reward integrity / anti-farming
-- Every non-daily reward must reference a real, server-verifiable event.

alter table public.transactions
  add column if not exists reference_id uuid;

create index if not exists idx_transactions_reward_reference
  on public.transactions(user_id, action_key, reference_id)
  where pts > 0 and reference_id is not null;

create unique index if not exists ux_transactions_reward_event
  on public.transactions(user_id, action_key, reference_id)
  where pts > 0 and reference_id is not null;

create or replace function public.wallet_earn(
  p_user_id uuid,
  p_pts numeric,
  p_label text,
  p_action_key text,
  p_daily_cap numeric default 100,
  p_daily_bonus boolean default false,
  p_reference_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  w public.wallets%rowtype;
  earned numeric := 0;
  actual_pts numeric;
  tx public.transactions%rowtype;
  event_exists boolean := false;
begin
  if p_pts is null or p_pts <= 0 then raise exception 'INVALID_POINTS'; end if;
  if length(coalesce(p_label,'')) = 0 then raise exception 'INVALID_LABEL'; end if;

  if not p_daily_bonus then
    if p_reference_id is null then raise exception 'REWARD_REFERENCE_REQUIRED'; end if;

    case p_action_key
      when 'publish_post' then
        select exists(select 1 from public.posts where id = p_reference_id and author_id = p_user_id) into event_exists;
      when 'publish_post_media' then
        select exists(select 1 from public.posts where id = p_reference_id and author_id = p_user_id and media_url is not null) into event_exists;
      when 'like_post' then
        select exists(select 1 from public.post_likes where post_id = p_reference_id and user_id = p_user_id) into event_exists;
      when 'comment' then
        select exists(select 1 from public.comments where id = p_reference_id and author_id = p_user_id) into event_exists;
      when 'subscribe' then
        select exists(select 1 from public.follows where follower_id = p_user_id and followed_id = p_reference_id) into event_exists;
      when 'like_video' then
        select exists(select 1 from public.video_likes where video_id = p_reference_id and user_id = p_user_id) into event_exists;
      when 'comment_video' then
        select exists(select 1 from public.video_comments where id = p_reference_id and author_id = p_user_id) into event_exists;
      when 'publish_video' then
        select exists(select 1 from public.videos where id = p_reference_id and author_id = p_user_id) into event_exists;
      when 'repost_video' then
        select exists(select 1 from public.videos where id = p_reference_id and author_id = p_user_id and is_repost = true) into event_exists;
      when 'publish_story' then
        select exists(select 1 from public.stories where id = p_reference_id and author_id = p_user_id) into event_exists;
      else
        raise exception 'UNVERIFIABLE_REWARD_ACTION';
    end case;

    if not event_exists then raise exception 'REWARD_EVENT_NOT_FOUND'; end if;

    if exists (
      select 1 from public.transactions
      where user_id = p_user_id and action_key = p_action_key and reference_id = p_reference_id and pts > 0
    ) then
      raise exception 'REWARD_ALREADY_CLAIMED';
    end if;
  else
    if p_action_key <> 'daily_bonus' then raise exception 'INVALID_DAILY_BONUS'; end if;
    if exists (
      select 1 from public.transactions
      where user_id = p_user_id and action_key = 'daily_bonus' and day_key = current_date
    ) then
      raise exception 'DAILY_BONUS_ALREADY_CLAIMED';
    end if;
  end if;

  perform public.wallet_ensure(p_user_id, 0);
  select * into w from public.wallets where user_id = p_user_id for update;

  select coalesce(sum(pts), 0) into earned
  from public.transactions
  where user_id = p_user_id and pts > 0 and created_at >= date_trunc('day', now());

  if earned >= p_daily_cap then raise exception 'DAILY_CAP_REACHED'; end if;
  actual_pts := least(p_pts, p_daily_cap - earned);

  update public.wallets
    set balance = balance + actual_pts, updated_at = now()
  where user_id = p_user_id
  returning * into w;

  insert into public.transactions(user_id, label, pts, action_key, day_key, reference_id)
  values (p_user_id, left(p_label, 120), actual_pts, p_action_key, current_date, p_reference_id)
  returning * into tx;

  return jsonb_build_object(
    'balance', w.balance,
    'earned_today', earned + actual_pts,
    'remaining_today', greatest(0, p_daily_cap - earned - actual_pts),
    'transaction', to_jsonb(tx)
  );
end;
$$;

revoke all on function public.wallet_earn(uuid, numeric, text, text, numeric, boolean) from public, anon, authenticated;
revoke all on function public.wallet_earn(uuid, numeric, text, text, numeric, boolean, uuid) from public, anon, authenticated;
grant execute on function public.wallet_earn(uuid, numeric, text, text, numeric, boolean, uuid) to service_role;

-- Only a participant may send a gift in an active room.
create or replace function public.wallet_send_gift(
  p_sender_id uuid,
  p_room_id uuid,
  p_gift_type_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  room public.debate_rooms%rowtype;
  gift public.gift_types%rowtype;
  sender public.wallets%rowtype;
  host public.wallets%rowtype;
  gift_row public.gifts_sent%rowtype;
begin
  if p_sender_id is null or p_room_id is null or p_gift_type_id is null then raise exception 'INVALID_GIFT_REQUEST'; end if;
  select * into room from public.debate_rooms where id = p_room_id for share;
  if not found or room.status <> 'active' then raise exception 'LIVE_NOT_FOUND'; end if;
  if room.host_id = p_sender_id then raise exception 'SELF_GIFT_FORBIDDEN'; end if;
  if not exists (select 1 from public.debate_participants where room_id = p_room_id and user_id = p_sender_id) then
    raise exception 'NOT_LIVE_PARTICIPANT';
  end if;
  select * into gift from public.gift_types where id = p_gift_type_id for share;
  if not found or gift.cost_points <= 0 then raise exception 'GIFT_NOT_FOUND'; end if;

  if p_sender_id::text < room.host_id::text then
    perform public.wallet_ensure(p_sender_id, 0); perform public.wallet_ensure(room.host_id, 0);
    select * into sender from public.wallets where user_id = p_sender_id for update;
    select * into host from public.wallets where user_id = room.host_id for update;
  else
    perform public.wallet_ensure(room.host_id, 0); perform public.wallet_ensure(p_sender_id, 0);
    select * into host from public.wallets where user_id = room.host_id for update;
    select * into sender from public.wallets where user_id = p_sender_id for update;
  end if;

  if sender.balance < gift.cost_points then raise exception 'INSUFFICIENT_BALANCE'; end if;
  update public.wallets set balance = balance - gift.cost_points, updated_at = now() where user_id = p_sender_id;
  update public.wallets set balance = balance + gift.cost_points, updated_at = now() where user_id = room.host_id;
  insert into public.transactions(user_id, label, pts, action_key, day_key)
  values
    (p_sender_id, 'Cadeau envoyé : ' || gift.id, -gift.cost_points, 'gift_sent', current_date),
    (room.host_id, 'Cadeau reçu : ' || gift.id, gift.cost_points, 'gift_received', current_date);
  insert into public.gifts_sent(room_id, from_user_id, to_user_id, gift_type_id, points_spent)
  values (p_room_id, p_sender_id, room.host_id, gift.id, gift.cost_points)
  returning * into gift_row;
  select * into sender from public.wallets where user_id = p_sender_id;
  return jsonb_build_object('balance', sender.balance, 'gift', to_jsonb(gift_row));
end;
$$;
revoke all on function public.wallet_send_gift(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.wallet_send_gift(uuid, uuid, text) to service_role;
