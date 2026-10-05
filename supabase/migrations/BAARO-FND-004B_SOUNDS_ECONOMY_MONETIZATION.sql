-- ============================================================ -- 
-- BAARO-FND-004B — SCRIPT COMPLET CORRIGÉ
-- ============================================================ -- 

-- 0. SÉCURISATION ET MISE À JOUR DE LA TABLE MONETIZATION_PRODUCTS
CREATE TABLE IF NOT EXISTS public.monetization_products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    product_type TEXT,
    price NUMERIC(12, 2),
    currency VARCHAR(3) DEFAULT 'XOF',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Assurer que product_type et price acceptent les valeurs NULL
ALTER TABLE public.monetization_products ALTER COLUMN product_type DROP NOT NULL;
ALTER TABLE public.monetization_products ALTER COLUMN price DROP NOT NULL;

-- Ajout des colonnes requises par la v20 si elles n'existent pas
ALTER TABLE public.monetization_products ADD COLUMN IF NOT EXISTS code TEXT UNIQUE;
ALTER TABLE public.monetization_products ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE public.monetization_products ADD COLUMN IF NOT EXISTS category TEXT;
ALTER TABLE public.monetization_products ADD COLUMN IF NOT EXISTS price_minor BIGINT;
ALTER TABLE public.monetization_products ADD COLUMN IF NOT EXISTS billing_period TEXT;
ALTER TABLE public.monetization_products ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;
ALTER TABLE public.monetization_products ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT true;
ALTER TABLE public.monetization_products ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

ALTER TABLE public.monetization_products ENABLE ROW LEVEL SECURITY;

-- Insertion des produits de monétisation
INSERT INTO public.monetization_products(code, name, description, category, price_minor, currency, billing_period, metadata) 
VALUES 
    ('boost_post_24h', 'Boost publication 24h', 'Mise en avant d’une publication pendant 24 heures', 'boost', 200000, 'XOF', 'one_time', '{"duration_hours":24,"target_required":"post_id"}'::jsonb),
    ('sponsored_poll_1000', 'Sondage sponsorisé', 'Campagne sponsorisée avec objectif de réponses/portée mesurable', 'campaign', 1000000, 'XOF', 'one_time', '{"target_required":"poll_id","objective":"responses"}'::jsonb),
    ('local_ad_2000', 'Publicité locale', 'Campagne locale avec rayon et métriques réelles', 'advertising', 500000, 'XOF', 'one_time', '{"radius_km":5,"target_required":"campaign_id"}'::jsonb),
    ('credits_120', 'BAARO Credits 120', '120 unités fermées utilisables uniquement dans BAARO', 'credits', 100000, 'XOF', 'one_time', '{"credits":120,"cashout":false,"transfer":false}'::jsonb)
ON CONFLICT (code) DO UPDATE SET 
    name = excluded.name,
    description = excluded.description,
    category = excluded.category,
    price_minor = excluded.price_minor,
    currency = excluded.currency,
    billing_period = excluded.billing_period,
    metadata = excluded.metadata,
    updated_at = now();

-- 0.1 CRÉATION DE LA TABLE LIVE_TRAININGS (REQUISE POUR LES ACHATS DE FORMATIONS)
CREATE TABLE IF NOT EXISTS public.live_trainings (
    id uuid primary key default gen_random_uuid(),
    host_id uuid not null references auth.users(id) on delete cascade,
    title text not null,
    description text,
    status text not null default 'draft' check (status in ('draft','published','live','finished','cancelled')),
    starts_at timestamptz not null,
    price_minor bigint not null default 0 check (price_minor >= 0),
    currency text not null default 'XOF',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

ALTER TABLE public.live_trainings ENABLE ROW LEVEL SECURITY;

-- Table des achats de formations
CREATE TABLE IF NOT EXISTS public.training_purchases (
    id uuid primary key default gen_random_uuid(),
    training_id uuid not null references public.live_trainings(id) on delete cascade,
    buyer_id uuid not null references auth.users(id) on delete cascade,
    kind text not null check (kind in ('live','replay')),
    amount_minor bigint not null check (amount_minor > 0),
    currency text not null default 'XOF',
    provider text,
    provider_reference text,
    created_at timestamptz not null default now(),
    unique(training_id, buyer_id, kind)
);

CREATE INDEX IF NOT EXISTS idx_training_purchases_buyer ON public.training_purchases(buyer_id, created_at desc);

ALTER TABLE public.training_purchases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS training_purchases_own ON public.training_purchases;
CREATE POLICY training_purchases_own ON public.training_purchases 
FOR SELECT TO authenticated 
USING (buyer_id = auth.uid());

REVOKE INSERT, UPDATE, DELETE ON public.training_purchases FROM authenticated, anon;

-- ============================================================ --
-- FONCTION: fulfill_monetization_checkout (V1)
-- ============================================================ --
CREATE OR REPLACE FUNCTION public.fulfill_monetization_checkout(p_intent_id uuid, p_provider text, p_provider_reference text) 
RETURNS boolean 
LANGUAGE plpgsql 
SECURITY DEFINER 
SET search_path = public AS $$ 
DECLARE 
    i public.monetization_checkout_intents; 
    product_meta jsonb; 
    target_id uuid; 
    group_id uuid; 
    event_id uuid; 
    poll_id uuid; 
    campaign_id uuid; 
    job_id uuid; 
    organizer_id uuid; 
    target_user_id uuid; 
    now_end timestamptz; 
BEGIN 
    IF auth.role() <> 'service_role' THEN 
        RAISE EXCEPTION 'SERVICE_ROLE_REQUIRED'; 
    END IF; 

    SELECT * INTO i FROM public.monetization_checkout_intents WHERE id = p_intent_id FOR UPDATE; 
    IF NOT FOUND THEN 
        RAISE EXCEPTION 'CHECKOUT_NOT_FOUND'; 
    END IF; 

    IF i.status = 'paid' THEN 
        RETURN true; 
    END IF; 

    IF i.status NOT IN ('pending', 'processing') THEN 
        RAISE EXCEPTION 'CHECKOUT_NOT_PAYABLE'; 
    END IF; 

    IF i.expires_at <= now() THEN 
        RAISE EXCEPTION 'CHECKOUT_EXPIRED'; 
    END IF; 

    SELECT metadata INTO product_meta FROM public.monetization_products WHERE code = i.product_code AND active = true; 
    IF product_meta is null THEN 
        RAISE EXCEPTION 'PRODUCT_NOT_FOUND'; 
    END IF; 

    UPDATE public.monetization_checkout_intents 
    SET status = 'paid', provider = p_provider, provider_reference = p_provider_reference, updated_at = now() 
    WHERE id = i.id; 

    IF i.product_code = 'premium_monthly' THEN 
        now_end := now() + interval '30 days'; 
        INSERT INTO public.premium_subscriptions(user_id, status, provider, provider_reference, current_period_start, current_period_end) 
        VALUES (i.user_id, 'active', p_provider, p_provider_reference, now(), now_end) 
        ON CONFLICT(user_id) DO UPDATE SET 
            status = 'active', 
            provider = excluded.provider, 
            provider_reference = excluded.provider_reference, 
            current_period_start = now(), 
            current_period_end = excluded.current_period_end, 
            updated_at = now(); 
            
    ELSIF i.product_code = 'vip_group_monthly' THEN 
        group_id := nullif(i.metadata->>'group_id', '')::uuid; 
        IF group_id is null THEN 
            RAISE EXCEPTION 'GROUP_ID_REQUIRED'; 
        END IF; 
        IF NOT EXISTS(SELECT 1 FROM public.groups WHERE id = group_id) THEN 
            RAISE EXCEPTION 'GROUP_NOT_FOUND'; 
        END IF; 
        INSERT INTO public.vip_group_subscriptions(group_id, subscriber_id, price_minor, currency, status, period_end) 
        VALUES (group_id, i.user_id, i.amount_minor, i.currency, 'active', now() + interval '30 days') 
        ON CONFLICT(group_id, subscriber_id) DO UPDATE SET 
            price_minor = excluded.price_minor, 
            currency = excluded.currency, 
            status = 'active', 
            period_end = excluded.period_end; 
            
    ELSIF i.product_code = 'pro_merchant_monthly' THEN 
        INSERT INTO public.merchant_pro_subscriptions(merchant_id, status, price_minor, currency, current_period_end) 
        VALUES (i.user_id, 'active', i.amount_minor, i.currency, now() + interval '30 days') 
        ON CONFLICT(merchant_id) DO UPDATE SET 
            status = 'active', 
            price_minor = excluded.price_minor, 
            currency = excluded.currency, 
            current_period_end = excluded.current_period_end, 
            updated_at = now(); 
            
    ELSIF i.product_code = 'cosmetics_pack_6' THEN 
        INSERT INTO public.user_cosmetics(user_id, cosmetic_code, quantity, source) 
        VALUES (i.user_id, 'animated_pack', 6, 'purchase') 
        ON CONFLICT(user_id, cosmetic_code) DO UPDATE SET 
            quantity = public.user_cosmetics.quantity + 6; 
            
    ELSIF i.product_code = 'ai_pack_10' THEN 
        INSERT INTO public.ai_usage_daily(user_id, usage_date, paid_generations, units_used) 
        VALUES (i.user_id, current_date, 10, 10) 
        ON CONFLICT(user_id, usage_date) DO UPDATE SET 
            paid_generations = public.ai_usage_daily.paid_generations + 10, 
            units_used = public.ai_usage_daily.units_used + 10; 
            
    ELSIF i.product_code = 'job_boost_7d' THEN 
        job_id := nullif(i.metadata->>'job_listing_id', '')::uuid; 
        IF job_id is not null AND NOT EXISTS(SELECT 1 FROM public.job_listings WHERE id = job_id AND owner_id = i.user_id) THEN 
            RAISE EXCEPTION 'JOB_NOT_OWNED'; 
        END IF; 
        INSERT INTO public.job_profile_boosts(user_id, job_listing_id, starts_at, ends_at, status) 
        VALUES (i.user_id, job_id, now(), now() + interval '7 days', 'active'); 
        
    ELSIF i.product_code = 'api_starter_monthly' THEN 
        INSERT INTO public.api_subscriptions(owner_id, plan_code, status, current_period_end) 
        VALUES (i.user_id, 'starter', 'active', now() + interval '30 days'); 
        
    ELSIF i.product_code = 'boost_post_24h' THEN 
        target_id := nullif(i.metadata->>'post_id', '')::uuid; 
        IF target_id is null THEN 
            RAISE EXCEPTION 'POST_ID_REQUIRED'; 
        END IF; 
        IF NOT EXISTS(SELECT 1 FROM public.posts WHERE id = target_id AND author_id = i.user_id) THEN 
            RAISE EXCEPTION 'POST_NOT_OWNED'; 
        END IF; 
        INSERT INTO public.post_boosts(post_id, buyer_id, budget_minor, duration_hours, status, starts_at, ends_at) 
        VALUES (target_id, i.user_id, i.amount_minor, 24, 'active', now(), now() + interval '24 hours'); 
        
    ELSIF i.product_code = 'sponsored_poll_1000' THEN 
        poll_id := nullif(i.metadata->>'poll_id', '')::uuid; 
        IF poll_id is null THEN 
            RAISE EXCEPTION 'POLL_ID_REQUIRED'; 
        END IF; 
        IF NOT EXISTS(SELECT 1 FROM public.polls p JOIN public.posts po ON po.id = p.post_id WHERE p.id = poll_id AND po.author_id = i.user_id) THEN 
            RAISE EXCEPTION 'POLL_NOT_OWNED'; 
        END IF; 
        INSERT INTO public.sponsored_polls(poll_id, advertiser_id, budget_minor, target, objective, status, starts_at, ends_at) 
        VALUES (poll_id, i.user_id, i.amount_minor, coalesce(i.metadata->'target', '{}'::jsonb), coalesce(i.metadata->>'objective', 'responses'), 'active', now(), now() + interval '24 hours'); 
        
    ELSIF i.product_code = 'local_ad_2000' THEN 
        campaign_id := nullif(i.metadata->>'campaign_id', '')::uuid; 
        IF campaign_id is null THEN 
            RAISE EXCEPTION 'CAMPAIGN_ID_REQUIRED'; 
        END IF; 
        UPDATE public.local_ad_campaigns 
        SET status = 'active', starts_at = coalesce(starts_at, now()), ends_at = coalesce(ends_at, now() + interval '24 hours') 
        WHERE id = campaign_id AND advertiser_id = i.user_id AND status IN ('draft', 'pending'); 
        IF NOT FOUND THEN 
            RAISE EXCEPTION 'LOCAL_AD_NOT_FOUND_OR_NOT_OWNED'; 
        END IF; 
        
    ELSIF i.product_code = 'credits_120' THEN 
        INSERT INTO public.baaro_credits_accounts(user_id, balance) 
        VALUES (i.user_id, 120) 
        ON CONFLICT(user_id) DO UPDATE SET 
            balance = public.baaro_credits_accounts.balance + 120, 
            updated_at = now(); 
        INSERT INTO public.baaro_credits_ledger(user_id, direction, amount, source, reference_id, idempotency_key, metadata) 
        VALUES (i.user_id, 'credit', 120, 'purchase', i.id, concat('checkout:', i.id), jsonb_build_object('cashout_allowed', false, 'transfer_allowed', false)); 
        
    ELSIF i.product_code = 'live_ticket' THEN 
        event_id := nullif(i.metadata->>'event_id', '')::uuid; 
        IF event_id is null THEN 
            RAISE EXCEPTION 'EVENT_ID_REQUIRED'; 
        END IF; 
        SELECT organizer_id INTO organizer_id FROM public.community_events WHERE id = event_id AND status = 'published'; 
        IF organizer_id is null THEN 
            RAISE EXCEPTION 'EVENT_NOT_FOUND'; 
        END IF; 
        INSERT INTO public.live_tickets(event_id, buyer_id, organizer_id, amount_minor, currency, status, provider, provider_reference, ticket_code) 
        VALUES (event_id, i.user_id, organizer_id, i.amount_minor, i.currency, 'paid', p_provider, p_provider_reference, encode(gen_random_bytes(9), 'hex')); 
        
    ELSIF i.product_code IN ('training_ticket', 'training_replay') THEN 
        target_id := nullif(i.metadata->>'training_id', '')::uuid; 
        IF target_id is null THEN 
            RAISE EXCEPTION 'TRAINING_ID_REQUIRED'; 
        END IF; 
        IF NOT EXISTS(SELECT 1 FROM public.live_trainings WHERE id = target_id AND status IN ('published', 'live', 'finished')) THEN 
            RAISE EXCEPTION 'TRAINING_NOT_FOUND'; 
        END IF; 
        INSERT INTO public.training_purchases(training_id, buyer_id, kind, amount_minor, currency, provider, provider_reference) 
        VALUES (target_id, i.user_id, case when i.product_code = 'training_ticket' then 'live' else 'replay' end, i.amount_minor, i.currency, p_provider, p_provider_reference) 
        ON CONFLICT(training_id, buyer_id, kind) DO UPDATE SET 
            provider = excluded.provider, 
            provider_reference = excluded.provider_reference, 
            amount_minor = excluded.amount_minor; 
    END IF; 

    RETURN true; 
END $$; 

REVOKE ALL ON FUNCTION public.fulfill_monetization_checkout(uuid, text, text) FROM public, anon, authenticated; 
GRANT EXECUTE ON FUNCTION public.fulfill_monetization_checkout(uuid, text, text) TO service_role;

-- ============================================================ --
-- BAARO v20 — REAL-MONEY HARDENING & PAYOUTS
-- ============================================================ --

ALTER TABLE public.monetization_checkout_intents ADD COLUMN IF NOT EXISTS provider_amount_minor bigint;

CREATE TABLE IF NOT EXISTS public.creator_payout_profiles (
    user_id uuid primary key references auth.users(id) on delete cascade,
    kyc_status text not null default 'pending' check (kyc_status in ('pending','submitted','verified','rejected','suspended')),
    payout_verified boolean not null default false,
    country_code text,
    legal_name text,
    verified_at timestamptz,
    risk_level text not null default 'normal' check (risk_level in ('normal','review','blocked')),
    metadata jsonb not null default '{}'::jsonb,
    updated_at timestamptz not null default now()
);

ALTER TABLE public.creator_payout_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS creator_payout_profile_own ON public.creator_payout_profiles;
CREATE POLICY creator_payout_profile_own ON public.creator_payout_profiles 
FOR SELECT TO authenticated 
USING (auth.uid() = user_id);

REVOKE INSERT, UPDATE, DELETE ON public.creator_payout_profiles FROM authenticated, anon;

INSERT INTO public.monetization_products(code, name, description, category, price_minor, currency, billing_period, metadata) 
VALUES 
    ('tip_100', 'Pourboire 100 FCFA', 'Pourboire créateur', 'tips', 10000, 'XOF', 'one_time', '{"tip_fcfa":100}'::jsonb),
    ('tip_500', 'Pourboire 500 FCFA', 'Pourboire créateur', 'tips', 50000, 'XOF', 'one_time', '{"tip_fcfa":500}'::jsonb),
    ('tip_1000', 'Pourboire 1000 FCFA', 'Pourboire créateur', 'tips', 100000, 'XOF', 'one_time', '{"tip_fcfa":1000}'::jsonb),
    ('creator_subscription', 'Abonnement créateur', 'Abonnement mensuel à un créateur', 'creator_subscription', 50000, 'XOF', 'month', '{"min_fcfa":500,"platform_share_bps":1500}'::jsonb)
ON CONFLICT (code) DO UPDATE SET 
    name = excluded.name,
    description = excluded.description,
    category = excluded.category,
    price_minor = excluded.price_minor,
    currency = excluded.currency,
    billing_period = excluded.billing_period,
    metadata = excluded.metadata,
    updated_at = now();

CREATE OR REPLACE FUNCTION public.send_tip(
    p_recipient_id uuid, 
    p_amount_minor bigint, 
    p_post_id uuid default null, 
    p_live_id uuid default null
) 
RETURNS jsonb 
LANGUAGE plpgsql 
SECURITY INVOKER 
SET search_path = public AS $$ 
DECLARE 
    uid uuid := auth.uid(); 
    i public.monetization_checkout_intents; 
    code text; 
BEGIN 
    IF uid is null THEN 
        RAISE EXCEPTION 'AUTH_REQUIRED'; 
    END IF; 
    IF p_recipient_id is null OR p_recipient_id = uid THEN 
        RAISE EXCEPTION 'INVALID_RECIPIENT'; 
    END IF; 
    IF p_amount_minor NOT IN (10000, 50000, 100000) THEN 
        RAISE EXCEPTION 'INVALID_TIP_AMOUNT'; 
    END IF; 
    IF NOT EXISTS(SELECT 1 FROM auth.users WHERE id = p_recipient_id) THEN 
        RAISE EXCEPTION 'RECIPIENT_NOT_FOUND'; 
    END IF; 

    code := case p_amount_minor 
        when 10000 then 'tip_100' 
        when 50000 then 'tip_500' 
        else 'tip_1000' 
    end; 

    INSERT INTO public.monetization_checkout_intents(user_id, product_code, amount_minor, currency, metadata) 
    VALUES (uid, code, p_amount_minor, 'XOF', jsonb_build_object('recipient_id', p_recipient_id, 'post_id', p_post_id, 'live_id', p_live_id, 'source', 'tip')) 
    RETURNING * INTO i; 

    RETURN jsonb_build_object('id', i.id, 'product_code', i.product_code, 'amount_minor', i.amount_minor, 'currency', i.currency, 'status', i.status, 'expires_at', i.expires_at); 
END $$; 

REVOKE ALL ON FUNCTION public.send_tip(uuid, bigint, uuid, uuid) FROM public, anon; 
GRANT EXECUTE ON FUNCTION public.send_tip(uuid, bigint, uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.start_creator_subscription_checkout(
    p_creator_id uuid, 
    p_amount_minor bigint default 50000
) 
RETURNS jsonb 
LANGUAGE plpgsql 
SECURITY INVOKER 
SET search_path = public AS $$ 
DECLARE 
    uid uuid := auth.uid(); 
    i public.monetization_checkout_intents; 
BEGIN 
    IF uid is null THEN 
        RAISE EXCEPTION 'AUTH_REQUIRED'; 
    END IF; 
    IF p_creator_id is null OR p_creator_id = uid THEN 
        RAISE EXCEPTION 'INVALID_CREATOR'; 
    END IF; 
    IF p_amount_minor < 50000 OR p_amount_minor > 1000000 OR mod(p_amount_minor, 10000) <> 0 THEN 
        RAISE EXCEPTION 'INVALID_CREATOR_SUBSCRIPTION_PRICE'; 
    END IF; 
    IF NOT EXISTS(SELECT 1 FROM auth.users WHERE id = p_creator_id) THEN 
        RAISE EXCEPTION 'CREATOR_NOT_FOUND'; 
    END IF; 

    INSERT INTO public.monetization_checkout_intents(user_id, product_code, amount_minor, currency, metadata) 
    VALUES (uid, 'creator_subscription', p_amount_minor, 'XOF', jsonb_build_object('creator_id', p_creator_id, 'source', 'creator_subscription')) 
    RETURNING * INTO i; 

    RETURN jsonb_build_object('id', i.id, 'product_code', i.product_code, 'amount_minor', i.amount_minor, 'currency', i.currency, 'status', i.status, 'expires_at', i.expires_at); 
END $$; 

REVOKE ALL ON FUNCTION public.start_creator_subscription_checkout(uuid, bigint) FROM public, anon; 
GRANT EXECUTE ON FUNCTION public.start_creator_subscription_checkout(uuid, bigint) TO authenticated;

-- ============================================================ --
-- FONCTION COMPLÈTE: fulfill_monetization_checkout (Mise à jour v20 finale)
-- ============================================================ --
CREATE OR REPLACE FUNCTION public.fulfill_monetization_checkout(p_intent_id uuid, p_provider text, p_provider_reference text) 
RETURNS boolean 
LANGUAGE plpgsql 
SECURITY DEFINER 
SET search_path = public AS $$ 
DECLARE 
    i public.monetization_checkout_intents; 
    product_meta jsonb; 
    target_id uuid; 
    group_id uuid; 
    event_id uuid; 
    poll_id uuid; 
    campaign_id uuid; 
    job_id uuid; 
    organizer_id uuid; 
    creator_id uuid; 
    tip_id uuid; 
    now_end timestamptz; 
    ledger_id uuid; 
BEGIN 
    IF auth.role() <> 'service_role' THEN 
        RAISE EXCEPTION 'SERVICE_ROLE_REQUIRED'; 
    END IF; 

    SELECT * INTO i FROM public.monetization_checkout_intents WHERE id = p_intent_id FOR UPDATE; 
    IF NOT FOUND THEN 
        RAISE EXCEPTION 'CHECKOUT_NOT_FOUND'; 
    END IF; 

    IF i.status = 'paid' THEN 
        RETURN true; 
    END IF; 

    IF i.status NOT IN ('pending', 'processing') THEN 
        RAISE EXCEPTION 'CHECKOUT_NOT_PAYABLE'; 
    END IF; 

    IF i.expires_at <= now() THEN 
        RAISE EXCEPTION 'CHECKOUT_EXPIRED'; 
    END IF; 

    SELECT metadata INTO product_meta FROM public.monetization_products WHERE code = i.product_code AND active = true; 
    IF product_meta is null THEN 
        RAISE EXCEPTION 'PRODUCT_NOT_FOUND'; 
    END IF; 

    UPDATE public.monetization_checkout_intents 
    SET status = 'paid', provider = p_provider, provider_reference = p_provider_reference, updated_at = now() 
    WHERE id = i.id; 

    IF i.product_code = 'premium_monthly' THEN 
        INSERT INTO public.premium_subscriptions(user_id, status, provider, provider_reference, current_period_start, current_period_end) 
        VALUES (i.user_id, 'active', p_provider, p_provider_reference, now(), now() + interval '30 days') 
        ON CONFLICT(user_id) DO UPDATE SET 
            status = 'active', 
            provider = excluded.provider, 
            provider_reference = excluded.provider_reference, 
            current_period_start = now(), 
            current_period_end = excluded.current_period_end, 
            updated_at = now(); 
            
    ELSIF i.product_code = 'creator_subscription' THEN 
        creator_id := nullif(i.metadata->>'creator_id', '')::uuid; 
        IF creator_id is null OR creator_id = i.user_id THEN 
            RAISE EXCEPTION 'INVALID_CREATOR'; 
        END IF; 
        INSERT INTO public.creator_subscriptions(creator_id, subscriber_id, status, tier) 
        VALUES (creator_id, i.user_id, 'active', 'paid') 
        ON CONFLICT(creator_id, subscriber_id) DO UPDATE SET 
            status = 'active', 
            tier = 'paid'; 
        ledger_id := public.record_economy_event('creator-subscription:' || i.id, creator_id, 'subscriptions', i.amount_minor, 0, i.currency, i.id, jsonb_build_object('subscriber_id', i.user_id, 'provider', p_provider)); 
        
    ELSIF i.product_code IN ('tip_100', 'tip_500', 'tip_1000') THEN 
        creator_id := nullif(i.metadata->>'recipient_id', '')::uuid; 
        IF creator_id is null OR creator_id = i.user_id THEN 
            RAISE EXCEPTION 'INVALID_RECIPIENT'; 
        END IF; 
        INSERT INTO public.tips(sender_id, recipient_id, post_id, live_id, amount_minor, currency, status, provider, provider_reference, idempotency_key) 
        VALUES (i.user_id, creator_id, nullif(i.metadata->>'post_id', '')::uuid, nullif(i.metadata->>'live_id', '')::uuid, i.amount_minor, i.currency, 'paid', p_provider, p_provider_reference, 'tip:' || i.id) 
        ON CONFLICT(idempotency_key) DO NOTHING 
        RETURNING id INTO tip_id; 
        
        IF tip_id is not null THEN 
            ledger_id := public.record_economy_event('tip:' || i.id, creator_id, 'tips', i.amount_minor, 0, i.currency, tip_id, jsonb_build_object('sender_id', i.user_id, 'provider', p_provider, 'checkout_intent_id', i.id)); 
        END IF; 
        
    ELSIF i.product_code = 'vip_group_monthly' THEN 
        group_id := nullif(i.metadata->>'group_id', '')::uuid; 
        IF group_id is null OR NOT EXISTS(SELECT 1 FROM public.groups WHERE id = group_id) THEN 
            RAISE EXCEPTION 'GROUP_NOT_FOUND'; 
        END IF; 
        INSERT INTO public.vip_group_subscriptions(group_id, subscriber_id, price_minor, currency, status, period_end) 
        VALUES (group_id, i.user_id, i.amount_minor, i.currency, 'active', now() + interval '30 days') 
        ON CONFLICT(group_id, subscriber_id) DO UPDATE SET 
            price_minor = excluded.price_minor, 
            currency = excluded.currency, 
            status = 'active', 
            period_end = excluded.period_end; 
            
    ELSIF i.product_code = 'pro_merchant_monthly' THEN 
        INSERT INTO public.merchant_pro_subscriptions(merchant_id, status, price_minor, currency, current_period_end) 
        VALUES (i.user_id, 'active', i.amount_minor, i.currency, now() + interval '30 days') 
        ON CONFLICT(merchant_id) DO UPDATE SET 
            status = 'active', 
            price_minor = excluded.price_minor, 
            currency = excluded.currency, 
            current_period_end = excluded.current_period_end, 
            updated_at = now(); 
            
    ELSIF i.product_code = 'cosmetics_pack_6' THEN 
        INSERT INTO public.user_cosmetics(user_id, cosmetic_code, quantity, source) 
        VALUES (i.user_id, 'animated_pack', 6, 'purchase') 
        ON CONFLICT(user_id, cosmetic_code) DO UPDATE SET 
            quantity = public.user_cosmetics.quantity + 6; 
            
    ELSIF i.product_code = 'ai_pack_10' THEN 
        INSERT INTO public.ai_usage_daily(user_id, usage_date, paid_generations, units_used) 
        VALUES (i.user_id, current_date, 10, 10) 
        ON CONFLICT(user_id, usage_date) DO UPDATE SET 
            paid_generations = public.ai_usage_daily.paid_generations + 10, 
            units_used = public.ai_usage_daily.units_used + 10; 
            
    ELSIF i.product_code = 'job_boost_7d' THEN 
        job_id := nullif(i.metadata->>'job_listing_id', '')::uuid; 
        IF job_id is not null AND NOT EXISTS(SELECT 1 FROM public.job_listings WHERE id = job_id AND owner_id = i.user_id) THEN 
            RAISE EXCEPTION 'JOB_NOT_OWNED'; 
        END IF; 
        INSERT INTO public.job_profile_boosts(user_id, job_listing_id, starts_at, ends_at, status) 
        VALUES (i.user_id, job_id, now(), now() + interval '7 days', 'active'); 
        
    ELSIF i.product_code = 'api_starter_monthly' THEN 
        INSERT INTO public.api_subscriptions(owner_id, plan_code, status, current_period_end) 
        VALUES (i.user_id, 'starter', 'active', now() + interval '30 days'); 
        
    ELSIF i.product_code = 'boost_post_24h' THEN 
        target_id := nullif(i.metadata->>'post_id', '')::uuid; 
        IF target_id is null OR NOT EXISTS(SELECT 1 FROM public.posts WHERE id = target_id AND author_id = i.user_id) THEN 
            RAISE EXCEPTION 'POST_NOT_OWNED'; 
        END IF; 
        INSERT INTO public.post_boosts(post_id, buyer_id, budget_minor, duration_hours, status, starts_at, ends_at) 
        VALUES (target_id, i.user_id, i.amount_minor, 24, 'active', now(), now() + interval '24 hours'); 
        
    ELSIF i.product_code = 'sponsored_poll_1000' THEN 
        poll_id := nullif(i.metadata->>'poll_id', '')::uuid; 
        IF poll_id is null OR NOT EXISTS(SELECT 1 FROM public.polls p JOIN public.posts po ON po.id = p.post_id WHERE p.id = poll_id AND po.author_id = i.user_id) THEN 
            RAISE EXCEPTION 'POLL_NOT_OWNED'; 
        END IF; 
        INSERT INTO public.sponsored_polls(poll_id, advertiser_id, budget_minor, target, objective, status, starts_at, ends_at) 
        VALUES (poll_id, i.user_id, i.amount_minor, coalesce(i.metadata->'target', '{}'::jsonb), coalesce(i.metadata->>'objective', 'responses'), 'active', now(), now() + interval '24 hours'); 
        
    ELSIF i.product_code = 'local_ad_2000' THEN 
        campaign_id := nullif(i.metadata->>'campaign_id', '')::uuid; 
        IF campaign_id is null THEN 
            RAISE EXCEPTION 'CAMPAIGN_ID_REQUIRED'; 
        END IF; 
        UPDATE public.local_ad_campaigns 
        SET status = 'active', starts_at = coalesce(starts_at, now()), ends_at = coalesce(ends_at, now() + interval '24 hours') 
        WHERE id = campaign_id AND advertiser_id = i.user_id AND status IN ('draft', 'pending'); 
        IF NOT FOUND THEN 
            RAISE EXCEPTION 'LOCAL_AD_NOT_FOUND_OR_NOT_OWNED'; 
        END IF; 
        
    ELSIF i.product_code = 'credits_120' THEN 
        INSERT INTO public.baaro_credits_accounts(user_id, balance) 
        VALUES (i.user_id, 120) 
        ON CONFLICT(user_id) DO UPDATE SET 
            balance = public.baaro_credits_accounts.balance + 120, 
            updated_at = now(); 
        INSERT INTO public.baaro_credits_ledger(user_id, direction, amount, source, reference_id, idempotency_key, metadata) 
        VALUES (i.user_id, 'credit', 120, 'purchase', i.id, 'checkout:' || i.id, jsonb_build_object('cashout_allowed', false, 'transfer_allowed', false)) 
        ON CONFLICT(idempotency_key) DO NOTHING; 
        
    ELSIF i.product_code = 'live_ticket' THEN 
        event_id := nullif(i.metadata->>'event_id', '')::uuid; 
        IF event_id is null THEN 
            RAISE EXCEPTION 'EVENT_ID_REQUIRED'; 
        END IF; 
        SELECT organizer_id INTO organizer_id FROM public.community_events WHERE id = event_id AND status = 'published'; 
        IF organizer_id is null THEN 
            RAISE EXCEPTION 'EVENT_NOT_FOUND'; 
        END IF; 
        INSERT INTO public.live_tickets(event_id, buyer_id, organizer_id, amount_minor, currency, status, provider, provider_reference, ticket_code) 
        VALUES (event_id, i.user_id, organizer_id, i.amount_minor, i.currency, 'paid', p_provider, p_provider_reference, encode(gen_random_bytes(9), 'hex')); 
        ledger_id := public.record_economy_event('live-ticket:' || i.id, organizer_id, 'campaigns', i.amount_minor, 0, i.currency, i.id, jsonb_build_object('buyer_id', i.user_id, 'provider', p_provider)); 
        
    ELSIF i.product_code IN ('training_ticket', 'training_replay') THEN 
        target_id := nullif(i.metadata->>'training_id', '')::uuid; 
        IF target_id is null OR NOT EXISTS(SELECT 1 FROM public.live_trainings WHERE id = target_id AND status IN ('published', 'live', 'finished')) THEN 
            RAISE EXCEPTION 'TRAINING_NOT_FOUND'; 
        END IF; 
        INSERT INTO public.training_purchases(training_id, buyer_id, kind, amount_minor, currency, provider, provider_reference) 
        VALUES (target_id, i.user_id, case when i.product_code = 'training_ticket' then 'live' else 'replay' end, i.amount_minor, i.currency, p_provider, p_provider_reference) 
        ON CONFLICT(training_id, buyer_id, kind) DO UPDATE SET 
            provider = excluded.provider, 
            provider_reference = excluded.provider_reference, 
            amount_minor = excluded.amount_minor; 
        SELECT host_id INTO creator_id FROM public.live_trainings WHERE id = target_id; 
        IF creator_id is not null THEN 
            ledger_id := public.record_economy_event('training:' || i.id, creator_id, 'campaigns', i.amount_minor, 0, i.currency, i.id, jsonb_build_object('buyer_id', i.user_id, 'provider', p_provider)); 
        END IF; 
    END IF; 

    RETURN true; 
END $$; 

REVOKE ALL ON FUNCTION public.fulfill_monetization_checkout(uuid, text, text) FROM public, anon, authenticated; 
GRANT EXECUTE ON FUNCTION public.fulfill_monetization_checkout(uuid, text, text) TO service_role;

-- ============================================================ --
-- MARK ORDER PAID & PAYOUT MANAGEMENT
-- ============================================================ --
CREATE OR REPLACE FUNCTION public.mark_order_paid(p_order_id uuid, p_payment_ref text, p_provider text default null) 
RETURNS void 
LANGUAGE plpgsql 
SECURITY DEFINER 
SET search_path = public AS $$ 
DECLARE 
    o public.orders; 
    ledger_id uuid; 
    merchant_id uuid; 
BEGIN 
    IF auth.role() <> 'service_role' THEN 
        RAISE EXCEPTION 'SERVICE_ROLE_REQUIRED'; 
    END IF; 
    SELECT * INTO o FROM public.orders WHERE id = p_order_id FOR UPDATE; 
    IF NOT FOUND THEN 
        RAISE EXCEPTION 'ORDER_NOT_FOUND'; 
    END IF; 
    IF o.payment_status = 'paid' THEN 
        RETURN; 
    END IF; 

    UPDATE public.orders 
    SET payment_status = 'paid', paid_at = coalesce(paid_at, now()), status = case when status = 'pending' then 'confirmed' else status end, payment_reference = p_payment_ref, updated_at = now() 
    WHERE id = o.id; 

    IF o.shop_id is not null THEN 
        SELECT owner_id INTO merchant_id FROM public.shops WHERE id = o.shop_id; 
        IF merchant_id is not null THEN 
            ledger_id := public.record_economy_event('marketplace-order:' || o.id, merchant_id, 'marketplace', round(o.total_amount * 100)::bigint, 0, o.currency, o.id, jsonb_build_object('provider', p_provider, 'payment_ref', p_payment_ref)); 
        END IF; 
    END IF; 
END $$; 

REVOKE ALL ON FUNCTION public.mark_order_paid(uuid, text, text) FROM public, anon, authenticated; 
GRANT EXECUTE ON FUNCTION public.mark_order_paid(uuid, text, text) TO service_role;

CREATE OR REPLACE FUNCTION public.request_economy_payout(
    p_amount_minor bigint, 
    p_method text, 
    p_destination_token text default null
) 
RETURNS uuid 
LANGUAGE plpgsql 
SECURITY DEFINER 
SET search_path = public AS $$ 
DECLARE 
    uid uuid := auth.uid(); 
    a public.economy_accounts; 
    p uuid; 
    min_cash bigint; 
    k public.creator_payout_profiles; 
BEGIN 
    IF uid is null THEN 
        RAISE EXCEPTION 'AUTH_REQUIRED'; 
    END IF; 
    IF p_amount_minor <= 0 THEN 
        RAISE EXCEPTION 'INVALID_AMOUNT'; 
    END IF; 
    IF p_method NOT IN ('mobile_money', 'bank_transfer') THEN 
        RAISE EXCEPTION 'INVALID_PAYOUT_METHOD'; 
    END IF; 

    SELECT * INTO k FROM public.creator_payout_profiles WHERE user_id = uid FOR UPDATE; 
    IF NOT FOUND OR k.kyc_status <> 'verified' OR NOT k.payout_verified THEN 
        RAISE EXCEPTION 'PAYOUT_KYC_REQUIRED'; 
    END IF; 
    IF k.risk_level <> 'normal' THEN 
        RAISE EXCEPTION 'PAYOUT_BLOCKED_FOR_RISK'; 
    END IF; 
    IF p_destination_token is null OR length(trim(p_destination_token)) < 8 THEN 
        RAISE EXCEPTION 'PAYOUT_DESTINATION_REQUIRED'; 
    END IF; 

    SELECT * INTO a FROM public.economy_accounts WHERE user_id = uid FOR UPDATE; 
    IF NOT FOUND THEN 
        RAISE EXCEPTION 'NO_EARNINGS_ACCOUNT'; 
    END IF; 

    SELECT round(min_cashout * 100)::bigint INTO min_cash FROM public.creator_monetization WHERE creator_id = uid; 
    min_cash := coalesce(min_cash, 100000); 
    IF p_amount_minor < min_cash THEN 
        RAISE EXCEPTION 'MIN_CASHOUT'; 
    END IF; 
    IF p_amount_minor > a.available_minor THEN 
        RAISE EXCEPTION 'INSUFFICIENT_AVAILABLE'; 
    END IF; 

    INSERT INTO public.economy_payouts(user_id, amount_minor, currency, method, destination_token) 
    VALUES (uid, p_amount_minor, a.currency, p_method, nullif(trim(p_destination_token), '')) 
    RETURNING id INTO p; 

    INSERT INTO public.economy_ledger(user_id, entry_type, bucket, direction, source, amount_minor, currency, reference_id, metadata) 
    VALUES (uid, 'payout_hold', 'payout_hold', 'credit', 'payout', p_amount_minor, a.currency, p, jsonb_build_object('status', 'reserved')); 

    UPDATE public.economy_accounts 
    SET available_minor = available_minor - p_amount_minor, payout_hold_minor = payout_hold_minor + p_amount_minor, updated_at = now() 
    WHERE user_id = uid; 

    RETURN p; 
END $$; 

REVOKE ALL ON FUNCTION public.request_economy_payout(bigint, text, text) FROM public, anon; 
GRANT EXECUTE ON FUNCTION public.request_economy_payout(bigint, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.record_ad_creator_revenue(
    p_idempotency_key text, 
    p_creator_id uuid, 
    p_gross_minor bigint, 
    p_provider_fee_minor bigint default 0, 
    p_reference_id uuid default null, 
    p_metadata jsonb default '{}'::jsonb
) 
RETURNS uuid 
LANGUAGE plpgsql 
SECURITY DEFINER 
SET search_path = public AS $$ 
BEGIN 
    IF auth.role() <> 'service_role' THEN 
        RAISE EXCEPTION 'SERVICE_ROLE_REQUIRED'; 
    END IF; 
    RETURN public.record_economy_event(p_idempotency_key, p_creator_id, 'ads', p_gross_minor, p_provider_fee_minor, 'XOF', p_reference_id, p_metadata); 
END $$; 

REVOKE ALL ON FUNCTION public.record_ad_creator_revenue(text, uuid, bigint, bigint, uuid, jsonb) FROM public, anon, authenticated; 
GRANT EXECUTE ON FUNCTION public.record_ad_creator_revenue(text, uuid, bigint, bigint, uuid, jsonb) TO service_role;

-- ============================================================ --
-- CREATOR REWARDS / POINTS & LEGAL CONSENTS
-- ============================================================ --
CREATE TABLE IF NOT EXISTS public.creator_reward_accounts (
    user_id uuid primary key references auth.users(id) on delete cascade,
    points bigint not null default 0 check(points >= 0),
    lifetime_points bigint not null default 0 check(lifetime_points >= 0),
    tier text not null default 'starter' check(tier in ('starter','rising','creator','pro','elite')),
    updated_at timestamptz not null default now()
);

CREATE TABLE IF NOT EXISTS public.creator_reward_events (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    source text not null,
    points bigint not null check(points > 0),
    reference_id uuid,
    idempotency_key text unique,
    metadata jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now()
);

CREATE INDEX IF NOT EXISTS idx_creator_reward_events_user_created ON public.creator_reward_events(user_id, created_at desc);

ALTER TABLE public.creator_reward_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.creator_reward_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS creator_rewards_read_own ON public.creator_reward_accounts;
CREATE POLICY creator_rewards_read_own ON public.creator_reward_accounts FOR SELECT TO authenticated USING(user_id = auth.uid());

DROP POLICY IF EXISTS creator_reward_events_read_own ON public.creator_reward_events;
CREATE POLICY creator_reward_events_read_own ON public.creator_reward_events FOR SELECT TO authenticated USING(user_id = auth.uid());

REVOKE INSERT, UPDATE, DELETE ON public.creator_reward_accounts FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.creator_reward_events FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.award_creator_points(
    p_user_id uuid, 
    p_source text, 
    p_points bigint, 
    p_reference_id uuid default null, 
    p_idempotency_key text default null, 
    p_metadata jsonb default '{}'::jsonb
) 
RETURNS bigint 
LANGUAGE plpgsql 
SECURITY DEFINER 
SET search_path = public AS $$ 
DECLARE 
    current_points bigint; 
    new_points bigint; 
    new_tier text; 
BEGIN 
    IF auth.role() <> 'service_role' THEN 
        RAISE EXCEPTION 'SERVICE_ROLE_REQUIRED'; 
    END IF; 
    IF p_user_id is null OR p_points <= 0 OR p_points > 1000000 THEN 
        RAISE EXCEPTION 'INVALID_REWARD'; 
    END IF; 
    IF p_idempotency_key is not null AND EXISTS(SELECT 1 FROM public.creator_reward_events WHERE idempotency_key = p_idempotency_key) THEN 
        SELECT points INTO current_points FROM public.creator_reward_accounts WHERE user_id = p_user_id; 
        RETURN coalesce(current_points, 0); 
    END IF; 

    INSERT INTO public.creator_reward_accounts(user_id) VALUES(p_user_id) ON CONFLICT(user_id) DO NOTHING; 
    INSERT INTO public.creator_reward_events(user_id, source, points, reference_id, idempotency_key, metadata) 
    VALUES(p_user_id, lower(trim(p_source)), p_points, p_reference_id, p_idempotency_key, coalesce(p_metadata, '{}'::jsonb)); 

    UPDATE public.creator_reward_accounts 
    SET points = points + p_points, lifetime_points = lifetime_points + p_points, updated_at = now() 
    WHERE user_id = p_user_id 
    RETURNING points INTO new_points; 

    new_tier := case 
        when new_points >= 100000 then 'elite' 
        when new_points >= 50000 then 'pro' 
        when new_points >= 20000 then 'creator' 
        when new_points >= 5000 then 'rising' 
        else 'starter' 
    end; 

    UPDATE public.creator_reward_accounts SET tier = new_tier WHERE user_id = p_user_id; 
    RETURN new_points; 
END $$; 

REVOKE ALL ON FUNCTION public.award_creator_points(uuid, text, bigint, uuid, text, jsonb) FROM public, anon, authenticated; 
GRANT EXECUTE ON FUNCTION public.award_creator_points(uuid, text, bigint, uuid, text, jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.get_creator_rewards_summary() 
RETURNS jsonb 
LANGUAGE sql 
SECURITY DEFINER 
SET search_path = public AS $$ 
SELECT jsonb_build_object( 
    'points', coalesce(a.points, 0), 
    'lifetime_points', coalesce(a.lifetime_points, 0), 
    'tier', coalesce(a.tier, 'starter'), 
    'next_tier', case 
        when coalesce(a.points, 0) < 5000 then 'rising' 
        when a.points < 20000 then 'creator' 
        when a.points < 50000 then 'pro' 
        when a.points < 100000 then 'elite' 
        else 'max' 
    end, 
    'next_threshold', case 
        when coalesce(a.points, 0) < 5000 then 5000 
        when a.points < 20000 then 20000 
        when a.points < 50000 then 50000 
        when a.points < 100000 then 100000 
        else 100000 
    end 
) 
FROM (SELECT auth.uid() as uid) u 
LEFT JOIN public.creator_reward_accounts a ON a.user_id = u.uid; 
$$; 

REVOKE ALL ON FUNCTION public.get_creator_rewards_summary() FROM public, anon; 
GRANT EXECUTE ON FUNCTION public.get_creator_rewards_summary() TO authenticated;

CREATE TABLE IF NOT EXISTS public.legal_consents (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    document_type text not null check(document_type in ('terms','privacy','community','creator','merchant','refund','cookies')),
    version text not null,
    accepted_at timestamptz not null default now(),
    ip_hash text,
    user_agent_hash text,
    unique(user_id, document_type, version)
);

ALTER TABLE public.legal_consents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS legal_consents_read_own ON public.legal_consents;
CREATE POLICY legal_consents_read_own ON public.legal_consents FOR SELECT TO authenticated USING(user_id = auth.uid());

REVOKE INSERT, UPDATE, DELETE ON public.legal_consents FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.record_legal_consent(
    p_document_type text, 
    p_version text, 
    p_ip_hash text default null, 
    p_user_agent_hash text default null
) 
RETURNS uuid 
LANGUAGE plpgsql 
SECURITY DEFINER 
SET search_path = public AS $$ 
DECLARE 
    v_id uuid; 
    v_uid uuid := auth.uid(); 
BEGIN 
    IF v_uid is null THEN 
        RAISE EXCEPTION 'AUTH_REQUIRED'; 
    END IF; 
    IF p_document_type NOT IN ('terms', 'privacy', 'community', 'creator', 'merchant', 'refund', 'cookies') THEN 
        RAISE EXCEPTION 'INVALID_DOCUMENT'; 
    END IF; 
    IF p_version is null OR length(trim(p_version)) = 0 THEN 
        RAISE EXCEPTION 'INVALID_VERSION'; 
    END IF; 

    INSERT INTO public.legal_consents(user_id, document_type, version, ip_hash, user_agent_hash) 
    VALUES(v_uid, lower(trim(p_document_type)), trim(p_version), p_ip_hash, p_user_agent_hash) 
    ON CONFLICT(user_id, document_type, version) DO UPDATE SET accepted_at = now() 
    RETURNING id INTO v_id; 

    RETURN v_id; 
END $$; 

REVOKE ALL ON FUNCTION public.record_legal_consent(text, text, text, text) FROM public, anon; 
GRANT EXECUTE ON FUNCTION public.record_legal_consent(text, text, text, text) TO authenticated;

-- ============================================================ --
-- BAARO FRESH SCHEMA INVARIANTS (CORRIGÉ)
-- ============================================================ --
DO $$ 
BEGIN 
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'user_id') THEN 
        RAISE EXCEPTION 'BAARO_SCHEMA_INVALID: profiles.user_id must not exist; profiles.id is canonical'; 
    END IF; 
END $$;

-- ============================================================ --
-- END BAARO-FND-004B FIXED
-- ============================================================ --
