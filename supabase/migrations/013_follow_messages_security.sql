-- BAARO 2.0 — Follow/message security consistency
-- Execute after 012_wallet_atomic_security.sql.

-- The canonical column in public.follows is followed_id.
-- Existing installations already use this name; this migration mainly hardens constraints/policies.

alter table public.follows enable row level security;
drop policy if exists "follows_read" on public.follows;
drop policy if exists "follows_own" on public.follows;
create policy "follows_read" on public.follows
  for select using (auth.uid() is not null);
create policy "follows_own" on public.follows
  for insert with check (auth.uid() = follower_id and follower_id <> followed_id);
create policy "follows_update_own" on public.follows
  for update
  using (auth.uid() = follower_id)
  with check (auth.uid() = follower_id and follower_id <> followed_id);
create policy "follows_delete_own" on public.follows
  for delete using (auth.uid() = follower_id);

-- Messages: a sender may only send to the other participant of the conversation.
-- This prevents arbitrary message injection into a valid conversation row.
drop policy if exists "messages_send_own" on public.messages;
create policy "messages_send_own" on public.messages
  for insert
  with check (
    auth.uid() = sender_id
    and (
      recipient_id is null
      or recipient_id <> sender_id
    )
    and exists (
      select 1
      from public.conversations c
      where c.id = messages.conversation_id
        and (
          (c.user1_id = auth.uid() and c.user2_id = messages.recipient_id)
          or
          (c.user2_id = auth.uid() and c.user1_id = messages.recipient_id)
        )
    )
  );

-- Prevent clients from changing sender/conversation identity on an existing message.
create or replace function public.prevent_message_identity_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.sender_id <> old.sender_id
     or new.conversation_id <> old.conversation_id
     or coalesce(new.recipient_id::text, '') <> coalesce(old.recipient_id::text, '') then
    raise exception 'MESSAGE_IDENTITY_FIELDS_IMMUTABLE';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_messages_immutable_identity on public.messages;
create trigger trg_messages_immutable_identity
before update on public.messages
for each row execute function public.prevent_message_identity_change();

-- Users may not update messages through the client unless they are the sender.
drop policy if exists "messages_update_own" on public.messages;
create policy "messages_update_own" on public.messages
  for update
  using (auth.uid() = sender_id)
  with check (auth.uid() = sender_id);

do $$
begin
  alter publication supabase_realtime add table public.stories;
exception when duplicate_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table public.videos;
exception when duplicate_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table public.follows;
exception when duplicate_object then null;
end $$;

-- Atomic gift transfer: debit sender, credit host, write ledger and gift record in one transaction.
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
  if p_sender_id is null or p_room_id is null or p_gift_type_id is null then
    raise exception 'INVALID_GIFT_REQUEST';
  end if;

  select * into room from public.debate_rooms where id = p_room_id for share;
  if not found or room.status <> 'active' then raise exception 'LIVE_NOT_FOUND'; end if;
  if room.host_id = p_sender_id then raise exception 'SELF_GIFT_FORBIDDEN'; end if;

  select * into gift from public.gift_types where id = p_gift_type_id for share;
  if not found or gift.cost_points <= 0 then raise exception 'GIFT_NOT_FOUND'; end if;

  -- Lock wallets in deterministic UUID order to reduce deadlocks under high gift traffic.
  if p_sender_id::text < room.host_id::text then
    perform public.wallet_ensure(p_sender_id, 0);
    perform public.wallet_ensure(room.host_id, 0);
    select * into sender from public.wallets where user_id = p_sender_id for update;
    select * into host from public.wallets where user_id = room.host_id for update;
  else
    perform public.wallet_ensure(room.host_id, 0);
    perform public.wallet_ensure(p_sender_id, 0);
    select * into host from public.wallets where user_id = room.host_id for update;
    select * into sender from public.wallets where user_id = p_sender_id for update;
  end if;

  if sender.balance < gift.cost_points then raise exception 'INSUFFICIENT_BALANCE'; end if;

  update public.wallets set balance = balance - gift.cost_points, updated_at = now()
    where user_id = p_sender_id;
  update public.wallets set balance = balance + gift.cost_points, updated_at = now()
    where user_id = room.host_id;

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

-- Atomic referral application. The unique referred_id constraint plus the profile update
-- happen in the same transaction as both wallet credits.
create or replace function public.apply_referral_reward(
  p_referrer_id uuid,
  p_referred_id uuid,
  p_code text,
  p_referrer_pts numeric default 25,
  p_referred_pts numeric default 15
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  reward public.referral_rewards%rowtype;
begin
  if p_referrer_id is null or p_referred_id is null or p_referrer_id = p_referred_id then
    raise exception 'INVALID_REFERRAL';
  end if;

  update public.profiles
    set referred_by = p_referrer_id
  where user_id = p_referred_id and referred_by is null;
  if not found then raise exception 'REFERRAL_ALREADY_APPLIED'; end if;

  if not exists (select 1 from public.profiles where user_id = p_referrer_id and referral_code = upper(trim(p_code))) then
    raise exception 'INVALID_REFERRAL_CODE';
  end if;

  insert into public.referral_rewards(referrer_id, referred_id, pts_referrer, pts_referred)
  values (p_referrer_id, p_referred_id, p_referrer_pts, p_referred_pts)
  returning * into reward;

  perform public.wallet_earn(p_referrer_id, p_referrer_pts, 'Parrainage — filleul inscrit', 'referral_referrer', 100, false);
  perform public.wallet_earn(p_referred_id, p_referred_pts, 'Bonus code parrainage ' || upper(trim(p_code)), 'referral_referred', 100, false);

  return jsonb_build_object('reward', to_jsonb(reward));
end;
$$;
revoke all on function public.apply_referral_reward(uuid, uuid, text, numeric, numeric) from public, anon, authenticated;
grant execute on function public.apply_referral_reward(uuid, uuid, text, numeric, numeric) to service_role;
