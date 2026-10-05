-- =========================================================================
-- BAARO FOUNDATION 004: SOUNDS, ECONOMY & MONETIZATION (CORRECTED)
-- =========================================================================

-- 1. Table des services (Définie en premier pour éviter l'erreur de relation manquante)
CREATE TABLE IF NOT EXISTS public.service_listings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    price NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    currency VARCHAR(3) DEFAULT 'XOF',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.service_listings ENABLE ROW LEVEL SECURITY;

-- 2. Catalogue et Droits Audio
CREATE TABLE IF NOT EXISTS public.sounds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    creator_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    audio_url TEXT NOT NULL,
    duration_seconds INTEGER,
    license_type TEXT DEFAULT 'baaro_original',
    territory_restrictions TEXT[],
    is_verified BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.sounds ENABLE ROW LEVEL SECURITY;

-- 3. Nettoyage des anciennes fonctions portefeuille/crypto (si existantes)
DROP FUNCTION IF EXISTS public.wallet_transfer(uuid, uuid, numeric) CASCADE;
DROP FUNCTION IF EXISTS public.gift_send(uuid, uuid, numeric) CASCADE;

-- 4. Économie et Comptabilité (Fiat XOF)
CREATE TABLE IF NOT EXISTS public.economy_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    balance NUMERIC(12, 2) DEFAULT 0.00,
    currency VARCHAR(3) DEFAULT 'XOF',
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.economy_accounts ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.economy_ledger (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sender_id UUID REFERENCES auth.users(id),
    receiver_id UUID REFERENCES auth.users(id),
    amount NUMERIC(12, 2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'XOF',
    transaction_type TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.economy_ledger ENABLE ROW LEVEL SECURITY;

-- 5. Catalogue de Monétisation V19
CREATE TABLE IF NOT EXISTS public.monetization_products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    product_type TEXT NOT NULL,
    price NUMERIC(12, 2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'XOF',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.monetization_products ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.monetization_checkout_intents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    product_id UUID REFERENCES public.monetization_products(id) ON DELETE CASCADE,
    status TEXT DEFAULT 'pending',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.monetization_checkout_intents ENABLE ROW LEVEL SECURITY;

-- 6. Fonctions RPC sécurisées
CREATE OR REPLACE FUNCTION public.search_audio_library(search_query TEXT)
RETURNS SETOF public.sounds
LANGUAGE sql
SECURITY DEFINER
AS $$
    SELECT * FROM public.sounds
    WHERE title ILIKE '%' || search_query || '%'
    LIMIT 50;
$$;

CREATE OR REPLACE FUNCTION public.record_sound_usage(p_sound_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    INSERT INTO public.economy_ledger (amount, transaction_type)
    VALUES (0.00, 'sound_usage');
END;
$$;

drop policy if exists credits_account_own on public.baaro_credits_accounts;
create policy credits_account_own on public.baaro_credits_accounts for select to authenticated using (auth.uid()=user_id);
drop policy if exists credits_ledger_own on public.baaro_credits_ledger;
create policy credits_ledger_own on public.baaro_credits_ledger for select to authenticated using (auth.uid()=user_id);
drop policy if exists affiliate_own on public.affiliate_attributions;
create policy affiliate_own on public.affiliate_attributions for select to authenticated using (auth.uid()=affiliate_id);
drop policy if exists ai_usage_own on public.ai_usage_daily;
create policy ai_usage_own on public.ai_usage_daily for select to authenticated using (auth.uid()=user_id);
drop policy if exists job_boost_own on public.job_profile_boosts;
create policy job_boost_own on public.job_profile_boosts for select to authenticated using (auth.uid()=user_id);
drop policy if exists profile_view_own on public.profile_view_premium;
create policy profile_view_own on public.profile_view_premium for select to authenticated using (auth.uid()=user_id);
drop policy if exists training_public on public.live_trainings;
create policy training_public on public.live_trainings for select to authenticated using (status in ('published','live','finished') or auth.uid()=host_id);
drop policy if exists insight_own on public.b2b_insight_exports;
create policy insight_own on public.b2b_insight_exports for select to authenticated using (auth.uid()=requester_id);

-- No direct client writes to financial/entitlement tables.
revoke insert,update,delete on public.monetization_checkout_intents from authenticated,anon;
revoke insert,update,delete on public.premium_subscriptions from authenticated,anon;
revoke insert,update,delete on public.tips from authenticated,anon;
revoke insert,update,delete on public.post_boosts from authenticated,anon;
revoke insert,update,delete on public.sponsored_polls from authenticated,anon;
revoke insert,update,delete on public.vip_group_subscriptions from authenticated,anon;
revoke insert,update,delete on public.user_cosmetics from authenticated,anon;
revoke insert,update,delete on public.merchant_pro_subscriptions from authenticated,anon;
revoke insert,update,delete on public.local_ad_campaigns from authenticated,anon;
revoke insert,update,delete on public.service_bookings from authenticated,anon;
revoke insert,update,delete on public.api_subscriptions from authenticated,anon;
revoke insert,update,delete on public.api_keys from authenticated,anon;
revoke insert,update,delete on public.api_usage_daily from authenticated,anon;
revoke insert,update,delete on public.live_tickets from authenticated,anon;
revoke insert,update,delete on public.baaro_credits_accounts from authenticated,anon;
revoke insert,update,delete on public.baaro_credits_ledger from authenticated,anon;
revoke insert,update,delete on public.affiliate_attributions from authenticated,anon;
revoke insert,update,delete on public.ai_usage_daily from authenticated,anon;
revoke insert,update,delete on public.job_profile_boosts from authenticated,anon;
revoke insert,update,delete on public.profile_view_premium from authenticated,anon;
revoke insert,update,delete on public.b2b_insight_exports from authenticated,anon;

create or replace function public.start_monetization_checkout(p_product_code text,p_metadata jsonb default '{}'::jsonb)
returns jsonb
language plpgsql security invoker set search_path=public
as $$
declare uid uuid:=auth.uid(); p public.monetization_products; i public.monetization_checkout_intents;
begin
 if uid is null then raise exception 'AUTH_REQUIRED'; end if;
 select * into p from public.monetization_products where code=p_product_code and active=true;
 if not found then raise exception 'PRODUCT_NOT_FOUND'; end if;
 insert into public.monetization_checkout_intents(user_id,product_code,amount_minor,currency,metadata)
 values(uid,p.code,p.price_minor,p.currency,coalesce(p_metadata,'{}'::jsonb)) returning * into i;
 return jsonb_build_object('id',i.id,'product_code',i.product_code,'amount_minor',i.amount_minor,'currency',i.currency,'status',i.status,'expires_at',i.expires_at);
end $$;
revoke all on function public.start_monetization_checkout(text,jsonb) from public,anon;
grant execute on function public.start_monetization_checkout(text,jsonb) to authenticated;

create or replace function public.set_profile_view_premium(p_enabled boolean)
returns public.profile_view_premium
language plpgsql security invoker set search_path=public
as $$
declare uid uuid:=auth.uid(); r public.profile_view_premium;
begin
 if uid is null then raise exception 'AUTH_REQUIRED'; end if;
 insert into public.profile_view_premium(user_id,enabled) values(uid,p_enabled)
 on conflict(user_id) do update set enabled=excluded.enabled,updated_at=now()
 returning * into r;
 return r;
end $$;
revoke all on function public.set_profile_view_premium(boolean) from public,anon;
grant execute on function public.set_profile_view_premium(boolean) to authenticated;

create or replace function public.get_monetization_catalog()
returns jsonb
language sql security invoker set search_path=public
as $$
 select jsonb_build_object(
  'products',(select coalesce(jsonb_agg(to_jsonb(p) order by p.category,p.price_minor),'[]'::jsonb) from public.monetization_products p where p.active),
  'api_plans',(select coalesce(jsonb_agg(to_jsonb(a) order by a.price_minor),'[]'::jsonb) from public.api_plans a)
 );
$$;
revoke all on function public.get_monetization_catalog() from public,anon;
grant execute on function public.get_monetization_catalog() to authenticated;

-- Service-role fulfillment: provider webhooks call this function after independently verifying payment.
create or replace function public.fulfill_monetization_checkout(p_intent_id uuid,p_provider text,p_provider_reference text)
returns boolean
language plpgsql security definer set search_path=public
as $$
declare i public.monetization_checkout_intents; now_end timestamptz;
begin
 if auth.role() <> 'service_role' then raise exception 'SERVICE_ROLE_REQUIRED'; end if;
 select * into i from public.monetization_checkout_intents where id=p_intent_id for update;
 if not found then raise exception 'CHECKOUT_NOT_FOUND'; end if;
 if i.status='paid' then return true; end if;
 if i.status not in ('pending','processing') then raise exception 'CHECKOUT_NOT_PAYABLE'; end if;
 update public.monetization_checkout_intents set status='paid',provider=p_provider,provider_reference=p_provider_reference,updated_at=now() where id=i.id;
 if i.product_code='premium_monthly' then
   now_end:=now()+interval '30 days';
   insert into public.premium_subscriptions(user_id,status,provider,provider_reference,current_period_end) values(i.user_id,'active',p_provider,p_provider_reference,now_end)
   on conflict(user_id) do update set status='active',provider=excluded.provider,provider_reference=excluded.provider_reference,current_period_start=now(),current_period_end=excluded.current_period_end,updated_at=now();
 elsif i.product_code='pro_merchant_monthly' then
   insert into public.merchant_pro_subscriptions(merchant_id,status,current_period_end) values(i.user_id,'active',now()+interval '30 days')
   on conflict(merchant_id) do update set status='active',current_period_end=excluded.current_period_end,updated_at=now();
 elsif i.product_code='cosmetics_pack_6' then
   insert into public.user_cosmetics(user_id,cosmetic_code,quantity) values(i.user_id,'animated_pack',6)
   on conflict(user_id,cosmetic_code) do update set quantity=public.user_cosmetics.quantity+6;
 elsif i.product_code='ai_pack_10' then
   insert into public.ai_usage_daily(user_id,usage_date,paid_generations,units_used) values(i.user_id,current_date,10,10)
   on conflict(user_id,usage_date) do update set paid_generations=public.ai_usage_daily.paid_generations+10,units_used=public.ai_usage_daily.units_used+10;
 elsif i.product_code='job_boost_7d' then
   insert into public.job_profile_boosts(user_id,ends_at,status) values(i.user_id,now()+interval '7 days','active');
 elsif i.product_code='api_starter_monthly' then
   insert into public.api_subscriptions(owner_id,plan_code,status,current_period_end) values(i.user_id,'starter','active',now()+interval '30 days');
 end if;
 return true;
end $$;
revoke all on function public.fulfill_monetization_checkout(uuid,text,text) from public,anon,authenticated;
grant execute on function public.fulfill_monetization_checkout(uuid,text,text) to service_role;

create or replace function public.get_monetization_dashboard()
returns jsonb
language plpgsql security invoker set search_path=public
as $$
declare uid uuid:=auth.uid();
begin
 if uid is null then raise exception 'AUTH_REQUIRED'; end if;
 return jsonb_build_object(
  'premium', (select to_jsonb(p) from public.premium_subscriptions p where p.user_id=uid),
  'pro', (select to_jsonb(p) from public.merchant_pro_subscriptions p where p.merchant_id=uid),
  'profile_view_premium',(select to_jsonb(v) from public.profile_view_premium v where v.user_id=uid),
  'credits',(select to_jsonb(c) from public.baaro_credits_accounts c where c.user_id=uid),
  'ai_today',(select to_jsonb(a) from public.ai_usage_daily a where a.user_id=uid and a.usage_date=current_date),
  'pending_checkouts',(select coalesce(jsonb_agg(to_jsonb(i) order by i.created_at desc),'[]'::jsonb) from public.monetization_checkout_intents i where i.user_id=uid and i.status in ('pending','processing')),
  'products',(select coalesce(jsonb_agg(to_jsonb(p) order by p.category,p.price_minor),'[]'::jsonb) from public.monetization_products p where p.active)
 );
end $$;
revoke all on function public.get_monetization_dashboard() from public,anon;
grant execute on function public.get_monetization_dashboard() to authenticated;
