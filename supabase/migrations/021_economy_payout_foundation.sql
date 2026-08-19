-- BAARO 2.0 v17 — Economy / Payout foundation
-- Payouts are intentionally disabled until a verified provider integration is configured.

create table if not exists public.payout_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('stripe_connect')),
  provider_account_id text not null,
  country_code text check (country_code is null or country_code ~ '^[A-Z]{2}$'),
  currency text check (currency is null or currency ~ '^[A-Z]{3}$'),
  status text not null default 'pending'
    check (status in ('pending','enabled','disabled','restricted')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(provider, provider_account_id),
  unique(user_id, provider)
);

create table if not exists public.payout_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  payout_account_id uuid references public.payout_accounts(id) on delete restrict,
  amount_points bigint not null check (amount_points > 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  amount_minor bigint not null check (amount_minor > 0),
  status text not null default 'pending'
    check (status in ('pending','processing','paid','failed','cancelled','requires_review')),
  idempotency_key text not null,
  provider_payout_id text,
  failure_code text,
  failure_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, idempotency_key)
);

create index if not exists payout_requests_user_created_idx
  on public.payout_requests(user_id, created_at desc);

create index if not exists payout_requests_status_idx
  on public.payout_requests(status, created_at);

alter table public.payout_accounts enable row level security;
alter table public.payout_requests enable row level security;

drop policy if exists payout_accounts_select_own on public.payout_accounts;
create policy payout_accounts_select_own
on public.payout_accounts for select
using (auth.uid() = user_id);

drop policy if exists payout_requests_select_own on public.payout_requests;
create policy payout_requests_select_own
on public.payout_requests for select
using (auth.uid() = user_id);

-- No client INSERT/UPDATE/DELETE policies are intentionally created.
-- Payout mutations must happen through authenticated server-side functions.

create or replace function public.create_payout_request(
  p_idempotency_key text,
  p_amount_points bigint,
  p_currency text
)
returns public.payout_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_wallet public.wallets;
  v_account public.payout_accounts;
  v_request public.payout_requests;
  v_amount_minor bigint;
begin
  if v_uid is null then
    raise exception 'authentication_required';
  end if;

  if p_idempotency_key is null or length(trim(p_idempotency_key)) < 16
     or length(trim(p_idempotency_key)) > 128 then
    raise exception 'invalid_idempotency_key';
  end if;

  if p_amount_points <= 0 then
    raise exception 'invalid_amount';
  end if;

  select * into v_request
  from public.payout_requests
  where user_id = v_uid and idempotency_key = trim(p_idempotency_key)
  for update;

  if found then
    return v_request;
  end if;

  select * into v_account
  from public.payout_accounts
  where user_id = v_uid and provider = 'stripe_connect'
  for update;

  if not found or v_account.status <> 'enabled' then
    raise exception 'payout_account_not_ready';
  end if;

  -- Conversion must be replaced by the configured business-rate table/RPC
  -- before enabling payouts. This function intentionally refuses a real payout.
  raise exception 'payout_disabled_until_provider_configuration';
end;
$$;

revoke all on function public.create_payout_request(text,bigint,text) from public, anon, authenticated;
grant execute on function public.create_payout_request(text,bigint,text) to authenticated;
