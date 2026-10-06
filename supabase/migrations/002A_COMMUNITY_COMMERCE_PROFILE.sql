-- ============================================================
-- BAARO FOUNDATION 002: COMMUNITY_COMMERCE_PROFILE
-- UNIQUE FOUNDATION ID: BAARO-FND-002
-- Apply in order: BAARO-FND-001 -> 002 -> 003 -> 004
-- Target: fresh/empty Supabase database.
-- This block is part of the four-block canonical foundation.
-- ============================================================

-- BAARO migration 020 : shops + delivery
-- Ce bloc remplace les anciennes migrations 001–019 dans la fondation BAARO.
-- Idempotent partiel (IF NOT EXISTS où possible)
-- ============================================

-- Boutiques
create table if not exists public.shops (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  description text,
  category text,
  country text not null,
  city text,
  latitude double precision,
  longitude double precision,
  logo_url text,
  is_active boolean not null default false,
  subscription_expires_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.shop_products (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  name text not null,
  description text,
  price numeric(12,2) not null,
  currency text not null default 'XOF',
  type text not null default 'produit' check (type in ('produit', 'service')),
  image_url text,
  is_available boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.shop_subscriptions (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  amount numeric(12,2) not null,
  currency text not null,
  was_premium_rate boolean not null,
  provider text not null check (provider in ('stripe', 'paypal', 'cinetpay', 'paydunya')),
  payment_ref text unique,
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'failed')),
  period_start timestamptz,
  period_end timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.shop_pricing (
  currency text primary key,
  amount_normal numeric(12,2) not null,
  amount_premium numeric(12,2) not null,
  updated_at timestamptz not null default now()
);

insert into public.shop_pricing (currency, amount_normal, amount_premium) values
  ('XOF', 5000, 2500),
  ('EUR', 8, 4),
  ('USD', 9, 4.5)
on conflict (currency) do nothing;

create index if not exists idx_shops_country_city on public.shops(country, city) where is_active;
create index if not exists idx_shop_products_shop on public.shop_products(shop_id);

alter table public.shops enable row level security;
alter table public.shop_products enable row level security;
alter table public.shop_subscriptions enable row level security;
alter table public.shop_pricing enable row level security;

-- Policies (drop + recreate pour idempotence soft)
drop policy if exists "shops_select" on public.shops;
create policy "shops_select" on public.shops
  for select using (is_active = true or owner_id = auth.uid());

drop policy if exists "shops_insert_owner" on public.shops;
create policy "shops_insert_owner" on public.shops
  for insert with check (owner_id = auth.uid());

drop policy if exists "shops_update_owner" on public.shops;
create policy "shops_update_owner" on public.shops
  for update using (owner_id = auth.uid());

drop policy if exists "products_select" on public.shop_products;
create policy "products_select" on public.shop_products
  for select using (
    exists (
      select 1 from public.shops
      where id = shop_products.shop_id and (is_active or owner_id = auth.uid())
    )
  );

drop policy if exists "products_write_owner" on public.shop_products;
create policy "products_write_owner" on public.shop_products
  for all using (
    exists (
      select 1 from public.shops
      where id = shop_products.shop_id and owner_id = auth.uid()
    )
  );

drop policy if exists "subscriptions_select_owner" on public.shop_subscriptions;
create policy "subscriptions_select_owner" on public.shop_subscriptions
  for select using (
    exists (
      select 1 from public.shops
      where id = shop_subscriptions.shop_id and owner_id = auth.uid()
    )
  );

-- Insert subscription : owner only
drop policy if exists "subscriptions_insert_owner" on public.shop_subscriptions;
create policy "subscriptions_insert_owner" on public.shop_subscriptions
  for insert with check (
    exists (
      select 1 from public.shops
      where id = shop_subscriptions.shop_id and owner_id = auth.uid()
    )
  );

drop policy if exists "pricing_select_public" on public.shop_pricing;
create policy "pricing_select_public" on public.shop_pricing
  for select using (true);

-- Activation (service_role only)
create or replace function public.activate_shop_subscription(
  p_shop_id uuid,
  p_payment_ref text,
  p_amount numeric,
  p_currency text,
  p_provider text,
  p_was_premium boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.shop_subscriptions
  set status = 'confirmed',
      period_start = now(),
      period_end = now() + interval '1 year'
  where payment_ref = p_payment_ref
    and status = 'pending';

  update public.shops
  set is_active = true,
      subscription_expires_at = now() + interval '1 year'
  where id = p_shop_id;
end;
$$;

revoke all on function public.activate_shop_subscription(uuid, text, numeric, text, text, boolean) from public, anon, authenticated;
grant execute on function public.activate_shop_subscription(uuid, text, numeric, text, text, boolean) to service_role;

-- Delivery (dépend de shops / shop_products)
create table if not exists public.delivery_orders (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  buyer_id uuid not null references public.profiles(id) on delete cascade,
  shop_product_id uuid references public.shop_products(id) on delete set null,
  method text not null check (method in ('pickup', 'courier', 'drone')),
  provider text not null default 'mock',
  dropoff_lat double precision,
  dropoff_lng double precision,
  dropoff_address text,
  status text not null default 'pending' check (
    status in ('pending', 'dispatched', 'in_transit', 'delivered', 'cancelled', 'failed')
  ),
  current_lat double precision,
  current_lng double precision,
  estimated_delivery_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_delivery_orders_buyer on public.delivery_orders(buyer_id, created_at desc);
create index if not exists idx_delivery_orders_shop on public.delivery_orders(shop_id, created_at desc);

alter table public.delivery_orders enable row level security;

drop policy if exists "delivery_select_buyer_or_shop_owner" on public.delivery_orders;
create policy "delivery_select_buyer_or_shop_owner" on public.delivery_orders
  for select using (
    buyer_id = auth.uid()
    or exists (select 1 from public.shops where id = delivery_orders.shop_id and owner_id = auth.uid())
  );

drop policy if exists "delivery_insert_buyer" on public.delivery_orders;
create policy "delivery_insert_buyer" on public.delivery_orders
  for insert with check (buyer_id = auth.uid());

drop policy if exists "delivery_update_shop_owner" on public.delivery_orders;
create policy "delivery_update_shop_owner" on public.delivery_orders
  for update using (
    exists (select 1 from public.shops where id = delivery_orders.shop_id and owner_id = auth.uid())
  );


-- ============================================================

-- ============================================================
-- FOUNDATION COMPATIBILITY: POST POLLS
-- Feed code and existing RPCs expect these canonical objects.
-- ============================================================

create table if not exists public.polls (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  question text not null check (char_length(trim(question)) between 1 and 500),
  created_at timestamptz not null default now(),
  unique(post_id)
);

create table if not exists public.poll_options (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references public.polls(id) on delete cascade,
  option_text text not null check (char_length(trim(option_text)) between 1 and 300),
  position integer not null check (position >= 0),
  created_at timestamptz not null default now(),
  unique(poll_id, position)
);

create table if not exists public.poll_votes (
  poll_id uuid not null references public.polls(id) on delete cascade,
  option_id uuid not null references public.poll_options(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  post_id uuid not null references public.posts(id) on delete cascade,
  option_index integer not null default 0,
  created_at timestamptz not null default now(),
  primary key (poll_id, user_id)
);

create index if not exists idx_poll_options_poll_position
  on public.poll_options(poll_id, position);

create index if not exists idx_poll_votes_poll
  on public.poll_votes(poll_id, created_at desc);

alter table public.polls enable row level security;
alter table public.poll_options enable row level security;
alter table public.poll_votes enable row level security;

drop policy if exists polls_read on public.polls;
create policy polls_read on public.polls
for select using (true);

drop policy if exists polls_insert_own_post on public.polls;
create policy polls_insert_own_post on public.polls
for insert to authenticated
with check (
  exists (select 1 from public.posts p where p.id = post_id and p.author_id = auth.uid())
);

drop policy if exists poll_options_read on public.poll_options;
create policy poll_options_read on public.poll_options
for select using (true);

drop policy if exists poll_options_insert_own_poll on public.poll_options;
create policy poll_options_insert_own_poll on public.poll_options
for insert to authenticated
with check (
  exists (
    select 1
    from public.polls p
    join public.posts po on po.id = p.post_id
    where p.id = poll_id and po.author_id = auth.uid()
  )
);

drop policy if exists poll_votes_read_own on public.poll_votes;
create policy poll_votes_read_own on public.poll_votes
for select to authenticated
using (auth.uid() = user_id);

drop policy if exists poll_votes_insert_own on public.poll_votes;
create policy poll_votes_insert_own on public.poll_votes
for insert to authenticated
with check (auth.uid() = user_id);

drop policy if exists poll_votes_delete_own on public.poll_votes;
create policy poll_votes_delete_own on public.poll_votes
for delete to authenticated
using (auth.uid() = user_id);

create or replace view public.poll_results as
select
  po.poll_id,
  po.id as option_id,
  po.option_text,
  po.position,
  count(pv.id)::bigint as vote_count
from public.poll_options po
left join public.poll_votes pv
  on pv.option_id = po.id
group by po.poll_id, po.id, po.option_text, po.position;


-- SOURCE: 0054_fix_social_interactions.sql
-- ============================================================
-- ============================================================
-- BAARO — Correction des interactions sociales (Feed & Sondages)
-- Fichier : 053_fix_social_interactions.sql
-- Date : 26 septembre 2026
-- 
-- Objectif : Aligner les fonctions SQL avec le schéma réel 
-- (user_id au lieu de id, display_name au lieu de full_name, 
-- et éviter les UPDATE sur les vues).
-- ============================================================

-- 1. Corriger vote_poll (ne pas UPDATE la vue poll_results, le COUNT est automatique)
CREATE OR REPLACE FUNCTION public.vote_poll(p_poll_id uuid, p_option_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
DECLARE
  v_post_id uuid;
  v_user_id uuid;
  v_option_index integer;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'User not authenticated'; END IF;
  
  SELECT p.post_id, po.position INTO v_post_id, v_option_index
  FROM polls p
  JOIN poll_options po ON po.poll_id = p.id AND po.id = p_option_id
  WHERE p.id = p_poll_id;
  
  IF v_post_id IS NULL THEN RAISE EXCEPTION 'Poll or option not found'; END IF;
  
  DELETE FROM public.poll_votes WHERE poll_id = p_poll_id AND user_id = v_user_id;
  
  INSERT INTO public.poll_votes (poll_id, option_id, user_id, post_id, option_index)
  VALUES (p_poll_id, p_option_id, v_user_id, v_post_id, v_option_index);
END;
$function$;

-- 2. Corriger notify_on_poll_vote (utiliser user_id et display_name)
CREATE OR REPLACE FUNCTION public.notify_on_poll_vote()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
DECLARE
  v_post_id UUID;
  v_post_author UUID;
  v_actor_name TEXT;
  v_question TEXT;
BEGIN
  SELECT post_id INTO v_post_id FROM public.polls WHERE id = NEW.poll_id;
  SELECT author_id INTO v_post_author FROM public.posts WHERE id = v_post_id;
  SELECT question INTO v_question FROM public.polls WHERE id = NEW.poll_id;
  
  SELECT COALESCE(display_name, handle, 'Quelqu''un') INTO v_actor_name
    FROM public.profiles WHERE id = NEW.user_id;

  PERFORM public.create_notification(
    v_post_author, NEW.user_id, 'poll_vote',
    v_actor_name || ' a voté à votre sondage : ' || LEFT(v_question, 50),
    v_post_id
  );
  RETURN NEW;
END;
$function$;

-- 3. Corriger create_notification (utiliser notification_id et user_id)
CREATE OR REPLACE FUNCTION public.create_notification(
  p_target_id uuid, p_actor_id uuid, p_type text, p_message text, p_source_id uuid DEFAULT NULL::uuid
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
BEGIN
  IF p_target_id = p_actor_id THEN RETURN; END IF;
  
  IF p_source_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.notifications
    WHERE user_id = p_target_id AND type = p_type AND source_id = p_source_id
    AND created_at > NOW() - INTERVAL '5 minutes'
  ) THEN RETURN; END IF;

  INSERT INTO public.notifications (notification_id, user_id, actor_id, type, message, source_id, read, created_at)
  VALUES (gen_random_uuid(), p_target_id, p_actor_id, p_type, p_message, p_source_id, false, NOW());
END;
$function$;

-- 4. Corriger notify_on_comment (utiliser display_name)
CREATE OR REPLACE FUNCTION public.notify_on_comment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
DECLARE
  v_post_author UUID;
  v_actor_name TEXT;
BEGIN
  SELECT author_id INTO v_post_author FROM public.posts WHERE id = NEW.post_id;
  
  SELECT COALESCE(display_name, handle, 'Quelqu''un') INTO v_actor_name
    FROM public.profiles WHERE id = NEW.author_id;

  PERFORM public.create_notification(
    v_post_author, NEW.author_id, 'comment',
    v_actor_name || ' a commenté votre publication', NEW.post_id
  );
  RETURN NEW;
END;
$function$;

-- 5. Corriger get_poll_voters (joindre sur user_id, pas id)
CREATE OR REPLACE FUNCTION public.get_poll_voters(p_poll_id uuid)
RETURNS TABLE(option_id uuid, option_text text, voters jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.poll_votes WHERE poll_id = p_poll_id AND user_id = auth.uid()
  ) AND NOT EXISTS (
    SELECT 1 FROM public.polls p
    JOIN public.posts po ON po.id = p.post_id
    WHERE p.id = p_poll_id AND po.author_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'ACCESS_DENIED';
  END IF;

  RETURN QUERY
  SELECT 
    po.id AS option_id,
    po.option_text,
    COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'id', pv.user_id,
          'display_name', COALESCE(pr.display_name, pr.handle, 'Membre'),
          'avatar_url', pr.avatar_url,
          'handle', pr.handle
        )
        ORDER BY pv.created_at DESC
      ) FILTER (WHERE pv.id IS NOT NULL),
      '[]'::jsonb
    ) AS voters
  FROM public.poll_options po
  LEFT JOIN public.poll_votes pv ON po.id = pv.option_id
  LEFT JOIN public.profiles pr ON pv.user_id = pr.id
  WHERE po.poll_id = p_poll_id
  GROUP BY po.id, po.option_text, po.position
  ORDER BY po.position;
END;
$function$;


-- ============================================================
-- SOURCE: 0055_follows_status.sql
-- ============================================================
-- BAARO — Colonnes amis + RLS follows (obligatoire pour FriendRequestButton)
alter table public.follows
  add column if not exists status text not null default 'accepted';
alter table public.follows
  add column if not exists is_friend boolean not null default false;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'follows_follower_followed_unique'
  ) then
    alter table public.follows
      add constraint follows_follower_followed_unique
      unique (follower_id, followed_id);
  end if;
exception when others then
  raise notice 'Unique follows déjà présent ou doublons à nettoyer';
end $$;

alter table public.follows enable row level security;

drop policy if exists follows_select on public.follows;
drop policy if exists "follows_read" on public.follows;
create policy follows_select on public.follows
  for select using (
    auth.uid() is not null
    and (follower_id = auth.uid() or followed_id = auth.uid())
  );

drop policy if exists follows_insert_own on public.follows;
drop policy if exists "follows_own" on public.follows;

drop policy if exists follows_update_own on public.follows;
drop policy if exists "follows_update_own" on public.follows;

drop policy if exists follows_delete_own on public.follows;
drop policy if exists "follows_delete_own" on public.follows;


-- ============================================================
-- SOURCE: 0056_add_contacts.sql
-- ============================================================
-- Onglet "Contact" (Communauté) — v2, performance + fiabilité du matching.
-- Remplace l'approche "une colonne phone_hash/email_hash" par une table dédiée
-- contact_hashes : chaque personne peut avoir PLUSIEURS hachages (variantes de
-- formatage du même numéro : +223 70..., 22370..., 070..., 70...) sans qu'on
-- ait besoin de deviner un indicatif pays. Ça augmente nettement le taux de
-- correspondance avec un vrai répertoire de téléphone, pour un coût quasi nul
-- (quelques lignes de plus par utilisateur, PK sur le hash = recherche O(1)).

-- Nettoyage si vous aviez déjà exécuté l'ancienne version (v1) de ce fichier :
drop index if exists public.profiles_phone_hash_idx;
drop index if exists public.profiles_email_hash_idx;
alter table public.profiles drop column if exists phone_hash;
alter table public.profiles drop column if exists email_hash;

-- Le numéro en clair n'est gardé QUE pour l'affichage à son propriétaire dans
-- ses propres réglages — jamais exposé aux autres.
alter table public.profiles add column if not exists phone text;

create table if not exists public.contact_hashes (
  hash text primary key,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('phone', 'email')),
  created_at timestamptz not null default now()
);

create index if not exists contact_hashes_profile_idx on public.contact_hashes (profile_id);

alter table public.contact_hashes enable row level security;

drop policy if exists "contact_hashes_manage_own" on public.contact_hashes;
create policy "contact_hashes_manage_own"
  on public.contact_hashes for all
  using (auth.uid() = profile_id)
  with check (auth.uid() = profile_id);

drop policy if exists "profiles_update_own_contact_fields" on public.profiles;
create policy "profiles_update_own_contact_fields"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Fonction serveur : reçoit une liste de hachages (déjà calculés côté client,
-- variantes comprises) et renvoie les profils publics qui correspondent, avec
-- le hachage qui a matché (matched_hash) — ça permet au client de relier le
-- résultat au contact précis de son répertoire, pour ensuite proposer
-- d'inviter ceux qui n'ont pas matché. Jamais de numéro/e-mail en clair ni de
-- hachage de tiers renvoyé au-delà de ce qui matche la requête.
create or replace function public.find_users_by_contact_hashes(hashes text[])
returns table (
  id uuid,
  display_name text,
  handle text,
  avatar_url text,
  flag text,
  matched_via text,
  matched_hash text
)
language sql
security definer
set search_path = public
as $$
  select p.id, p.display_name, p.handle, p.avatar_url, p.flag,
         ch.kind as matched_via, ch.hash as matched_hash
  from public.contact_hashes ch
  join public.profiles p on p.id = ch.profile_id
  where ch.hash = any(hashes)
    and p.id <> auth.uid();
$$;

grant execute on function public.find_users_by_contact_hashes(text[]) to authenticated, anon;

-- Si votre table `follows` n'a pas déjà de contrainte unique (follower_id, followed_id),
-- décommentez la ligne suivante — elle évite les doublons de demandes d'ami/abonnement :
-- alter table public.follows add constraint follows_unique_pair unique (follower_id, followed_id);


-- ============================================================
-- SOURCE: 0057_innovation_platform_foundation.sql
-- ============================================================
-- BAARO Innovation Foundation
-- Supabase stores metadata/state. Binary media remains on Cloudflare R2.

create extension if not exists pgcrypto;

create table if not exists public.user_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  language text default 'fr',
  country text,
  city text,
  interests jsonb not null default '[]'::jsonb,
  notification_settings jsonb not null default '{}'::jsonb,
  discovery_settings jsonb not null default '{}'::jsonb,
  privacy_settings jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.content_bookmarks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  content_type text not null,
  content_id uuid not null,
  collection text,
  created_at timestamptz not null default now(),
  unique(user_id, content_type, content_id)
);

create table if not exists public.saved_searches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  query text not null,
  filters jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.creator_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  category text,
  bio text,
  verified boolean not null default false,
  subscriber_count bigint not null default 0,
  support_enabled boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.creator_subscriptions (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references auth.users(id) on delete cascade,
  subscriber_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'active' check (status in ('active','paused','cancelled')),
  tier text not null default 'free',
  created_at timestamptz not null default now(),
  unique(creator_id, subscriber_id)
);

create table if not exists public.learning_courses (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid references auth.users(id) on delete set null,
  title text not null,
  description text,
  language text default 'fr',
  level text,
  category text,
  cover_media_key text,
  published boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.learning_progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  course_id uuid not null references public.learning_courses(id) on delete cascade,
  progress numeric not null default 0 check (progress >= 0 and progress <= 100),
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key(user_id, course_id)
);

create table if not exists public.job_listings (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id) on delete set null,
  title text not null,
  description text,
  company_name text,
  location text,
  remote boolean not null default false,
  skills text[] not null default '{}',
  status text not null default 'open' check (status in ('draft','open','closed','filled')),
  created_at timestamptz not null default now(),
  expires_at timestamptz
);

create table if not exists public.service_listings (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id) on delete set null,
  title text not null,
  description text,
  category text,
  location text,
  price numeric,
  currency text default 'XOF',
  status text not null default 'active' check (status in ('draft','active','paused','closed')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.community_events (
  id uuid primary key default gen_random_uuid(),
  organizer_id uuid references auth.users(id) on delete set null,
  title text not null,
  description text,
  location text,
  starts_at timestamptz not null,
  ends_at timestamptz,
  online_url text,
  cover_media_key text,
  capacity integer,
  status text not null default 'published' check (status in ('draft','published','cancelled','finished')),
  created_at timestamptz not null default now()
);

create table if not exists public.event_attendees (
  event_id uuid not null references public.community_events(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'going' check (status in ('going','interested','cancelled')),
  created_at timestamptz not null default now(),
  primary key(event_id, user_id)
);

create table if not exists public.user_blocks (
  blocker_id uuid not null references auth.users(id) on delete cascade,
  blocked_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(blocker_id, blocked_id),
  check(blocker_id <> blocked_id)
);

create table if not exists public.safety_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users(id) on delete cascade,
  target_type text not null,
  target_id uuid not null,
  reason text not null,
  details text,
  status text not null default 'open' check (status in ('open','reviewing','resolved','dismissed')),
  created_at timestamptz not null default now()
);

create table if not exists public.reputation_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null,
  score integer not null default 0,
  reference_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_bookmarks_user_created on public.content_bookmarks(user_id, created_at desc);
create index if not exists idx_jobs_status_created on public.job_listings(status, created_at desc);
create index if not exists idx_services_status_created on public.service_listings(status, created_at desc);
create index if not exists idx_events_start on public.community_events(starts_at);
create index if not exists idx_reports_status_created on public.safety_reports(status, created_at desc);
create index if not exists idx_reputation_user_created on public.reputation_events(user_id, created_at desc);

alter table public.user_preferences enable row level security;
alter table public.content_bookmarks enable row level security;
alter table public.saved_searches enable row level security;
alter table public.creator_profiles enable row level security;
alter table public.creator_subscriptions enable row level security;
alter table public.learning_courses enable row level security;
alter table public.learning_progress enable row level security;
alter table public.job_listings enable row level security;
alter table public.service_listings enable row level security;
alter table public.community_events enable row level security;
alter table public.event_attendees enable row level security;
alter table public.user_blocks enable row level security;
alter table public.safety_reports enable row level security;
alter table public.reputation_events enable row level security;

-- User-owned data
create policy innovation_preferences_owner on public.user_preferences for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy innovation_bookmarks_owner on public.content_bookmarks for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy innovation_searches_owner on public.saved_searches for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy innovation_progress_owner on public.learning_progress for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy innovation_subscriptions_owner on public.creator_subscriptions for all using (auth.uid() = subscriber_id or auth.uid() = creator_id) with check (auth.uid() = subscriber_id or auth.uid() = creator_id);
create policy innovation_blocks_owner on public.user_blocks for all using (auth.uid() = blocker_id) with check (auth.uid() = blocker_id);
create policy innovation_reports_owner on public.safety_reports for insert with check (auth.uid() = reporter_id);
create policy innovation_reports_read_owner on public.safety_reports for select using (auth.uid() = reporter_id);

-- Public/discoverable records
create policy innovation_creator_public on public.creator_profiles for select using (true);
create policy innovation_creator_owner on public.creator_profiles for insert with check (auth.uid() = user_id);
create policy innovation_creator_update on public.creator_profiles for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy innovation_courses_public on public.learning_courses for select using (published = true or auth.uid() = creator_id);
create policy innovation_courses_owner on public.learning_courses for all using (auth.uid() = creator_id) with check (auth.uid() = creator_id);
create policy innovation_jobs_public on public.job_listings for select using (status = 'open' or auth.uid() = owner_id);
create policy innovation_jobs_owner on public.job_listings for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
create policy innovation_services_public on public.service_listings for select using (status = 'active' or auth.uid() = owner_id);
create policy innovation_services_owner on public.service_listings for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
create policy innovation_events_public on public.community_events for select using (status in ('published','finished') or auth.uid() = organizer_id);
create policy innovation_events_owner on public.community_events for all using (auth.uid() = organizer_id) with check (auth.uid() = organizer_id);
create policy innovation_attendees_owner on public.event_attendees for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy innovation_attendees_organizer_read on public.event_attendees for select using (exists (select 1 from public.community_events e where e.id = event_id and e.organizer_id = auth.uid()));
create policy innovation_reputation_public on public.reputation_events for select using (true);


-- ============================================================
-- SOURCE: 0058_video_module_global_fix.sql
-- ============================================================
-- ============================================================
-- BAARO — Correction globale du module vidéo
-- Fichier : 052_video_module_global_fix.sql
-- Date : 26 septembre 2026
-- 
-- Objectif :
--   1. Supprimer le trigger bloquant qui empêchait les compteurs de se mettre à jour
--   2. Corriger la fonction de comptage des vues (support des invités/anonymes)
--   3. Créer des triggers propres pour likes et commentaires
--   4. Recalculer les compteurs existants
--   5. S'assurer que les politiques RLS sont correctes
-- ============================================================

-- ============================================================
-- ÉTAPE 1 : NETTOYAGE DES TRIGGERS BLOQUANTS
-- ============================================================

-- Suppression du trigger qui bloquait toutes les mises à jour de la table videos
DROP TRIGGER IF EXISTS trg_protect_video_counters ON public.videos;
DROP FUNCTION IF EXISTS public.protect_video_counters();

-- Suppression des anciens triggers en doublon (nettoyage)
DROP TRIGGER IF EXISTS trg_video_comments_count ON public.video_comments;
DROP TRIGGER IF EXISTS trg_video_likes_count ON public.video_likes;
DROP TRIGGER IF EXISTS trg_baaro_video_comment_count ON public.video_comments;
DROP TRIGGER IF EXISTS trg_baaro_video_like_count ON public.video_likes;

-- Suppression des anciennes fonctions obsolètes
DROP FUNCTION IF EXISTS public.update_video_comments_count_trigger();
DROP FUNCTION IF EXISTS public.update_video_likes_count_trigger();
DROP FUNCTION IF EXISTS public.baaro_video_comment_count();
DROP FUNCTION IF EXISTS public.baaro_video_like_count();


-- ============================================================
-- ÉTAPE 2 : CORRECTION DE LA FONCTION DE VUES (SUPPORT INVITÉS)
-- ============================================================

-- Suppression forcée de l'ancienne fonction pour éviter l'erreur 42P13
DROP FUNCTION IF EXISTS public.register_video_view(uuid);

CREATE OR REPLACE FUNCTION public.register_video_view(p_video_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  -- Si l'utilisateur est anonyme (guest), on utilise un UUID générique pour éviter le crash
  uid uuid := coalesce(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid);
  inserted boolean := false;
  new_views integer := 0;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.videos WHERE id = p_video_id) THEN
    RAISE EXCEPTION 'VIDEO_NOT_FOUND';
  END IF;

  -- Insertion idempotente : une seule vue comptée par jour par utilisateur (ou UUID générique)
  INSERT INTO public.video_views(video_id, viewer_id, view_date)
  VALUES (p_video_id, uid, current_date)
  ON CONFLICT DO NOTHING;

  inserted := FOUND;
  
  IF inserted THEN
    UPDATE public.videos
      SET views = coalesce(views, 0) + 1
      WHERE id = p_video_id
      RETURNING views INTO new_views;
  ELSE
    SELECT coalesce(views, 0) INTO new_views FROM public.videos WHERE id = p_video_id;
  END IF;

  RETURN jsonb_build_object('counted', inserted, 'views', new_views);
END;
$$;

-- Autoriser les utilisateurs authentifiés ET anonymes (anon) à appeler cette fonction
REVOKE ALL ON FUNCTION public.register_video_view(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.register_video_view(uuid) TO authenticated, anon;


-- ============================================================
-- ÉTAPE 3 : TRIGGER POUR LES COMMENTAIRES
-- ============================================================

CREATE OR REPLACE FUNCTION public.update_video_comments_count()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.videos 
    SET comments_count = COALESCE(comments_count, 0) + 1
    WHERE id = NEW.video_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.videos 
    SET comments_count = GREATEST(COALESCE(comments_count, 0) - 1, 0)
    WHERE id = OLD.video_id;
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_video_comments_count
AFTER INSERT OR DELETE ON public.video_comments
FOR EACH ROW EXECUTE FUNCTION public.update_video_comments_count();


-- ============================================================
-- ÉTAPE 4 : TRIGGER POUR LES LIKES
-- ============================================================

CREATE OR REPLACE FUNCTION public.update_video_likes_count()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.videos 
    SET likes = COALESCE(likes, 0) + 1
    WHERE id = NEW.video_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.videos 
    SET likes = GREATEST(COALESCE(likes, 0) - 1, 0)
    WHERE id = OLD.video_id;
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_video_likes_count
AFTER INSERT OR DELETE ON public.video_likes
FOR EACH ROW EXECUTE FUNCTION public.update_video_likes_count();
