-- BAARO 2.0 - Wallet atomique / ledger sécurisé
-- À exécuter après 011_baaro_core_media_security.sql.

alter table public.transactions
  add column if not exists action_key text,
  add column if not exists day_key date;

create index if not exists idx_transactions_user_created
  on public.transactions(user_id, created_at desc);

create index if not exists idx_transactions_user_day_positive
  on public.transactions(user_id, day_key, pts)
  where pts > 0;

create unique index if not exists ux_transactions_daily_bonus
  on public.transactions(user_id, day_key)
  where action_key = 'daily_bonus';

create or replace function public.wallet_ensure(p_user_id uuid, p_welcome_bonus numeric default 50)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  w public.wallets%rowtype;
  bonus numeric := greatest(coalesce(p_welcome_bonus, 0), 0);
begin
  insert into public.wallets(user_id, balance)
  values (p_user_id, 0)
  on conflict (user_id) do nothing;

  select * into w from public.wallets where user_id = p_user_id for update;

  if bonus > 0 and not exists (
    select 1 from public.transactions
    where user_id = p_user_id and action_key = 'welcome_bonus'
  ) then
    update public.wallets
      set balance = balance + bonus, updated_at = now()
    where user_id = p_user_id
    returning * into w;

    insert into public.transactions(user_id, label, pts, action_key, day_key)
    values (p_user_id, 'Bonus de bienvenue', bonus, 'welcome_bonus', current_date);
  end if;

  return jsonb_build_object('user_id', w.user_id, 'balance', w.balance, 'updated_at', w.updated_at);
end;
$$;

create or replace function public.wallet_earn(
  p_user_id uuid,
  p_pts numeric,
  p_label text,
  p_action_key text,
  p_daily_cap numeric default 100,
  p_daily_bonus boolean default false
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
begin
  if p_pts is null or p_pts <= 0 then raise exception 'INVALID_POINTS'; end if;
  if length(coalesce(p_label,'')) = 0 then raise exception 'INVALID_LABEL'; end if;

  perform public.wallet_ensure(p_user_id, 0);
  select * into w from public.wallets where user_id = p_user_id for update;

  select coalesce(sum(pts), 0) into earned
  from public.transactions
  where user_id = p_user_id and pts > 0 and created_at >= date_trunc('day', now());

  if p_daily_bonus and exists (
    select 1 from public.transactions
    where user_id = p_user_id and action_key = 'daily_bonus' and day_key = current_date
  ) then
    raise exception 'DAILY_BONUS_ALREADY_CLAIMED';
  end if;

  if earned >= p_daily_cap then raise exception 'DAILY_CAP_REACHED'; end if;
  actual_pts := least(p_pts, p_daily_cap - earned);

  update public.wallets
    set balance = balance + actual_pts, updated_at = now()
  where user_id = p_user_id
  returning * into w;

  insert into public.transactions(user_id, label, pts, action_key, day_key)
  values (p_user_id, left(p_label, 120), actual_pts, p_action_key, current_date)
  returning * into tx;

  return jsonb_build_object(
    'balance', w.balance,
    'earned_today', earned + actual_pts,
    'remaining_today', greatest(0, p_daily_cap - earned - actual_pts),
    'transaction', to_jsonb(tx)
  );
end;
$$;

create or replace function public.wallet_redeem(
  p_user_id uuid,
  p_cost numeric,
  p_label text,
  p_action_key text default 'redeem'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  w public.wallets%rowtype;
  tx public.transactions%rowtype;
begin
  if p_cost is null or p_cost <= 0 then raise exception 'INVALID_COST'; end if;
  perform public.wallet_ensure(p_user_id, 0);
  select * into w from public.wallets where user_id = p_user_id for update;
  if w.balance < p_cost then raise exception 'INSUFFICIENT_BALANCE'; end if;

  update public.wallets set balance = balance - p_cost, updated_at = now()
  where user_id = p_user_id returning * into w;

  insert into public.transactions(user_id, label, pts, action_key, day_key)
  values (p_user_id, left(p_label, 120), -p_cost, p_action_key, current_date)
  returning * into tx;

  return jsonb_build_object('balance', w.balance, 'transaction', to_jsonb(tx));
end;
$$;

create or replace function public.wallet_convert(
  p_user_id uuid,
  p_pts numeric,
  p_points_per_baro numeric default 100
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  w public.wallets%rowtype;
  h public.crypto_holdings%rowtype;
  tx public.transactions%rowtype;
  baro numeric;
begin
  if p_pts is null or p_pts <= 0 or p_pts <> trunc(p_pts) then raise exception 'INVALID_POINTS'; end if;
  if p_points_per_baro <= 0 then raise exception 'INVALID_RATE'; end if;

  perform public.wallet_ensure(p_user_id, 0);
  select * into w from public.wallets where user_id = p_user_id for update;
  if w.balance < p_pts then raise exception 'INSUFFICIENT_BALANCE'; end if;
  baro := round((p_pts / p_points_per_baro)::numeric, 3);

  insert into public.crypto_holdings(user_id, holdings)
  values (p_user_id, 0)
  on conflict (user_id) do nothing;
  select * into h from public.crypto_holdings where user_id = p_user_id for update;

  update public.wallets set balance = balance - p_pts, updated_at = now()
  where user_id = p_user_id returning * into w;
  update public.crypto_holdings set holdings = holdings + baro, updated_at = now()
  where user_id = p_user_id returning * into h;

  insert into public.transactions(user_id, label, pts, action_key, day_key)
  values (p_user_id, format('Conversion en %s BARO', baro), -p_pts, 'convert_baro', current_date)
  returning * into tx;

  return jsonb_build_object('balance', w.balance, 'holdings', h.holdings, 'transaction', to_jsonb(tx));
end;
$$;

revoke all on function public.wallet_ensure(uuid, numeric) from public, anon, authenticated;
revoke all on function public.wallet_earn(uuid, numeric, text, text, numeric, boolean) from public, anon, authenticated;
revoke all on function public.wallet_redeem(uuid, numeric, text, text) from public, anon, authenticated;
revoke all on function public.wallet_convert(uuid, numeric, numeric) from public, anon, authenticated;
grant execute on function public.wallet_ensure(uuid, numeric) to service_role;
grant execute on function public.wallet_earn(uuid, numeric, text, text, numeric, boolean) to service_role;
grant execute on function public.wallet_redeem(uuid, numeric, text, text) to service_role;
grant execute on function public.wallet_convert(uuid, numeric, numeric) to service_role;

-- RLS hardening: expired stories are never exposed through the database API.
drop policy if exists stories_read on public.stories;
create policy stories_read on public.stories
  for select using (expires_at > now());

-- Calls: participants may update status, but identity/room fields cannot be rewritten.
create or replace function public.prevent_call_identity_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.caller_id <> old.caller_id
     or new.callee_id <> old.callee_id
     or coalesce(new.conversation_id::text, '') <> coalesce(old.conversation_id::text, '')
     or coalesce(new.daily_room_name, '') <> coalesce(old.daily_room_name, '')
     or new.type <> old.type
     or new.created_at <> old.created_at then
    raise exception 'CALL_IDENTITY_FIELDS_IMMUTABLE';
  end if;
  if new.status not in ('ringing','accepted','rejected','missed','ended','cancelled') then
    raise exception 'INVALID_CALL_STATUS';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_calls_immutable_identity on public.calls;
create trigger trg_calls_immutable_identity
before update on public.calls
for each row execute function public.prevent_call_identity_change();

drop policy if exists calls_participant_update on public.calls;
create policy calls_participant_update on public.calls
  for update
  using (auth.uid() = caller_id or auth.uid() = callee_id)
  with check (auth.uid() = caller_id or auth.uid() = callee_id);

drop policy if exists gifts_sent_public_read on public.gifts_sent;
create policy gifts_sent_room_read on public.gifts_sent
  for select using (
    auth.uid() is not null and exists (
      select 1 from public.debate_rooms r
      where r.id = gifts_sent.room_id
      and (
        r.host_id = auth.uid()
        or exists (
          select 1 from public.debate_participants p
          where p.room_id = gifts_sent.room_id and p.user_id = auth.uid()
        )
      )
    )
  );
