


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pg_trgm" WITH SCHEMA "public";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE OR REPLACE FUNCTION "public"."accept_friend_request"("p_follow_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
    v_user uuid := auth.uid();
    v_follower uuid;
BEGIN
    SELECT follower_id
    INTO v_follower
    FROM public.follows
    WHERE id = p_follow_id
      AND followed_id = v_user
      AND status = 'pending'
      AND is_friend = true
    FOR UPDATE;

    IF v_follower IS NULL THEN
        RAISE EXCEPTION 'FRIEND_REQUEST_NOT_FOUND';
    END IF;

    UPDATE public.follows
    SET
        status = 'accepted',
        is_friend = true
    WHERE id = p_follow_id;

    -- Crée également la relation inverse.
    INSERT INTO public.follows (
        follower_id,
        followed_id,
        status,
        is_friend
    )
    VALUES (
        v_user,
        v_follower,
        'accepted',
        true
    )
    ON CONFLICT (follower_id, followed_id)
    DO UPDATE SET
        status = 'accepted',
        is_friend = true;

    RETURN true;
END;
$$;


ALTER FUNCTION "public"."accept_friend_request"("p_follow_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."activate_shop_subscription"("p_shop_id" "uuid", "p_payment_ref" "text", "p_amount" numeric, "p_currency" "text", "p_provider" "text", "p_was_premium" boolean) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  update public.shop_subscriptions
  set status = 'confirmed',
      period_start = now(),
      period_end = now() + interval '1 year'
  where payment_ref = p_payment_ref and status = 'pending';

  update public.shops
  set is_active = true,
      subscription_status = 'active',
      subscription_expires_at = now() + interval '1 year'
  where id = p_shop_id;
end;
$$;


ALTER FUNCTION "public"."activate_shop_subscription"("p_shop_id" "uuid", "p_payment_ref" "text", "p_amount" numeric, "p_currency" "text", "p_provider" "text", "p_was_premium" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."add_to_cart"("p_item_id" "uuid", "p_quantity" integer, "p_user_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if p_user_id is distinct from auth.uid() then
    raise exception 'Non autorisé';
  end if;
  if p_quantity is null or p_quantity < 1 then
    raise exception 'Quantité invalide';
  end if;

  insert into public.cart (user_id, item_id, quantity)
  values (p_user_id, p_item_id, p_quantity)
  on conflict (user_id, item_id)
  do update set quantity = public.cart.quantity + excluded.quantity;
end;
$$;


ALTER FUNCTION "public"."add_to_cart"("p_item_id" "uuid", "p_quantity" integer, "p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."award_creator_points"("p_user_id" "uuid", "p_source" "text", "p_points" bigint, "p_reference_id" "uuid" DEFAULT NULL::"uuid", "p_idempotency_key" "text" DEFAULT NULL::"text", "p_metadata" "jsonb" DEFAULT '{}'::"jsonb") RETURNS bigint
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$ 
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


ALTER FUNCTION "public"."award_creator_points"("p_user_id" "uuid", "p_source" "text", "p_points" bigint, "p_reference_id" "uuid", "p_idempotency_key" "text", "p_metadata" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."baaro_sync_post_comment_count"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  target_post_id uuid;
begin
  target_post_id := case when tg_op = 'DELETE' then old.post_id else new.post_id end;

  update public.posts p
  set comments_count = (
    select count(*)::int from public.comments c where c.post_id = target_post_id
  )
  where p.id = target_post_id;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;


ALTER FUNCTION "public"."baaro_sync_post_comment_count"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."baaro_sync_post_like_count"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  target_post_id uuid;
begin
  target_post_id := case when tg_op = 'DELETE' then old.post_id else new.post_id end;

  update public.posts
  set likes_count = (
    select count(*)::int from public.post_likes where post_id = target_post_id
  )
  where id = target_post_id;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;


ALTER FUNCTION "public"."baaro_sync_post_like_count"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."baaro_sync_video_comment_count"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  target_video_id uuid;
begin
  target_video_id :=
    case
      when tg_op = 'DELETE' then old.video_id
      else new.video_id
    end;

  update public.videos v
  set comments_count = (
    select count(*)
    from public.video_comments c
    where c.video_id = target_video_id
  )
  where v.id = target_video_id;

  return case
    when tg_op = 'DELETE' then old
    else new
  end;
end;
$$;


ALTER FUNCTION "public"."baaro_sync_video_comment_count"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ban_community_member"("p_group" "uuid", "p_user" "uuid", "p_reason" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_actor text := public.group_role(p_group);
  v_target text;
begin
  if auth.uid() is null then raise exception 'Non authentifié'; end if;
  if p_user = auth.uid() then raise exception 'Action impossible sur soi-même'; end if;

  select case when g.owner_id = p_user then 'owner' else gm.role end
  into v_target
  from public.groups g
  left join public.group_members gm
    on gm.group_id = g.id and gm.user_id = p_user
  where g.id = p_group;

  if public.role_rank(v_actor) < 1
     or public.role_rank(v_actor) <= public.role_rank(v_target) then
    raise exception 'Droits insuffisants';
  end if;

  insert into public.group_bans (group_id, user_id, banned_by, reason)
  values (p_group, p_user, auth.uid(), left(p_reason, 300))
  on conflict do nothing;

  delete from public.group_members
  where group_id = p_group and user_id = p_user;
end $$;


ALTER FUNCTION "public"."ban_community_member"("p_group" "uuid", "p_user" "uuid", "p_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_post_in_channel"("p_channel" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1
    from public.channels c
    where c.id = p_channel
      and public.group_role(c.group_id) is not null
      and not public.is_banned(c.group_id, auth.uid())
      and (
        c.type in ('text', 'voice')
        or public.group_role(c.group_id) in ('owner', 'admin', 'moderator')
      )
  );
$$;


ALTER FUNCTION "public"."can_post_in_channel"("p_channel" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_see_group"("p_group" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1 from public.groups g
    where g.id = p_group and coalesce(g.is_public, true)
  ) or public.group_role(p_group) is not null;
$$;


ALTER FUNCTION "public"."can_see_group"("p_group" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."channel_group"("p_channel" "uuid") RETURNS "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select group_id from public.channels where id = p_channel;
$$;


ALTER FUNCTION "public"."channel_group"("p_channel" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."checkout_cart"("p_method" "text" DEFAULT 'pickup'::"text", "p_notes" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_uid uuid := auth.uid();
  v_order uuid;
  v_count integer := 0;
  r record;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if p_method not in ('pickup','delivery') then raise exception 'INVALID_METHOD'; end if;
  if not exists (select 1 from cart where user_id = v_uid) then raise exception 'CART_EMPTY'; end if;

  if exists (
    select 1 from cart c join shop_products p on p.id = c.item_id
    where c.user_id = v_uid and p.type = 'produit'
      and p.stock is not null and p.stock < c.quantity
  ) then raise exception 'OUT_OF_STOCK'; end if;

  for r in
    select p.shop_id, p.currency
    from cart c
    join shop_products p on p.id = c.item_id and p.is_available
    join shops s on s.id = p.shop_id
    where c.user_id = v_uid
      and public.shop_is_live(s.is_active, s.subscription_status, s.trial_ends_at, s.subscription_expires_at)
    group by p.shop_id, p.currency
  loop
    insert into orders (shop_id, buyer_id, method, status, total_amount, currency, notes)
    values (r.shop_id, v_uid, p_method, 'pending', 0, r.currency, p_notes)
    returning id into v_order;

    insert into order_items (order_id, product_id, name, quantity, unit_price, currency)
    select v_order, p.id, p.name, c.quantity, p.price, p.currency
    from cart c join shop_products p on p.id = c.item_id
    where c.user_id = v_uid and p.shop_id = r.shop_id
      and p.currency = r.currency and p.is_available;

    update orders
    set total_amount = (select coalesce(sum(quantity * unit_price), 0)
                        from order_items where order_id = v_order)
    where id = v_order;

    v_count := v_count + 1;
  end loop;

  if v_count = 0 then raise exception 'NOTHING_TO_ORDER'; end if;

  update shop_products p
  set stock = p.stock - c.quantity
  from cart c
  where c.item_id = p.id and c.user_id = v_uid
    and p.type = 'produit' and p.stock is not null;

  delete from cart where user_id = v_uid;

  return jsonb_build_object('orders', v_count);
end;
$$;


ALTER FUNCTION "public"."checkout_cart"("p_method" "text", "p_notes" "text") OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."media_jobs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "asset_id" "uuid",
    "video_id" "uuid",
    "owner_id" "uuid" NOT NULL,
    "job_type" "text" NOT NULL,
    "status" "text" DEFAULT 'queued'::"text" NOT NULL,
    "attempts" integer DEFAULT 0 NOT NULL,
    "max_attempts" integer DEFAULT 5 NOT NULL,
    "priority" integer DEFAULT 50 NOT NULL,
    "payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "result" "jsonb",
    "error" "text",
    "available_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "locked_at" timestamp with time zone,
    "locked_by" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "file_size" bigint,
    CONSTRAINT "media_jobs_job_type_check" CHECK (("job_type" = ANY (ARRAY['transcode'::"text", 'thumbnail'::"text", 'captions'::"text", 'translate'::"text", 'dub'::"text", 'moderate'::"text", 'features'::"text", 'highlights'::"text", 'edit_plan'::"text"]))),
    CONSTRAINT "media_jobs_priority_check" CHECK ((("priority" >= 0) AND ("priority" <= 100))),
    CONSTRAINT "media_jobs_status_check" CHECK (("status" = ANY (ARRAY['queued'::"text", 'processing'::"text", 'completed'::"text", 'failed'::"text", 'dead'::"text"])))
);


ALTER TABLE "public"."media_jobs" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."claim_media_jobs"("p_limit" integer DEFAULT 5, "p_worker" "text" DEFAULT 'vercel'::"text") RETURNS SETOF "public"."media_jobs"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  return query
  with claimed as (
    update public.media_jobs
    set 
      status = 'processing',
      locked_at = now(),
      locked_by = p_worker,
      attempts = coalesce(attempts,0) + 1,
      updated_at = now()
    where id in (
      select id from public.media_jobs
      where status = 'queued' 
        and (available_at is null or available_at <= now())
      order by priority desc, created_at asc
      limit p_limit
      for update skip locked
    )
    returning *
  )
  select * from claimed;
end;
$$;


ALTER FUNCTION "public"."claim_media_jobs"("p_limit" integer, "p_worker" "text") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."push_notification_jobs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "batch_id" "text" NOT NULL,
    "user_id" "text" NOT NULL,
    "token_id" "text" NOT NULL,
    "payload" "jsonb" NOT NULL,
    "status" "text" DEFAULT 'queued'::"text" NOT NULL,
    "attempts" integer DEFAULT 0 NOT NULL,
    "max_attempts" integer DEFAULT 8 NOT NULL,
    "available_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "locked_at" timestamp with time zone,
    "claim_token" "uuid",
    "last_error" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "sent_at" timestamp with time zone,
    "cancelled_at" timestamp with time zone,
    "cancel_reason" "text",
    "dead_at" timestamp with time zone,
    CONSTRAINT "push_notification_jobs_attempts_check" CHECK (("attempts" >= 0)),
    CONSTRAINT "push_notification_jobs_max_attempts_check" CHECK (("max_attempts" > 0)),
    CONSTRAINT "push_notification_jobs_status_check" CHECK (("status" = ANY (ARRAY['queued'::"text", 'processing'::"text", 'sent'::"text", 'cancelled'::"text", 'dead'::"text"])))
);


ALTER TABLE "public"."push_notification_jobs" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."claim_push_notification_jobs"("p_limit" integer DEFAULT 40) RETURNS SETOF "public"."push_notification_jobs"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public', 'pg_temp'
    AS $$
begin
  -- Archive exhausted queued jobs and expired final leases before claiming work.
  insert into public.push_notification_dead_letters (
    source_job_id, batch_id, user_id, token_id, payload, attempts, last_error, dead_at
  )
  select
    job.id,
    job.batch_id,
    job.user_id,
    job.token_id,
    job.payload,
    job.attempts,
    coalesce(job.last_error, 'Worker lease expired after maximum attempts'),
    now()
  from public.push_notification_jobs as job
  where job.attempts >= job.max_attempts
    and (
      job.status = 'queued'
      or (job.status = 'processing' and job.locked_at < now() - interval '5 minutes')
    )
  on conflict (source_job_id) do nothing;

  update public.push_notification_jobs as job
  set status = 'dead',
      dead_at = now(),
      locked_at = null,
      claim_token = null,
      updated_at = now()
  where job.attempts >= job.max_attempts
    and (
      job.status = 'queued'
      or (job.status = 'processing' and job.locked_at < now() - interval '5 minutes')
    );

  -- Payloads may include user-authored text; keep sent and dead-letter copies
  -- only for the 30-day operational investigation window.
  delete from public.push_notification_jobs
  where status = 'sent' and sent_at < now() - interval '30 days';

  delete from public.push_notification_jobs
  where status = 'cancelled' and cancelled_at < now() - interval '30 days';

  delete from public.push_notification_jobs
  where status = 'dead' and updated_at < now() - interval '30 days';

  delete from public.push_notification_dead_letters
  where dead_at < now() - interval '30 days';

  return query
  with candidates as (
    select job.id
    from public.push_notification_jobs as job
    where job.attempts < job.max_attempts
      and (
        (job.status = 'queued' and job.available_at <= now())
        or (job.status = 'processing' and job.locked_at < now() - interval '5 minutes')
    )
    order by job.available_at, job.created_at
    limit greatest(1, least(coalesce(p_limit, 40), 100))
    for update skip locked
  ), claimed as (
    update public.push_notification_jobs as job
    set status = 'processing',
        attempts = job.attempts + 1,
        locked_at = now(),
        claim_token = gen_random_uuid(),
        updated_at = now()
    from candidates
    where job.id = candidates.id
    returning job.*
  )
  select * from claimed;
end;
$$;


ALTER FUNCTION "public"."claim_push_notification_jobs"("p_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."company_is_mine"("cid" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (select 1 from public.companies where id=cid and owner_id=auth.uid());
$$;


ALTER FUNCTION "public"."company_is_mine"("cid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."company_is_visible"("cid" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1 from public.companies c where c.id=cid and c.is_active
    and ( (c.subscription_status='active' and c.subscription_ends_at > now())
       or (c.subscription_status='trial' and c.trial_ends_at > now()) )
  );
$$;


ALTER FUNCTION "public"."company_is_visible"("cid" "uuid") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."channels" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "group_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "type" "text" DEFAULT 'text'::"text" NOT NULL,
    "description" "text",
    "topic" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "channels_type_check" CHECK (("type" = ANY (ARRAY['text'::"text", 'voice'::"text", 'announce'::"text"])))
);


ALTER TABLE "public"."channels" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_community_channel"("p_group_id" "uuid", "p_name" "text", "p_type" "text" DEFAULT 'text'::"text", "p_description" "text" DEFAULT NULL::"text") RETURNS "public"."channels"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
declare
  v_name text;
  v_type text;
  v_channel public.channels;
  v_role text := public.group_role(p_group_id);
begin
  if auth.uid() is null then
    raise exception 'Non authentifié';
  end if;

  if coalesce(v_role, '') not in ('owner', 'admin') then
    raise exception 'Seuls les admins peuvent créer un canal';
  end if;

  v_type := case
    when p_type in ('voice', 'announce') then p_type
    else 'text'
  end;

  v_name := lower(regexp_replace(trim(coalesce(p_name, '')), '\s+', '-', 'g'));
  v_name := regexp_replace(
    v_name,
    '[<>"''`&/\\?#%@:;,.!$^*()+=\[\]{}|~]',
    '',
    'g'
  );
  v_name := left(v_name, 40);

  if length(v_name) < 1 then
    raise exception 'Nom de canal invalide';
  end if;

  insert into public.channels (group_id, name, type, description)
  values (
    p_group_id,
    v_name,
    v_type,
    nullif(left(trim(coalesce(p_description, '')), 200), '')
  )
  returning * into v_channel;

  return v_channel;
end;
$_$;


ALTER FUNCTION "public"."create_community_channel"("p_group_id" "uuid", "p_name" "text", "p_type" "text", "p_description" "text") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."groups" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "owner_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "avatar_url" "text",
    "is_public" boolean DEFAULT true NOT NULL,
    "is_private" boolean DEFAULT false NOT NULL,
    "category" "text" DEFAULT 'community'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."groups" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_community_group"("p_name" "text", "p_description" "text" DEFAULT NULL::"text", "p_is_public" boolean DEFAULT true, "p_category" "text" DEFAULT 'community'::"text") RETURNS "public"."groups"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_uid uuid := auth.uid();
  v_group public.groups;
begin
  if v_uid is null then raise exception 'Non authentifié'; end if;
  if p_name is null or length(trim(p_name)) < 2 then
    raise exception 'Nom du groupe trop court';
  end if;

  insert into public.groups (name, description, owner_id, is_public, category)
  values (
    left(trim(p_name), 80),
    nullif(left(trim(coalesce(p_description, '')), 500), ''),
    v_uid,
    coalesce(p_is_public, true),
    coalesce(nullif(trim(p_category), ''), 'community')
  )
  returning * into v_group;

  insert into public.group_members (group_id, user_id, role)
  values (v_group.id, v_uid, 'owner')
  on conflict (group_id, user_id) do update set role = 'owner';

  insert into public.channels (group_id, name, type, description)
  values (v_group.id, 'general', 'text', 'Canal principal');

  return v_group;
end $$;


ALTER FUNCTION "public"."create_community_group"("p_name" "text", "p_description" "text", "p_is_public" boolean, "p_category" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_follow_notification"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.is_friend = false AND NEW.status = 'accepted' THEN
    INSERT INTO public.notifications (user_id, actor_id, type, message, source_id)
    VALUES (NEW.followed_id, NEW.follower_id, 'follow', 'a commencé à vous suivre', NEW.follower_id);
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."create_follow_notification"() OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."group_invites" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "group_id" "uuid" NOT NULL,
    "code" "text" NOT NULL,
    "created_by" "uuid" NOT NULL,
    "max_uses" integer DEFAULT 0,
    "uses" integer DEFAULT 0 NOT NULL,
    "expires_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."group_invites" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_group_invite"("p_group" "uuid", "p_max_uses" integer DEFAULT 0, "p_expires_hours" integer DEFAULT NULL::integer) RETURNS "public"."group_invites"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_uid uuid := auth.uid();
  v_code text;
  v_row public.group_invites;
begin
  if v_uid is null then
    raise exception 'Non authentifié';
  end if;

  if public.group_role(p_group) not in ('owner', 'admin') then
    raise exception 'Seuls les admins peuvent créer une invitation';
  end if;

  v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));

  insert into public.group_invites (
    group_id, code, created_by, max_uses, expires_at
  )
  values (
    p_group,
    v_code,
    v_uid,
    greatest(coalesce(p_max_uses, 0), 0),
    case
      when p_expires_hours is null or p_expires_hours <= 0 then null
      else now() + (p_expires_hours || ' hours')::interval
    end
  )
  returning * into v_row;

  return v_row;
end;
$$;


ALTER FUNCTION "public"."create_group_invite"("p_group" "uuid", "p_max_uses" integer, "p_expires_hours" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_notification"("p_target_id" "uuid", "p_actor_id" "uuid", "p_type" "text", "p_message" "text", "p_source_id" "uuid" DEFAULT NULL::"uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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
$$;


ALTER FUNCTION "public"."create_notification"("p_target_id" "uuid", "p_actor_id" "uuid", "p_type" "text", "p_message" "text", "p_source_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_order_secure"("p_shop_id" "uuid", "p_buyer_id" "uuid", "p_method" "text", "p_notes" "text", "p_dropoff_address" "text", "p_items" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_uid uuid := auth.uid();
  v_order uuid;
  v_code text;
  v_total numeric := 0;
  v_currency text;
  e jsonb;
  prod record;
  qty integer;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if p_method not in ('pickup', 'delivery') then raise exception 'INVALID_METHOD'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) = 0 then
    raise exception 'EMPTY_ORDER';
  end if;

  if not exists (
    select 1 from shops s
    where s.id = p_shop_id
      and public.shop_is_live(s.is_active, s.subscription_status, s.trial_ends_at, s.subscription_expires_at)
  ) then raise exception 'SHOP_UNAVAILABLE'; end if;

  insert into orders (shop_id, buyer_id, method, status, total_amount, currency, notes, dropoff_address)
  values (p_shop_id, v_uid, p_method, 'pending', 0, 'XOF', p_notes, p_dropoff_address)
  returning id, pickup_code into v_order, v_code;

  for e in select x from jsonb_array_elements(p_items) as x loop
    qty := greatest(1, least(100, coalesce((e->>'quantity')::int, 1)));

    select * into prod from shop_products
    where id = (e->>'product_id')::uuid and shop_id = p_shop_id
    for update;

    if not found or not prod.is_available then raise exception 'PRODUCT_UNAVAILABLE'; end if;
    if prod.type = 'produit' and prod.stock is not null and prod.stock < qty then
      raise exception 'OUT_OF_STOCK';
    end if;

    insert into order_items (order_id, product_id, name, quantity, unit_price, currency)
    values (v_order, prod.id, prod.name, qty, prod.price, prod.currency);

    if prod.type = 'produit' and prod.stock is not null then
      update shop_products set stock = stock - qty where id = prod.id;
    end if;

    v_total := v_total + prod.price * qty;
    v_currency := coalesce(v_currency, prod.currency);
  end loop;

  update orders
  set total_amount = v_total, currency = coalesce(v_currency, 'XOF')
  where id = v_order;

  return jsonb_build_object('order_id', v_order, 'pickup_code', v_code, 'total', v_total);
end;
$$;


ALTER FUNCTION "public"."create_order_secure"("p_shop_id" "uuid", "p_buyer_id" "uuid", "p_method" "text", "p_notes" "text", "p_dropoff_address" "text", "p_items" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_video_remix"("p_video_id" "uuid", "p_source_video_id" "uuid", "p_mode" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_mode not in ('remix','duet','react','quote','green_screen','reply') then raise exception 'MODE_INVALID'; end if;
  if p_video_id = p_source_video_id then raise exception 'SAME_VIDEO'; end if;
  if not exists (select 1 from public.videos where id = p_video_id and author_id = uid) then raise exception 'VIDEO_NOT_YOURS'; end if;
  if not exists (
    select 1 from public.videos s
    where s.id = p_source_video_id
      and coalesce(s.visibility,'public') = 'public'
      and (case when p_mode = 'duet' then s.allow_duet else s.allow_remix end)
      and not exists (select 1 from public.blocks b where b.blocker_id = s.author_id and b.blocked_id = uid)
  ) then raise exception 'REMIX_NOT_ALLOWED'; end if;
  insert into public.video_remixes(video_id, source_video_id, creator_id, mode)
  values (p_video_id, p_source_video_id, uid, p_mode) on conflict (video_id) do nothing;
  update public.videos
     set content_mode = case when p_mode in ('duet','react','reply') then p_mode else 'remix' end
   where id = p_video_id and author_id = uid;
end $$;


ALTER FUNCTION "public"."create_video_remix"("p_video_id" "uuid", "p_source_video_id" "uuid", "p_mode" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."creator_record_earning"("p_creator_id" "uuid", "p_source" "text", "p_gross_minor" bigint, "p_platform_fee_minor" bigint DEFAULT 0, "p_currency" "text" DEFAULT 'XOF'::"text", "p_reference_id" "uuid" DEFAULT NULL::"uuid", "p_metadata" "jsonb" DEFAULT '{}'::"jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_net_minor bigint;
  v_earning_id uuid;
BEGIN
  IF auth.role() <> 'service_role' AND auth.uid() IS DISTINCT FROM p_creator_id THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF p_gross_minor <= 0 THEN
    RAISE EXCEPTION 'Gross amount must be positive';
  END IF;

  v_net_minor := p_gross_minor - COALESCE(p_platform_fee_minor, 0);

  IF v_net_minor < 0 THEN
    RAISE EXCEPTION 'Net amount cannot be negative';
  END IF;

  INSERT INTO public.creator_earnings (
    creator_id, source, reference_id,
    gross_amount, platform_fee, net_amount,
    currency, status, created_at
  ) VALUES (
    p_creator_id, p_source, p_reference_id,
    p_gross_minor / 100.0,
    p_platform_fee_minor / 100.0,
    v_net_minor / 100.0,
    p_currency, 'pending', now()
  )
  RETURNING id INTO v_earning_id;

  PERFORM public.economy_adjust_balance(
    p_creator_id,
    v_net_minor,
    'credit',
    'creator_earning',
    v_earning_id,
    NULL,
    jsonb_build_object('source', p_source)
  );

  RETURN jsonb_build_object(
    'success', true,
    'earning_id', v_earning_id,
    'net_minor', v_net_minor
  );
END;
$$;


ALTER FUNCTION "public"."creator_record_earning"("p_creator_id" "uuid", "p_source" "text", "p_gross_minor" bigint, "p_platform_fee_minor" bigint, "p_currency" "text", "p_reference_id" "uuid", "p_metadata" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."credits_transfer"("p_from_user_id" "uuid", "p_to_user_id" "uuid", "p_amount" integer, "p_reason" "text" DEFAULT 'transfer'::"text", "p_idempotency_key" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_from_balance int;
  v_ledger_out uuid;
  v_ledger_in uuid;
BEGIN
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be positive';
  END IF;

  IF p_from_user_id = p_to_user_id THEN
    RAISE EXCEPTION 'Cannot transfer to self';
  END IF;

  IF auth.uid() IS DISTINCT FROM p_from_user_id AND auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT balance INTO v_from_balance
  FROM public.baaro_credits_accounts
  WHERE user_id = p_from_user_id
  FOR UPDATE;

  IF NOT FOUND OR v_from_balance < p_amount THEN
    RAISE EXCEPTION 'Insufficient credits';
  END IF;

  INSERT INTO public.baaro_credits_accounts (user_id, balance, updated_at)
  VALUES (p_to_user_id, 0, now())
  ON CONFLICT (user_id) DO NOTHING;

  UPDATE public.baaro_credits_accounts
  SET balance = balance - p_amount, updated_at = now()
  WHERE user_id = p_from_user_id;

  INSERT INTO public.baaro_credits_ledger (user_id, amount, created_at)
  VALUES (p_from_user_id, -p_amount, now())
  RETURNING id INTO v_ledger_out;

  UPDATE public.baaro_credits_accounts
  SET balance = balance + p_amount, updated_at = now()
  WHERE user_id = p_to_user_id;

  INSERT INTO public.baaro_credits_ledger (user_id, amount, created_at)
  VALUES (p_to_user_id, p_amount, now())
  RETURNING id INTO v_ledger_in;

  RETURN jsonb_build_object(
    'success', true,
    'from_ledger_id', v_ledger_out,
    'to_ledger_id', v_ledger_in
  );
END;
$$;


ALTER FUNCTION "public"."credits_transfer"("p_from_user_id" "uuid", "p_to_user_id" "uuid", "p_amount" integer, "p_reason" "text", "p_idempotency_key" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."delete_own_account"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  delete from auth.users where id = auth.uid();
end $$;


ALTER FUNCTION "public"."delete_own_account"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."economy_adjust_balance"("p_user_id" "uuid", "p_amount_minor" bigint, "p_entry_type" "text", "p_source" "text", "p_reference_id" "uuid" DEFAULT NULL::"uuid", "p_idempotency_key" "text" DEFAULT NULL::"text", "p_metadata" "jsonb" DEFAULT '{}'::"jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_account public.economy_accounts%ROWTYPE;
  v_new_available bigint;
  v_ledger_id uuid;
BEGIN
  IF auth.uid() IS DISTINCT FROM p_user_id AND auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF p_amount_minor <= 0 THEN
    RAISE EXCEPTION 'Amount must be positive';
  END IF;

  IF p_entry_type NOT IN ('credit', 'debit') THEN
    RAISE EXCEPTION 'Invalid entry_type';
  END IF;

  IF p_idempotency_key IS NOT NULL THEN
    SELECT id INTO v_ledger_id FROM public.economy_ledger WHERE idempotency_key = p_idempotency_key;
    IF FOUND THEN
      RETURN jsonb_build_object('success', true, 'already_processed', true, 'ledger_id', v_ledger_id);
    END IF;
  END IF;

  SELECT * INTO v_account FROM public.economy_accounts WHERE user_id = p_user_id FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.economy_accounts (user_id, balance, currency, available_minor, pending_minor, payout_hold_minor, lifetime_minor, updated_at)
    VALUES (p_user_id, 0, 'XOF', 0, 0, 0, 0, now())
    RETURNING * INTO v_account;
  END IF;

  IF p_entry_type = 'credit' THEN
    v_new_available := v_account.available_minor + p_amount_minor;
  ELSE
    IF v_account.available_minor < p_amount_minor THEN
      RAISE EXCEPTION 'Insufficient balance';
    END IF;
    v_new_available := v_account.available_minor - p_amount_minor;
  END IF;

  UPDATE public.economy_accounts SET
    available_minor = v_new_available,
    lifetime_minor = CASE WHEN p_entry_type = 'credit' THEN lifetime_minor + p_amount_minor ELSE lifetime_minor END,
    balance = v_new_available,
    updated_at = now()
  WHERE user_id = p_user_id;

  INSERT INTO public.economy_ledger (user_id, amount_minor, entry_type, direction, source, reference_id, idempotency_key, metadata, created_at)
  VALUES (p_user_id, p_amount_minor, p_entry_type, CASE WHEN p_entry_type = 'credit' THEN 'in' ELSE 'out' END, p_source, p_reference_id, p_idempotency_key, p_metadata, now())
  RETURNING id INTO v_ledger_id;

  RETURN jsonb_build_object('success', true, 'ledger_id', v_ledger_id, 'new_available_minor', v_new_available);
END;
$$;


ALTER FUNCTION "public"."economy_adjust_balance"("p_user_id" "uuid", "p_amount_minor" bigint, "p_entry_type" "text", "p_source" "text", "p_reference_id" "uuid", "p_idempotency_key" "text", "p_metadata" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."economy_request_payout"("p_amount_minor" bigint, "p_method" "text", "p_destination_token" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_account public.economy_accounts%ROWTYPE;
  v_payout_id uuid;
  v_min_payout bigint := 100000;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_amount_minor < v_min_payout THEN
    RAISE EXCEPTION 'Amount below minimum payout';
  END IF;

  SELECT * INTO v_account
  FROM public.economy_accounts
  WHERE user_id = v_user_id
  FOR UPDATE;

  IF NOT FOUND OR v_account.available_minor < p_amount_minor THEN
    RAISE EXCEPTION 'Insufficient available balance';
  END IF;

  UPDATE public.economy_accounts
  SET
    available_minor = available_minor - p_amount_minor,
    payout_hold_minor = payout_hold_minor + p_amount_minor,
    updated_at = now()
  WHERE user_id = v_user_id;

  INSERT INTO public.economy_payouts (
    user_id, amount_minor, currency, method,
    destination_token, status, created_at
  ) VALUES (
    v_user_id, p_amount_minor,
    COALESCE(v_account.currency, 'XOF'),
    p_method, p_destination_token, 'pending', now()
  )
  RETURNING id INTO v_payout_id;

  INSERT INTO public.economy_ledger (
    user_id, amount_minor, entry_type, direction,
    source, reference_id, metadata, created_at
  ) VALUES (
    v_user_id, p_amount_minor, 'debit', 'out',
    'payout_request', v_payout_id,
    jsonb_build_object('method', p_method), now()
  );

  RETURN jsonb_build_object(
    'success', true,
    'payout_id', v_payout_id,
    'status', 'pending'
  );
END;
$$;


ALTER FUNCTION "public"."economy_request_payout"("p_amount_minor" bigint, "p_method" "text", "p_destination_token" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."export_my_data"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
declare
  uid uuid := auth.uid();
  result jsonb;
  spec record;
  where_sql text;
  rows_json jsonb;
  secret_keys text[] := array[
    'destination_token', 'token_hash', 'upload_token_hash',
    'fingerprint', 'public_key'
  ];
begin
  if uid is null then
    raise exception 'Non authentifié' using errcode = '28000';
  end if;

  result := jsonb_build_object(
    'app', 'BAARO',
    'exported_at', now(),
    'user_id', uid,
    'email', (select email from auth.users where id = uid)
  );

  for spec in
    select * from (values
      -- Profil, réglages, confidentialité
      ('profiles',                 array['id']),
      ('user_settings',            array['user_id']),
      ('user_preferences',         array['user_id']),
      ('profile_contacts',         array['user_id']),
      ('profile_links',            array['user_id']),
      ('profile_social_links',     array['user_id']),
      ('profile_view_premium',     array['user_id']),
      ('notification_preferences', array['user_id']),
      ('module_preferences',       array['user_id']),
      ('nexus_preferences',        array['user_id']),
      ('security_settings',        array['user_id']),
      ('security_devices',         array['user_id']),
      ('legal_consents',           array['user_id']),
      ('user_blocks',              array['blocker_id']),
      ('search_history',           array['user_id']),
      ('saved_searches',           array['user_id']),
      -- Publications et interactions
      ('posts',                    array['author_id']),
      ('comments',                 array['author_id']),
      ('post_likes',               array['user_id']),
      ('post_bookmarks',           array['user_id']),
      ('post_reposts',             array['user_id']),
      ('post_poll_votes',          array['user_id']),
      ('poll_votes',               array['user_id']),
      ('post_reports',             array['reporter_id']),
      ('content_bookmarks',        array['user_id']),
      ('follows',                  array['follower_id', 'followed_id']),
      ('tips',                     array['sender_id', 'receiver_id']),
      -- Stories
      ('stories',                  array['author_id']),
      ('story_reactions',          array['user_id']),
      ('story_replies',            array['sender_id']),
      ('story_sticker_responses',  array['user_id']),
      ('story_highlights',         array['owner_id']),
      ('story_close_friends',      array['owner_id']),
      -- Vidéos
      ('videos',                   array['author_id']),
      ('video_comments',           array['author_id']),
      ('video_likes',              array['user_id']),
      ('video_bookmarks',          array['user_id']),
      ('video_collections',        array['owner_id']),
      ('video_poll_votes',         array['user_id']),
      ('video_questions',          array['author_id']),
      ('video_challenges',         array['creator_id']),
      ('video_remixes',            array['creator_id']),
      ('video_collaborations',     array['owner_id', 'collaborator_id']),
      ('sounds',                   array['creator_id']),
      -- Messagerie
      ('conversations',            array['user1_id', 'user2_id']),
      ('messages',                 array['sender_id']),
      ('message_reactions',        array['user_id']),
      ('message_stars',            array['user_id']),
      ('message_reports',          array['reporter_id']),
      ('calls',                    array['caller_id', 'callee_id']),
      -- Groupes, débats, événements
      ('groups',                   array['owner_id']),
      ('group_members',            array['user_id']),
      ('channel_messages',         array['sender_id']),
      ('voice_channel_members',    array['user_id']),
      ('debate_rooms',             array['host_id']),
      ('debate_participants',      array['user_id']),
      ('debate_messages',          array['sender_id']),
      ('community_events',         array['organizer_id']),
      ('event_attendees',          array['user_id']),
      -- Créateur, apprentissage, emploi, services
      ('creator_profiles',         array['user_id']),
      ('creator_subscriptions',    array['subscriber_id', 'creator_id']),
      ('learning_courses',         array['creator_id']),
      ('learning_progress',        array['user_id']),
      ('live_trainings',           array['host_id']),
      ('training_purchases',       array['buyer_id']),
      ('job_listings',             array['owner_id']),
      ('service_listings',         array['owner_id']),
      -- Boutiques, entreprises, commandes
      ('shops',                    array['owner_id']),
      ('shop_reviews',             array['buyer_id']),
      ('companies',                array['owner_id']),
      ('company_reviews',          array['user_id']),
      ('cart',                     array['user_id']),
      ('orders',                   array['buyer_id']),
      ('delivery_orders',          array['buyer_id']),
      ('user_cosmetics',           array['user_id']),
      -- Économie
      ('economy_accounts',         array['user_id']),
      ('economy_ledger',           array['user_id']),
      ('economy_payouts',          array['user_id']),
      ('creator_earnings',         array['creator_id']),
      ('creator_reward_accounts',  array['user_id']),
      ('creator_reward_events',    array['user_id']),
      ('baaro_credits_accounts',   array['user_id']),
      ('baaro_credits_ledger',     array['user_id']),
      ('premium_subscriptions',    array['user_id']),
      ('monetization_checkout_intents', array['user_id']),
      ('reputation_events',        array['user_id']),
      -- IA et automatisations
      ('ai_action_log',            array['user_id']),
      ('ai_agent_tasks',           array['user_id']),
      ('ai_usage_daily',           array['user_id']),
      ('automation_rules',         array['user_id']),
      ('nexus_actions',            array['user_id']),
      ('nexus_goals',              array['user_id']),
      ('nexus_memory_items',       array['user_id']),
      -- Médias, notifications, sécurité
      ('media_assets',             array['owner_id']),
      ('notifications',            array['user_id']),
      ('data_export_jobs',         array['user_id']),
      ('safety_reports',           array['reporter_id'])
    ) as t (tbl, cols)
  loop
    -- Toutes les colonnes propriétaire doivent exister dans la table.
    if (
      select count(*)
      from information_schema.columns
      where table_schema = 'public'
        and table_name = spec.tbl
        and column_name = any (spec.cols)
    ) = array_length(spec.cols, 1) then

      select string_agg(format('%I::text = $1::text', c), ' or ')
      into where_sql
      from unnest(spec.cols) as c;

      execute format(
        'select coalesce(jsonb_agg(to_jsonb(t) - $2), ''[]''::jsonb) '
        'from (select * from public.%I where %s limit 10000) t',
        spec.tbl, where_sql
      )
      into rows_json
      using uid, secret_keys;

      result := result || jsonb_build_object(spec.tbl, rows_json);
    end if;
  end loop;

  return result;
end;
$_$;


ALTER FUNCTION "public"."export_my_data"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."find_users_by_contact_hashes"("hashes" "text"[]) RETURNS TABLE("id" "uuid", "display_name" "text", "handle" "text", "avatar_url" "text", "flag" "text", "matched_via" "text", "matched_hash" "text")
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select p.id, p.display_name, p.handle, p.avatar_url, p.flag,
         ch.kind as matched_via, ch.hash as matched_hash
  from public.contact_hashes ch
  join public.profiles p on p.id = ch.profile_id
  where ch.hash = any(hashes)
    and p.id <> auth.uid();
$$;


ALTER FUNCTION "public"."find_users_by_contact_hashes"("hashes" "text"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fulfill_monetization_checkout"("p_intent_id" "uuid", "p_provider" "text", "p_provider_reference" "text") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$ 
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


ALTER FUNCTION "public"."fulfill_monetization_checkout"("p_intent_id" "uuid", "p_provider" "text", "p_provider_reference" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."future_export_user_data"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  uid uuid := auth.uid();
  result jsonb;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  SELECT jsonb_build_object(
    'user_id', uid,
    'exported_at', now(),
    'nexus_preferences', (SELECT to_jsonb(p) FROM public.nexus_preferences p WHERE p.user_id = uid),
    'future_preferences', (SELECT COALESCE(jsonb_agg(f), '[]'::jsonb) FROM public.future_preferences f WHERE f.user_id = uid),
    'goals', (SELECT COALESCE(jsonb_agg(g), '[]'::jsonb) FROM public.nexus_goals g WHERE g.user_id = uid),
    'memory_items_count', (SELECT COUNT(*) FROM public.nexus_memory_items WHERE user_id = uid),
    'note', 'Aucun secret, mot de passe, clé E2E ou token inclus'
  ) INTO result;

  INSERT INTO public.data_export_jobs (user_id, scope, status) VALUES (uid, 'full', 'completed') ON CONFLICT DO NOTHING;

  RETURN result;
END $$;


ALTER FUNCTION "public"."future_export_user_data"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_creator_rewards_summary"() RETURNS "jsonb"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$ 
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


ALTER FUNCTION "public"."get_creator_rewards_summary"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_creator_top_gifters"("p_creator_id" "uuid", "p_days" integer DEFAULT 30, "p_limit" integer DEFAULT 20) RETURNS TABLE("sender_id" "uuid", "total_minor" bigint, "gift_count" bigint, "handle" "text", "display_name" "text", "avatar_url" "text")
    LANGUAGE "sql" STABLE
    AS $$ 
    SELECT e.sender_id, SUM(e.amount_minor)::bigint AS total_minor, COUNT(*)::bigint AS gift_count, 
           p.handle, p.display_name, p.avatar_url 
    FROM video_gift_events e 
    LEFT JOIN profiles p ON p.id = e.sender_id 
    WHERE e.creator_id = p_creator_id 
      AND (p_days IS NULL OR e.created_at >= now() - (p_days || ' days')::interval) 
    GROUP BY e.sender_id, p.handle, p.display_name, p.avatar_url 
    ORDER BY total_minor DESC 
    LIMIT GREATEST(1, LEAST(p_limit, 50)); 
$$;


ALTER FUNCTION "public"."get_creator_top_gifters"("p_creator_id" "uuid", "p_days" integer, "p_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_friends"() RETURNS TABLE("friend_id" "uuid")
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select distinct case when follower_id=auth.uid() then followed_id else follower_id end
    from follows
   where is_friend and status='accepted'
     and auth.uid() in (follower_id, followed_id);
$$;


ALTER FUNCTION "public"."get_friends"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_hashtag_leaderboard"("p_tag" "text", "p_limit" integer DEFAULT 30) RETURNS TABLE("video_id" "uuid", "title" "text", "video_url" "text", "thumbnail_url" "text", "author_id" "uuid", "views" bigint, "likes" bigint, "comments_count" bigint, "score" numeric, "handle" "text", "display_name" "text", "avatar_url" "text")
    LANGUAGE "sql" STABLE
    AS $$ 
    SELECT v.id, v.title, v.video_url, v.thumbnail_url, v.author_id, 
           COALESCE(v.views, 0)::bigint, COALESCE(v.likes, 0)::bigint, COALESCE(v.comments_count, 0)::bigint, 
           (COALESCE(v.views, 0) + COALESCE(v.likes, 0) * 4 + COALESCE(v.comments_count, 0) * 6)::numeric AS score, 
           p.handle, p.display_name, p.avatar_url 
    FROM video_hashtags h 
    JOIN videos v ON v.id = h.video_id 
    LEFT JOIN profiles p ON p.id = v.author_id 
    WHERE lower(h.tag) = lower(trim(both '#' from p_tag)) 
    ORDER BY score DESC, v.created_at DESC 
    LIMIT GREATEST(1, LEAST(p_limit, 100)); 
$$;


ALTER FUNCTION "public"."get_hashtag_leaderboard"("p_tag" "text", "p_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_monetization_catalog"() RETURNS "jsonb"
    LANGUAGE "sql"
    SET "search_path" TO 'public'
    AS $$
 select jsonb_build_object(
  'products',(select coalesce(jsonb_agg(to_jsonb(p) order by p.category,p.price_minor),'[]'::jsonb) from public.monetization_products p where p.active),
  'api_plans',(select coalesce(jsonb_agg(to_jsonb(a) order by a.price_minor),'[]'::jsonb) from public.api_plans a)
 );
$$;


ALTER FUNCTION "public"."get_monetization_catalog"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_monetization_dashboard"() RETURNS "jsonb"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."get_monetization_dashboard"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_playlist_videos"("p_playlist_id" "uuid") RETURNS TABLE("video_id" "uuid", "position" integer, "title" "text", "video_url" "text", "thumbnail_url" "text", "duration" "text", "author_id" "uuid")
    LANGUAGE "sql" STABLE
    AS $$ 
    SELECT i.video_id, i."position", v.title, v.video_url, v.thumbnail_url, v.duration, v.author_id 
    FROM video_playlist_items i 
    JOIN videos v ON v.id = i.video_id 
    WHERE i.playlist_id = p_playlist_id 
    ORDER BY i."position" ASC; 
$$;


ALTER FUNCTION "public"."get_playlist_videos"("p_playlist_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_poll_voters"("p_poll_id" "uuid") RETURNS TABLE("option_id" "uuid", "option_text" "text", "voters" "jsonb")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if not exists (select 1 from public.poll_votes
                 where poll_id = p_poll_id and user_id = auth.uid())
     and not exists (select 1 from public.polls p
                     join public.posts po on po.id = p.post_id
                     where p.id = p_poll_id and po.author_id = auth.uid())
  then raise exception 'ACCESS_DENIED'; end if;

  return query
  select po.id, po.option_text,
    coalesce(jsonb_agg(jsonb_build_object(
      'id', pv.user_id,
      'display_name', coalesce(pr.display_name, pr.handle, 'Membre'),
      'avatar_url', pr.avatar_url, 'handle', pr.handle)
      order by pv.created_at desc) filter (where pv.user_id is not null),
      '[]'::jsonb)
  from public.poll_options po
  left join public.poll_votes pv on pv.option_id = po.id
  left join public.profiles pr on pr.id = pv.user_id
  where po.poll_id = p_poll_id
  group by po.id, po.option_text, po.position
  order by po.position;
end $$;


ALTER FUNCTION "public"."get_poll_voters"("p_poll_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_post_likers"("p_post_id" "uuid") RETURNS TABLE("user_id" "uuid", "display_name" "text", "handle" "text", "avatar_url" "text", "flag" "text", "created_at" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'pg_temp'
    AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.posts p
    WHERE p.id = p_post_id
      AND p.author_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'ACCESS_DENIED';
  END IF;

  RETURN QUERY
  SELECT
    l.user_id,
    pr.display_name,
    pr.handle,
    pr.avatar_url,
    pr.flag,
    l.created_at
  FROM public.post_likes l
  LEFT JOIN public.profiles pr
    ON pr.id = l.user_id
  WHERE l.post_id = p_post_id
  ORDER BY l.created_at DESC;
END;
$$;


ALTER FUNCTION "public"."get_post_likers"("p_post_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_post_viewers"("p_post_id" "uuid") RETURNS TABLE("viewer_id" "uuid", "display_name" "text", "handle" "text", "avatar_url" "text", "flag" "text", "viewed_at" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'pg_temp'
    AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.posts p
    WHERE p.id = p_post_id
      AND p.author_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'ACCESS_DENIED';
  END IF;

  RETURN QUERY
  SELECT
    latest.viewer_id,
    pr.display_name,
    pr.handle,
    pr.avatar_url,
    pr.flag,
    latest.viewed_at
  FROM (
    SELECT DISTINCT ON (pv.viewer_id)
      pv.viewer_id,
      pv.viewed_at
    FROM public.post_views pv
    WHERE pv.post_id = p_post_id
    ORDER BY pv.viewer_id, pv.viewed_at DESC NULLS LAST
  ) AS latest
  LEFT JOIN public.profiles pr
    ON pr.id = latest.viewer_id
  ORDER BY latest.viewed_at DESC NULLS LAST;
END;
$$;


ALTER FUNCTION "public"."get_post_viewers"("p_post_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_profile_stats"("p_user_id" "uuid") RETURNS TABLE("followers" bigint, "following" bigint, "friends" bigint, "posts" bigint, "likes" bigint)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_user_id is null then raise exception 'USER_REQUIRED'; end if;
  if not exists (select 1 from public.profiles where id = p_user_id) then raise exception 'PROFILE_NOT_FOUND'; end if;
  return query select
    (select count(*) from public.follows f where f.followed_id=p_user_id and f.status='accepted'),
    (select count(*) from public.follows f where f.follower_id=p_user_id and f.status='accepted'),
    (select count(*) from public.follows f where f.followed_id=p_user_id and f.status='accepted' and f.is_friend=true),
    (select count(*) from public.posts p where p.author_id=p_user_id),
    (select count(*) from public.post_likes l join public.posts p on p.id=l.post_id where p.author_id=p_user_id);
end; $$;


ALTER FUNCTION "public"."get_profile_stats"("p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_story_product_stats"() RETURNS TABLE("story_id" "uuid", "product_id" "text", "views" bigint, "clicks" bigint, "add_to_cart" bigint, "purchases" bigint, "units" bigint, "story_created_at" timestamp with time zone)
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select e.story_id, e.product_id,
         count(*) filter (where e.event_type = 'view'),
         count(*) filter (where e.event_type = 'click'),
         count(*) filter (where e.event_type = 'add_to_cart'),
         count(*) filter (where e.event_type = 'purchase'),
         coalesce(sum(e.quantity) filter (where e.event_type = 'purchase'), 0),
         s.created_at
  from story_product_events e
  join stories s on s.id = e.story_id
  where s.author_id = auth.uid()
  group by e.story_id, e.product_id, s.created_at
  order by s.created_at desc
  limit 50;
$$;


ALTER FUNCTION "public"."get_story_product_stats"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_story_reactors"("p_story_id" "uuid") RETURNS TABLE("user_id" "uuid", "display_name" "text", "handle" "text", "avatar_url" "text", "flag" "text", "reaction" "text", "created_at" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."get_story_reactors"("p_story_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_story_viewers"("p_story_id" "uuid") RETURNS TABLE("viewer_id" "uuid", "display_name" "text", "handle" "text", "avatar_url" "text", "flag" "text", "viewed_at" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."get_story_viewers"("p_story_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_unread_notification_counts"("p_user_ids" "uuid"[]) RETURNS TABLE("user_id" "uuid", "unread_count" bigint)
    LANGUAGE "sql" STABLE
    SET "search_path" TO ''
    AS $$
  SELECT n.user_id, COUNT(*)::bigint AS unread_count
  FROM public.notifications AS n
  WHERE n.user_id = ANY(COALESCE(p_user_ids, ARRAY[]::uuid[]))
    AND n.read = false
  GROUP BY n.user_id;
$$;


ALTER FUNCTION "public"."get_unread_notification_counts"("p_user_ids" "uuid"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_user_friends"("p_user_id" "uuid") RETURNS TABLE("friend_id" "uuid")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
    SELECT DISTINCT
        f1.followed_id AS friend_id
    FROM public.follows f1
    INNER JOIN public.follows f2
        ON f1.follower_id = f2.followed_id
       AND f1.followed_id = f2.follower_id
    WHERE f1.follower_id = p_user_id
      AND f1.status = 'accepted'
      AND f1.is_friend = true
      AND f2.status = 'accepted'
      AND f2.is_friend = true;
$$;


ALTER FUNCTION "public"."get_user_friends"("p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_video_likers"("p_video_id" "uuid") RETURNS TABLE("user_id" "uuid", "display_name" "text", "handle" "text", "avatar_url" "text", "flag" "text", "created_at" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'pg_temp'
    AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.videos v
    WHERE v.id = p_video_id
      AND v.author_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'ACCESS_DENIED';
  END IF;

  RETURN QUERY
  SELECT
    l.user_id,
    pr.display_name,
    pr.handle,
    pr.avatar_url,
    pr.flag,
    l.created_at
  FROM public.video_likes l
  LEFT JOIN public.profiles pr
    ON pr.id = l.user_id
  WHERE l.video_id = p_video_id
  ORDER BY l.created_at DESC;
END;
$$;


ALTER FUNCTION "public"."get_video_likers"("p_video_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_video_viewers"("p_video_id" "uuid") RETURNS TABLE("viewer_id" "uuid", "display_name" "text", "handle" "text", "avatar_url" "text", "flag" "text", "viewed_at" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'pg_temp'
    AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.videos v
    WHERE v.id = p_video_id
      AND v.author_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'ACCESS_DENIED';
  END IF;

  RETURN QUERY
  SELECT
    latest.viewer_id,
    pr.display_name,
    pr.handle,
    pr.avatar_url,
    pr.flag,
    latest.viewed_at
  FROM (
    SELECT DISTINCT ON (vv.viewer_id)
      vv.viewer_id,
      vv.viewed_at
    FROM public.video_views vv
    WHERE vv.video_id = p_video_id
    ORDER BY vv.viewer_id, vv.viewed_at DESC NULLS LAST
  ) AS latest
  LEFT JOIN public.profiles pr
    ON pr.id = latest.viewer_id
  ORDER BY latest.viewed_at DESC NULLS LAST;
END;
$$;


ALTER FUNCTION "public"."get_video_viewers"("p_video_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."global_discovery_search"("p_query" "text", "p_limit" integer DEFAULT 8) RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare q text := trim(coalesce(p_query,'')); lim int := least(greatest(coalesce(p_limit,8),1),20);
begin
  if char_length(q) < 2 then return jsonb_build_object('users','[]'::jsonb,'groups','[]'::jsonb,'debates','[]'::jsonb,'posts','[]'::jsonb); end if;
  return jsonb_build_object(
    'users', coalesce((select jsonb_agg(to_jsonb(x)) from (select id, display_name, handle, avatar_url, flag from profiles where display_name ilike '%'||q||'%' or handle ilike '%'||q||'%' order by display_name limit lim) x),'[]'::jsonb),
    'groups', coalesce((select jsonb_agg(to_jsonb(x)) from (select id, name, description, avatar_url, category from groups where is_public = true and (name ilike '%'||q||'%' or description ilike '%'||q||'%') order by created_at desc limit lim) x),'[]'::jsonb),
    'debates', coalesce((select jsonb_agg(to_jsonb(x)) from (select id, title, topic, status from debate_rooms where status = 'active' and (title ilike '%'||q||'%' or topic ilike '%'||q||'%') order by created_at desc limit lim) x),'[]'::jsonb),
    'posts', coalesce((select jsonb_agg(to_jsonb(x)) from (select id, author_id, text, media_url, created_at from posts where text ilike '%'||q||'%' order by created_at desc limit lim) x),'[]'::jsonb)
  );
end; $$;


ALTER FUNCTION "public"."global_discovery_search"("p_query" "text", "p_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."group_role"("p_group" "uuid") RETURNS "text"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select case when g.owner_id = auth.uid() then 'owner' else gm.role end
  from public.groups g
  left join public.group_members gm
    on gm.group_id = g.id and gm.user_id = auth.uid()
  where g.id = p_group;
$$;


ALTER FUNCTION "public"."group_role"("p_group" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."groups_guard"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  if tg_op = 'INSERT' then
    new.is_public := coalesce(new.is_public, true) and not coalesce(new.is_private, false);
  else
    if new.owner_id is distinct from old.owner_id and auth.uid() is not null then
      raise exception 'Changement de propriétaire interdit';
    end if;
    if new.is_public is not distinct from old.is_public
       and new.is_private is distinct from old.is_private then
      new.is_public := not new.is_private;
    end if;
  end if;
  new.is_private := not coalesce(new.is_public, true);
  return new;
end $$;


ALTER FUNCTION "public"."groups_guard"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_name text;
  v_handle text;
  v_fallback text;
  v_flag text;
  v_bio text;
BEGIN
  v_name := left(coalesce(
    nullif(new.raw_user_meta_data ->> 'display_name', ''),
    nullif(new.raw_user_meta_data ->> 'full_name', ''),
    nullif(new.raw_user_meta_data ->> 'name', ''),
    nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
    nullif(new.phone, ''),
    'Membre BAARO'
  ), 80);

  v_handle := lower(trim(coalesce(
    nullif(new.raw_user_meta_data ->> 'handle', ''),
    '@user_' || substr(replace(new.id::text, '-', ''), 1, 12)
  )));
  IF left(v_handle, 1) <> '@' THEN v_handle := '@' || v_handle; END IF;
  v_handle := left(v_handle, 40);
  v_fallback := '@user_' || substr(replace(new.id::text, '-', ''), 1, 12);
  v_flag := coalesce(nullif(new.raw_user_meta_data ->> 'flag', ''), '🌍');
  v_bio := left(coalesce(new.raw_user_meta_data ->> 'bio', ''), 1000);

  BEGIN
    INSERT INTO public.profiles (id, display_name, handle, flag, bio, created_at, updated_at, phone)
    VALUES (new.id, v_name, v_handle, v_flag, v_bio, now(), now(), nullif(new.phone, ''))
    ON CONFLICT (id) DO NOTHING;
  EXCEPTION WHEN unique_violation THEN
    INSERT INTO public.profiles (id, display_name, handle, flag, bio, created_at, updated_at, phone)
    VALUES (new.id, v_name, v_fallback, v_flag, v_bio, now(), now(), nullif(new.phone, ''))
    ON CONFLICT (id) DO NOTHING;
  END;

  RETURN new;
END;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user_nexus"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  INSERT INTO public.nexus_preferences (user_id, ai_enabled, memory_enabled, personalization_enabled, discovery_mode)
  VALUES (NEW.id, true, true, true, 'balanced')
  ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO public.security_settings (user_id, ai_sensitive_action_confirmation, require_mfa, login_alerts)
  VALUES (NEW.id, true, false, true)
  ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO public.user_settings (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO public.future_preferences (user_id, module_key, enabled)
  SELECT NEW.id, m.key, true
  FROM (VALUES ('ai_agent'),('trust'),('anti_scam'),('translator'),('offline'),('commerce'),('creator'),('observability')) AS m(key)
  ON CONFLICT (user_id, module_key) DO NOTHING;

  RETURN NEW;
END $$;


ALTER FUNCTION "public"."handle_new_user_nexus"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_banned"("p_group" "uuid", "p_user" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1 from public.group_bans
    where group_id = p_group and user_id = p_user
  );
$$;


ALTER FUNCTION "public"."is_banned"("p_group" "uuid", "p_user" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_blocked"("a" "uuid", "b" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select coalesce(auth.uid() in (a, b), false)
    and exists (
      select 1
      from public.user_blocks
      where (blocker_id = a and blocked_id = b)
         or (blocker_id = b and blocked_id = a)
    );
$$;


ALTER FUNCTION "public"."is_blocked"("a" "uuid", "b" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_debate_member"("p_room" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1 from public.debate_participants
    where room_id = p_room and user_id = auth.uid() and left_at is null
  );
$$;


ALTER FUNCTION "public"."is_debate_member"("p_room" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_friend_with"("other" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1
    from public.follows f
    where f.is_friend = true
      and f.status = 'accepted'
      and (
        (f.follower_id = auth.uid() and f.followed_id = other)
        or (f.follower_id = other and f.followed_id = auth.uid())
      )
  );
$$;


ALTER FUNCTION "public"."is_friend_with"("other" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_real_user"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$ select coalesce((select not is_anonymous from auth.users where id = auth.uid()), false); $$;


ALTER FUNCTION "public"."is_real_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."join_community_group"("p_group" "uuid" DEFAULT NULL::"uuid", "p_code" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_uid uuid := auth.uid();
  v_group_id uuid;
  v_public boolean;
  v_inv public.group_invites;
begin
  if v_uid is null then
    raise exception 'Non authentifié';
  end if;

  -- Mode 1: code d'invitation
  if p_code is not null and length(trim(p_code)) > 0 then
    select * into v_inv
    from public.group_invites
    where upper(code) = upper(trim(p_code))
      and (expires_at is null or expires_at > now())
      and (coalesce(max_uses, 0) = 0 or coalesce(uses, 0) < max_uses)
    for update;

    if not found then
      raise exception 'Invitation invalide ou expirée';
    end if;

    v_group_id := v_inv.group_id;

    if public.is_banned(v_group_id, v_uid) then
      raise exception 'Accès refusé';
    end if;

    if public.group_role(v_group_id) is not null then
      return jsonb_build_object(
        'ok', true,
        'group_id', v_group_id,
        'already_member', true
      );
    end if;

    update public.group_invites
    set uses = coalesce(uses, 0) + 1
    where id = v_inv.id;

    insert into public.group_members (group_id, user_id, role)
    values (v_group_id, v_uid, 'member')
    on conflict do nothing;

    return jsonb_build_object(
      'ok', true,
      'group_id', v_group_id,
      'via', 'invite'
    );
  end if;

  -- Mode 2: groupe public
  if p_group is null then
    raise exception 'Groupe ou code requis';
  end if;

  v_group_id := p_group;

  if public.is_banned(v_group_id, v_uid) then
    raise exception 'Accès refusé';
  end if;

  if public.group_role(v_group_id) is not null then
    return jsonb_build_object(
      'ok', true,
      'group_id', v_group_id,
      'already_member', true
    );
  end if;

  select coalesce(is_public, true) into v_public
  from public.groups
  where id = v_group_id;

  if not found then
    raise exception 'Groupe introuvable';
  end if;

  if not v_public then
    raise exception 'Groupe privé : code d''invitation requis';
  end if;

  insert into public.group_members (group_id, user_id, role)
  values (v_group_id, v_uid, 'member')
  on conflict do nothing;

  return jsonb_build_object(
    'ok', true,
    'group_id', v_group_id,
    'via', 'public'
  );
end;
$$;


ALTER FUNCTION "public"."join_community_group"("p_group" "uuid", "p_code" "text") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."debate_rooms" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "host_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "topic" "text",
    "mode" "text" DEFAULT 'video'::"text" NOT NULL,
    "max_participants" integer DEFAULT 6 NOT NULL,
    "ai_enabled" boolean DEFAULT true NOT NULL,
    "invite_code" "text" DEFAULT "substr"("replace"(("gen_random_uuid"())::"text", '-'::"text", ''::"text"), 1, 8) NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "ended_at" timestamp with time zone,
    "daily_room_name" "text",
    "format" "text" DEFAULT 'standard'::"text",
    CONSTRAINT "debate_rooms_max_participants_check" CHECK ((("max_participants" >= 2) AND ("max_participants" <= 12))),
    CONSTRAINT "debate_rooms_mode_check" CHECK (("mode" = ANY (ARRAY['text'::"text", 'audio'::"text", 'video'::"text"]))),
    CONSTRAINT "debate_rooms_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'ended'::"text"])))
);


ALTER TABLE "public"."debate_rooms" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."join_debate_by_code"("p_code" "text") RETURNS "public"."debate_rooms"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_room public.debate_rooms;
  v_count int;
begin
  select * into v_room from public.debate_rooms
    where lower(trim(invite_code)) = lower(trim(p_code))
      and status in ('active', 'paused');

  if not found then
    raise exception 'Aucun live actif avec ce code.';
  end if;

  select count(*) into v_count from public.debate_participants
    where room_id = v_room.id and (left_at is null);

  if v_count >= coalesce(v_room.max_participants, 12) then
    raise exception 'Ce live est complet.';
  end if;

  insert into public.debate_participants (room_id, user_id, joined_at, left_at)
  values (v_room.id, auth.uid(), now(), null)
  on conflict (room_id, user_id) do update set left_at = null, joined_at = now();

  return v_room;
end;
$$;


ALTER FUNCTION "public"."join_debate_by_code"("p_code" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."join_video_challenge"("p_challenge_id" "uuid", "p_video_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'AUTH_REQUIRED'; end if;
  if not exists (select 1 from public.videos where id = p_video_id and author_id = uid) then raise exception 'VIDEO_NOT_YOURS'; end if;
  if not exists (select 1 from public.video_challenges where id = p_challenge_id and status = 'active'
                 and starts_at <= now() and (ends_at is null or ends_at > now())) then raise exception 'CHALLENGE_NOT_ACTIVE'; end if;
  insert into public.video_challenge_entries(challenge_id, video_id, creator_id)
  values (p_challenge_id, p_video_id, uid) on conflict do nothing;
  update public.videos set challenge_id = p_challenge_id, content_mode = 'challenge'
   where id = p_video_id and author_id = uid;
end $$;


ALTER FUNCTION "public"."join_video_challenge"("p_challenge_id" "uuid", "p_video_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."list_group_invites"("p_group" "uuid") RETURNS SETOF "public"."group_invites"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if public.group_role(p_group) not in ('owner', 'admin') then
    raise exception 'Droits insuffisants';
  end if;

  return query
  select *
  from public.group_invites
  where group_id = p_group
  order by created_at desc;
end;
$$;


ALTER FUNCTION "public"."list_group_invites"("p_group" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mark_order_paid"("p_order_id" "uuid", "p_payment_ref" "text", "p_provider" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$ 
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


ALTER FUNCTION "public"."mark_order_paid"("p_order_id" "uuid", "p_payment_ref" "text", "p_provider" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."messages_rate_limit"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  if (select count(*) from public.channel_messages
      where sender_id = new.sender_id
        and created_at > now() - interval '10 seconds') >= 10 then
    raise exception 'Trop de messages, ralentis';
  end if;
  return new;
end $$;


ALTER FUNCTION "public"."messages_rate_limit"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."nexus_bootstrap"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  uid uuid := auth.uid();
  trust numeric := 0;
  mem_enabled bool := true;
  goals_active int := 0;
  quota_used int := 0;
  pending_sync int := 0;
  memory_count int := 0;
BEGIN
  IF uid IS NULL THEN
    RETURN jsonb_build_object('error','not_authenticated');
  END IF;

  SELECT COALESCE(SUM(weight),0) INTO trust FROM public.trust_events WHERE subject_user_id = uid;
  IF trust = 0 THEN
    SELECT COALESCE(SUM(weight),0) INTO trust FROM public.nexus_trust_events WHERE subject_id = uid;
  END IF;

  SELECT memory_enabled INTO mem_enabled FROM public.nexus_preferences WHERE user_id = uid;
  SELECT COUNT(*) INTO goals_active FROM public.nexus_goals WHERE user_id = uid AND status IN ('active','in_progress');
  SELECT COALESCE(SUM(paid_generations),0) INTO quota_used FROM public.ai_usage_daily WHERE user_id = uid AND usage_date = CURRENT_DATE;
  SELECT COUNT(*) INTO pending_sync FROM public.offline_sync_queue WHERE user_id = uid AND status = 'pending';
  SELECT COUNT(*) INTO memory_count FROM public.nexus_memory_items WHERE user_id = uid;

  RETURN jsonb_build_object(
    'user_id', uid,
    'trust_score', trust,
    'memory_enabled', COALESCE(mem_enabled, true),
    'goals_active', goals_active,
    'quota_used_today', quota_used,
    'pending_sync', pending_sync,
    'memory_items', memory_count,
    'boot_at', now()
  );
END $$;


ALTER FUNCTION "public"."nexus_bootstrap"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."nexus_trust_score"("p_user_id" "uuid") RETURNS integer
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select greatest(0, least(100, 50 + coalesce(sum(weight),0)::integer)) from public.nexus_trust_events where subject_id = p_user_id;
$$;


ALTER FUNCTION "public"."nexus_trust_score"("p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."notify_on_comment"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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
$$;


ALTER FUNCTION "public"."notify_on_comment"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."notify_on_poll_vote"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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
$$;


ALTER FUNCTION "public"."notify_on_poll_vote"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."notify_user"("p_user" "uuid", "p_actor" "uuid", "p_type" "text", "p_story" "uuid", "p_message" "text", "p_preview" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if p_user is null or p_user = p_actor then return; end if;
  insert into notifications (user_id, actor_id, type, source_id, message, preview)
  values (p_user, p_actor, p_type, p_story, coalesce(p_message, ''), p_preview);
end $$;


ALTER FUNCTION "public"."notify_user"("p_user" "uuid", "p_actor" "uuid", "p_type" "text", "p_story" "uuid", "p_message" "text", "p_preview" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."on_block_cleanup"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  delete from public.follows
  where (follower_id = new.blocker_id and followed_id = new.blocked_id)
     or (follower_id = new.blocked_id and followed_id = new.blocker_id);
  return new;
end;
$$;


ALTER FUNCTION "public"."on_block_cleanup"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."peek_group_invite"("p_code" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_inv public.group_invites;
  v_g public.groups;
  v_count int;
begin
  select * into v_inv
  from public.group_invites
  where upper(code) = upper(trim(p_code))
    and (expires_at is null or expires_at > now())
    and (coalesce(max_uses, 0) = 0 or coalesce(uses, 0) < max_uses);

  if not found then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;

  select * into v_g from public.groups where id = v_inv.group_id;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'group_gone');
  end if;

  select count(*)::int into v_count
  from public.group_members
  where group_id = v_g.id;

  return jsonb_build_object(
    'ok', true,
    'group_id', v_g.id,
    'name', v_g.name,
    'description', v_g.description,
    'is_public', coalesce(v_g.is_public, true),
    'member_count', v_count,
    'code', v_inv.code
  );
end;
$$;


ALTER FUNCTION "public"."peek_group_invite"("p_code" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."phone_account_exists"("p_phone" "text") RETURNS boolean
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
  select exists (
    select 1 from auth.users
    where phone = regexp_replace(p_phone, '\D', '', 'g')
      and coalesce(encrypted_password, '') <> ''
  );
$$;


ALTER FUNCTION "public"."phone_account_exists"("p_phone" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."phone_exists"("p_phone" "text") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (select 1 from public.profile_private where phone = p_phone)
$$;


ALTER FUNCTION "public"."phone_exists"("p_phone" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."prevent_client_role_change"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if NEW.role is distinct from OLD.role then
    if auth.role() <> 'service_role' then
      raise exception 'Le rôle ne peut être modifié que par le serveur';
    end if;
  end if;
  return NEW;
end;
$$;


ALTER FUNCTION "public"."prevent_client_role_change"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."profiles_country_guard"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if auth.role() = 'authenticated' then
    if tg_op = 'INSERT' then
      new.registered_country := new.country;
      new.country_changed_at := null;
      new.country_change_available_at := null;
    else
      new.registered_country := coalesce(old.registered_country, new.country);
      new.country_changed_at := old.country_changed_at;
      new.country_change_available_at := old.country_change_available_at;
      if new.country is distinct from old.country and old.country is not null then
        if old.country_change_available_at is not null
           and old.country_change_available_at > now() then
          raise exception 'COUNTRY_CHANGE_LOCKED';
        end if;
        new.country_changed_at := now();
        new.country_change_available_at := now() + interval '4 months';
      end if;
    end if;
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."profiles_country_guard"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."profiles_protect_flags"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if auth.role() = 'authenticated' then
    if tg_op = 'INSERT' then
      new.is_premium := false;
      new.is_verified := false;
      new.restricted := false;
    else
      new.is_premium := old.is_premium;
      new.is_verified := old.is_verified;
      new.restricted := old.restricted;
    end if;
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."profiles_protect_flags"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."prune_stale_push_tokens"("max_age" interval DEFAULT '180 days'::interval) RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare deleted_count integer;
begin
  delete from public.push_tokens where updated_at < now() - max_age;
  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;


ALTER FUNCTION "public"."prune_stale_push_tokens"("max_age" interval) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."record_ad_creator_revenue"("p_idempotency_key" "text", "p_creator_id" "uuid", "p_gross_minor" bigint, "p_provider_fee_minor" bigint DEFAULT 0, "p_reference_id" "uuid" DEFAULT NULL::"uuid", "p_metadata" "jsonb" DEFAULT '{}'::"jsonb") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$ 
BEGIN 
    IF auth.role() <> 'service_role' THEN 
        RAISE EXCEPTION 'SERVICE_ROLE_REQUIRED'; 
    END IF; 
    RETURN public.record_economy_event(p_idempotency_key, p_creator_id, 'ads', p_gross_minor, p_provider_fee_minor, 'XOF', p_reference_id, p_metadata); 
END $$;


ALTER FUNCTION "public"."record_ad_creator_revenue"("p_idempotency_key" "text", "p_creator_id" "uuid", "p_gross_minor" bigint, "p_provider_fee_minor" bigint, "p_reference_id" "uuid", "p_metadata" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."record_economy_event"("p_idempotency_key" "text", "p_user_id" "uuid", "p_source" "text", "p_gross_minor" bigint, "p_provider_fee_minor" bigint DEFAULT 0, "p_currency" "text" DEFAULT 'XOF'::"text", "p_reference_id" "uuid" DEFAULT NULL::"uuid", "p_metadata" "jsonb" DEFAULT '{}'::"jsonb") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare v_id uuid; v_bps int; v_net bigint;
begin
  if p_user_id is null or coalesce(p_gross_minor,0) <= 0
     or p_idempotency_key is null then
    raise exception 'INVALID_ECONOMY_EVENT';
  end if;

  -- Part de la plateforme par source (à ajuster)
  v_bps := case p_source
    when 'subscriptions' then 1500
    when 'tips'          then 500
    when 'marketplace'   then 1000
    when 'campaigns'     then 1000
    when 'ads'           then 4500
    else 1000 end;

  v_net := greatest(
    p_gross_minor - (p_gross_minor * v_bps) / 10000
      - coalesce(p_provider_fee_minor,0), 0);

  insert into public.economy_accounts(user_id, currency)
  values (p_user_id, coalesce(p_currency,'XOF'))
  on conflict (user_id) do nothing;

  insert into public.economy_ledger(
    user_id, entry_type, bucket, direction, source,
    amount_minor, currency, reference_id, idempotency_key, metadata)
  values (p_user_id, 'earning', 'available', 'credit', p_source,
    v_net, coalesce(p_currency,'XOF'), p_reference_id,
    p_idempotency_key, coalesce(p_metadata,'{}'::jsonb))
  on conflict (idempotency_key) do nothing
  returning id into v_id;

  if v_id is null then
    select id into v_id from public.economy_ledger
     where idempotency_key = p_idempotency_key;
    return v_id;
  end if;

  update public.economy_accounts
     set available_minor = available_minor + v_net,
         lifetime_minor  = lifetime_minor + v_net,
         updated_at = now()
   where user_id = p_user_id;

  return v_id;
end $$;


ALTER FUNCTION "public"."record_economy_event"("p_idempotency_key" "text", "p_user_id" "uuid", "p_source" "text", "p_gross_minor" bigint, "p_provider_fee_minor" bigint, "p_currency" "text", "p_reference_id" "uuid", "p_metadata" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."record_legal_consent"("p_document_type" "text", "p_version" "text", "p_ip_hash" "text" DEFAULT NULL::"text", "p_user_agent_hash" "text" DEFAULT NULL::"text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$ 
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


ALTER FUNCTION "public"."record_legal_consent"("p_document_type" "text", "p_version" "text", "p_ip_hash" "text", "p_user_agent_hash" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."record_sound_usage"("p_sound_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
    INSERT INTO public.economy_ledger (amount, transaction_type)
    VALUES (0.00, 'sound_usage');
END;
$$;


ALTER FUNCTION "public"."record_sound_usage"("p_sound_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."record_story_product_event"("p_story_id" "uuid", "p_product_id" "text", "p_event" "text", "p_quantity" integer DEFAULT 1, "p_order_id" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if auth.uid() is null then return; end if;
  if p_event not in ('view','click','add_to_cart','purchase') then return; end if;
  if p_event = 'view' and exists (
    select 1 from story_product_events
    where story_id = p_story_id and product_id = p_product_id
      and user_id = auth.uid() and event_type = 'view'
  ) then return; end if;
  insert into story_product_events (story_id, product_id, user_id, event_type, quantity, order_id)
  values (p_story_id, p_product_id, auth.uid(), p_event, greatest(coalesce(p_quantity,1),1), p_order_id)
  on conflict do nothing;
end $$;


ALTER FUNCTION "public"."record_story_product_event"("p_story_id" "uuid", "p_product_id" "text", "p_event" "text", "p_quantity" integer, "p_order_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."record_story_view"("p_story_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."record_story_view"("p_story_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."record_video_gift"("p_video_id" "uuid", "p_sender_id" "uuid", "p_gift_code" "text", "p_checkout_intent_id" "uuid" DEFAULT NULL::"uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$ 
DECLARE 
    v_creator uuid; 
    v_price int; 
    v_id uuid; 
BEGIN 
    SELECT author_id INTO v_creator FROM videos WHERE id = p_video_id; 
    IF v_creator IS NULL THEN RAISE EXCEPTION 'VIDEO_NOT_FOUND'; END IF; 
    IF v_creator = p_sender_id THEN RAISE EXCEPTION 'CANNOT_GIFT_SELF'; END IF; 
    
    SELECT price_minor INTO v_price FROM video_gifts_catalog WHERE code = p_gift_code AND active = true; 
    IF v_price IS NULL THEN RAISE EXCEPTION 'GIFT_NOT_FOUND'; END IF; 
    
    INSERT INTO video_gift_events (video_id, creator_id, sender_id, gift_code, amount_minor, checkout_intent_id) 
    VALUES (p_video_id, v_creator, p_sender_id, p_gift_code, v_price, p_checkout_intent_id) 
    RETURNING id INTO v_id; 
    
    RETURN v_id; 
END; $$;


ALTER FUNCTION "public"."record_video_gift"("p_video_id" "uuid", "p_sender_id" "uuid", "p_gift_code" "text", "p_checkout_intent_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."record_video_watch"("p_video_id" "uuid", "p_watch_ms" integer, "p_duration_ms" integer, "p_completed" boolean DEFAULT false, "p_rewatched" boolean DEFAULT false, "p_liked" boolean DEFAULT false, "p_shared" boolean DEFAULT false, "p_negative_signal" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  insert into public.video_watch_events(
    video_id, user_id, watch_ms, duration_ms,
    completed, rewatched, liked, shared, negative_signal
  )
  values(
    p_video_id, auth.uid(), p_watch_ms, p_duration_ms,
    p_completed, p_rewatched, p_liked, p_shared, p_negative_signal
  );
end;
$$;


ALTER FUNCTION "public"."record_video_watch"("p_video_id" "uuid", "p_watch_ms" integer, "p_duration_ms" integer, "p_completed" boolean, "p_rewatched" boolean, "p_liked" boolean, "p_shared" boolean, "p_negative_signal" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."register_post_view"("p_post_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  uid uuid := auth.uid();
  owner_id uuid;
  inserted boolean := false;
  new_views bigint := 0;
begin
  if uid is null then raise exception 'AUTH_REQUIRED'; end if;
  select author_id into owner_id from public.posts where id = p_post_id;
  if owner_id is null then raise exception 'POST_NOT_FOUND'; end if;
  if owner_id = uid then
    select coalesce(views_count, 0) into new_views from public.posts where id = p_post_id;
    return jsonb_build_object('counted', false, 'views', new_views);
  end if;
  insert into public.post_views(post_id, viewer_id, view_date) values (p_post_id, uid, current_date) on conflict (post_id, viewer_id, view_date) do nothing;
  inserted := found;
  if inserted then
    update public.posts set views_count = coalesce(views_count, 0) + 1, updated_at = now() where id = p_post_id returning views_count into new_views;
  else
    select coalesce(views_count, 0) into new_views from public.posts where id = p_post_id;
  end if;
  return jsonb_build_object('counted', inserted, 'views', new_views);
end; $$;


ALTER FUNCTION "public"."register_post_view"("p_post_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."register_video_hashtags"("p_video_id" "uuid", "p_text" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$ 
DECLARE t text; 
BEGIN 
    IF p_video_id IS NULL OR p_text IS NULL THEN RETURN; END IF; 
    DELETE FROM video_hashtags WHERE video_id = p_video_id; 
    FOR t IN SELECT lower(m[1]) FROM regexp_matches(p_text, '#([A-Za-zÀ-ÿ0-9_]{2,40})', 'g') AS m LOOP 
        INSERT INTO video_hashtags (video_id, tag) VALUES (p_video_id, t) ON CONFLICT DO NOTHING; 
    END LOOP; 
END; $$;


ALTER FUNCTION "public"."register_video_hashtags"("p_video_id" "uuid", "p_text" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."register_video_view"("p_video_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'pg_temp'
    AS $$
DECLARE
  uid uuid := auth.uid();
  inserted boolean := false;
  new_views bigint := 0;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED'
      USING ERRCODE = '28000';
  END IF;

  IF p_video_id IS NULL THEN
    RAISE EXCEPTION 'VIDEO_REQUIRED'
      USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = uid
  ) THEN
    RAISE EXCEPTION 'PROFILE_NOT_FOUND';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.videos v
    WHERE v.id = p_video_id
  ) THEN
    RAISE EXCEPTION 'VIDEO_NOT_FOUND';
  END IF;

  INSERT INTO public.video_views (
    video_id,
    viewer_id,
    view_date
  )
  VALUES (
    p_video_id,
    uid,
    current_date
  )
  ON CONFLICT (video_id, viewer_id, view_date)
  DO NOTHING;

  inserted := FOUND;

  IF inserted THEN
    UPDATE public.videos
    SET views = COALESCE(views, 0) + 1
    WHERE id = p_video_id
    RETURNING views INTO new_views;
  ELSE
    SELECT COALESCE(v.views, 0)
    INTO new_views
    FROM public.videos v
    WHERE v.id = p_video_id;
  END IF;

  RETURN jsonb_build_object(
    'counted', inserted,
    'views', COALESCE(new_views, 0)
  );
END;
$$;


ALTER FUNCTION "public"."register_video_view"("p_video_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."reject_friend_request"("p_follow_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
    UPDATE public.follows
    SET
        status = 'rejected',
        is_friend = false
    WHERE id = p_follow_id
      AND followed_id = auth.uid()
      AND status = 'pending'
      AND is_friend = true;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'FRIEND_REQUEST_NOT_FOUND';
    END IF;

    RETURN true;
END;
$$;


ALTER FUNCTION "public"."reject_friend_request"("p_follow_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."remove_friend"("p_user" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'NOT_AUTHENTICATED'; end if;
  delete from public.follows
  where is_friend = true
    and ((follower_id = v_user and followed_id = p_user)
      or (follower_id = p_user and followed_id = v_user));
  return true;
end $$;


ALTER FUNCTION "public"."remove_friend"("p_user" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."report_community_message"("p_message" "uuid", "p_reason" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_group uuid;
begin
  select c.group_id into v_group
  from public.channel_messages m
  join public.channels c on c.id = m.channel_id
  where m.id = p_message;

  if v_group is null or not public.can_see_group(v_group) then
    raise exception 'Message introuvable ou accès refusé';
  end if;

  insert into public.community_reports (group_id, message_id, reporter_id, reason)
  values (v_group, p_message, auth.uid(), left(coalesce(p_reason, ''), 300))
  on conflict (message_id, reporter_id) do nothing;
end $$;


ALTER FUNCTION "public"."report_community_message"("p_message" "uuid", "p_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."request_economy_payout"("p_amount_minor" bigint, "p_method" "text", "p_destination_token" "text" DEFAULT NULL::"text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$ 
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


ALTER FUNCTION "public"."request_economy_payout"("p_amount_minor" bigint, "p_method" "text", "p_destination_token" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."revoke_group_invite"("p_invite_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_group uuid;
begin
  select group_id into v_group
  from public.group_invites
  where id = p_invite_id;

  if v_group is null then
    raise exception 'Invitation introuvable';
  end if;

  if public.group_role(v_group) not in ('owner', 'admin') then
    raise exception 'Droits insuffisants';
  end if;

  delete from public.group_invites where id = p_invite_id;
end;
$$;


ALTER FUNCTION "public"."revoke_group_invite"("p_invite_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rls_auto_enable"() RETURNS "event_trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog'
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."rls_auto_enable"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."role_rank"("p_role" "text") RETURNS integer
    LANGUAGE "sql" IMMUTABLE
    AS $$
  select case p_role
    when 'owner' then 3 when 'admin' then 2
    when 'moderator' then 1 when 'member' then 0 else -1 end;
$$;


ALTER FUNCTION "public"."role_rank"("p_role" "text") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."sounds" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "creator_id" "uuid",
    "title" "text" NOT NULL,
    "audio_url" "text" NOT NULL,
    "duration_seconds" integer,
    "license_type" "text" DEFAULT 'baaro_original'::"text",
    "territory_restrictions" "text"[],
    "is_verified" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);


ALTER TABLE "public"."sounds" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."search_audio_library"("q" "text") RETURNS SETOF "public"."sounds"
    LANGUAGE "sql"
    AS $$
  SELECT * FROM sounds WHERE title ILIKE '%'||q||'%' AND is_verified=true LIMIT 20;
$$;


ALTER FUNCTION "public"."search_audio_library"("q" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."search_audio_library"("p_query" "text", "p_genre" "text", "p_limit" integer) RETURNS TABLE("id" "uuid", "title" "text", "artist" "text", "audio_url" "text", "preview_url" "text", "duration_seconds" integer, "license_code" "text", "license_name" "text", "rights_holder" "text", "attribution_required" boolean, "commercial_use_allowed" boolean, "remix_allowed" boolean, "genre" "text", "language" "text", "region" "text")
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT 
    s.id,
    s.title,
    NULL::text as artist,
    s.audio_url,
    s.audio_url as preview_url, -- fallback preview = même url
    s.duration_seconds,
    s.license_type as license_code,
    s.license_type as license_name,
    NULL::text as rights_holder,
    false as attribution_required,
    true as commercial_use_allowed,
    true as remix_allowed,
    'tous'::text as genre,
    NULL::text as language,
    s.territory_restrictions as region
  FROM sounds s
  WHERE s.is_verified = true
  AND (p_query IS NULL OR s.title ILIKE '%'||p_query||'%')
  ORDER BY s.created_at DESC
  LIMIT LEAST(COALESCE(p_limit,50), 50);
$$;


ALTER FUNCTION "public"."search_audio_library"("p_query" "text", "p_genre" "text", "p_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."security_list_devices"() RETURNS TABLE("id" "uuid", "device_id" "text", "label" "text", "platform" "text", "fingerprint" "text", "trusted" boolean, "revoked_at" timestamp with time zone, "last_seen_at" timestamp with time zone, "created_at" timestamp with time zone)
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public'
    AS $$
  select d.id, d.device_id, d.label, d.platform, d.fingerprint,
         d.trusted, d.revoked_at, d.last_seen_at, d.created_at
  from public.security_devices d
  where d.user_id = auth.uid()
  order by d.last_seen_at desc;
$$;


ALTER FUNCTION "public"."security_list_devices"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."security_revoke_device"("target_device_id" "text") RETURNS boolean
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  update public.security_devices
     set revoked_at = now(), trusted = false
   where user_id = auth.uid()
     and device_id = target_device_id
     and revoked_at is null;
  return found;
end;
$$;


ALTER FUNCTION "public"."security_revoke_device"("target_device_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."send_friend_request"("p_target" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
    v_user uuid := auth.uid();
BEGIN
    IF v_user IS NULL THEN
        RAISE EXCEPTION 'NOT_AUTHENTICATED';
    END IF;

    IF p_target IS NULL THEN
        RAISE EXCEPTION 'INVALID_TARGET';
    END IF;

    IF v_user = p_target THEN
        RAISE EXCEPTION 'CANNOT_FRIEND_SELF';
    END IF;

    INSERT INTO public.follows (
        follower_id,
        followed_id,
        status,
        is_friend
    )
    VALUES (
        v_user,
        p_target,
        'pending',
        true
    )
    ON CONFLICT (follower_id, followed_id)
    DO UPDATE SET
        status = 'pending',
        is_friend = true;

    RETURN true;
END;
$$;


ALTER FUNCTION "public"."send_friend_request"("p_target" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."send_tip"("p_recipient_id" "uuid", "p_amount_minor" bigint, "p_post_id" "uuid" DEFAULT NULL::"uuid", "p_live_id" "uuid" DEFAULT NULL::"uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  uid uuid := auth.uid();
  i public.monetization_checkout_intents;
  code text;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED';
  END IF;

  IF p_recipient_id IS NULL OR p_recipient_id = uid THEN
    RAISE EXCEPTION 'INVALID_RECIPIENT';
  END IF;

  IF p_amount_minor NOT IN (10000, 50000, 100000) THEN
    RAISE EXCEPTION 'INVALID_TIP_AMOUNT';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_recipient_id) THEN
    RAISE EXCEPTION 'RECIPIENT_NOT_FOUND';
  END IF;

  code := CASE p_amount_minor
    WHEN 10000 THEN 'tip_100'
    WHEN 50000 THEN 'tip_500'
    ELSE 'tip_1000'
  END;

  INSERT INTO public.monetization_checkout_intents (
    user_id, product_code, amount_minor, currency, expires_at, metadata
  )
  VALUES (
    uid,
    code,
    p_amount_minor,
    'XOF',
    now() + interval '30 minutes',
    jsonb_build_object(
      'recipient_id', p_recipient_id,
      'post_id', p_post_id,
      'live_id', p_live_id,
      'source', 'tip'
    )
  )
  RETURNING * INTO i;

  RETURN jsonb_build_object(
    'id', i.id,
    'product_code', i.product_code,
    'amount_minor', i.amount_minor,
    'currency', i.currency,
    'status', i.status,
    'expires_at', i.expires_at
  );
END;
$$;


ALTER FUNCTION "public"."send_tip"("p_recipient_id" "uuid", "p_amount_minor" bigint, "p_post_id" "uuid", "p_live_id" "uuid") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."creator_monetization" (
    "creator_id" "uuid" NOT NULL,
    "enabled" boolean DEFAULT false NOT NULL,
    "revenue_share" numeric DEFAULT 0.55 NOT NULL,
    "min_cashout" numeric DEFAULT 1000 NOT NULL,
    "currency" "text" DEFAULT 'XOF'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "creator_monetization_min_cashout_check" CHECK (("min_cashout" >= (0)::numeric)),
    CONSTRAINT "creator_monetization_revenue_share_check" CHECK ((("revenue_share" >= (0)::numeric) AND ("revenue_share" <= (1)::numeric)))
);


ALTER TABLE "public"."creator_monetization" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_creator_monetization_enabled"("p_enabled" boolean) RETURNS "public"."creator_monetization"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
declare r public.creator_monetization;
begin
  update public.creator_monetization set enabled = p_enabled, updated_at = now() where creator_id = auth.uid() returning * into r;
  if not found then
    insert into public.creator_monetization(creator_id, enabled) values (auth.uid(), p_enabled) returning * into r;
  end if;
  return r;
end; $$;


ALTER FUNCTION "public"."set_creator_monetization_enabled"("p_enabled" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_debate_room_ended_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  if new.status = 'ended' and old.status is distinct from 'ended' then
    new.ended_at := coalesce(new.ended_at, now());
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."set_debate_room_ended_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_media_assets_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return new;
end $$;


ALTER FUNCTION "public"."set_media_assets_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_member_role"("p_group" "uuid", "p_user" "uuid", "p_role" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_actor text := public.group_role(p_group);
  v_target text;
begin
  if coalesce(p_role, '') not in ('admin','moderator','member') then
    raise exception 'Rôle invalide';
  end if;

  select role into v_target from public.group_members
  where group_id = p_group and user_id = p_user;
  if v_target is null then raise exception 'Membre introuvable'; end if;
  if v_target = 'owner' then raise exception 'Le propriétaire ne peut pas changer'; end if;

  if v_actor = 'owner' then
    null;
  elsif v_actor = 'admin' and p_role <> 'admin' and v_target <> 'admin' then
    null;
  else
    raise exception 'Droits insuffisants';
  end if;

  update public.group_members set role = p_role
  where group_id = p_group and user_id = p_user;
end $$;


ALTER FUNCTION "public"."set_member_role"("p_group" "uuid", "p_user" "uuid", "p_role" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_message_expiry"("p_message_id" "uuid", "p_seconds" integer) RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  update public.messages m
     set expires_at = case when p_seconds is null or p_seconds <= 0 then null else now() + make_interval(secs => p_seconds) end
   where m.id = p_message_id and m.sender_id = auth.uid();
end;
$$;


ALTER FUNCTION "public"."set_message_expiry"("p_message_id" "uuid", "p_seconds" integer) OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profile_view_premium" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "enabled" boolean DEFAULT false,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);


ALTER TABLE "public"."profile_view_premium" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_profile_view_premium"("p_enabled" boolean) RETURNS "public"."profile_view_premium"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare uid uuid:=auth.uid(); r public.profile_view_premium;
begin
 if uid is null then raise exception 'AUTH_REQUIRED'; end if;
 insert into public.profile_view_premium(user_id,enabled) values(uid,p_enabled)
 on conflict(user_id) do update set enabled=excluded.enabled,updated_at=now()
 returning * into r;
 return r;
end $$;


ALTER FUNCTION "public"."set_profile_view_premium"("p_enabled" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."shop_is_live"("p_active" boolean, "p_status" "text", "p_trial" timestamp with time zone, "p_expires" timestamp with time zone) RETURNS boolean
    LANGUAGE "sql" STABLE
    AS $$
  select coalesce(p_active, false) and (
    case when coalesce(p_status, 'none') = 'trial'
         then p_trial is not null and p_trial > now()
         else p_expires is null or p_expires > now()
    end
  );
$$;


ALTER FUNCTION "public"."shop_is_live"("p_active" boolean, "p_status" "text", "p_trial" timestamp with time zone, "p_expires" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."shops_enforce_insert"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if auth.role() = 'authenticated' then
    if exists (select 1 from public.shops where owner_id = new.owner_id) then
      new.is_active := false;
      new.subscription_status := 'none';
      new.trial_ends_at := null;
      new.subscription_expires_at := null;
    else
      new.is_active := true;
      new.subscription_status := 'trial';
      new.trial_ends_at := now() + interval '30 days';
      new.subscription_expires_at := null;
    end if;
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."shops_enforce_insert"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."shops_protect_billing"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if auth.role() = 'authenticated' then
    new.is_active := old.is_active;
    new.subscription_status := old.subscription_status;
    new.trial_ends_at := old.trial_ends_at;
    new.subscription_expires_at := old.subscription_expires_at;
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."shops_protect_billing"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."start_creator_subscription_checkout"("p_creator_id" "uuid", "p_amount_minor" bigint DEFAULT 50000) RETURNS "jsonb"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$ 
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


ALTER FUNCTION "public"."start_creator_subscription_checkout"("p_creator_id" "uuid", "p_amount_minor" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."start_monetization_checkout"("p_product_code" "text", "p_metadata" "jsonb" DEFAULT '{}'::"jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare uid uuid:=auth.uid(); p public.monetization_products; i public.monetization_checkout_intents;
begin
 if uid is null then raise exception 'AUTH_REQUIRED'; end if;
 select * into p from public.monetization_products where code=p_product_code and active=true;
 if not found then raise exception 'PRODUCT_NOT_FOUND'; end if;
 insert into public.monetization_checkout_intents(user_id,product_code,amount_minor,currency,metadata)
 values(uid,p.code,p.price_minor,p.currency,coalesce(p_metadata,'{}'::jsonb)) returning * into i;
 return jsonb_build_object('id',i.id,'product_code',i.product_code,'amount_minor',i.amount_minor,'currency',i.currency,'status',i.status,'expires_at',i.expires_at);
end $$;


ALTER FUNCTION "public"."start_monetization_checkout"("p_product_code" "text", "p_metadata" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."stories_set_expiry"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  if new.publish_at is null then new.publish_at := now(); end if;
  if new.publish_at > now() + interval '30 days' then
    raise exception 'Programmation limitée à 30 jours';
  end if;
  new.expires_at := new.publish_at + interval '24 hours';
  return new;
end $$;


ALTER FUNCTION "public"."stories_set_expiry"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."story_actor_name"("p" "uuid") RETURNS "text"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select coalesce((select display_name from profiles where id = p), 'Quelqu''un');
$$;


ALTER FUNCTION "public"."story_actor_name"("p" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."touch_message_read"("p_message_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  update public.messages m
     set read_at = now(), delivered_at = coalesce(delivered_at, now())
   where m.id = p_message_id
     and m.recipient_id = auth.uid();
end;
$$;


ALTER FUNCTION "public"."touch_message_read"("p_message_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."touch_profile_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."touch_profile_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trg_notify_sticker_answer"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare v_author uuid;
begin
  select author_id into v_author from stories where id = new.story_id;
  perform notify_user(v_author, new.user_id, 'story_question_answer', new.story_id,
    story_actor_name(new.user_id) || ' a répondu à ta question', left(new.body, 120));
  return new;
end $$;


ALTER FUNCTION "public"."trg_notify_sticker_answer"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trg_notify_story_mentions"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare el jsonb;
begin
  if new.publish_at > now() + interval '1 minute' then return new; end if;
  for el in select * from jsonb_array_elements(coalesce(new.stickers, '[]'::jsonb)) loop
    if el->>'type' = 'mention' then
      begin
        perform notify_user((el->'data'->>'user_id')::uuid, new.author_id, 'story_mention', new.id,
          story_actor_name(new.author_id) || ' t''a mentionné dans sa story', left(coalesce(new.caption,''), 120));
      exception when others then null;
      end;
    end if;
  end loop;
  return new;
end $$;


ALTER FUNCTION "public"."trg_notify_story_mentions"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trg_notify_story_poll_vote"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare v_author uuid;
begin
  select author_id into v_author from stories where id = new.post_id;
  if v_author is null then return new; end if;
  perform notify_user(v_author, new.user_id, 'story_poll_vote', new.post_id,
    story_actor_name(new.user_id) || ' a voté à ton sondage', null);
  return new;
end $$;


ALTER FUNCTION "public"."trg_notify_story_poll_vote"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trg_notify_story_reaction"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare v_author uuid;
begin
  select author_id into v_author from stories where id = new.story_id;
  perform notify_user(v_author, new.user_id, 'story_reaction', new.story_id,
    story_actor_name(new.user_id) || ' a réagi ' || new.reaction || ' à ta story', new.reaction);
  return new;
end $$;


ALTER FUNCTION "public"."trg_notify_story_reaction"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trg_notify_story_reply"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare v_author uuid;
begin
  select author_id into v_author from stories where id = new.story_id;
  perform notify_user(v_author, new.sender_id, 'story_reply', new.story_id,
    story_actor_name(new.sender_id) || ' a répondu à ta story', left(new.body, 120));
  return new;
end $$;


ALTER FUNCTION "public"."trg_notify_story_reply"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."unban_community_member"("p_group" "uuid", "p_user" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if public.role_rank(public.group_role(p_group)) < 1 then
    raise exception 'Droits insuffisants';
  end if;
  delete from public.group_bans where group_id = p_group and user_id = p_user;
end $$;


ALTER FUNCTION "public"."unban_community_member"("p_group" "uuid", "p_user" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_notifications_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."update_notifications_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_video_comments_count"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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


ALTER FUNCTION "public"."update_video_comments_count"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_video_likes_count"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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


ALTER FUNCTION "public"."update_video_likes_count"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."upsert_push_token"("p_user_id" "uuid", "p_token" "text", "p_platform" "text", "p_user_agent" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if auth.uid() is null or auth.uid() <> p_user_id then
    raise exception 'Non autorisé';
  end if;

  if p_platform not in ('web', 'android', 'ios') then
    raise exception 'Plateforme invalide';
  end if;

  if coalesce(length(p_token), 0) = 0 or length(p_token) > 4096 then
    raise exception 'Jeton invalide';
  end if;

  -- Un jeton appartient à un seul compte : l'appareil change de compte.
  delete from public.push_tokens
  where token = p_token and user_id <> p_user_id;

  insert into public.push_tokens (user_id, token, platform, user_agent, updated_at)
  values (p_user_id, p_token, p_platform, p_user_agent, now())
  on conflict (user_id, token)
  do update set
    platform = excluded.platform,
    user_agent = excluded.user_agent,
    updated_at = now();

  -- Garde les 5 appareils les plus récents par plateforme.
  delete from public.push_tokens
  where id in (
    select id from public.push_tokens
    where user_id = p_user_id and platform = p_platform
    order by updated_at desc nulls last
    offset 5
  );
end;
$$;


ALTER FUNCTION "public"."upsert_push_token"("p_user_id" "uuid", "p_token" "text", "p_platform" "text", "p_user_agent" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."video_discovery_score"("p_video_id" "uuid", "p_user_id" "uuid" DEFAULT "auth"."uid"()) RETURNS numeric
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select round(
    (coalesce(v.views,0)::numeric * 0.02)
    + (coalesce(v.likes,0)::numeric * 1.0)
    + (coalesce(v.comments_count,0)::numeric * 1.8)
    + (coalesce(v.completion_rate,0) * 100)
    + (coalesce(v.rewatch_rate,0) * 80)
    + case when v.author_id = p_user_id then -100 else 0 end
  , 4)
  from public.videos v
  where v.id = p_video_id;
$$;


ALTER FUNCTION "public"."video_discovery_score"("p_video_id" "uuid", "p_user_id" "uuid") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."videos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "author_id" "uuid" NOT NULL,
    "video_url" "text" NOT NULL,
    "thumbnail_url" "text",
    "title" "text" DEFAULT 'Vidéo BAARO'::"text" NOT NULL,
    "description" "text",
    "duration" "text",
    "views" bigint DEFAULT 0 NOT NULL,
    "likes" integer DEFAULT 0 NOT NULL,
    "comments_count" integer DEFAULT 0 NOT NULL,
    "is_repost" boolean DEFAULT false NOT NULL,
    "original_author_id" "uuid",
    "sound_id" "text",
    "sound_url" "text",
    "sound_title" "text",
    "mute_original" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "content_mode" "text" DEFAULT 'original'::"text" NOT NULL,
    "language_code" "text",
    "ai_caption" "text",
    "ai_topics" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "ai_highlights" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "chapters" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "cover_frame_ms" integer,
    "visibility" "text" DEFAULT 'public'::"text" NOT NULL,
    "allow_remix" boolean DEFAULT true NOT NULL,
    "allow_duet" boolean DEFAULT true NOT NULL,
    "allow_comments" boolean DEFAULT true NOT NULL,
    "allow_download" boolean DEFAULT false NOT NULL,
    "allow_tips" boolean DEFAULT true NOT NULL,
    "challenge_id" "uuid",
    "recommendation_score" numeric DEFAULT 0 NOT NULL,
    "completion_rate" numeric DEFAULT 0 NOT NULL,
    "rewatch_rate" numeric DEFAULT 0 NOT NULL,
    "reply_to_comment_id" "uuid",
    "reply_to_video_id" "uuid",
    "source_video_id" "uuid",
    "collab_mode" "text",
    "stitch_start_ms" integer,
    "stitch_end_ms" integer,
    "playlist_id" "uuid",
    CONSTRAINT "videos_collab_mode_check" CHECK ((("collab_mode" IS NULL) OR ("collab_mode" = ANY (ARRAY['stitch'::"text", 'duo'::"text", 'reply'::"text"])))),
    CONSTRAINT "videos_content_mode_check" CHECK (("content_mode" = ANY (ARRAY['original'::"text", 'remix'::"text", 'duet'::"text", 'react'::"text", 'reply'::"text", 'collab'::"text", 'challenge'::"text", 'tutorial'::"text", 'music'::"text", 'comedy'::"text", 'education'::"text"]))),
    CONSTRAINT "videos_visibility_check" CHECK (("visibility" = ANY (ARRAY['public'::"text", 'followers'::"text", 'private'::"text", 'unlisted'::"text"])))
);


ALTER TABLE "public"."videos" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."video_feed_candidates"("p_user_id" "uuid", "p_limit" integer DEFAULT 20) RETURNS SETOF "public"."videos"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select * from public.videos
  where visibility = 'public'
  order by created_at desc
  limit p_limit;
$$;


ALTER FUNCTION "public"."video_feed_candidates"("p_user_id" "uuid", "p_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."vote_poll"("p_poll_id" "uuid", "p_option_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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
$$;


ALTER FUNCTION "public"."vote_poll"("p_poll_id" "uuid", "p_option_id" "uuid") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."abuse_counters" (
    "bucket_key" "text" NOT NULL,
    "window_started_at" timestamp with time zone NOT NULL,
    "request_count" integer DEFAULT 0 NOT NULL,
    "blocked_until" timestamp with time zone,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."abuse_counters" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."affiliate_attributions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "affiliate_id" "uuid",
    "referred_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);


ALTER TABLE "public"."affiliate_attributions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ai_action_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "module_id" "text" NOT NULL,
    "action" "text" NOT NULL,
    "status" "text" DEFAULT 'requested'::"text" NOT NULL,
    "consent_version" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "ai_action_log_status_check" CHECK (("status" = ANY (ARRAY['requested'::"text", 'approved'::"text", 'completed'::"text", 'rejected'::"text", 'failed'::"text"])))
);


ALTER TABLE "public"."ai_action_log" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ai_agent_tasks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "goal" "text" NOT NULL,
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "plan" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "result" "jsonb",
    "requires_confirmation" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "ai_agent_tasks_goal_check" CHECK ((("char_length"("goal") >= 1) AND ("char_length"("goal") <= 2000))),
    CONSTRAINT "ai_agent_tasks_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'awaiting_confirmation'::"text", 'running'::"text", 'completed'::"text", 'failed'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."ai_agent_tasks" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ai_usage_daily" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "usage_date" "date" DEFAULT CURRENT_DATE,
    "paid_generations" integer DEFAULT 0,
    "units_used" integer DEFAULT 0
);


ALTER TABLE "public"."ai_usage_daily" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."api_plans" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "plan_code" "text" NOT NULL,
    "name" "text" NOT NULL,
    "price_minor" integer DEFAULT 0,
    "currency" character varying(3) DEFAULT 'XOF'::character varying
);


ALTER TABLE "public"."api_plans" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."api_subscriptions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "owner_id" "uuid",
    "plan_code" "text",
    "status" "text" DEFAULT 'active'::"text",
    "current_period_end" timestamp with time zone
);


ALTER TABLE "public"."api_subscriptions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."api_usage_daily" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "usage_date" "date" DEFAULT CURRENT_DATE
);


ALTER TABLE "public"."api_usage_daily" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."automation_rules" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "module_id" "text" NOT NULL,
    "name" "text" NOT NULL,
    "trigger" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "action" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "enabled" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."automation_rules" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."b2b_insight_exports" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "requester_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);


ALTER TABLE "public"."b2b_insight_exports" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."baaro_credits_accounts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "balance" integer DEFAULT 0,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);


ALTER TABLE "public"."baaro_credits_accounts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."baaro_credits_ledger" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "amount" integer NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);


ALTER TABLE "public"."baaro_credits_ledger" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."calls" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "conversation_id" "uuid",
    "caller_id" "uuid" NOT NULL,
    "callee_id" "uuid" NOT NULL,
    "type" "text" NOT NULL,
    "status" "text" DEFAULT 'ringing'::"text" NOT NULL,
    "daily_room_name" "text",
    "daily_room_url" "text",
    "started_at" timestamp with time zone,
    "ended_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "duration_seconds" integer,
    CONSTRAINT "calls_status_check" CHECK (("status" = ANY (ARRAY['ringing'::"text", 'ongoing'::"text", 'ended'::"text", 'rejected'::"text", 'missed'::"text"]))),
    CONSTRAINT "calls_type_check" CHECK (("type" = ANY (ARRAY['voice'::"text", 'video'::"text"])))
);


ALTER TABLE "public"."calls" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."cart" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "item_id" "uuid" NOT NULL,
    "quantity" integer DEFAULT 1 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "cart_quantity_check" CHECK (("quantity" > 0))
);


ALTER TABLE "public"."cart" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."channel_messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "channel_id" "uuid" NOT NULL,
    "sender_id" "uuid" NOT NULL,
    "text" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."channel_messages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."chat_ai_jobs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "conversation_id" "uuid" NOT NULL,
    "requested_by" "uuid" NOT NULL,
    "action" "text" NOT NULL,
    "target_language" "text",
    "status" "text" DEFAULT 'queued'::"text" NOT NULL,
    "result" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "completed_at" timestamp with time zone,
    CONSTRAINT "chat_ai_jobs_action_check" CHECK (("action" = ANY (ARRAY['summary'::"text", 'smart_reply'::"text", 'translate'::"text", 'rewrite'::"text", 'tone'::"text", 'extract_tasks'::"text"]))),
    CONSTRAINT "chat_ai_jobs_status_check" CHECK (("status" = ANY (ARRAY['queued'::"text", 'running'::"text", 'done'::"text", 'failed'::"text"])))
);


ALTER TABLE "public"."chat_ai_jobs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."chat_devices" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "device_id" "text" NOT NULL,
    "public_key" "jsonb" NOT NULL,
    "label" "text",
    "last_seen_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "revoked_at" timestamp with time zone
);


ALTER TABLE "public"."chat_devices" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."comments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "post_id" "uuid" NOT NULL,
    "author_id" "uuid" NOT NULL,
    "text" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."comments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."community_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organizer_id" "uuid",
    "title" "text" NOT NULL,
    "description" "text",
    "location" "text",
    "starts_at" timestamp with time zone NOT NULL,
    "ends_at" timestamp with time zone,
    "online_url" "text",
    "cover_media_key" "text",
    "capacity" integer,
    "status" "text" DEFAULT 'published'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "community_events_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'published'::"text", 'cancelled'::"text", 'finished'::"text"])))
);


ALTER TABLE "public"."community_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."community_reports" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "group_id" "uuid",
    "message_id" "uuid",
    "reporter_id" "uuid" NOT NULL,
    "reason" "text",
    "status" "text" DEFAULT 'open'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."community_reports" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."companies" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "owner_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "company_type" "text" DEFAULT 'transport'::"text" NOT NULL,
    "category" "text",
    "country" "text" DEFAULT 'ML'::"text" NOT NULL,
    "city" "text",
    "phone" "text",
    "email" "text",
    "website" "text",
    "logo_url" "text",
    "currency" "text" DEFAULT 'XOF'::"text" NOT NULL,
    "is_active" boolean DEFAULT false NOT NULL,
    "subscription_status" "text" DEFAULT 'none'::"text" NOT NULL,
    "trial_ends_at" timestamp with time zone,
    "subscription_ends_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "companies_subscription_status_check" CHECK (("subscription_status" = ANY (ARRAY['none'::"text", 'trial'::"text", 'active'::"text", 'expired'::"text"])))
);


ALTER TABLE "public"."companies" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."company_infos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "content" "text" NOT NULL,
    "is_public" boolean DEFAULT true NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."company_infos" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."company_programs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "origin" "text",
    "destination" "text",
    "start_time" time without time zone,
    "end_time" time without time zone,
    "days_of_week" smallint[] DEFAULT '{}'::smallint[] NOT NULL,
    "price" numeric(14,2),
    "currency" "text",
    "sort_order" integer DEFAULT 0 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."company_programs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."company_reviews" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "rating" smallint NOT NULL,
    "comment" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "company_reviews_rating_check" CHECK ((("rating" >= 1) AND ("rating" <= 5)))
);


ALTER TABLE "public"."company_reviews" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."company_subscriptions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "amount" numeric(14,2) DEFAULT 0 NOT NULL,
    "currency" "text" DEFAULT 'XOF'::"text",
    "provider" "text",
    "payment_ref" "text",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "period_start" timestamp with time zone,
    "period_end" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."company_subscriptions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."company_tariffs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "price" numeric(14,2) NOT NULL,
    "currency" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."company_tariffs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."contact_hashes" (
    "hash" "text" NOT NULL,
    "profile_id" "uuid" NOT NULL,
    "kind" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "contact_hashes_kind_check" CHECK (("kind" = ANY (ARRAY['phone'::"text", 'email'::"text"])))
);


ALTER TABLE "public"."contact_hashes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."content_bookmarks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "content_type" "text" NOT NULL,
    "content_id" "uuid" NOT NULL,
    "collection" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."content_bookmarks" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."conversation_settings" (
    "conversation_id" "uuid" NOT NULL,
    "disappearing_seconds" integer,
    "read_receipts" boolean DEFAULT true NOT NULL,
    "typing_indicators" boolean DEFAULT true NOT NULL,
    "link_previews" boolean DEFAULT true NOT NULL,
    "media_auto_download" boolean DEFAULT false NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "conversation_settings_disappearing_seconds_check" CHECK ((("disappearing_seconds" IS NULL) OR ("disappearing_seconds" = ANY (ARRAY[0, 86400, 604800, 2592000]))))
);


ALTER TABLE "public"."conversation_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."conversations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user1_id" "uuid" NOT NULL,
    "user2_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."conversations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."creator_coach_tips" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "creator_id" "uuid" NOT NULL,
    "video_id" "uuid",
    "tip_type" "text" NOT NULL,
    "message" "text" NOT NULL,
    "dismissed" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "creator_coach_tips_tip_type_check" CHECK (("tip_type" = ANY (ARRAY['hook_too_long'::"text", 'low_retention'::"text", 'no_captions'::"text", 'trending_sound'::"text", 'best_time'::"text", 'low_completion'::"text", 'no_thumbnail_variant'::"text"])))
);


ALTER TABLE "public"."creator_coach_tips" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."creator_earnings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "creator_id" "uuid" NOT NULL,
    "source" "text" NOT NULL,
    "reference_id" "uuid",
    "gross_amount" numeric DEFAULT 0 NOT NULL,
    "platform_fee" numeric DEFAULT 0 NOT NULL,
    "net_amount" numeric GENERATED ALWAYS AS (("gross_amount" - "platform_fee")) STORED,
    "currency" "text" DEFAULT 'XOF'::"text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "creator_earnings_gross_amount_check" CHECK (("gross_amount" >= (0)::numeric)),
    CONSTRAINT "creator_earnings_platform_fee_check" CHECK (("platform_fee" >= (0)::numeric)),
    CONSTRAINT "creator_earnings_source_check" CHECK (("source" = ANY (ARRAY['ads'::"text", 'tips'::"text", 'subscriptions'::"text", 'gifts'::"text", 'marketplace'::"text", 'bonus'::"text"]))),
    CONSTRAINT "creator_earnings_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'available'::"text", 'paid'::"text", 'reversed'::"text"])))
);


ALTER TABLE "public"."creator_earnings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."creator_payout_profiles" (
    "user_id" "uuid" NOT NULL,
    "kyc_status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "payout_verified" boolean DEFAULT false NOT NULL,
    "country_code" "text",
    "legal_name" "text",
    "verified_at" timestamp with time zone,
    "risk_level" "text" DEFAULT 'normal'::"text" NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "creator_payout_profiles_kyc_status_check" CHECK (("kyc_status" = ANY (ARRAY['pending'::"text", 'submitted'::"text", 'verified'::"text", 'rejected'::"text", 'suspended'::"text"]))),
    CONSTRAINT "creator_payout_profiles_risk_level_check" CHECK (("risk_level" = ANY (ARRAY['normal'::"text", 'review'::"text", 'blocked'::"text"])))
);


ALTER TABLE "public"."creator_payout_profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."creator_profiles" (
    "user_id" "uuid" NOT NULL,
    "category" "text",
    "bio" "text",
    "verified" boolean DEFAULT false NOT NULL,
    "subscriber_count" bigint DEFAULT 0 NOT NULL,
    "support_enabled" boolean DEFAULT true NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."creator_profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."creator_revenue_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "creator_id" "uuid" NOT NULL,
    "source" "text" NOT NULL,
    "gross_minor" bigint DEFAULT 0 NOT NULL,
    "creator_minor" bigint DEFAULT 0 NOT NULL,
    "currency" "text" DEFAULT 'USD'::"text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."creator_revenue_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."creator_reward_accounts" (
    "user_id" "uuid" NOT NULL,
    "points" bigint DEFAULT 0 NOT NULL,
    "lifetime_points" bigint DEFAULT 0 NOT NULL,
    "tier" "text" DEFAULT 'starter'::"text" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "creator_reward_accounts_lifetime_points_check" CHECK (("lifetime_points" >= 0)),
    CONSTRAINT "creator_reward_accounts_points_check" CHECK (("points" >= 0)),
    CONSTRAINT "creator_reward_accounts_tier_check" CHECK (("tier" = ANY (ARRAY['starter'::"text", 'rising'::"text", 'creator'::"text", 'pro'::"text", 'elite'::"text"])))
);


ALTER TABLE "public"."creator_reward_accounts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."creator_reward_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "source" "text" NOT NULL,
    "points" bigint NOT NULL,
    "reference_id" "uuid",
    "idempotency_key" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "creator_reward_events_points_check" CHECK (("points" > 0))
);


ALTER TABLE "public"."creator_reward_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."creator_subscriptions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "creator_id" "uuid" NOT NULL,
    "subscriber_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "tier" "text" DEFAULT 'free'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "creator_subscriptions_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'paused'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."creator_subscriptions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."data_export_jobs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "scope" "text" DEFAULT 'all'::"text" NOT NULL,
    "status" "text" DEFAULT 'queued'::"text" NOT NULL,
    "object_key" "text",
    "expires_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "data_export_jobs_status_check" CHECK (("status" = ANY (ARRAY['queued'::"text", 'processing'::"text", 'ready'::"text", 'expired'::"text", 'failed'::"text"])))
);


ALTER TABLE "public"."data_export_jobs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."debate_messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "room_id" "uuid" NOT NULL,
    "sender_id" "uuid",
    "sender_type" "text" DEFAULT 'user'::"text" NOT NULL,
    "text" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "debate_messages_sender_type_check" CHECK (("sender_type" = ANY (ARRAY['user'::"text", 'ai'::"text", 'system'::"text"])))
);


ALTER TABLE "public"."debate_messages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."debate_participants" (
    "room_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "joined_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "left_at" timestamp with time zone,
    "role" "text" DEFAULT 'viewer'::"text" NOT NULL,
    CONSTRAINT "debate_participants_role_check" CHECK (("role" = ANY (ARRAY['host'::"text", 'co_host'::"text", 'viewer'::"text"])))
);


ALTER TABLE "public"."debate_participants" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."delivery_orders" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "shop_id" "uuid" NOT NULL,
    "buyer_id" "uuid" NOT NULL,
    "shop_product_id" "uuid",
    "method" "text" NOT NULL,
    "provider" "text" DEFAULT 'mock'::"text" NOT NULL,
    "dropoff_lat" double precision,
    "dropoff_lng" double precision,
    "dropoff_address" "text",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "current_lat" double precision,
    "current_lng" double precision,
    "estimated_delivery_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "delivery_orders_method_check" CHECK (("method" = ANY (ARRAY['pickup'::"text", 'courier'::"text", 'drone'::"text"]))),
    CONSTRAINT "delivery_orders_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'dispatched'::"text", 'in_transit'::"text", 'delivered'::"text", 'cancelled'::"text", 'failed'::"text"])))
);


ALTER TABLE "public"."delivery_orders" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."device_accounts" (
    "device_id" "text" NOT NULL,
    "id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."device_accounts" OWNER TO "postgres";


COMMENT ON COLUMN "public"."device_accounts"."id" IS 'Identifiant utilisateur = auth.users.id (plus de user_id)';



CREATE TABLE IF NOT EXISTS "public"."e2e_key_backups" (
    "user_id" "uuid" NOT NULL,
    "proof_hash" "text" NOT NULL,
    "salt" "text" NOT NULL,
    "iter" integer NOT NULL,
    "wrap_secret" "text" NOT NULL,
    "backup" "jsonb" NOT NULL,
    "failed_attempts" integer DEFAULT 0 NOT NULL,
    "lock_level" integer DEFAULT 0 NOT NULL,
    "locked_until" timestamp with time zone,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."e2e_key_backups" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."economy_accounts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "balance" numeric(12,2) DEFAULT 0.00,
    "currency" character varying(3) DEFAULT 'XOF'::character varying,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "available_minor" bigint DEFAULT 0 NOT NULL,
    "pending_minor" bigint DEFAULT 0 NOT NULL,
    "payout_hold_minor" bigint DEFAULT 0 NOT NULL,
    "lifetime_minor" bigint DEFAULT 0 NOT NULL
);


ALTER TABLE "public"."economy_accounts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."economy_ledger" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "sender_id" "uuid",
    "receiver_id" "uuid",
    "amount" numeric(12,2) DEFAULT 0,
    "currency" character varying(3) DEFAULT 'XOF'::character varying,
    "transaction_type" "text",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "user_id" "uuid",
    "entry_type" "text",
    "bucket" "text",
    "direction" "text",
    "source" "text",
    "amount_minor" bigint NOT NULL,
    "reference_id" "uuid",
    "idempotency_key" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL
);


ALTER TABLE "public"."economy_ledger" OWNER TO "postgres";


COMMENT ON COLUMN "public"."economy_ledger"."amount" IS 'Ancienne colonne (legacy). À migrer progressivement vers amount_minor.';



COMMENT ON COLUMN "public"."economy_ledger"."amount_minor" IS 'Source de vérité monétaire (en unités mineures). Préférer cette colonne.';



CREATE TABLE IF NOT EXISTS "public"."economy_payouts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "amount_minor" bigint NOT NULL,
    "currency" "text" DEFAULT 'XOF'::"text" NOT NULL,
    "method" "text" NOT NULL,
    "destination_token" "text",
    "status" "text" DEFAULT 'requested'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "processed_at" timestamp with time zone,
    CONSTRAINT "economy_payouts_amount_minor_check" CHECK (("amount_minor" > 0)),
    CONSTRAINT "economy_payouts_method_check" CHECK (("method" = ANY (ARRAY['mobile_money'::"text", 'bank_transfer'::"text"]))),
    CONSTRAINT "economy_payouts_status_check" CHECK (("status" = ANY (ARRAY['requested'::"text", 'processing'::"text", 'paid'::"text", 'failed'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."economy_payouts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."event_attendees" (
    "event_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'going'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "event_attendees_status_check" CHECK (("status" = ANY (ARRAY['going'::"text", 'interested'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."event_attendees" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."feed_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "post_id" "uuid",
    "user_id" "uuid",
    "event_type" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);


ALTER TABLE "public"."feed_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."follows" (
    "follower_id" "uuid" NOT NULL,
    "followed_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'accepted'::"text" NOT NULL,
    "is_friend" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "id" "uuid" DEFAULT "gen_random_uuid"(),
    CONSTRAINT "follows_check" CHECK (("follower_id" <> "followed_id")),
    CONSTRAINT "follows_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'accepted'::"text", 'rejected'::"text"])))
);


ALTER TABLE "public"."follows" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."group_bans" (
    "group_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "banned_by" "uuid",
    "reason" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."group_bans" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."group_members" (
    "group_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role" "text" DEFAULT 'member'::"text" NOT NULL,
    "joined_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "group_members_role_check" CHECK (("role" = ANY (ARRAY['owner'::"text", 'admin'::"text", 'moderator'::"text", 'member'::"text"])))
);


ALTER TABLE "public"."group_members" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."job_listings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "owner_id" "uuid",
    "title" "text" NOT NULL,
    "description" "text",
    "company_name" "text",
    "location" "text",
    "remote" boolean DEFAULT false NOT NULL,
    "skills" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "status" "text" DEFAULT 'open'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "expires_at" timestamp with time zone,
    CONSTRAINT "job_listings_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'open'::"text", 'closed'::"text", 'filled'::"text"])))
);


ALTER TABLE "public"."job_listings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."job_profile_boosts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "status" "text" DEFAULT 'active'::"text",
    "ends_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);


ALTER TABLE "public"."job_profile_boosts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."learning_courses" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "creator_id" "uuid",
    "title" "text" NOT NULL,
    "description" "text",
    "language" "text" DEFAULT 'fr'::"text",
    "level" "text",
    "category" "text",
    "cover_media_key" "text",
    "published" boolean DEFAULT false NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."learning_courses" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."learning_progress" (
    "user_id" "uuid" NOT NULL,
    "course_id" "uuid" NOT NULL,
    "progress" numeric DEFAULT 0 NOT NULL,
    "completed_at" timestamp with time zone,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "learning_progress_progress_check" CHECK ((("progress" >= (0)::numeric) AND ("progress" <= (100)::numeric)))
);


ALTER TABLE "public"."learning_progress" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."legal_consents" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "document_type" "text" NOT NULL,
    "version" "text" NOT NULL,
    "accepted_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "ip_hash" "text",
    "user_agent_hash" "text",
    CONSTRAINT "legal_consents_document_type_check" CHECK (("document_type" = ANY (ARRAY['terms'::"text", 'privacy'::"text", 'community'::"text", 'creator'::"text", 'merchant'::"text", 'refund'::"text", 'cookies'::"text"])))
);


ALTER TABLE "public"."legal_consents" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."live_trainings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "host_id" "uuid",
    "title" "text" NOT NULL,
    "status" "text" DEFAULT 'published'::"text",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);


ALTER TABLE "public"."live_trainings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."media_assets" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "owner_id" "uuid" NOT NULL,
    "provider" "text" DEFAULT 'cloudflare-r2'::"text" NOT NULL,
    "bucket" "text" NOT NULL,
    "folder" "text" NOT NULL,
    "object_key" "text" NOT NULL,
    "public_url" "text" NOT NULL,
    "mime_type" "text" NOT NULL,
    "byte_size" bigint NOT NULL,
    "original_name" "text",
    "status" "text" DEFAULT 'ready'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "variants" "jsonb" DEFAULT '{}'::"jsonb",
    "upload_token_hash" "text",
    "hls_url" "text",
    "dash_url" "text",
    "expires_at" timestamp with time zone,
    "upload_mode" "text" DEFAULT 'r2_direct'::"text",
    CONSTRAINT "media_assets_byte_size_check" CHECK (("byte_size" > 0)),
    CONSTRAINT "media_assets_folder_check" CHECK (("folder" = ANY (ARRAY['profiles'::"text", 'posts'::"text", 'videos'::"text", 'stories'::"text", 'comments'::"text", 'chat'::"text", 'shop'::"text", 'misc'::"text"]))),
    CONSTRAINT "media_assets_provider_check" CHECK (("provider" = 'cloudflare-r2'::"text")),
    CONSTRAINT "media_assets_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'ready'::"text", 'failed'::"text", 'deleted'::"text"]))),
    CONSTRAINT "media_assets_upload_mode_check" CHECK (("upload_mode" = ANY (ARRAY['r2_direct'::"text", 'worker'::"text"])))
);


ALTER TABLE "public"."media_assets" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."media_upload_tokens" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "owner_id" "uuid" NOT NULL,
    "token_hash" "text" NOT NULL,
    "bucket" "text" NOT NULL,
    "object_key" "text" NOT NULL,
    "max_bytes" bigint,
    "expires_at" timestamp with time zone NOT NULL,
    "used_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."media_upload_tokens" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."merchant_pro_subscriptions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "merchant_id" "uuid",
    "status" "text" DEFAULT 'active'::"text",
    "current_period_end" timestamp with time zone,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);


ALTER TABLE "public"."merchant_pro_subscriptions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."message_pins" (
    "message_id" "uuid" NOT NULL,
    "pinned_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."message_pins" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."message_reactions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "message_id" "uuid" NOT NULL,
    "conversation_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "emoji" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "message_reactions_emoji_check" CHECK (("emoji" = ANY (ARRAY['❤️'::"text", '😂'::"text", '😮'::"text", '😢'::"text", '😡'::"text", '👍'::"text", '👎'::"text", '🔥'::"text", '🙏'::"text", '🎉'::"text"])))
);


ALTER TABLE "public"."message_reactions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."message_reports" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "message_id" "uuid" NOT NULL,
    "reporter_id" "uuid" NOT NULL,
    "reason" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "message_reports_reason_check" CHECK (("reason" = ANY (ARRAY['spam'::"text", 'harassment'::"text", 'scam'::"text", 'violence'::"text", 'sexual'::"text", 'other'::"text"])))
);


ALTER TABLE "public"."message_reports" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."message_stars" (
    "message_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."message_stars" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "conversation_id" "uuid",
    "sender_id" "uuid" NOT NULL,
    "recipient_id" "uuid",
    "text" "text" DEFAULT ''::"text" NOT NULL,
    "type" "text" DEFAULT 'text'::"text" NOT NULL,
    "media_url" "text",
    "media_mime" "text",
    "media_size" bigint,
    "media_duration" numeric,
    "file_name" "text",
    "deleted_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "read_at" timestamp with time zone,
    "edited_at" timestamp with time zone,
    "client_message_id" "text",
    "reply_to_id" "uuid",
    "expires_at" timestamp with time zone,
    "delivered_at" timestamp with time zone,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "scheduled_for" timestamp with time zone
);


ALTER TABLE "public"."messages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."module_preferences" (
    "user_id" "uuid" NOT NULL,
    "module_id" "text" NOT NULL,
    "settings" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."module_preferences" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."monetization_checkout_intents" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "product_id" "uuid",
    "product_code" "text",
    "amount_minor" integer DEFAULT 0,
    "currency" character varying(3) DEFAULT 'XOF'::character varying,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "provider" "text",
    "provider_reference" "text",
    "status" "text" DEFAULT 'pending'::"text",
    "expires_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "provider_amount_minor" bigint
);


ALTER TABLE "public"."monetization_checkout_intents" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."monetization_products" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "code" "text" NOT NULL,
    "name" "text" NOT NULL,
    "product_type" "text",
    "category" "text" DEFAULT 'general'::"text",
    "price" numeric(12,2),
    "price_minor" integer DEFAULT 0,
    "currency" character varying(3) DEFAULT 'XOF'::character varying,
    "active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "description" "text",
    "billing_period" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."monetization_products" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."nexus_actions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "action_type" "text" NOT NULL,
    "payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "status" "text" DEFAULT 'queued'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "completed_at" timestamp with time zone,
    CONSTRAINT "nexus_actions_action_type_check" CHECK (("action_type" = ANY (ARRAY['recommend'::"text", 'remind'::"text", 'summarize'::"text", 'translate'::"text", 'learn'::"text", 'create'::"text", 'sell'::"text", 'connect'::"text"]))),
    CONSTRAINT "nexus_actions_status_check" CHECK (("status" = ANY (ARRAY['queued'::"text", 'running'::"text", 'completed'::"text", 'failed'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."nexus_actions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."nexus_goals" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "progress" numeric(5,2) DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "nexus_goals_description_check" CHECK ((("description" IS NULL) OR ("char_length"("description") <= 2000))),
    CONSTRAINT "nexus_goals_progress_check" CHECK ((("progress" >= (0)::numeric) AND ("progress" <= (100)::numeric))),
    CONSTRAINT "nexus_goals_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'paused'::"text", 'completed'::"text", 'archived'::"text"]))),
    CONSTRAINT "nexus_goals_title_check" CHECK ((("char_length"("title") >= 1) AND ("char_length"("title") <= 160)))
);


ALTER TABLE "public"."nexus_goals" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."nexus_memory_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "scope" "text" DEFAULT 'personal'::"text" NOT NULL,
    "title" "text" NOT NULL,
    "content" "text" NOT NULL,
    "source" "text" DEFAULT 'user'::"text" NOT NULL,
    "expires_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "nexus_memory_items_content_check" CHECK ((("char_length"("content") >= 1) AND ("char_length"("content") <= 5000))),
    CONSTRAINT "nexus_memory_items_scope_check" CHECK (("scope" = ANY (ARRAY['personal'::"text", 'conversation'::"text", 'community'::"text", 'project'::"text"]))),
    CONSTRAINT "nexus_memory_items_source_check" CHECK (("source" = ANY (ARRAY['user'::"text", 'assistant'::"text", 'imported'::"text"]))),
    CONSTRAINT "nexus_memory_items_title_check" CHECK ((("char_length"("title") >= 1) AND ("char_length"("title") <= 160)))
);


ALTER TABLE "public"."nexus_memory_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."nexus_preferences" (
    "user_id" "uuid" NOT NULL,
    "ai_enabled" boolean DEFAULT true NOT NULL,
    "personalization_enabled" boolean DEFAULT true NOT NULL,
    "memory_enabled" boolean DEFAULT true NOT NULL,
    "discovery_mode" "text" DEFAULT 'balanced'::"text" NOT NULL,
    "data_export_enabled" boolean DEFAULT true NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "nexus_preferences_discovery_mode_check" CHECK (("discovery_mode" = ANY (ARRAY['balanced'::"text", 'chronological'::"text", 'serendipity'::"text", 'local'::"text"])))
);


ALTER TABLE "public"."nexus_preferences" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."nexus_trust_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "subject_id" "uuid" NOT NULL,
    "actor_id" "uuid",
    "kind" "text" NOT NULL,
    "weight" integer DEFAULT 0 NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "nexus_trust_events_kind_check" CHECK (("kind" = ANY (ARRAY['verified_identity'::"text", 'successful_trade'::"text", 'community_contribution'::"text", 'reported_abuse'::"text", 'resolved_report'::"text", 'quality_content'::"text", 'spam_penalty'::"text"]))),
    CONSTRAINT "nexus_trust_events_weight_check" CHECK ((("weight" >= '-100'::integer) AND ("weight" <= 100)))
);


ALTER TABLE "public"."nexus_trust_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."notification_preferences" (
    "user_id" "uuid" NOT NULL,
    "push_enabled" boolean DEFAULT true,
    "messages" boolean DEFAULT true,
    "social" boolean DEFAULT true,
    "live" boolean DEFAULT true,
    "marketing" boolean DEFAULT false,
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "earnings" boolean DEFAULT true NOT NULL,
    "sound_id" "text",
    "sound_silent" boolean DEFAULT false NOT NULL,
    CONSTRAINT "notification_preferences_sound_id_check" CHECK ((("sound_id" IS NULL) OR ("sound_id" = ANY (ARRAY['baaro_pulse'::"text", 'sahel_beat'::"text", 'nko_glow'::"text", 'market_hustle'::"text", 'live_drop'::"text", 'creator_rise'::"text", 'baaro_signature'::"text"]))))
);


ALTER TABLE "public"."notification_preferences" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."notifications" (
    "notification_id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "actor_id" "uuid",
    "type" "text" DEFAULT 'general'::"text",
    "message" "text" DEFAULT ''::"text" NOT NULL,
    "source_id" "uuid",
    "read" boolean DEFAULT false NOT NULL,
    "read_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "preview" "text",
    "idempotency_key" "text"
);

ALTER TABLE ONLY "public"."notifications" REPLICA IDENTITY FULL;


ALTER TABLE "public"."notifications" OWNER TO "postgres";


COMMENT ON COLUMN "public"."notifications"."idempotency_key" IS 'Stable event key used to make notification inserts atomic and idempotent.';



CREATE OR REPLACE VIEW "public"."notification_unread_counts" AS
 SELECT "user_id",
    "count"(*) AS "unread_count"
   FROM "public"."notifications"
  WHERE ("read" = false)
  GROUP BY "user_id";


ALTER VIEW "public"."notification_unread_counts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."observability_events" (
    "id" bigint NOT NULL,
    "service" "text" NOT NULL,
    "event_type" "text" NOT NULL,
    "severity" "text" DEFAULT 'info'::"text" NOT NULL,
    "duration_ms" integer,
    "request_id" "text",
    "region" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "observability_events_severity_check" CHECK (("severity" = ANY (ARRAY['debug'::"text", 'info'::"text", 'warn'::"text", 'error'::"text", 'critical'::"text"])))
);


ALTER TABLE "public"."observability_events" OWNER TO "postgres";


ALTER TABLE "public"."observability_events" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."observability_events_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."offline_sync_queue" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "client_id" "text" NOT NULL,
    "operation" "text" NOT NULL,
    "payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "attempts" integer DEFAULT 0 NOT NULL,
    "next_attempt_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "offline_sync_queue_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'processing'::"text", 'done'::"text", 'failed'::"text"])))
);


ALTER TABLE "public"."offline_sync_queue" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."order_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "order_id" "uuid" NOT NULL,
    "product_id" "uuid",
    "name" "text" NOT NULL,
    "unit_price" numeric DEFAULT 0 NOT NULL,
    "quantity" integer DEFAULT 1 NOT NULL,
    "currency" "text" DEFAULT 'XOF'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "order_items_quantity_check" CHECK (("quantity" > 0))
);


ALTER TABLE "public"."order_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."orders" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "buyer_id" "uuid" NOT NULL,
    "shop_id" "uuid",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "method" "text",
    "total_amount" numeric DEFAULT 0 NOT NULL,
    "currency" "text" DEFAULT 'XOF'::"text" NOT NULL,
    "pickup_code" "text",
    "notes" "text",
    "payment_status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "payment_reference" "text",
    "paid_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "dropoff_address" "text"
);


ALTER TABLE "public"."orders" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."payment_webhook_events" (
    "provider" "text" NOT NULL,
    "event_id" "text" NOT NULL,
    "payload_hash" "text" NOT NULL,
    "status" "text" DEFAULT 'processing'::"text" NOT NULL,
    "error_code" "text",
    "started_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "completed_at" timestamp with time zone,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "payment_webhook_events_completed_at_check" CHECK ((("status" <> 'completed'::"text") OR ("completed_at" IS NOT NULL))),
    CONSTRAINT "payment_webhook_events_event_id_check" CHECK ((("length"(TRIM(BOTH FROM "event_id")) >= 1) AND ("length"(TRIM(BOTH FROM "event_id")) <= 255))),
    CONSTRAINT "payment_webhook_events_payload_hash_check" CHECK (("length"(TRIM(BOTH FROM "payload_hash")) = 64)),
    CONSTRAINT "payment_webhook_events_provider_check" CHECK (("provider" = ANY (ARRAY['stripe'::"text", 'paypal'::"text", 'cinetpay'::"text"]))),
    CONSTRAINT "payment_webhook_events_status_check" CHECK (("status" = ANY (ARRAY['processing'::"text", 'completed'::"text", 'failed'::"text"])))
);

ALTER TABLE ONLY "public"."payment_webhook_events" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."payment_webhook_events" OWNER TO "postgres";


COMMENT ON TABLE "public"."payment_webhook_events" IS 'Registre privé d''idempotence des événements Stripe, PayPal et CinetPay.';



COMMENT ON COLUMN "public"."payment_webhook_events"."provider" IS 'Fournisseur du paiement : stripe, paypal ou cinetpay.';



COMMENT ON COLUMN "public"."payment_webhook_events"."event_id" IS 'Identifiant unique fourni par le prestataire de paiement.';



COMMENT ON COLUMN "public"."payment_webhook_events"."payload_hash" IS 'Empreinte SHA-256 du payload vérifié.';



COMMENT ON COLUMN "public"."payment_webhook_events"."status" IS 'processing pendant le traitement, completed après succès, failed après erreur.';



CREATE TABLE IF NOT EXISTS "public"."poll_options" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "poll_id" "uuid" NOT NULL,
    "option_text" "text" NOT NULL,
    "position" integer NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "votes_count" integer DEFAULT 0,
    CONSTRAINT "poll_options_option_text_check" CHECK ((("char_length"(TRIM(BOTH FROM "option_text")) >= 1) AND ("char_length"(TRIM(BOTH FROM "option_text")) <= 300))),
    CONSTRAINT "poll_options_position_check" CHECK (("position" >= 0))
);


ALTER TABLE "public"."poll_options" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."poll_votes" (
    "poll_id" "uuid" NOT NULL,
    "option_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "post_id" "uuid" NOT NULL,
    "option_index" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."poll_votes" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."poll_results" AS
 SELECT "po"."poll_id",
    "po"."id" AS "option_id",
    "po"."option_text",
    "po"."position",
    "count"("pv"."user_id") AS "vote_count"
   FROM ("public"."poll_options" "po"
     LEFT JOIN "public"."poll_votes" "pv" ON (("pv"."option_id" = "po"."id")))
  GROUP BY "po"."poll_id", "po"."id", "po"."option_text", "po"."position";


ALTER VIEW "public"."poll_results" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."polls" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "post_id" "uuid" NOT NULL,
    "question" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "polls_question_check" CHECK ((("char_length"(TRIM(BOTH FROM "question")) >= 1) AND ("char_length"(TRIM(BOTH FROM "question")) <= 500)))
);


ALTER TABLE "public"."polls" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."post_bookmarks" (
    "post_id" "uuid" NOT NULL,
    "user_id" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."post_bookmarks" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."post_likes" (
    "post_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."post_likes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."post_poll_votes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "post_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "option_index" integer NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."post_poll_votes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."post_reports" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "post_id" "uuid" NOT NULL,
    "reporter_id" "uuid" NOT NULL,
    "reason" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);


ALTER TABLE "public"."post_reports" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."post_reposts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "post_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."post_reposts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."post_views" (
    "post_id" "uuid" NOT NULL,
    "viewer_id" "uuid" NOT NULL,
    "view_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "viewed_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."post_views" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."posts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "author_id" "uuid" NOT NULL,
    "text" "text" DEFAULT ''::"text" NOT NULL,
    "media_url" "text",
    "media_type" "text",
    "likes_count" integer DEFAULT 0 NOT NULL,
    "comments_count" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "views_count" bigint DEFAULT 0 NOT NULL,
    "reposts_count" integer DEFAULT 0,
    "media_urls" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "is_shadow" boolean DEFAULT false NOT NULL,
    "shadow_village" "text",
    CONSTRAINT "posts_media_type_check" CHECK ((("media_type" IS NULL) OR ("media_type" = ANY (ARRAY['image'::"text", 'video'::"text", 'audio'::"text"])))),
    CONSTRAINT "posts_shadow_village_length" CHECK ((("shadow_village" IS NULL) OR (("char_length"("btrim"("shadow_village")) >= 2) AND ("char_length"("btrim"("shadow_village")) <= 80))))
);


ALTER TABLE "public"."posts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."premium_subscriptions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "status" "text" DEFAULT 'active'::"text",
    "provider" "text",
    "provider_reference" "text",
    "current_period_start" timestamp with time zone DEFAULT "now"(),
    "current_period_end" timestamp with time zone,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);


ALTER TABLE "public"."premium_subscriptions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profile_contacts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "contact_type" "text" NOT NULL,
    "value" "text" NOT NULL,
    "label" "text" DEFAULT ''::"text" NOT NULL,
    "position" integer DEFAULT 1 NOT NULL,
    "is_primary" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "profile_contacts_contact_type_check" CHECK (("contact_type" = ANY (ARRAY['phone'::"text", 'email'::"text"])))
);


ALTER TABLE "public"."profile_contacts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profile_links" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "link_type" "text" DEFAULT 'link'::"text" NOT NULL,
    "label" "text" DEFAULT 'Lien'::"text" NOT NULL,
    "url" "text" NOT NULL,
    "position" integer DEFAULT 1 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."profile_links" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profile_social_links" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "platform" "text" NOT NULL,
    "username" "text" DEFAULT ''::"text" NOT NULL,
    "url" "text" NOT NULL,
    "position" integer DEFAULT 1 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."profile_social_links" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "display_name" "text" DEFAULT 'Membre BAARO'::"text" NOT NULL,
    "handle" "text" NOT NULL,
    "flag" "text" DEFAULT '🌍'::"text",
    "bio" "text" DEFAULT ''::"text",
    "avatar_url" "text",
    "phone" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "restricted" boolean DEFAULT false NOT NULL,
    "last_seen_at" timestamp with time zone,
    "is_premium" boolean DEFAULT false NOT NULL,
    "first_name" "text",
    "last_name" "text",
    "birth_date" "date",
    "location" "text",
    "country" "text",
    "registered_country" "text",
    "country_changed_at" timestamp with time zone,
    "country_change_available_at" timestamp with time zone,
    "cover_url" "text",
    "is_verified" boolean DEFAULT false NOT NULL,
    "public_key" "text",
    "language" "text"
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


COMMENT ON COLUMN "public"."profiles"."id" IS 'Identifiant unique du compte BAARO = auth.users.id';



COMMENT ON COLUMN "public"."profiles"."handle" IS 'Identifiant public unique BAARO, insensible à la casse';



CREATE TABLE IF NOT EXISTS "public"."push_notification_dead_letters" (
    "source_job_id" "uuid" NOT NULL,
    "batch_id" "text" NOT NULL,
    "user_id" "text" NOT NULL,
    "token_id" "text" NOT NULL,
    "payload" "jsonb" NOT NULL,
    "attempts" integer NOT NULL,
    "last_error" "text" NOT NULL,
    "dead_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "push_notification_dead_letters_attempts_check" CHECK (("attempts" >= 0))
);


ALTER TABLE "public"."push_notification_dead_letters" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."push_tokens" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "token" "text" NOT NULL,
    "platform" "text" NOT NULL,
    "user_agent" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "push_tokens_platform_check" CHECK (("platform" = ANY (ARRAY['web'::"text", 'ios'::"text", 'android'::"text"])))
);


ALTER TABLE "public"."push_tokens" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."reputation_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "event_type" "text" NOT NULL,
    "score" integer DEFAULT 0 NOT NULL,
    "reference_id" "uuid",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."reputation_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."safety_reports" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "reporter_id" "uuid" NOT NULL,
    "target_type" "text" NOT NULL,
    "target_id" "uuid" NOT NULL,
    "reason" "text" NOT NULL,
    "details" "text",
    "status" "text" DEFAULT 'open'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "safety_reports_status_check" CHECK (("status" = ANY (ARRAY['open'::"text", 'reviewing'::"text", 'resolved'::"text", 'dismissed'::"text"])))
);


ALTER TABLE "public"."safety_reports" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."safety_signals" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "target_type" "text" NOT NULL,
    "target_id" "text" NOT NULL,
    "risk_level" "text" NOT NULL,
    "reasons" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "action" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "safety_signals_action_check" CHECK (("action" = ANY (ARRAY['allow'::"text", 'warn'::"text", 'block'::"text", 'review'::"text"]))),
    CONSTRAINT "safety_signals_risk_level_check" CHECK (("risk_level" = ANY (ARRAY['low'::"text", 'medium'::"text", 'high'::"text", 'critical'::"text"]))),
    CONSTRAINT "safety_signals_target_type_check" CHECK (("target_type" = ANY (ARRAY['account'::"text", 'message'::"text", 'link'::"text", 'post'::"text", 'transaction'::"text", 'seller'::"text"])))
);


ALTER TABLE "public"."safety_signals" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."saved_searches" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "query" "text" NOT NULL,
    "filters" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."saved_searches" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."search_history" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "query" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "search_history_query_check" CHECK ((("char_length"("query") >= 1) AND ("char_length"("query") <= 200)))
);


ALTER TABLE "public"."search_history" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."security_devices" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "device_id" "text" NOT NULL,
    "label" "text",
    "platform" "text",
    "public_key" "jsonb",
    "fingerprint" "text",
    "trusted" boolean DEFAULT false NOT NULL,
    "revoked_at" timestamp with time zone,
    "last_seen_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "security_devices_device_id_check" CHECK ((("char_length"("device_id") >= 16) AND ("char_length"("device_id") <= 200))),
    CONSTRAINT "security_devices_platform_check" CHECK (("platform" = ANY (ARRAY['web'::"text", 'android'::"text", 'ios'::"text", 'desktop'::"text", 'unknown'::"text"])))
);


ALTER TABLE "public"."security_devices" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."security_events" (
    "id" bigint NOT NULL,
    "user_id" "uuid",
    "event_type" "text" NOT NULL,
    "device_id" "text",
    "request_id" "text",
    "ip_hash" "text",
    "user_agent_hash" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "security_events_event_type_check" CHECK (("event_type" = ANY (ARRAY['login'::"text", 'logout'::"text", 'password_change'::"text", 'mfa_change'::"text", 'device_added'::"text", 'device_revoked'::"text", 'session_rejected'::"text", 'suspicious_login'::"text", 'rate_limited'::"text", 'report_created'::"text", 'data_exported'::"text", 'security_setting_changed'::"text", 'key_rotated'::"text"])))
);


ALTER TABLE "public"."security_events" OWNER TO "postgres";


ALTER TABLE "public"."security_events" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."security_events_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."security_settings" (
    "user_id" "uuid" NOT NULL,
    "require_mfa" boolean DEFAULT false NOT NULL,
    "login_alerts" boolean DEFAULT true NOT NULL,
    "new_device_approval" boolean DEFAULT true NOT NULL,
    "remote_logout_enabled" boolean DEFAULT true NOT NULL,
    "ai_sensitive_action_confirmation" boolean DEFAULT true NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."security_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."service_listings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "owner_id" "uuid",
    "title" "text" NOT NULL,
    "description" "text",
    "category" "text",
    "location" "text",
    "price" numeric,
    "currency" "text" DEFAULT 'XOF'::"text",
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "service_listings_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'active'::"text", 'paused'::"text", 'closed'::"text"])))
);


ALTER TABLE "public"."service_listings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."shop_pricing" (
    "currency" "text" NOT NULL,
    "amount_normal" numeric(12,2) NOT NULL,
    "amount_premium" numeric(12,2) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."shop_pricing" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."shop_products" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "shop_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "price" numeric(12,2) NOT NULL,
    "currency" "text" DEFAULT 'XOF'::"text" NOT NULL,
    "type" "text" DEFAULT 'produit'::"text" NOT NULL,
    "image_url" "text",
    "is_available" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "compare_at_price" numeric(12,2),
    "stock" integer,
    "images" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "category" "text",
    "sku" "text",
    "low_stock_threshold" integer DEFAULT 5 NOT NULL,
    "tags" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    CONSTRAINT "shop_products_type_check" CHECK (("type" = ANY (ARRAY['produit'::"text", 'service'::"text", 'numerique'::"text"])))
);


ALTER TABLE "public"."shop_products" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."shop_reviews" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "shop_id" "uuid" NOT NULL,
    "order_id" "uuid",
    "buyer_id" "uuid" NOT NULL,
    "rating" integer NOT NULL,
    "comment" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "shop_reviews_rating_check" CHECK ((("rating" >= 1) AND ("rating" <= 5)))
);


ALTER TABLE "public"."shop_reviews" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."shop_subscriptions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "shop_id" "uuid" NOT NULL,
    "amount" numeric(12,2) NOT NULL,
    "currency" "text" NOT NULL,
    "was_premium_rate" boolean NOT NULL,
    "provider" "text" NOT NULL,
    "payment_ref" "text",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "period_start" timestamp with time zone,
    "period_end" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "shop_subscriptions_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'confirmed'::"text", 'failed'::"text", 'trial'::"text", 'expired'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."shop_subscriptions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."shops" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "owner_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "category" "text",
    "country" "text" NOT NULL,
    "city" "text",
    "latitude" double precision,
    "longitude" double precision,
    "logo_url" "text",
    "is_active" boolean DEFAULT false NOT NULL,
    "subscription_expires_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "currency" "text" DEFAULT 'XOF'::"text" NOT NULL,
    "subscription_status" "text" DEFAULT 'inactive'::"text" NOT NULL,
    "trial_ends_at" timestamp with time zone
);


ALTER TABLE "public"."shops" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."stories" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "author_id" "uuid" NOT NULL,
    "media_url" "text",
    "media_type" "text" DEFAULT 'image'::"text" NOT NULL,
    "caption" "text",
    "background" "text",
    "visibility" "text" DEFAULT 'followers'::"text" NOT NULL,
    "expires_at" timestamp with time zone DEFAULT ("now"() + '24:00:00'::interval) NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone,
    "audio_title" "text",
    "audio_url" "text",
    "poll" "jsonb",
    "product" "jsonb",
    "publish_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "stickers" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    CONSTRAINT "stories_media_type_check" CHECK (("media_type" = ANY (ARRAY['image'::"text", 'video'::"text", 'text'::"text"]))),
    CONSTRAINT "stories_visibility_check" CHECK (("visibility" = ANY (ARRAY['public'::"text", 'followers'::"text", 'close_friends'::"text"])))
);


ALTER TABLE "public"."stories" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."story_close_friends" (
    "owner_id" "uuid" NOT NULL,
    "member_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "story_close_friends_check" CHECK (("owner_id" <> "member_id"))
);


ALTER TABLE "public"."story_close_friends" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."story_highlight_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "highlight_id" "uuid" NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    "media_url" "text",
    "media_type" "text" DEFAULT 'text'::"text" NOT NULL,
    "caption" "text",
    "background" "text",
    "audio_url" "text",
    "audio_title" "text",
    "product" "jsonb",
    "stickers" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."story_highlight_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."story_highlights" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "owner_id" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "title" "text" NOT NULL,
    "cover_url" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "story_highlights_title_check" CHECK ((("char_length"("title") >= 1) AND ("char_length"("title") <= 40)))
);


ALTER TABLE "public"."story_highlights" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."story_product_events" (
    "id" bigint NOT NULL,
    "story_id" "uuid" NOT NULL,
    "product_id" "text" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "event_type" "text" NOT NULL,
    "quantity" integer DEFAULT 1 NOT NULL,
    "order_id" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "story_product_events_event_type_check" CHECK (("event_type" = ANY (ARRAY['view'::"text", 'click'::"text", 'add_to_cart'::"text", 'purchase'::"text"]))),
    CONSTRAINT "story_product_events_quantity_check" CHECK (("quantity" > 0))
);


ALTER TABLE "public"."story_product_events" OWNER TO "postgres";


ALTER TABLE "public"."story_product_events" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."story_product_events_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."story_reactions" (
    "story_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "reaction" "text" DEFAULT '❤️'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."story_reactions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."story_replies" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "story_id" "uuid" NOT NULL,
    "sender_id" "uuid" NOT NULL,
    "body" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "story_replies_body_check" CHECK ((("char_length"("body") >= 1) AND ("char_length"("body") <= 2000)))
);


ALTER TABLE "public"."story_replies" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."story_sticker_responses" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "story_id" "uuid" NOT NULL,
    "sticker_id" "text" NOT NULL,
    "user_id" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "body" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "story_sticker_responses_body_check" CHECK ((("char_length"("body") >= 1) AND ("char_length"("body") <= 300)))
);


ALTER TABLE "public"."story_sticker_responses" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."story_views" (
    "story_id" "uuid" NOT NULL,
    "viewer_id" "uuid" NOT NULL,
    "viewed_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."story_views" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tips" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "sender_id" "uuid",
    "receiver_id" "uuid",
    "amount" numeric(12,2) NOT NULL,
    "post_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);


ALTER TABLE "public"."tips" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."training_purchases" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "training_id" "uuid" NOT NULL,
    "buyer_id" "uuid" NOT NULL,
    "kind" "text" NOT NULL,
    "amount_minor" bigint NOT NULL,
    "currency" "text" DEFAULT 'XOF'::"text" NOT NULL,
    "provider" "text",
    "provider_reference" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "training_purchases_amount_minor_check" CHECK (("amount_minor" > 0)),
    CONSTRAINT "training_purchases_kind_check" CHECK (("kind" = ANY (ARRAY['live'::"text", 'replay'::"text"])))
);


ALTER TABLE "public"."training_purchases" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."trust_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "subject_user_id" "uuid" NOT NULL,
    "actor_user_id" "uuid",
    "event_type" "text" NOT NULL,
    "evidence" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "weight" numeric(8,3) DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."trust_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_blocks" (
    "blocker_id" "uuid" NOT NULL,
    "blocked_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "user_blocks_check" CHECK (("blocker_id" <> "blocked_id")),
    CONSTRAINT "user_blocks_not_self" CHECK (("blocker_id" <> "blocked_id"))
);


ALTER TABLE "public"."user_blocks" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_cosmetics" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "cosmetic_code" "text" NOT NULL,
    "quantity" integer DEFAULT 1
);


ALTER TABLE "public"."user_cosmetics" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_preferences" (
    "user_id" "uuid" NOT NULL,
    "language" "text" DEFAULT 'fr'::"text",
    "country" "text",
    "city" "text",
    "interests" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "notification_settings" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "discovery_settings" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "privacy_settings" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."user_preferences" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_settings" (
    "user_id" "uuid" NOT NULL,
    "id" "uuid" GENERATED ALWAYS AS ("user_id") STORED,
    "theme" "text" DEFAULT 'midnight'::"text" NOT NULL,
    "lang" "text" DEFAULT 'fr'::"text" NOT NULL,
    "country" "text" DEFAULT 'ML'::"text" NOT NULL,
    "currency" "text" DEFAULT 'XOF'::"text" NOT NULL,
    "data_saver" boolean DEFAULT true NOT NULL,
    "autoplay_video" boolean DEFAULT false NOT NULL,
    "offline_sync" boolean DEFAULT true NOT NULL,
    "ai_region" "text" DEFAULT 'auto'::"text" NOT NULL,
    "ai_suggest" boolean DEFAULT true NOT NULL,
    "auto_translate" boolean DEFAULT true NOT NULL,
    "translate_media" boolean DEFAULT true NOT NULL,
    "show_earnings" boolean DEFAULT false NOT NULL,
    "prefer_debates" boolean DEFAULT true NOT NULL,
    "prefer_local" boolean DEFAULT true NOT NULL,
    "private_profile" boolean DEFAULT false NOT NULL,
    "block_screenshots" boolean DEFAULT true NOT NULL,
    "biometric" boolean DEFAULT false NOT NULL,
    "large_text" boolean DEFAULT false NOT NULL,
    "reduce_motion" boolean DEFAULT false NOT NULL,
    "notif_push" boolean DEFAULT true NOT NULL,
    "smart_prefetch" boolean DEFAULT true NOT NULL,
    "battery_saver" boolean DEFAULT false NOT NULL,
    "low_bandwidth_mode" boolean DEFAULT false NOT NULL,
    "local_cache" boolean DEFAULT true NOT NULL,
    "privacy_ai" boolean DEFAULT true NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "custom_theme" "jsonb",
    "enabled_modules" "jsonb" DEFAULT '{}'::"jsonb",
    CONSTRAINT "user_settings_lang_check" CHECK (("lang" = ANY (ARRAY['fr'::"text", 'en'::"text", 'ar'::"text", 'bm'::"text", 'wo'::"text", 'ha'::"text", 'ff'::"text", 'sw'::"text", 'pt'::"text", 'es'::"text", 'nqo'::"text", 'boz'::"text", 'dog'::"text", 'snk'::"text"])))
);


ALTER TABLE "public"."user_settings" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."v_trust_score" AS
 SELECT "trust_events"."subject_user_id" AS "user_id",
    COALESCE("sum"("trust_events"."weight"), (0)::numeric) AS "trust_score",
    ("count"(*))::integer AS "events_count"
   FROM "public"."trust_events"
  GROUP BY "trust_events"."subject_user_id"
UNION ALL
 SELECT "nexus_trust_events"."subject_id" AS "user_id",
    (COALESCE("sum"("nexus_trust_events"."weight"), (0)::bigint))::numeric AS "trust_score",
    ("count"(*))::integer AS "events_count"
   FROM "public"."nexus_trust_events"
  GROUP BY "nexus_trust_events"."subject_id";


ALTER VIEW "public"."v_trust_score" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."video_ai_assets" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "video_id" "uuid" NOT NULL,
    "asset_type" "text" NOT NULL,
    "start_ms" integer,
    "end_ms" integer,
    "score" numeric,
    "payload" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "video_ai_assets_asset_type_check" CHECK (("asset_type" = ANY (ARRAY['hook'::"text", 'highlight'::"text", 'chapter'::"text", 'caption'::"text", 'translation'::"text", 'dub'::"text", 'thumbnail_variant'::"text", 'reframe'::"text", 'transcript'::"text", 'smart_hook'::"text"])))
);


ALTER TABLE "public"."video_ai_assets" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."video_bookmarks" (
    "user_id" "uuid" NOT NULL,
    "video_id" "uuid" NOT NULL,
    "collection_id" "uuid",
    "note" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."video_bookmarks" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."video_captions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "video_id" "uuid",
    "language" "text" NOT NULL,
    "kind" "text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "vtt_url" "text",
    "payload" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "video_captions_kind_check" CHECK (("kind" = ANY (ARRAY['original'::"text", 'translated'::"text", 'dubbed'::"text"])))
);


ALTER TABLE "public"."video_captions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."video_challenge_entries" (
    "challenge_id" "uuid" NOT NULL,
    "video_id" "uuid" NOT NULL,
    "creator_id" "uuid" NOT NULL,
    "score" numeric DEFAULT 0 NOT NULL,
    "rank" integer,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."video_challenge_entries" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."video_challenges" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "creator_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "hashtag" "text" NOT NULL,
    "cover_url" "text",
    "starts_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "ends_at" timestamp with time zone,
    "reward_label" "text",
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "video_challenges_hashtag_check" CHECK (("hashtag" ~ '^[a-zA-Z0-9_]{2,60}$'::"text")),
    CONSTRAINT "video_challenges_name_check" CHECK ((("char_length"("name") >= 2) AND ("char_length"("name") <= 100))),
    CONSTRAINT "video_challenges_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'active'::"text", 'ended'::"text", 'paused'::"text"])))
);


ALTER TABLE "public"."video_challenges" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."video_chapters" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "video_id" "uuid" NOT NULL,
    "position" integer NOT NULL,
    "start_ms" integer NOT NULL,
    "title" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "video_chapters_position_check" CHECK (("position" >= 0)),
    CONSTRAINT "video_chapters_start_ms_check" CHECK (("start_ms" >= 0)),
    CONSTRAINT "video_chapters_title_check" CHECK ((("char_length"("title") >= 1) AND ("char_length"("title") <= 120)))
);


ALTER TABLE "public"."video_chapters" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."video_collaborations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "video_id" "uuid" NOT NULL,
    "owner_id" "uuid" NOT NULL,
    "collaborator_id" "uuid" NOT NULL,
    "role" "text" DEFAULT 'co_creator'::"text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "responded_at" timestamp with time zone,
    CONSTRAINT "video_collaborations_check" CHECK (("owner_id" <> "collaborator_id")),
    CONSTRAINT "video_collaborations_role_check" CHECK (("role" = ANY (ARRAY['co_creator'::"text", 'guest'::"text", 'editor'::"text", 'sponsor'::"text"]))),
    CONSTRAINT "video_collaborations_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'accepted'::"text", 'declined'::"text", 'removed'::"text"])))
);


ALTER TABLE "public"."video_collaborations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."video_collections" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "owner_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "is_public" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "video_collections_name_check" CHECK ((("char_length"("name") >= 1) AND ("char_length"("name") <= 80)))
);


ALTER TABLE "public"."video_collections" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."video_comments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "video_id" "uuid" NOT NULL,
    "author_id" "uuid" NOT NULL,
    "content" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "has_video_reply" boolean DEFAULT false,
    "parent_comment_id" "uuid",
    CONSTRAINT "video_comments_content_check" CHECK ((("char_length"(TRIM(BOTH FROM "content")) >= 1) AND ("char_length"(TRIM(BOTH FROM "content")) <= 2000)))
);


ALTER TABLE "public"."video_comments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."video_gift_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "video_id" "uuid" NOT NULL,
    "creator_id" "uuid" NOT NULL,
    "sender_id" "uuid" NOT NULL,
    "gift_code" "text" NOT NULL,
    "amount_minor" integer NOT NULL,
    "checkout_intent_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."video_gift_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."video_gifts_catalog" (
    "code" "text" NOT NULL,
    "name" "text" NOT NULL,
    "emoji" "text" DEFAULT '🎁'::"text",
    "price_minor" integer NOT NULL,
    "animation_key" "text" DEFAULT 'sparkle'::"text",
    "sort_order" integer DEFAULT 0,
    "active" boolean DEFAULT true
);


ALTER TABLE "public"."video_gifts_catalog" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."video_hashtags" (
    "video_id" "uuid" NOT NULL,
    "tag" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."video_hashtags" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."video_likes" (
    "video_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."video_likes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."video_moderation_results" (
    "video_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "reasons" "jsonb" DEFAULT '{}'::"jsonb",
    "score" numeric,
    "reviewed_by" "uuid",
    "reviewed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "video_moderation_results_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'approved'::"text", 'rejected'::"text", 'needs_review'::"text"])))
);


ALTER TABLE "public"."video_moderation_results" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."video_playlist_items" (
    "playlist_id" "uuid" NOT NULL,
    "video_id" "uuid" NOT NULL,
    "position" integer DEFAULT 0 NOT NULL
);


ALTER TABLE "public"."video_playlist_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."video_playlists" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "author_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "cover_url" "text",
    "is_series" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."video_playlists" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."video_poll_votes" (
    "poll_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "option_key" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."video_poll_votes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."video_polls" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "video_id" "uuid" NOT NULL,
    "question" "text" NOT NULL,
    "options" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "duration_seconds" integer,
    "allow_multiple" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "video_polls_duration_seconds_check" CHECK ((("duration_seconds" IS NULL) OR (("duration_seconds" >= 5) AND ("duration_seconds" <= 604800)))),
    CONSTRAINT "video_polls_question_check" CHECK ((("char_length"("question") >= 1) AND ("char_length"("question") <= 240)))
);


ALTER TABLE "public"."video_polls" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."video_questions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "video_id" "uuid" NOT NULL,
    "author_id" "uuid" NOT NULL,
    "question" "text" NOT NULL,
    "answer_video_id" "uuid",
    "status" "text" DEFAULT 'open'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "answered_at" timestamp with time zone,
    CONSTRAINT "video_questions_question_check" CHECK ((("char_length"("question") >= 1) AND ("char_length"("question") <= 500))),
    CONSTRAINT "video_questions_status_check" CHECK (("status" = ANY (ARRAY['open'::"text", 'answered'::"text", 'hidden'::"text"])))
);


ALTER TABLE "public"."video_questions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."video_recommendation_explanations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "video_id" "uuid" NOT NULL,
    "reason" "text" NOT NULL,
    "score_breakdown" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."video_recommendation_explanations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."video_recommendation_profiles" (
    "user_id" "uuid" NOT NULL,
    "topics" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "creators" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "languages" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."video_recommendation_profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."video_remixes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "video_id" "uuid" NOT NULL,
    "source_video_id" "uuid" NOT NULL,
    "creator_id" "uuid" NOT NULL,
    "mode" "text" NOT NULL,
    "source_start_ms" integer DEFAULT 0 NOT NULL,
    "source_end_ms" integer,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "video_remixes_check" CHECK ((("source_end_ms" IS NULL) OR ("source_end_ms" > "source_start_ms"))),
    CONSTRAINT "video_remixes_mode_check" CHECK (("mode" = ANY (ARRAY['remix'::"text", 'duet'::"text", 'react'::"text", 'quote'::"text", 'green_screen'::"text", 'reply'::"text"]))),
    CONSTRAINT "video_remixes_source_start_ms_check" CHECK (("source_start_ms" >= 0))
);


ALTER TABLE "public"."video_remixes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."video_views" (
    "video_id" "uuid" NOT NULL,
    "viewer_id" "uuid" NOT NULL,
    "view_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "viewed_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."video_views" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."video_watch_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "video_id" "uuid" NOT NULL,
    "user_id" "uuid",
    "session_id" "text",
    "watch_ms" integer DEFAULT 0 NOT NULL,
    "duration_ms" integer DEFAULT 0 NOT NULL,
    "completed" boolean DEFAULT false NOT NULL,
    "rewatched" boolean DEFAULT false NOT NULL,
    "skipped" boolean DEFAULT false NOT NULL,
    "liked" boolean DEFAULT false NOT NULL,
    "shared" boolean DEFAULT false NOT NULL,
    "negative_signal" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "video_watch_events_duration_ms_check" CHECK (("duration_ms" >= 0)),
    CONSTRAINT "video_watch_events_negative_signal_check" CHECK ((("negative_signal" IS NULL) OR ("negative_signal" = ANY (ARRAY['not_interested'::"text", 'hide_creator'::"text", 'report'::"text"])))),
    CONSTRAINT "video_watch_events_watch_ms_check" CHECK (("watch_ms" >= 0))
);


ALTER TABLE "public"."video_watch_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."voice_channel_members" (
    "channel_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "joined_at" timestamp with time zone DEFAULT "now"(),
    "muted" boolean DEFAULT true
);


ALTER TABLE "public"."voice_channel_members" OWNER TO "postgres";


ALTER TABLE ONLY "public"."abuse_counters"
    ADD CONSTRAINT "abuse_counters_pkey" PRIMARY KEY ("bucket_key");



ALTER TABLE ONLY "public"."affiliate_attributions"
    ADD CONSTRAINT "affiliate_attributions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ai_action_log"
    ADD CONSTRAINT "ai_action_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ai_agent_tasks"
    ADD CONSTRAINT "ai_agent_tasks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ai_usage_daily"
    ADD CONSTRAINT "ai_usage_daily_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ai_usage_daily"
    ADD CONSTRAINT "ai_usage_daily_user_id_usage_date_key" UNIQUE ("user_id", "usage_date");



ALTER TABLE ONLY "public"."api_plans"
    ADD CONSTRAINT "api_plans_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."api_plans"
    ADD CONSTRAINT "api_plans_plan_code_key" UNIQUE ("plan_code");



ALTER TABLE ONLY "public"."api_subscriptions"
    ADD CONSTRAINT "api_subscriptions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."api_usage_daily"
    ADD CONSTRAINT "api_usage_daily_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."automation_rules"
    ADD CONSTRAINT "automation_rules_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."b2b_insight_exports"
    ADD CONSTRAINT "b2b_insight_exports_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."baaro_credits_accounts"
    ADD CONSTRAINT "baaro_credits_accounts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."baaro_credits_accounts"
    ADD CONSTRAINT "baaro_credits_accounts_user_id_key" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."baaro_credits_ledger"
    ADD CONSTRAINT "baaro_credits_ledger_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."calls"
    ADD CONSTRAINT "calls_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cart"
    ADD CONSTRAINT "cart_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cart"
    ADD CONSTRAINT "cart_user_item_key" UNIQUE ("user_id", "item_id");



ALTER TABLE ONLY "public"."channel_messages"
    ADD CONSTRAINT "channel_messages_pkey" PRIMARY KEY ("id");



ALTER TABLE "public"."channel_messages"
    ADD CONSTRAINT "channel_messages_text_len" CHECK ((("char_length"("text") >= 1) AND ("char_length"("text") <= 2000))) NOT VALID;



ALTER TABLE ONLY "public"."channels"
    ADD CONSTRAINT "channels_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."chat_ai_jobs"
    ADD CONSTRAINT "chat_ai_jobs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."chat_devices"
    ADD CONSTRAINT "chat_devices_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."chat_devices"
    ADD CONSTRAINT "chat_devices_user_id_device_id_key" UNIQUE ("user_id", "device_id");



ALTER TABLE ONLY "public"."comments"
    ADD CONSTRAINT "comments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."community_events"
    ADD CONSTRAINT "community_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."community_reports"
    ADD CONSTRAINT "community_reports_message_id_reporter_id_key" UNIQUE ("message_id", "reporter_id");



ALTER TABLE ONLY "public"."community_reports"
    ADD CONSTRAINT "community_reports_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."companies"
    ADD CONSTRAINT "companies_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."company_infos"
    ADD CONSTRAINT "company_infos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."company_programs"
    ADD CONSTRAINT "company_programs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."company_reviews"
    ADD CONSTRAINT "company_reviews_company_id_user_id_key" UNIQUE ("company_id", "user_id");



ALTER TABLE ONLY "public"."company_reviews"
    ADD CONSTRAINT "company_reviews_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."company_subscriptions"
    ADD CONSTRAINT "company_subscriptions_payment_ref_key" UNIQUE ("payment_ref");



ALTER TABLE ONLY "public"."company_subscriptions"
    ADD CONSTRAINT "company_subscriptions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."company_tariffs"
    ADD CONSTRAINT "company_tariffs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."contact_hashes"
    ADD CONSTRAINT "contact_hashes_pkey" PRIMARY KEY ("hash");



ALTER TABLE ONLY "public"."content_bookmarks"
    ADD CONSTRAINT "content_bookmarks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."content_bookmarks"
    ADD CONSTRAINT "content_bookmarks_user_id_content_type_content_id_key" UNIQUE ("user_id", "content_type", "content_id");



ALTER TABLE ONLY "public"."conversation_settings"
    ADD CONSTRAINT "conversation_settings_pkey" PRIMARY KEY ("conversation_id");



ALTER TABLE ONLY "public"."conversations"
    ADD CONSTRAINT "conversations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."conversations"
    ADD CONSTRAINT "conversations_user1_id_user2_id_key" UNIQUE ("user1_id", "user2_id");



ALTER TABLE ONLY "public"."creator_coach_tips"
    ADD CONSTRAINT "creator_coach_tips_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."creator_earnings"
    ADD CONSTRAINT "creator_earnings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."creator_monetization"
    ADD CONSTRAINT "creator_monetization_pkey" PRIMARY KEY ("creator_id");



ALTER TABLE ONLY "public"."creator_payout_profiles"
    ADD CONSTRAINT "creator_payout_profiles_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."creator_profiles"
    ADD CONSTRAINT "creator_profiles_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."creator_revenue_events"
    ADD CONSTRAINT "creator_revenue_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."creator_reward_accounts"
    ADD CONSTRAINT "creator_reward_accounts_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."creator_reward_events"
    ADD CONSTRAINT "creator_reward_events_idempotency_key_key" UNIQUE ("idempotency_key");



ALTER TABLE ONLY "public"."creator_reward_events"
    ADD CONSTRAINT "creator_reward_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."creator_subscriptions"
    ADD CONSTRAINT "creator_subscriptions_creator_id_subscriber_id_key" UNIQUE ("creator_id", "subscriber_id");



ALTER TABLE ONLY "public"."creator_subscriptions"
    ADD CONSTRAINT "creator_subscriptions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."data_export_jobs"
    ADD CONSTRAINT "data_export_jobs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."debate_messages"
    ADD CONSTRAINT "debate_messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."debate_participants"
    ADD CONSTRAINT "debate_participants_pkey" PRIMARY KEY ("room_id", "user_id");



ALTER TABLE ONLY "public"."debate_rooms"
    ADD CONSTRAINT "debate_rooms_invite_code_key" UNIQUE ("invite_code");



ALTER TABLE ONLY "public"."debate_rooms"
    ADD CONSTRAINT "debate_rooms_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."delivery_orders"
    ADD CONSTRAINT "delivery_orders_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."device_accounts"
    ADD CONSTRAINT "device_accounts_pkey" PRIMARY KEY ("device_id", "id");



ALTER TABLE ONLY "public"."e2e_key_backups"
    ADD CONSTRAINT "e2e_key_backups_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."economy_accounts"
    ADD CONSTRAINT "economy_accounts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."economy_ledger"
    ADD CONSTRAINT "economy_ledger_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."economy_payouts"
    ADD CONSTRAINT "economy_payouts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."event_attendees"
    ADD CONSTRAINT "event_attendees_pkey" PRIMARY KEY ("event_id", "user_id");



ALTER TABLE ONLY "public"."feed_events"
    ADD CONSTRAINT "feed_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."follows"
    ADD CONSTRAINT "follows_follower_followed_unique" UNIQUE ("follower_id", "followed_id");



ALTER TABLE ONLY "public"."follows"
    ADD CONSTRAINT "follows_pkey" PRIMARY KEY ("follower_id", "followed_id");



ALTER TABLE ONLY "public"."group_bans"
    ADD CONSTRAINT "group_bans_pkey" PRIMARY KEY ("group_id", "user_id");



ALTER TABLE ONLY "public"."group_invites"
    ADD CONSTRAINT "group_invites_group_id_code_key" UNIQUE ("group_id", "code");



ALTER TABLE ONLY "public"."group_invites"
    ADD CONSTRAINT "group_invites_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."group_members"
    ADD CONSTRAINT "group_members_pkey" PRIMARY KEY ("group_id", "user_id");



ALTER TABLE ONLY "public"."groups"
    ADD CONSTRAINT "groups_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."job_listings"
    ADD CONSTRAINT "job_listings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."job_profile_boosts"
    ADD CONSTRAINT "job_profile_boosts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."learning_courses"
    ADD CONSTRAINT "learning_courses_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."learning_progress"
    ADD CONSTRAINT "learning_progress_pkey" PRIMARY KEY ("user_id", "course_id");



ALTER TABLE ONLY "public"."legal_consents"
    ADD CONSTRAINT "legal_consents_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."legal_consents"
    ADD CONSTRAINT "legal_consents_user_id_document_type_version_key" UNIQUE ("user_id", "document_type", "version");



ALTER TABLE ONLY "public"."live_trainings"
    ADD CONSTRAINT "live_trainings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."media_assets"
    ADD CONSTRAINT "media_assets_bucket_object_key_key" UNIQUE ("bucket", "object_key");



ALTER TABLE ONLY "public"."media_assets"
    ADD CONSTRAINT "media_assets_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."media_jobs"
    ADD CONSTRAINT "media_jobs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."media_upload_tokens"
    ADD CONSTRAINT "media_upload_tokens_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."media_upload_tokens"
    ADD CONSTRAINT "media_upload_tokens_token_hash_key" UNIQUE ("token_hash");



ALTER TABLE ONLY "public"."merchant_pro_subscriptions"
    ADD CONSTRAINT "merchant_pro_subscriptions_merchant_id_key" UNIQUE ("merchant_id");



ALTER TABLE ONLY "public"."merchant_pro_subscriptions"
    ADD CONSTRAINT "merchant_pro_subscriptions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."message_pins"
    ADD CONSTRAINT "message_pins_message_id_unique" UNIQUE ("message_id");



ALTER TABLE ONLY "public"."message_pins"
    ADD CONSTRAINT "message_pins_pkey" PRIMARY KEY ("message_id");



ALTER TABLE ONLY "public"."message_reactions"
    ADD CONSTRAINT "message_reactions_message_id_user_id_emoji_key" UNIQUE ("message_id", "user_id", "emoji");



ALTER TABLE ONLY "public"."message_reactions"
    ADD CONSTRAINT "message_reactions_pkey" PRIMARY KEY ("message_id", "user_id", "emoji");



ALTER TABLE ONLY "public"."message_reports"
    ADD CONSTRAINT "message_reports_message_id_reporter_id_key" UNIQUE ("message_id", "reporter_id");



ALTER TABLE ONLY "public"."message_reports"
    ADD CONSTRAINT "message_reports_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."message_stars"
    ADD CONSTRAINT "message_stars_pkey" PRIMARY KEY ("message_id", "user_id");



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."module_preferences"
    ADD CONSTRAINT "module_preferences_pkey" PRIMARY KEY ("user_id", "module_id");



ALTER TABLE ONLY "public"."monetization_checkout_intents"
    ADD CONSTRAINT "monetization_checkout_intents_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."monetization_products"
    ADD CONSTRAINT "monetization_products_code_key" UNIQUE ("code");



ALTER TABLE ONLY "public"."monetization_products"
    ADD CONSTRAINT "monetization_products_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."nexus_actions"
    ADD CONSTRAINT "nexus_actions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."nexus_goals"
    ADD CONSTRAINT "nexus_goals_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."nexus_memory_items"
    ADD CONSTRAINT "nexus_memory_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."nexus_preferences"
    ADD CONSTRAINT "nexus_preferences_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."nexus_trust_events"
    ADD CONSTRAINT "nexus_trust_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notification_preferences"
    ADD CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_pkey" PRIMARY KEY ("notification_id");



ALTER TABLE ONLY "public"."observability_events"
    ADD CONSTRAINT "observability_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."offline_sync_queue"
    ADD CONSTRAINT "offline_sync_queue_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."offline_sync_queue"
    ADD CONSTRAINT "offline_sync_queue_user_id_client_id_key" UNIQUE ("user_id", "client_id");



ALTER TABLE ONLY "public"."order_items"
    ADD CONSTRAINT "order_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."payment_webhook_events"
    ADD CONSTRAINT "payment_webhook_events_pkey" PRIMARY KEY ("provider", "event_id");



ALTER TABLE ONLY "public"."poll_options"
    ADD CONSTRAINT "poll_options_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."poll_options"
    ADD CONSTRAINT "poll_options_poll_id_position_key" UNIQUE ("poll_id", "position");



ALTER TABLE ONLY "public"."poll_votes"
    ADD CONSTRAINT "poll_votes_pkey" PRIMARY KEY ("poll_id", "user_id");



ALTER TABLE ONLY "public"."polls"
    ADD CONSTRAINT "polls_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."polls"
    ADD CONSTRAINT "polls_post_id_key" UNIQUE ("post_id");



ALTER TABLE ONLY "public"."post_bookmarks"
    ADD CONSTRAINT "post_bookmarks_pkey" PRIMARY KEY ("post_id", "user_id");



ALTER TABLE ONLY "public"."post_likes"
    ADD CONSTRAINT "post_likes_pkey" PRIMARY KEY ("post_id", "user_id");



ALTER TABLE ONLY "public"."post_poll_votes"
    ADD CONSTRAINT "post_poll_votes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."post_poll_votes"
    ADD CONSTRAINT "post_poll_votes_post_id_user_id_key" UNIQUE ("post_id", "user_id");



ALTER TABLE ONLY "public"."post_reports"
    ADD CONSTRAINT "post_reports_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."post_reposts"
    ADD CONSTRAINT "post_reposts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."post_reposts"
    ADD CONSTRAINT "post_reposts_post_id_user_id_key" UNIQUE ("post_id", "user_id");



ALTER TABLE ONLY "public"."post_views"
    ADD CONSTRAINT "post_views_pkey" PRIMARY KEY ("post_id", "viewer_id", "view_date");



ALTER TABLE ONLY "public"."posts"
    ADD CONSTRAINT "posts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."premium_subscriptions"
    ADD CONSTRAINT "premium_subscriptions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."premium_subscriptions"
    ADD CONSTRAINT "premium_subscriptions_user_id_key" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."profile_contacts"
    ADD CONSTRAINT "profile_contacts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profile_links"
    ADD CONSTRAINT "profile_links_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profile_social_links"
    ADD CONSTRAINT "profile_social_links_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profile_social_links"
    ADD CONSTRAINT "profile_social_links_user_id_platform_key" UNIQUE ("user_id", "platform");



ALTER TABLE ONLY "public"."profile_view_premium"
    ADD CONSTRAINT "profile_view_premium_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profile_view_premium"
    ADD CONSTRAINT "profile_view_premium_user_id_key" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_handle_key" UNIQUE ("handle");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."push_notification_dead_letters"
    ADD CONSTRAINT "push_notification_dead_letters_pkey" PRIMARY KEY ("source_job_id");



ALTER TABLE ONLY "public"."push_notification_jobs"
    ADD CONSTRAINT "push_notification_jobs_batch_token_key" UNIQUE ("batch_id", "token_id");



ALTER TABLE ONLY "public"."push_notification_jobs"
    ADD CONSTRAINT "push_notification_jobs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."push_tokens"
    ADD CONSTRAINT "push_tokens_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."push_tokens"
    ADD CONSTRAINT "push_tokens_user_id_token_key" UNIQUE ("user_id", "token");



ALTER TABLE ONLY "public"."reputation_events"
    ADD CONSTRAINT "reputation_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."safety_reports"
    ADD CONSTRAINT "safety_reports_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."safety_signals"
    ADD CONSTRAINT "safety_signals_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."saved_searches"
    ADD CONSTRAINT "saved_searches_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."search_history"
    ADD CONSTRAINT "search_history_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."security_devices"
    ADD CONSTRAINT "security_devices_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."security_devices"
    ADD CONSTRAINT "security_devices_user_id_device_id_key" UNIQUE ("user_id", "device_id");



ALTER TABLE ONLY "public"."security_events"
    ADD CONSTRAINT "security_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."security_settings"
    ADD CONSTRAINT "security_settings_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."service_listings"
    ADD CONSTRAINT "service_listings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."shop_pricing"
    ADD CONSTRAINT "shop_pricing_pkey" PRIMARY KEY ("currency");



ALTER TABLE ONLY "public"."shop_products"
    ADD CONSTRAINT "shop_products_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."shop_reviews"
    ADD CONSTRAINT "shop_reviews_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."shop_subscriptions"
    ADD CONSTRAINT "shop_subscriptions_payment_ref_key" UNIQUE ("payment_ref");



ALTER TABLE ONLY "public"."shop_subscriptions"
    ADD CONSTRAINT "shop_subscriptions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."shops"
    ADD CONSTRAINT "shops_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sounds"
    ADD CONSTRAINT "sounds_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."stories"
    ADD CONSTRAINT "stories_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."story_close_friends"
    ADD CONSTRAINT "story_close_friends_pkey" PRIMARY KEY ("owner_id", "member_id");



ALTER TABLE ONLY "public"."story_highlight_items"
    ADD CONSTRAINT "story_highlight_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."story_highlights"
    ADD CONSTRAINT "story_highlights_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."story_product_events"
    ADD CONSTRAINT "story_product_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."story_reactions"
    ADD CONSTRAINT "story_reactions_pkey" PRIMARY KEY ("story_id", "user_id");



ALTER TABLE ONLY "public"."story_replies"
    ADD CONSTRAINT "story_replies_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."story_sticker_responses"
    ADD CONSTRAINT "story_sticker_responses_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."story_views"
    ADD CONSTRAINT "story_views_pkey" PRIMARY KEY ("story_id", "viewer_id");



ALTER TABLE ONLY "public"."tips"
    ADD CONSTRAINT "tips_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."training_purchases"
    ADD CONSTRAINT "training_purchases_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."training_purchases"
    ADD CONSTRAINT "training_purchases_training_id_buyer_id_kind_key" UNIQUE ("training_id", "buyer_id", "kind");



ALTER TABLE ONLY "public"."trust_events"
    ADD CONSTRAINT "trust_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ai_usage_daily"
    ADD CONSTRAINT "uniq_ai_usage_user_date" UNIQUE ("user_id", "usage_date");



ALTER TABLE ONLY "public"."creator_reward_events"
    ADD CONSTRAINT "uniq_reward_idempotency" UNIQUE ("idempotency_key");



ALTER TABLE ONLY "public"."user_blocks"
    ADD CONSTRAINT "user_blocks_pkey" PRIMARY KEY ("blocker_id", "blocked_id");



ALTER TABLE ONLY "public"."user_cosmetics"
    ADD CONSTRAINT "user_cosmetics_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_cosmetics"
    ADD CONSTRAINT "user_cosmetics_user_id_cosmetic_code_key" UNIQUE ("user_id", "cosmetic_code");



ALTER TABLE ONLY "public"."user_preferences"
    ADD CONSTRAINT "user_preferences_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."user_settings"
    ADD CONSTRAINT "user_settings_id_key" UNIQUE ("id");



ALTER TABLE ONLY "public"."user_settings"
    ADD CONSTRAINT "user_settings_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."video_ai_assets"
    ADD CONSTRAINT "video_ai_assets_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."video_bookmarks"
    ADD CONSTRAINT "video_bookmarks_pkey" PRIMARY KEY ("user_id", "video_id");



ALTER TABLE ONLY "public"."video_captions"
    ADD CONSTRAINT "video_captions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."video_challenge_entries"
    ADD CONSTRAINT "video_challenge_entries_pkey" PRIMARY KEY ("challenge_id", "video_id");



ALTER TABLE ONLY "public"."video_challenges"
    ADD CONSTRAINT "video_challenges_hashtag_key" UNIQUE ("hashtag");



ALTER TABLE ONLY "public"."video_challenges"
    ADD CONSTRAINT "video_challenges_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."video_chapters"
    ADD CONSTRAINT "video_chapters_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."video_chapters"
    ADD CONSTRAINT "video_chapters_video_id_position_key" UNIQUE ("video_id", "position");



ALTER TABLE ONLY "public"."video_collaborations"
    ADD CONSTRAINT "video_collaborations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."video_collaborations"
    ADD CONSTRAINT "video_collaborations_video_id_collaborator_id_key" UNIQUE ("video_id", "collaborator_id");



ALTER TABLE ONLY "public"."video_collections"
    ADD CONSTRAINT "video_collections_owner_id_name_key" UNIQUE ("owner_id", "name");



ALTER TABLE ONLY "public"."video_collections"
    ADD CONSTRAINT "video_collections_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."video_comments"
    ADD CONSTRAINT "video_comments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."video_gift_events"
    ADD CONSTRAINT "video_gift_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."video_gifts_catalog"
    ADD CONSTRAINT "video_gifts_catalog_pkey" PRIMARY KEY ("code");



ALTER TABLE ONLY "public"."video_hashtags"
    ADD CONSTRAINT "video_hashtags_pkey" PRIMARY KEY ("video_id", "tag");



ALTER TABLE ONLY "public"."video_likes"
    ADD CONSTRAINT "video_likes_pkey" PRIMARY KEY ("video_id", "user_id");



ALTER TABLE ONLY "public"."video_moderation_results"
    ADD CONSTRAINT "video_moderation_results_pkey" PRIMARY KEY ("video_id");



ALTER TABLE ONLY "public"."video_playlist_items"
    ADD CONSTRAINT "video_playlist_items_pkey" PRIMARY KEY ("playlist_id", "video_id");



ALTER TABLE ONLY "public"."video_playlists"
    ADD CONSTRAINT "video_playlists_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."video_poll_votes"
    ADD CONSTRAINT "video_poll_votes_pkey" PRIMARY KEY ("poll_id", "user_id", "option_key");



ALTER TABLE ONLY "public"."video_polls"
    ADD CONSTRAINT "video_polls_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."video_questions"
    ADD CONSTRAINT "video_questions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."video_recommendation_explanations"
    ADD CONSTRAINT "video_recommendation_explanations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."video_recommendation_profiles"
    ADD CONSTRAINT "video_recommendation_profiles_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."video_remixes"
    ADD CONSTRAINT "video_remixes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."video_remixes"
    ADD CONSTRAINT "video_remixes_video_id_key" UNIQUE ("video_id");



ALTER TABLE ONLY "public"."video_views"
    ADD CONSTRAINT "video_views_pkey" PRIMARY KEY ("video_id", "viewer_id", "view_date");



ALTER TABLE ONLY "public"."video_watch_events"
    ADD CONSTRAINT "video_watch_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."videos"
    ADD CONSTRAINT "videos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."voice_channel_members"
    ADD CONSTRAINT "voice_channel_members_pkey" PRIMARY KEY ("channel_id", "user_id");



CREATE UNIQUE INDEX "cart_user_item_uidx" ON "public"."cart" USING "btree" ("user_id", "item_id");



CREATE INDEX "comments_post_id_idx" ON "public"."comments" USING "btree" ("post_id", "created_at" DESC);



CREATE INDEX "community_reports_status_idx" ON "public"."community_reports" USING "btree" ("status", "created_at" DESC);



CREATE INDEX "contact_hashes_profile_idx" ON "public"."contact_hashes" USING "btree" ("profile_id");



CREATE INDEX "debate_messages_room_idx" ON "public"."debate_messages" USING "btree" ("room_id", "created_at");



CREATE INDEX "debate_participants_room_idx" ON "public"."debate_participants" USING "btree" ("room_id");



CREATE UNIQUE INDEX "economy_accounts_user_key" ON "public"."economy_accounts" USING "btree" ("user_id");



CREATE UNIQUE INDEX "economy_ledger_idem_key" ON "public"."economy_ledger" USING "btree" ("idempotency_key");



CREATE INDEX "economy_ledger_user_created" ON "public"."economy_ledger" USING "btree" ("user_id", "created_at" DESC);



CREATE UNIQUE INDEX "follows_id_key" ON "public"."follows" USING "btree" ("id");



CREATE INDEX "groups_category_idx" ON "public"."groups" USING "btree" ("category");



CREATE INDEX "groups_name_trgm_idx" ON "public"."groups" USING "gin" ("name" "public"."gin_trgm_ops");



CREATE INDEX "idx_ai_action_log_user_module" ON "public"."ai_action_log" USING "btree" ("user_id", "module_id", "created_at" DESC);



CREATE INDEX "idx_ai_action_log_user_time" ON "public"."ai_action_log" USING "btree" ("user_id", "created_at" DESC);



CREATE INDEX "idx_ai_tasks_user_created" ON "public"."ai_agent_tasks" USING "btree" ("user_id", "created_at" DESC);



CREATE INDEX "idx_ai_tasks_user_status" ON "public"."ai_agent_tasks" USING "btree" ("user_id", "status");



CREATE INDEX "idx_automation_rules_user" ON "public"."automation_rules" USING "btree" ("user_id", "enabled");



CREATE INDEX "idx_challenge_entries_challenge_score" ON "public"."video_challenge_entries" USING "btree" ("challenge_id", "score" DESC);



CREATE INDEX "idx_channel_messages_channel_created" ON "public"."channel_messages" USING "btree" ("channel_id", "created_at" DESC);



CREATE INDEX "idx_channels_group_created" ON "public"."channels" USING "btree" ("group_id", "created_at");



CREATE INDEX "idx_chat_devices_user" ON "public"."chat_devices" USING "btree" ("user_id");



CREATE INDEX "idx_coach_creator" ON "public"."creator_coach_tips" USING "btree" ("creator_id", "dismissed", "created_at" DESC);



CREATE INDEX "idx_companies_owner" ON "public"."companies" USING "btree" ("owner_id");



CREATE UNIQUE INDEX "idx_conversations_unique_pair" ON "public"."conversations" USING "btree" (LEAST("user1_id", "user2_id"), GREATEST("user1_id", "user2_id"));



CREATE INDEX "idx_conversations_user1" ON "public"."conversations" USING "btree" ("user1_id");



CREATE INDEX "idx_conversations_user2" ON "public"."conversations" USING "btree" ("user2_id");



CREATE INDEX "idx_creator_earnings_creator" ON "public"."creator_earnings" USING "btree" ("creator_id", "created_at" DESC);



CREATE INDEX "idx_creator_earnings_creator_created" ON "public"."creator_earnings" USING "btree" ("creator_id", "created_at" DESC);



CREATE INDEX "idx_creator_reward_events_user_created" ON "public"."creator_reward_events" USING "btree" ("user_id", "created_at" DESC);



CREATE INDEX "idx_data_export_jobs_user" ON "public"."data_export_jobs" USING "btree" ("user_id", "created_at" DESC);



CREATE INDEX "idx_debate_participants_broadcasters" ON "public"."debate_participants" USING "btree" ("room_id", "role") WHERE ("role" = ANY (ARRAY['host'::"text", 'co_host'::"text"]));



CREATE INDEX "idx_delivery_orders_buyer" ON "public"."delivery_orders" USING "btree" ("buyer_id", "created_at" DESC);



CREATE INDEX "idx_delivery_orders_shop" ON "public"."delivery_orders" USING "btree" ("shop_id", "created_at" DESC);



CREATE INDEX "idx_economy_ledger_idempotency" ON "public"."economy_ledger" USING "btree" ("idempotency_key") WHERE ("idempotency_key" IS NOT NULL);



CREATE INDEX "idx_economy_ledger_user_created" ON "public"."economy_ledger" USING "btree" ("user_id", "created_at" DESC);



CREATE INDEX "idx_follows_followed" ON "public"."follows" USING "btree" ("followed_id");



CREATE INDEX "idx_group_invites_code" ON "public"."group_invites" USING "btree" ("upper"("code"));



CREATE INDEX "idx_group_members_user" ON "public"."group_members" USING "btree" ("user_id");



CREATE INDEX "idx_groups_owner_created" ON "public"."groups" USING "btree" ("owner_id", "created_at" DESC);



CREATE INDEX "idx_media_assets_owner" ON "public"."media_assets" USING "btree" ("owner_id");



CREATE INDEX "idx_media_assets_owner_created" ON "public"."media_assets" USING "btree" ("owner_id", "created_at" DESC);



CREATE INDEX "idx_media_assets_owner_folder" ON "public"."media_assets" USING "btree" ("owner_id", "folder", "created_at" DESC);



CREATE INDEX "idx_media_assets_status" ON "public"."media_assets" USING "btree" ("status", "created_at" DESC);



CREATE INDEX "idx_media_jobs_owner" ON "public"."media_jobs" USING "btree" ("owner_id", "created_at" DESC);



CREATE INDEX "idx_media_jobs_queue" ON "public"."media_jobs" USING "btree" ("status", "priority" DESC, "available_at", "created_at");



CREATE INDEX "idx_message_reactions_message" ON "public"."message_reactions" USING "btree" ("message_id");



CREATE UNIQUE INDEX "idx_messages_client_id" ON "public"."messages" USING "btree" ("sender_id", "client_message_id") WHERE ("client_message_id" IS NOT NULL);



CREATE INDEX "idx_messages_conversation" ON "public"."messages" USING "btree" ("conversation_id", "created_at");



CREATE INDEX "idx_messages_conversation_created" ON "public"."messages" USING "btree" ("conversation_id", "created_at" DESC);



CREATE INDEX "idx_messages_expiry" ON "public"."messages" USING "btree" ("expires_at") WHERE ("expires_at" IS NOT NULL);



CREATE INDEX "idx_messages_reply" ON "public"."messages" USING "btree" ("reply_to_id");



CREATE INDEX "idx_messages_scheduled" ON "public"."messages" USING "btree" ("scheduled_for") WHERE ("scheduled_for" IS NOT NULL);



CREATE INDEX "idx_messages_sender" ON "public"."messages" USING "btree" ("sender_id");



CREATE INDEX "idx_moderation_status" ON "public"."video_moderation_results" USING "btree" ("status");



CREATE INDEX "idx_msg_pins_message_id" ON "public"."message_pins" USING "btree" ("message_id");



CREATE INDEX "idx_msg_reactions_message_id" ON "public"."message_reactions" USING "btree" ("message_id");



CREATE INDEX "idx_msg_stars_message_id" ON "public"."message_stars" USING "btree" ("message_id");



CREATE INDEX "idx_msgs_channel_created" ON "public"."channel_messages" USING "btree" ("channel_id", "created_at" DESC);



CREATE INDEX "idx_msgs_sender_created" ON "public"."channel_messages" USING "btree" ("sender_id", "created_at" DESC);



CREATE INDEX "idx_nexus_memory_user_created" ON "public"."nexus_memory_items" USING "btree" ("user_id", "created_at" DESC);



CREATE INDEX "idx_nexus_memory_user_scope" ON "public"."nexus_memory_items" USING "btree" ("user_id", "scope");



CREATE INDEX "idx_notifications_actor" ON "public"."notifications" USING "btree" ("actor_id");



CREATE INDEX "idx_notifications_type" ON "public"."notifications" USING "btree" ("type") WHERE ("type" IS NOT NULL);



CREATE INDEX "idx_notifications_user_created" ON "public"."notifications" USING "btree" ("user_id", "created_at" DESC);



CREATE INDEX "idx_notifications_user_read" ON "public"."notifications" USING "btree" ("user_id", "read");



CREATE INDEX "idx_notifications_user_unread" ON "public"."notifications" USING "btree" ("user_id") WHERE ("read" = false);



CREATE INDEX "idx_observability_created" ON "public"."observability_events" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_offline_queue_ready" ON "public"."offline_sync_queue" USING "btree" ("user_id", "status", "next_attempt_at");



CREATE INDEX "idx_offline_queue_status_attempt" ON "public"."offline_sync_queue" USING "btree" ("status", "next_attempt_at");



CREATE INDEX "idx_offline_queue_user_status_next" ON "public"."offline_sync_queue" USING "btree" ("user_id", "status", "next_attempt_at");



CREATE INDEX "idx_order_items_order" ON "public"."order_items" USING "btree" ("order_id");



CREATE INDEX "idx_orders_buyer" ON "public"."orders" USING "btree" ("buyer_id", "created_at" DESC);



CREATE INDEX "idx_orders_buyer_created" ON "public"."orders" USING "btree" ("buyer_id", "created_at" DESC);



CREATE INDEX "idx_orders_shop" ON "public"."orders" USING "btree" ("shop_id", "created_at" DESC);



CREATE INDEX "idx_orders_shop_created" ON "public"."orders" USING "btree" ("shop_id", "created_at" DESC);



CREATE INDEX "idx_payment_webhook_events_provider_updated" ON "public"."payment_webhook_events" USING "btree" ("provider", "updated_at" DESC);



CREATE INDEX "idx_payment_webhook_events_status_updated" ON "public"."payment_webhook_events" USING "btree" ("status", "updated_at");



CREATE INDEX "idx_poll_options_poll_position" ON "public"."poll_options" USING "btree" ("poll_id", "position");



CREATE INDEX "idx_poll_votes_poll" ON "public"."poll_votes" USING "btree" ("poll_id", "created_at" DESC);



CREATE INDEX "idx_post_views_post_date" ON "public"."post_views" USING "btree" ("post_id", "viewed_at" DESC);



CREATE INDEX "idx_post_views_viewer_date" ON "public"."post_views" USING "btree" ("viewer_id", "viewed_at" DESC);



CREATE INDEX "idx_posts_author_created" ON "public"."posts" USING "btree" ("author_id", "created_at" DESC);



CREATE INDEX "idx_posts_created" ON "public"."posts" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_profiles_handle" ON "public"."profiles" USING "btree" ("handle");



CREATE INDEX "idx_profiles_last_seen_at" ON "public"."profiles" USING "btree" ("last_seen_at" DESC);



CREATE INDEX "idx_profiles_phone" ON "public"."profiles" USING "btree" ("phone");



CREATE INDEX "idx_profiles_updated_at" ON "public"."profiles" USING "btree" ("updated_at" DESC);



CREATE INDEX "idx_push_tokens_platform" ON "public"."push_tokens" USING "btree" ("platform");



CREATE INDEX "idx_push_tokens_updated" ON "public"."push_tokens" USING "btree" ("updated_at" DESC);



CREATE INDEX "idx_push_tokens_user" ON "public"."push_tokens" USING "btree" ("user_id");



CREATE INDEX "idx_rec_exp_user" ON "public"."video_recommendation_explanations" USING "btree" ("user_id", "created_at" DESC);



CREATE INDEX "idx_rec_exp_video" ON "public"."video_recommendation_explanations" USING "btree" ("video_id");



CREATE INDEX "idx_reward_user_source" ON "public"."creator_reward_events" USING "btree" ("user_id", "source");



CREATE INDEX "idx_safety_signals_target" ON "public"."safety_signals" USING "btree" ("target_type", "target_id", "created_at" DESC);



CREATE INDEX "idx_safety_signals_user" ON "public"."safety_signals" USING "btree" ("user_id", "created_at" DESC);



CREATE INDEX "idx_security_devices_active" ON "public"."security_devices" USING "btree" ("user_id") WHERE ("revoked_at" IS NULL);



CREATE INDEX "idx_security_devices_user" ON "public"."security_devices" USING "btree" ("user_id", "last_seen_at" DESC);



CREATE INDEX "idx_security_events_created" ON "public"."security_events" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_security_events_user_created" ON "public"."security_events" USING "btree" ("user_id", "created_at" DESC);



CREATE INDEX "idx_security_events_user_type" ON "public"."security_events" USING "btree" ("user_id", "event_type", "created_at" DESC);



CREATE INDEX "idx_shop_products_shop" ON "public"."shop_products" USING "btree" ("shop_id");



CREATE INDEX "idx_shops_country_city" ON "public"."shops" USING "btree" ("country", "city") WHERE "is_active";



CREATE INDEX "idx_shops_owner" ON "public"."shops" USING "btree" ("owner_id");



CREATE INDEX "idx_spe_story" ON "public"."story_product_events" USING "btree" ("story_id", "product_id");



CREATE INDEX "idx_stories_publish" ON "public"."stories" USING "btree" ("publish_at", "expires_at");



CREATE INDEX "idx_story_close_friends_member" ON "public"."story_close_friends" USING "btree" ("member_id", "owner_id");



CREATE INDEX "idx_story_views_story" ON "public"."story_views" USING "btree" ("story_id");



CREATE INDEX "idx_training_purchases_buyer" ON "public"."training_purchases" USING "btree" ("buyer_id", "created_at" DESC);



CREATE INDEX "idx_trust_events_subject_created" ON "public"."trust_events" USING "btree" ("subject_user_id", "created_at" DESC);



CREATE INDEX "idx_upload_tokens_owner" ON "public"."media_upload_tokens" USING "btree" ("owner_id");



CREATE INDEX "idx_user_blocks_blocked_id" ON "public"."user_blocks" USING "btree" ("blocked_id");



CREATE INDEX "idx_video_ai_assets_score" ON "public"."video_ai_assets" USING "btree" ("video_id", "score" DESC);



CREATE INDEX "idx_video_ai_assets_video_type" ON "public"."video_ai_assets" USING "btree" ("video_id", "asset_type");



CREATE INDEX "idx_video_bookmarks_user_created" ON "public"."video_bookmarks" USING "btree" ("user_id", "created_at" DESC);



CREATE INDEX "idx_video_challenge_entries_challenge" ON "public"."video_challenge_entries" USING "btree" ("challenge_id", "score" DESC);



CREATE INDEX "idx_video_challenges_hashtag" ON "public"."video_challenges" USING "btree" ("hashtag");



CREATE INDEX "idx_video_challenges_status" ON "public"."video_challenges" USING "btree" ("status");



CREATE INDEX "idx_video_chapters_video_start" ON "public"."video_chapters" USING "btree" ("video_id", "start_ms");



CREATE INDEX "idx_video_collabs_video" ON "public"."video_collaborations" USING "btree" ("video_id");



CREATE INDEX "idx_video_comments_video_created" ON "public"."video_comments" USING "btree" ("video_id", "created_at");



CREATE INDEX "idx_video_gift_events_creator" ON "public"."video_gift_events" USING "btree" ("creator_id", "created_at" DESC);



CREATE INDEX "idx_video_gift_events_video" ON "public"."video_gift_events" USING "btree" ("video_id", "created_at" DESC);



CREATE INDEX "idx_video_hashtags_tag" ON "public"."video_hashtags" USING "btree" ("tag");



CREATE INDEX "idx_video_hashtags_tag_lower" ON "public"."video_hashtags" USING "btree" ("lower"("tag"));



CREATE INDEX "idx_video_likes_user" ON "public"."video_likes" USING "btree" ("user_id", "created_at" DESC);



CREATE INDEX "idx_video_playlist_items_order" ON "public"."video_playlist_items" USING "btree" ("playlist_id", "position");



CREATE INDEX "idx_video_playlists_author" ON "public"."video_playlists" USING "btree" ("author_id");



CREATE INDEX "idx_video_polls_video" ON "public"."video_polls" USING "btree" ("video_id");



CREATE INDEX "idx_video_questions_video_created" ON "public"."video_questions" USING "btree" ("video_id", "created_at" DESC);



CREATE INDEX "idx_video_remixes_source" ON "public"."video_remixes" USING "btree" ("source_video_id", "created_at" DESC);



CREATE INDEX "idx_video_remixes_source_mode" ON "public"."video_remixes" USING "btree" ("source_video_id", "mode");



CREATE INDEX "idx_video_views_video_date" ON "public"."video_views" USING "btree" ("video_id", "view_date" DESC);



CREATE INDEX "idx_video_watch_events_user" ON "public"."video_watch_events" USING "btree" ("user_id", "created_at" DESC);



CREATE INDEX "idx_video_watch_events_video_created" ON "public"."video_watch_events" USING "btree" ("video_id", "created_at" DESC);



CREATE INDEX "idx_video_watch_user_created" ON "public"."video_watch_events" USING "btree" ("user_id", "created_at" DESC);



CREATE INDEX "idx_video_watch_video_created" ON "public"."video_watch_events" USING "btree" ("video_id", "created_at" DESC);



CREATE INDEX "idx_videos_author_created" ON "public"."videos" USING "btree" ("author_id", "created_at" DESC);



CREATE INDEX "idx_videos_created" ON "public"."videos" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_videos_mode_created" ON "public"."videos" USING "btree" ("content_mode", "created_at" DESC);



CREATE INDEX "idx_videos_playlist" ON "public"."videos" USING "btree" ("playlist_id") WHERE ("playlist_id" IS NOT NULL);



CREATE INDEX "idx_videos_reply_to_comment" ON "public"."videos" USING "btree" ("reply_to_comment_id") WHERE ("reply_to_comment_id" IS NOT NULL);



CREATE INDEX "idx_videos_source_video" ON "public"."videos" USING "btree" ("source_video_id") WHERE ("source_video_id" IS NOT NULL);



CREATE INDEX "idx_videos_visibility_created" ON "public"."videos" USING "btree" ("visibility", "created_at" DESC);



CREATE UNIQUE INDEX "messages_client_id_uidx" ON "public"."messages" USING "btree" ("client_message_id");



CREATE INDEX "messages_reply_to_idx" ON "public"."messages" USING "btree" ("reply_to_id");



CREATE INDEX "nexus_actions_user_idx" ON "public"."nexus_actions" USING "btree" ("user_id", "created_at" DESC);



CREATE INDEX "nexus_goals_user_idx" ON "public"."nexus_goals" USING "btree" ("user_id", "status", "updated_at" DESC);



CREATE INDEX "nexus_memory_user_idx" ON "public"."nexus_memory_items" USING "btree" ("user_id", "created_at" DESC);



CREATE INDEX "nexus_trust_subject_idx" ON "public"."nexus_trust_events" USING "btree" ("subject_id", "created_at" DESC);



CREATE UNIQUE INDEX "notifications_idempotency_key_uidx" ON "public"."notifications" USING "btree" ("idempotency_key");



CREATE INDEX "post_likes_user_idx" ON "public"."post_likes" USING "btree" ("user_id");



CREATE INDEX "posts_shadow_created_at_idx" ON "public"."posts" USING "btree" ("is_shadow", "created_at" DESC);



CREATE INDEX "profile_contacts_user_idx" ON "public"."profile_contacts" USING "btree" ("user_id");



CREATE INDEX "profile_links_user_idx" ON "public"."profile_links" USING "btree" ("user_id");



CREATE INDEX "profile_social_links_user_idx" ON "public"."profile_social_links" USING "btree" ("user_id");



CREATE UNIQUE INDEX "profiles_handle_unique" ON "public"."profiles" USING "btree" ("lower"("handle"));



CREATE INDEX "push_notification_dead_letters_batch_idx" ON "public"."push_notification_dead_letters" USING "btree" ("batch_id");



CREATE INDEX "push_notification_dead_letters_user_idx" ON "public"."push_notification_dead_letters" USING "btree" ("user_id", "dead_at" DESC);



CREATE INDEX "push_notification_jobs_cancelled_idx" ON "public"."push_notification_jobs" USING "btree" ("cancelled_at") WHERE ("status" = 'cancelled'::"text");



CREATE INDEX "push_notification_jobs_dead_idx" ON "public"."push_notification_jobs" USING "btree" ("updated_at") WHERE ("status" = 'dead'::"text");



CREATE INDEX "push_notification_jobs_lease_idx" ON "public"."push_notification_jobs" USING "btree" ("locked_at") WHERE ("status" = 'processing'::"text");



CREATE INDEX "push_notification_jobs_ready_idx" ON "public"."push_notification_jobs" USING "btree" ("available_at", "created_at") WHERE ("status" = 'queued'::"text");



CREATE INDEX "push_notification_jobs_sent_idx" ON "public"."push_notification_jobs" USING "btree" ("sent_at") WHERE ("status" = 'sent'::"text");



CREATE INDEX "search_history_user_idx" ON "public"."search_history" USING "btree" ("user_id", "created_at" DESC);



CREATE UNIQUE INDEX "shop_reviews_order_uidx" ON "public"."shop_reviews" USING "btree" ("order_id") WHERE ("order_id" IS NOT NULL);



CREATE INDEX "stories_author_created_idx" ON "public"."stories" USING "btree" ("author_id", "created_at" DESC);



CREATE INDEX "stories_expires_idx" ON "public"."stories" USING "btree" ("expires_at");



CREATE UNIQUE INDEX "uq_channels_group_name" ON "public"."channels" USING "btree" ("group_id", "name");



CREATE UNIQUE INDEX "uq_spe_purchase" ON "public"."story_product_events" USING "btree" ("order_id", "product_id") WHERE (("event_type" = 'purchase'::"text") AND ("order_id" IS NOT NULL));



CREATE INDEX "user_blocks_blocked_idx" ON "public"."user_blocks" USING "btree" ("blocked_id");



CREATE OR REPLACE TRIGGER "debate_participants_role_guard" BEFORE UPDATE ON "public"."debate_participants" FOR EACH ROW EXECUTE FUNCTION "public"."prevent_client_role_change"();



CREATE OR REPLACE TRIGGER "on_follow_created" AFTER INSERT ON "public"."follows" FOR EACH ROW EXECUTE FUNCTION "public"."create_follow_notification"();



CREATE OR REPLACE TRIGGER "profiles_touch_updated_at" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."touch_profile_updated_at"();



CREATE OR REPLACE TRIGGER "trg_baaro_post_comment_count" AFTER INSERT OR DELETE ON "public"."comments" FOR EACH ROW EXECUTE FUNCTION "public"."baaro_sync_post_comment_count"();



CREATE OR REPLACE TRIGGER "trg_baaro_post_like_count" AFTER INSERT OR DELETE ON "public"."post_likes" FOR EACH ROW EXECUTE FUNCTION "public"."baaro_sync_post_like_count"();



CREATE OR REPLACE TRIGGER "trg_baaro_video_comment_count" AFTER INSERT OR DELETE ON "public"."video_comments" FOR EACH ROW EXECUTE FUNCTION "public"."baaro_sync_video_comment_count"();



CREATE OR REPLACE TRIGGER "trg_debate_rooms_ended_at" BEFORE UPDATE OF "status" ON "public"."debate_rooms" FOR EACH ROW EXECUTE FUNCTION "public"."set_debate_room_ended_at"();



CREATE OR REPLACE TRIGGER "trg_groups_guard" BEFORE INSERT OR UPDATE ON "public"."groups" FOR EACH ROW EXECUTE FUNCTION "public"."groups_guard"();



CREATE OR REPLACE TRIGGER "trg_media_assets_updated_at" BEFORE UPDATE ON "public"."media_assets" FOR EACH ROW EXECUTE FUNCTION "public"."set_media_assets_updated_at"();



CREATE OR REPLACE TRIGGER "trg_messages_rate" BEFORE INSERT ON "public"."channel_messages" FOR EACH ROW EXECUTE FUNCTION "public"."messages_rate_limit"();



CREATE OR REPLACE TRIGGER "trg_poll_vote_notify" AFTER INSERT ON "public"."post_poll_votes" FOR EACH ROW EXECUTE FUNCTION "public"."trg_notify_story_poll_vote"();



CREATE OR REPLACE TRIGGER "trg_profiles_country_guard" BEFORE INSERT OR UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."profiles_country_guard"();



CREATE OR REPLACE TRIGGER "trg_profiles_protect_flags" BEFORE INSERT OR UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."profiles_protect_flags"();



CREATE OR REPLACE TRIGGER "trg_shops_enforce_insert" BEFORE INSERT ON "public"."shops" FOR EACH ROW EXECUTE FUNCTION "public"."shops_enforce_insert"();



CREATE OR REPLACE TRIGGER "trg_shops_protect_billing" BEFORE UPDATE ON "public"."shops" FOR EACH ROW EXECUTE FUNCTION "public"."shops_protect_billing"();



CREATE OR REPLACE TRIGGER "trg_sticker_answer_notify" AFTER INSERT ON "public"."story_sticker_responses" FOR EACH ROW EXECUTE FUNCTION "public"."trg_notify_sticker_answer"();



CREATE OR REPLACE TRIGGER "trg_stories_set_expiry" BEFORE INSERT ON "public"."stories" FOR EACH ROW EXECUTE FUNCTION "public"."stories_set_expiry"();



CREATE OR REPLACE TRIGGER "trg_story_mention_notify" AFTER INSERT ON "public"."stories" FOR EACH ROW EXECUTE FUNCTION "public"."trg_notify_story_mentions"();



CREATE OR REPLACE TRIGGER "trg_story_poll_vote_notify" AFTER INSERT ON "public"."post_poll_votes" FOR EACH ROW EXECUTE FUNCTION "public"."trg_notify_story_poll_vote"();



CREATE OR REPLACE TRIGGER "trg_story_reaction_notify" AFTER INSERT ON "public"."story_reactions" FOR EACH ROW EXECUTE FUNCTION "public"."trg_notify_story_reaction"();



CREATE OR REPLACE TRIGGER "trg_story_reply_notify" AFTER INSERT ON "public"."story_replies" FOR EACH ROW EXECUTE FUNCTION "public"."trg_notify_story_reply"();



CREATE OR REPLACE TRIGGER "trg_video_comments_count" AFTER INSERT OR DELETE ON "public"."video_comments" FOR EACH ROW EXECUTE FUNCTION "public"."update_video_comments_count"();



CREATE OR REPLACE TRIGGER "trg_video_likes_count" AFTER INSERT OR DELETE ON "public"."video_likes" FOR EACH ROW EXECUTE FUNCTION "public"."update_video_likes_count"();



CREATE OR REPLACE TRIGGER "update_notifications_updated_at_trigger" BEFORE UPDATE ON "public"."notifications" FOR EACH ROW EXECUTE FUNCTION "public"."update_notifications_updated_at"();



CREATE OR REPLACE TRIGGER "user_blocks_cleanup" AFTER INSERT ON "public"."user_blocks" FOR EACH ROW EXECUTE FUNCTION "public"."on_block_cleanup"();



ALTER TABLE ONLY "public"."affiliate_attributions"
    ADD CONSTRAINT "affiliate_attributions_affiliate_id_fkey" FOREIGN KEY ("affiliate_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."affiliate_attributions"
    ADD CONSTRAINT "affiliate_attributions_referred_id_fkey" FOREIGN KEY ("referred_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ai_action_log"
    ADD CONSTRAINT "ai_action_log_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ai_agent_tasks"
    ADD CONSTRAINT "ai_agent_tasks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ai_usage_daily"
    ADD CONSTRAINT "ai_usage_daily_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."api_subscriptions"
    ADD CONSTRAINT "api_subscriptions_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."api_usage_daily"
    ADD CONSTRAINT "api_usage_daily_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."automation_rules"
    ADD CONSTRAINT "automation_rules_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."b2b_insight_exports"
    ADD CONSTRAINT "b2b_insight_exports_requester_id_fkey" FOREIGN KEY ("requester_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."baaro_credits_accounts"
    ADD CONSTRAINT "baaro_credits_accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."baaro_credits_ledger"
    ADD CONSTRAINT "baaro_credits_ledger_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."calls"
    ADD CONSTRAINT "calls_callee_id_fkey" FOREIGN KEY ("callee_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."calls"
    ADD CONSTRAINT "calls_caller_id_fkey" FOREIGN KEY ("caller_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."calls"
    ADD CONSTRAINT "calls_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."cart"
    ADD CONSTRAINT "cart_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "public"."shop_products"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."cart"
    ADD CONSTRAINT "cart_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."channel_messages"
    ADD CONSTRAINT "channel_messages_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."channel_messages"
    ADD CONSTRAINT "channel_messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."channels"
    ADD CONSTRAINT "channels_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."chat_ai_jobs"
    ADD CONSTRAINT "chat_ai_jobs_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."chat_ai_jobs"
    ADD CONSTRAINT "chat_ai_jobs_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."chat_devices"
    ADD CONSTRAINT "chat_devices_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."comments"
    ADD CONSTRAINT "comments_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."comments"
    ADD CONSTRAINT "comments_author_profile_fkey" FOREIGN KEY ("author_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."comments"
    ADD CONSTRAINT "comments_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."community_events"
    ADD CONSTRAINT "community_events_organizer_id_fkey" FOREIGN KEY ("organizer_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."community_reports"
    ADD CONSTRAINT "community_reports_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."community_reports"
    ADD CONSTRAINT "community_reports_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "public"."channel_messages"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."community_reports"
    ADD CONSTRAINT "community_reports_reporter_id_fkey" FOREIGN KEY ("reporter_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."companies"
    ADD CONSTRAINT "companies_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."company_infos"
    ADD CONSTRAINT "company_infos_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."company_programs"
    ADD CONSTRAINT "company_programs_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."company_reviews"
    ADD CONSTRAINT "company_reviews_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."company_reviews"
    ADD CONSTRAINT "company_reviews_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."company_subscriptions"
    ADD CONSTRAINT "company_subscriptions_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."company_tariffs"
    ADD CONSTRAINT "company_tariffs_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."contact_hashes"
    ADD CONSTRAINT "contact_hashes_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."content_bookmarks"
    ADD CONSTRAINT "content_bookmarks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."conversation_settings"
    ADD CONSTRAINT "conversation_settings_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."conversations"
    ADD CONSTRAINT "conversations_user1_id_fkey" FOREIGN KEY ("user1_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."conversations"
    ADD CONSTRAINT "conversations_user2_id_fkey" FOREIGN KEY ("user2_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."creator_coach_tips"
    ADD CONSTRAINT "creator_coach_tips_creator_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."creator_coach_tips"
    ADD CONSTRAINT "creator_coach_tips_video_id_fkey" FOREIGN KEY ("video_id") REFERENCES "public"."videos"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."creator_earnings"
    ADD CONSTRAINT "creator_earnings_creator_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."creator_monetization"
    ADD CONSTRAINT "creator_monetization_creator_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."creator_payout_profiles"
    ADD CONSTRAINT "creator_payout_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."creator_profiles"
    ADD CONSTRAINT "creator_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."creator_revenue_events"
    ADD CONSTRAINT "creator_revenue_events_creator_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."creator_reward_accounts"
    ADD CONSTRAINT "creator_reward_accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."creator_reward_events"
    ADD CONSTRAINT "creator_reward_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."creator_subscriptions"
    ADD CONSTRAINT "creator_subscriptions_creator_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."creator_subscriptions"
    ADD CONSTRAINT "creator_subscriptions_subscriber_id_fkey" FOREIGN KEY ("subscriber_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."data_export_jobs"
    ADD CONSTRAINT "data_export_jobs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."debate_messages"
    ADD CONSTRAINT "debate_messages_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "public"."debate_rooms"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."debate_messages"
    ADD CONSTRAINT "debate_messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."debate_participants"
    ADD CONSTRAINT "debate_participants_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "public"."debate_rooms"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."debate_participants"
    ADD CONSTRAINT "debate_participants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."debate_rooms"
    ADD CONSTRAINT "debate_rooms_host_id_fkey" FOREIGN KEY ("host_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."delivery_orders"
    ADD CONSTRAINT "delivery_orders_buyer_id_fkey" FOREIGN KEY ("buyer_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."delivery_orders"
    ADD CONSTRAINT "delivery_orders_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."delivery_orders"
    ADD CONSTRAINT "delivery_orders_shop_product_id_fkey" FOREIGN KEY ("shop_product_id") REFERENCES "public"."shop_products"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."device_accounts"
    ADD CONSTRAINT "device_accounts_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."device_accounts"
    ADD CONSTRAINT "device_accounts_user_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."e2e_key_backups"
    ADD CONSTRAINT "e2e_key_backups_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."economy_accounts"
    ADD CONSTRAINT "economy_accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."economy_ledger"
    ADD CONSTRAINT "economy_ledger_receiver_id_fkey" FOREIGN KEY ("receiver_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."economy_ledger"
    ADD CONSTRAINT "economy_ledger_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."economy_ledger"
    ADD CONSTRAINT "economy_ledger_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."economy_payouts"
    ADD CONSTRAINT "economy_payouts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."event_attendees"
    ADD CONSTRAINT "event_attendees_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "public"."community_events"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."event_attendees"
    ADD CONSTRAINT "event_attendees_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."feed_events"
    ADD CONSTRAINT "feed_events_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."feed_events"
    ADD CONSTRAINT "feed_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."follows"
    ADD CONSTRAINT "follows_followed_id_fkey" FOREIGN KEY ("followed_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."follows"
    ADD CONSTRAINT "follows_follower_id_fkey" FOREIGN KEY ("follower_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."group_bans"
    ADD CONSTRAINT "group_bans_banned_by_fkey" FOREIGN KEY ("banned_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."group_bans"
    ADD CONSTRAINT "group_bans_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."group_bans"
    ADD CONSTRAINT "group_bans_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."group_invites"
    ADD CONSTRAINT "group_invites_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."group_invites"
    ADD CONSTRAINT "group_invites_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."group_members"
    ADD CONSTRAINT "group_members_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."group_members"
    ADD CONSTRAINT "group_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."groups"
    ADD CONSTRAINT "groups_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."job_listings"
    ADD CONSTRAINT "job_listings_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."job_profile_boosts"
    ADD CONSTRAINT "job_profile_boosts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."learning_courses"
    ADD CONSTRAINT "learning_courses_creator_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."learning_progress"
    ADD CONSTRAINT "learning_progress_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "public"."learning_courses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."learning_progress"
    ADD CONSTRAINT "learning_progress_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."legal_consents"
    ADD CONSTRAINT "legal_consents_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."live_trainings"
    ADD CONSTRAINT "live_trainings_host_id_fkey" FOREIGN KEY ("host_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."media_assets"
    ADD CONSTRAINT "media_assets_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."media_jobs"
    ADD CONSTRAINT "media_jobs_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "public"."media_assets"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."media_jobs"
    ADD CONSTRAINT "media_jobs_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."media_jobs"
    ADD CONSTRAINT "media_jobs_video_id_fkey" FOREIGN KEY ("video_id") REFERENCES "public"."videos"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."media_upload_tokens"
    ADD CONSTRAINT "media_upload_tokens_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."merchant_pro_subscriptions"
    ADD CONSTRAINT "merchant_pro_subscriptions_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."message_pins"
    ADD CONSTRAINT "message_pins_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."message_pins"
    ADD CONSTRAINT "message_pins_pinned_by_fkey" FOREIGN KEY ("pinned_by") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."message_reactions"
    ADD CONSTRAINT "message_reactions_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."message_reactions"
    ADD CONSTRAINT "message_reactions_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."message_reactions"
    ADD CONSTRAINT "message_reactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."message_reports"
    ADD CONSTRAINT "message_reports_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."message_reports"
    ADD CONSTRAINT "message_reports_reporter_id_fkey" FOREIGN KEY ("reporter_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."message_stars"
    ADD CONSTRAINT "message_stars_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."message_stars"
    ADD CONSTRAINT "message_stars_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_recipient_id_fkey" FOREIGN KEY ("recipient_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_reply_to_id_fkey" FOREIGN KEY ("reply_to_id") REFERENCES "public"."messages"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."module_preferences"
    ADD CONSTRAINT "module_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."monetization_checkout_intents"
    ADD CONSTRAINT "monetization_checkout_intents_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."monetization_products"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."monetization_checkout_intents"
    ADD CONSTRAINT "monetization_checkout_intents_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."nexus_actions"
    ADD CONSTRAINT "nexus_actions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."nexus_goals"
    ADD CONSTRAINT "nexus_goals_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."nexus_memory_items"
    ADD CONSTRAINT "nexus_memory_items_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."nexus_preferences"
    ADD CONSTRAINT "nexus_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."nexus_trust_events"
    ADD CONSTRAINT "nexus_trust_events_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."nexus_trust_events"
    ADD CONSTRAINT "nexus_trust_events_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notification_preferences"
    ADD CONSTRAINT "notification_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."offline_sync_queue"
    ADD CONSTRAINT "offline_sync_queue_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."order_items"
    ADD CONSTRAINT "order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."order_items"
    ADD CONSTRAINT "order_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."shop_products"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_buyer_id_fkey" FOREIGN KEY ("buyer_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."poll_options"
    ADD CONSTRAINT "poll_options_poll_id_fkey" FOREIGN KEY ("poll_id") REFERENCES "public"."polls"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."poll_votes"
    ADD CONSTRAINT "poll_votes_option_id_fkey" FOREIGN KEY ("option_id") REFERENCES "public"."poll_options"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."poll_votes"
    ADD CONSTRAINT "poll_votes_poll_id_fkey" FOREIGN KEY ("poll_id") REFERENCES "public"."polls"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."poll_votes"
    ADD CONSTRAINT "poll_votes_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."poll_votes"
    ADD CONSTRAINT "poll_votes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."polls"
    ADD CONSTRAINT "polls_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."post_bookmarks"
    ADD CONSTRAINT "post_bookmarks_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."post_bookmarks"
    ADD CONSTRAINT "post_bookmarks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."post_likes"
    ADD CONSTRAINT "post_likes_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."post_likes"
    ADD CONSTRAINT "post_likes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."post_poll_votes"
    ADD CONSTRAINT "post_poll_votes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."post_reports"
    ADD CONSTRAINT "post_reports_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."post_reports"
    ADD CONSTRAINT "post_reports_reporter_id_fkey" FOREIGN KEY ("reporter_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."post_reposts"
    ADD CONSTRAINT "post_reposts_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."post_reposts"
    ADD CONSTRAINT "post_reposts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."post_views"
    ADD CONSTRAINT "post_views_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."post_views"
    ADD CONSTRAINT "post_views_viewer_id_fkey" FOREIGN KEY ("viewer_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."posts"
    ADD CONSTRAINT "posts_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."premium_subscriptions"
    ADD CONSTRAINT "premium_subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profile_contacts"
    ADD CONSTRAINT "profile_contacts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profile_links"
    ADD CONSTRAINT "profile_links_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profile_social_links"
    ADD CONSTRAINT "profile_social_links_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profile_view_premium"
    ADD CONSTRAINT "profile_view_premium_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."push_tokens"
    ADD CONSTRAINT "push_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."reputation_events"
    ADD CONSTRAINT "reputation_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."safety_reports"
    ADD CONSTRAINT "safety_reports_reporter_id_fkey" FOREIGN KEY ("reporter_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."safety_signals"
    ADD CONSTRAINT "safety_signals_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."saved_searches"
    ADD CONSTRAINT "saved_searches_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."search_history"
    ADD CONSTRAINT "search_history_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."security_devices"
    ADD CONSTRAINT "security_devices_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."security_events"
    ADD CONSTRAINT "security_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."security_settings"
    ADD CONSTRAINT "security_settings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."service_listings"
    ADD CONSTRAINT "service_listings_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."shop_products"
    ADD CONSTRAINT "shop_products_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."shop_reviews"
    ADD CONSTRAINT "shop_reviews_buyer_id_fkey" FOREIGN KEY ("buyer_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."shop_reviews"
    ADD CONSTRAINT "shop_reviews_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."shop_reviews"
    ADD CONSTRAINT "shop_reviews_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."shop_subscriptions"
    ADD CONSTRAINT "shop_subscriptions_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."shops"
    ADD CONSTRAINT "shops_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."sounds"
    ADD CONSTRAINT "sounds_creator_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."stories"
    ADD CONSTRAINT "stories_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."story_close_friends"
    ADD CONSTRAINT "story_close_friends_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."story_close_friends"
    ADD CONSTRAINT "story_close_friends_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."story_highlight_items"
    ADD CONSTRAINT "story_highlight_items_highlight_id_fkey" FOREIGN KEY ("highlight_id") REFERENCES "public"."story_highlights"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."story_highlights"
    ADD CONSTRAINT "story_highlights_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."story_product_events"
    ADD CONSTRAINT "story_product_events_story_id_fkey" FOREIGN KEY ("story_id") REFERENCES "public"."stories"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."story_reactions"
    ADD CONSTRAINT "story_reactions_story_id_fkey" FOREIGN KEY ("story_id") REFERENCES "public"."stories"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."story_reactions"
    ADD CONSTRAINT "story_reactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."story_replies"
    ADD CONSTRAINT "story_replies_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."story_replies"
    ADD CONSTRAINT "story_replies_story_id_fkey" FOREIGN KEY ("story_id") REFERENCES "public"."stories"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."story_sticker_responses"
    ADD CONSTRAINT "story_sticker_responses_story_id_fkey" FOREIGN KEY ("story_id") REFERENCES "public"."stories"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."story_sticker_responses"
    ADD CONSTRAINT "story_sticker_responses_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."story_views"
    ADD CONSTRAINT "story_views_story_id_fkey" FOREIGN KEY ("story_id") REFERENCES "public"."stories"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."story_views"
    ADD CONSTRAINT "story_views_viewer_id_fkey" FOREIGN KEY ("viewer_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tips"
    ADD CONSTRAINT "tips_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."tips"
    ADD CONSTRAINT "tips_receiver_id_fkey" FOREIGN KEY ("receiver_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."tips"
    ADD CONSTRAINT "tips_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."training_purchases"
    ADD CONSTRAINT "training_purchases_buyer_id_fkey" FOREIGN KEY ("buyer_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."training_purchases"
    ADD CONSTRAINT "training_purchases_training_id_fkey" FOREIGN KEY ("training_id") REFERENCES "public"."live_trainings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."trust_events"
    ADD CONSTRAINT "trust_events_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."trust_events"
    ADD CONSTRAINT "trust_events_subject_user_id_fkey" FOREIGN KEY ("subject_user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_blocks"
    ADD CONSTRAINT "user_blocks_blocked_id_fkey" FOREIGN KEY ("blocked_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_blocks"
    ADD CONSTRAINT "user_blocks_blocker_id_fkey" FOREIGN KEY ("blocker_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_cosmetics"
    ADD CONSTRAINT "user_cosmetics_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_preferences"
    ADD CONSTRAINT "user_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_settings"
    ADD CONSTRAINT "user_settings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."video_ai_assets"
    ADD CONSTRAINT "video_ai_assets_video_id_fkey" FOREIGN KEY ("video_id") REFERENCES "public"."videos"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."video_bookmarks"
    ADD CONSTRAINT "video_bookmarks_collection_id_fkey" FOREIGN KEY ("collection_id") REFERENCES "public"."video_collections"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."video_bookmarks"
    ADD CONSTRAINT "video_bookmarks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."video_bookmarks"
    ADD CONSTRAINT "video_bookmarks_video_id_fkey" FOREIGN KEY ("video_id") REFERENCES "public"."videos"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."video_captions"
    ADD CONSTRAINT "video_captions_video_id_fkey" FOREIGN KEY ("video_id") REFERENCES "public"."videos"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."video_challenge_entries"
    ADD CONSTRAINT "video_challenge_entries_challenge_id_fkey" FOREIGN KEY ("challenge_id") REFERENCES "public"."video_challenges"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."video_challenge_entries"
    ADD CONSTRAINT "video_challenge_entries_creator_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."video_challenge_entries"
    ADD CONSTRAINT "video_challenge_entries_video_id_fkey" FOREIGN KEY ("video_id") REFERENCES "public"."videos"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."video_challenges"
    ADD CONSTRAINT "video_challenges_creator_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."video_chapters"
    ADD CONSTRAINT "video_chapters_video_id_fkey" FOREIGN KEY ("video_id") REFERENCES "public"."videos"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."video_collaborations"
    ADD CONSTRAINT "video_collaborations_collaborator_id_fkey" FOREIGN KEY ("collaborator_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."video_collaborations"
    ADD CONSTRAINT "video_collaborations_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."video_collaborations"
    ADD CONSTRAINT "video_collaborations_video_id_fkey" FOREIGN KEY ("video_id") REFERENCES "public"."videos"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."video_collections"
    ADD CONSTRAINT "video_collections_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."video_comments"
    ADD CONSTRAINT "video_comments_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."video_comments"
    ADD CONSTRAINT "video_comments_parent_fkey" FOREIGN KEY ("parent_comment_id") REFERENCES "public"."video_comments"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."video_comments"
    ADD CONSTRAINT "video_comments_video_id_fkey" FOREIGN KEY ("video_id") REFERENCES "public"."videos"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."video_gift_events"
    ADD CONSTRAINT "video_gift_events_gift_code_fkey" FOREIGN KEY ("gift_code") REFERENCES "public"."video_gifts_catalog"("code");



ALTER TABLE ONLY "public"."video_gift_events"
    ADD CONSTRAINT "video_gift_events_video_id_fkey" FOREIGN KEY ("video_id") REFERENCES "public"."videos"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."video_hashtags"
    ADD CONSTRAINT "video_hashtags_video_id_fkey" FOREIGN KEY ("video_id") REFERENCES "public"."videos"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."video_likes"
    ADD CONSTRAINT "video_likes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."video_likes"
    ADD CONSTRAINT "video_likes_video_id_fkey" FOREIGN KEY ("video_id") REFERENCES "public"."videos"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."video_moderation_results"
    ADD CONSTRAINT "video_moderation_results_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."video_moderation_results"
    ADD CONSTRAINT "video_moderation_results_video_id_fkey" FOREIGN KEY ("video_id") REFERENCES "public"."videos"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."video_playlist_items"
    ADD CONSTRAINT "video_playlist_items_playlist_id_fkey" FOREIGN KEY ("playlist_id") REFERENCES "public"."video_playlists"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."video_playlist_items"
    ADD CONSTRAINT "video_playlist_items_video_id_fkey" FOREIGN KEY ("video_id") REFERENCES "public"."videos"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."video_poll_votes"
    ADD CONSTRAINT "video_poll_votes_poll_id_fkey" FOREIGN KEY ("poll_id") REFERENCES "public"."video_polls"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."video_poll_votes"
    ADD CONSTRAINT "video_poll_votes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."video_polls"
    ADD CONSTRAINT "video_polls_video_id_fkey" FOREIGN KEY ("video_id") REFERENCES "public"."videos"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."video_questions"
    ADD CONSTRAINT "video_questions_answer_video_id_fkey" FOREIGN KEY ("answer_video_id") REFERENCES "public"."videos"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."video_questions"
    ADD CONSTRAINT "video_questions_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."video_questions"
    ADD CONSTRAINT "video_questions_video_id_fkey" FOREIGN KEY ("video_id") REFERENCES "public"."videos"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."video_recommendation_explanations"
    ADD CONSTRAINT "video_recommendation_explanations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."video_recommendation_explanations"
    ADD CONSTRAINT "video_recommendation_explanations_video_id_fkey" FOREIGN KEY ("video_id") REFERENCES "public"."videos"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."video_recommendation_profiles"
    ADD CONSTRAINT "video_recommendation_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."video_remixes"
    ADD CONSTRAINT "video_remixes_creator_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."video_remixes"
    ADD CONSTRAINT "video_remixes_source_video_id_fkey" FOREIGN KEY ("source_video_id") REFERENCES "public"."videos"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."video_remixes"
    ADD CONSTRAINT "video_remixes_video_id_fkey" FOREIGN KEY ("video_id") REFERENCES "public"."videos"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."video_views"
    ADD CONSTRAINT "video_views_video_id_fkey" FOREIGN KEY ("video_id") REFERENCES "public"."videos"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."video_views"
    ADD CONSTRAINT "video_views_viewer_id_fkey" FOREIGN KEY ("viewer_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."video_watch_events"
    ADD CONSTRAINT "video_watch_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."video_watch_events"
    ADD CONSTRAINT "video_watch_events_video_id_fkey" FOREIGN KEY ("video_id") REFERENCES "public"."videos"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."videos"
    ADD CONSTRAINT "videos_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."videos"
    ADD CONSTRAINT "videos_challenge_id_fkey" FOREIGN KEY ("challenge_id") REFERENCES "public"."video_challenges"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."videos"
    ADD CONSTRAINT "videos_original_author_id_fkey" FOREIGN KEY ("original_author_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."videos"
    ADD CONSTRAINT "videos_playlist_fkey" FOREIGN KEY ("playlist_id") REFERENCES "public"."video_playlists"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."videos"
    ADD CONSTRAINT "videos_reply_to_comment_fkey" FOREIGN KEY ("reply_to_comment_id") REFERENCES "public"."video_comments"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."videos"
    ADD CONSTRAINT "videos_reply_to_video_fkey" FOREIGN KEY ("reply_to_video_id") REFERENCES "public"."videos"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."videos"
    ADD CONSTRAINT "videos_source_video_fkey" FOREIGN KEY ("source_video_id") REFERENCES "public"."videos"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."voice_channel_members"
    ADD CONSTRAINT "voice_channel_members_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."voice_channel_members"
    ADD CONSTRAINT "voice_channel_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



CREATE POLICY "Ajout d'un repost" ON "public"."post_reposts" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Création de signalements" ON "public"."post_reports" FOR INSERT WITH CHECK (("auth"."uid"() = "reporter_id"));



CREATE POLICY "Insertion feed events" ON "public"."feed_events" FOR INSERT WITH CHECK (true);



CREATE POLICY "Lecture publique des reposts" ON "public"."post_reposts" FOR SELECT USING (true);



CREATE POLICY "Lecture publique des votes" ON "public"."post_poll_votes" FOR SELECT USING (true);



CREATE POLICY "Les utilisateurs peuvent modifier leur vote" ON "public"."post_poll_votes" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Les utilisateurs peuvent voter" ON "public"."post_poll_votes" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Owners manage products" ON "public"."shop_products" USING ((EXISTS ( SELECT 1
   FROM "public"."shops" "s"
  WHERE (("s"."id" = "shop_products"."shop_id") AND ("s"."owner_id" = "auth"."uid"())))));



CREATE POLICY "Shop products viewable" ON "public"."shop_products" FOR SELECT USING (true);



CREATE POLICY "Suppression de son propre repost" ON "public"."post_reposts" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view own economy account" ON "public"."economy_accounts" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view own ledger" ON "public"."economy_ledger" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users manage own blocks" ON "public"."user_blocks" USING (("auth"."uid"() = "blocker_id")) WITH CHECK (("auth"."uid"() = "blocker_id"));



CREATE POLICY "Users manage own media" ON "public"."media_assets" USING (("auth"."uid"() = "owner_id")) WITH CHECK (("auth"."uid"() = "owner_id"));



CREATE POLICY "Users manage own preferences" ON "public"."user_preferences" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users manage own security settings" ON "public"."security_settings" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."abuse_counters" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."affiliate_attributions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "affiliate_own" ON "public"."affiliate_attributions" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "affiliate_id"));



ALTER TABLE "public"."ai_action_log" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "ai_action_log_owner" ON "public"."ai_action_log" FOR SELECT USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."ai_agent_tasks" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "ai_agent_tasks_owner" ON "public"."ai_agent_tasks" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."ai_usage_daily" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "ai_usage_owner" ON "public"."ai_usage_daily" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."api_plans" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."api_subscriptions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."api_usage_daily" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."automation_rules" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "automation_rules_owner" ON "public"."automation_rules" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."b2b_insight_exports" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."baaro_credits_accounts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."baaro_credits_ledger" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "bans_select" ON "public"."group_bans" FOR SELECT TO "authenticated" USING (("public"."group_role"("group_id") = ANY (ARRAY['owner'::"text", 'admin'::"text", 'moderator'::"text"])));



CREATE POLICY "block_hide_channel_messages" ON "public"."channel_messages" AS RESTRICTIVE FOR SELECT TO "authenticated" USING ((NOT COALESCE("public"."is_blocked"(( SELECT "auth"."uid"() AS "uid"), "sender_id"), false)));



CREATE POLICY "block_hide_comments" ON "public"."comments" AS RESTRICTIVE FOR SELECT TO "authenticated" USING ((NOT "public"."is_blocked"(( SELECT "auth"."uid"() AS "uid"), "author_id")));



CREATE POLICY "block_hide_messages" ON "public"."messages" AS RESTRICTIVE FOR SELECT TO "authenticated" USING ((NOT COALESCE("public"."is_blocked"(( SELECT "auth"."uid"() AS "uid"), "sender_id"), false)));



CREATE POLICY "block_hide_posts" ON "public"."posts" AS RESTRICTIVE FOR SELECT TO "authenticated" USING ((NOT "public"."is_blocked"(( SELECT "auth"."uid"() AS "uid"), "author_id")));



CREATE POLICY "block_hide_stories" ON "public"."stories" AS RESTRICTIVE FOR SELECT TO "authenticated" USING ((NOT "public"."is_blocked"(( SELECT "auth"."uid"() AS "uid"), "author_id")));



CREATE POLICY "block_hide_video_comments" ON "public"."video_comments" AS RESTRICTIVE FOR SELECT TO "authenticated" USING ((NOT "public"."is_blocked"(( SELECT "auth"."uid"() AS "uid"), "author_id")));



CREATE POLICY "block_hide_videos" ON "public"."videos" AS RESTRICTIVE FOR SELECT TO "authenticated" USING ((NOT "public"."is_blocked"(( SELECT "auth"."uid"() AS "uid"), "author_id")));



CREATE POLICY "block_no_call" ON "public"."calls" AS RESTRICTIVE FOR INSERT TO "authenticated" WITH CHECK ((NOT COALESCE("public"."is_blocked"("caller_id", "callee_id"), false)));



CREATE POLICY "block_no_comment" ON "public"."comments" AS RESTRICTIVE FOR INSERT TO "authenticated" WITH CHECK ((NOT (EXISTS ( SELECT 1
   FROM "public"."posts" "p"
  WHERE (("p"."id" = "comments"."post_id") AND "public"."is_blocked"(( SELECT "auth"."uid"() AS "uid"), "p"."author_id"))))));



CREATE POLICY "block_no_conversation" ON "public"."conversations" AS RESTRICTIVE FOR INSERT TO "authenticated" WITH CHECK ((NOT COALESCE("public"."is_blocked"("user1_id", "user2_id"), false)));



CREATE POLICY "block_no_follow" ON "public"."follows" AS RESTRICTIVE FOR INSERT TO "authenticated" WITH CHECK ((NOT COALESCE("public"."is_blocked"(( SELECT "auth"."uid"() AS "uid"), "followed_id"), false)));



CREATE POLICY "block_no_message" ON "public"."messages" AS RESTRICTIVE FOR INSERT TO "authenticated" WITH CHECK ((NOT COALESCE("public"."is_blocked"(( SELECT "auth"."uid"() AS "uid"), "recipient_id"), false)));



CREATE POLICY "block_no_story_reaction" ON "public"."story_reactions" AS RESTRICTIVE FOR INSERT TO "authenticated" WITH CHECK ((NOT (EXISTS ( SELECT 1
   FROM "public"."stories" "s"
  WHERE (("s"."id" = "story_reactions"."story_id") AND "public"."is_blocked"(( SELECT "auth"."uid"() AS "uid"), "s"."author_id"))))));



CREATE POLICY "block_no_story_reply" ON "public"."story_replies" AS RESTRICTIVE FOR INSERT TO "authenticated" WITH CHECK ((NOT (EXISTS ( SELECT 1
   FROM "public"."stories" "s"
  WHERE (("s"."id" = "story_replies"."story_id") AND "public"."is_blocked"(( SELECT "auth"."uid"() AS "uid"), "s"."author_id"))))));



CREATE POLICY "block_no_tip" ON "public"."tips" AS RESTRICTIVE FOR INSERT TO "authenticated" WITH CHECK ((NOT COALESCE("public"."is_blocked"("sender_id", "receiver_id"), false)));



CREATE POLICY "block_no_video_comment" ON "public"."video_comments" AS RESTRICTIVE FOR INSERT TO "authenticated" WITH CHECK ((NOT (EXISTS ( SELECT 1
   FROM "public"."videos" "v"
  WHERE (("v"."id" = "video_comments"."video_id") AND "public"."is_blocked"(( SELECT "auth"."uid"() AS "uid"), "v"."author_id"))))));



CREATE POLICY "bookmarks_delete_own" ON "public"."post_bookmarks" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "bookmarks_insert_own" ON "public"."post_bookmarks" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "bookmarks_select_own" ON "public"."post_bookmarks" FOR SELECT USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."calls" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "calls_participants" ON "public"."calls" USING ((("auth"."uid"() = "caller_id") OR ("auth"."uid"() = "callee_id")));



CREATE POLICY "captions_read" ON "public"."video_captions" FOR SELECT USING (true);



CREATE POLICY "captions_write_owner" ON "public"."video_captions" USING (("auth"."uid"() = ( SELECT "videos"."author_id"
   FROM "public"."videos"
  WHERE ("videos"."id" = "video_captions"."video_id"))));



ALTER TABLE "public"."cart" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "cart_owner" ON "public"."cart" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."channel_messages" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."channels" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "channels_delete" ON "public"."channels" FOR DELETE TO "authenticated" USING (("public"."group_role"("group_id") = ANY (ARRAY['owner'::"text", 'admin'::"text"])));



CREATE POLICY "channels_insert" ON "public"."channels" FOR INSERT TO "authenticated" WITH CHECK (("public"."group_role"("group_id") = ANY (ARRAY['owner'::"text", 'admin'::"text"])));



CREATE POLICY "channels_select" ON "public"."channels" FOR SELECT TO "authenticated" USING ("public"."can_see_group"("group_id"));



CREATE POLICY "channels_update" ON "public"."channels" FOR UPDATE TO "authenticated" USING (("public"."group_role"("group_id") = ANY (ARRAY['owner'::"text", 'admin'::"text"]))) WITH CHECK (("public"."group_role"("group_id") = ANY (ARRAY['owner'::"text", 'admin'::"text"])));



ALTER TABLE "public"."chat_ai_jobs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "chat_ai_jobs_own" ON "public"."chat_ai_jobs" USING (("requested_by" = "auth"."uid"())) WITH CHECK (("requested_by" = "auth"."uid"()));



ALTER TABLE "public"."chat_devices" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "chat_devices_own" ON "public"."chat_devices" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "coach_owner" ON "public"."creator_coach_tips" USING (("auth"."uid"() = "creator_id")) WITH CHECK (("auth"."uid"() = "creator_id"));



ALTER TABLE "public"."comments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "comments_insert" ON "public"."comments" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "author_id"));



CREATE POLICY "comments_own_delete" ON "public"."comments" FOR DELETE TO "authenticated" USING (("auth"."uid"() = "author_id"));



CREATE POLICY "comments_own_update" ON "public"."comments" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "author_id")) WITH CHECK (("auth"."uid"() = "author_id"));



CREATE POLICY "comments_read" ON "public"."comments" FOR SELECT USING (true);



ALTER TABLE "public"."community_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."community_reports" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."companies" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "companies_owner" ON "public"."companies" USING (("auth"."uid"() = "owner_id"));



CREATE POLICY "companies_read" ON "public"."companies" FOR SELECT USING (true);



ALTER TABLE "public"."company_infos" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."company_programs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."company_reviews" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."company_subscriptions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."company_tariffs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."contact_hashes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "contact_hashes_manage_own" ON "public"."contact_hashes" USING (("auth"."uid"() = "profile_id")) WITH CHECK (("auth"."uid"() = "profile_id"));



CREATE POLICY "contacts_select_friends" ON "public"."profile_contacts" FOR SELECT TO "authenticated" USING (("public"."is_friend_with"("user_id") AND (NOT "public"."is_blocked"(( SELECT "auth"."uid"() AS "uid"), "user_id"))));



CREATE POLICY "contacts_write" ON "public"."profile_contacts" TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."content_bookmarks" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."conversation_settings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "conversation_settings_read" ON "public"."conversation_settings" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."conversations" "c"
  WHERE (("c"."id" = "conversation_settings"."conversation_id") AND (("c"."user1_id" = "auth"."uid"()) OR ("c"."user2_id" = "auth"."uid"()))))));



CREATE POLICY "conversation_settings_write" ON "public"."conversation_settings" USING ((EXISTS ( SELECT 1
   FROM "public"."conversations" "c"
  WHERE (("c"."id" = "conversation_settings"."conversation_id") AND (("c"."user1_id" = "auth"."uid"()) OR ("c"."user2_id" = "auth"."uid"())))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."conversations" "c"
  WHERE (("c"."id" = "conversation_settings"."conversation_id") AND (("c"."user1_id" = "auth"."uid"()) OR ("c"."user2_id" = "auth"."uid"()))))));



ALTER TABLE "public"."conversations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "conversations_insert" ON "public"."conversations" FOR INSERT WITH CHECK ((("auth"."uid"() = "user1_id") OR ("auth"."uid"() = "user2_id")));



CREATE POLICY "conversations_read" ON "public"."conversations" FOR SELECT USING ((("auth"."uid"() = "user1_id") OR ("auth"."uid"() = "user2_id")));



ALTER TABLE "public"."creator_coach_tips" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."creator_earnings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "creator_earnings_own" ON "public"."creator_earnings" FOR SELECT USING (("auth"."uid"() = "creator_id"));



ALTER TABLE "public"."creator_monetization" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "creator_monetization_own" ON "public"."creator_monetization" USING (("auth"."uid"() = "creator_id")) WITH CHECK (("auth"."uid"() = "creator_id"));



CREATE POLICY "creator_monetization_read" ON "public"."creator_monetization" FOR SELECT TO "authenticated" USING (("creator_id" = "auth"."uid"()));



CREATE POLICY "creator_payout_profile_own" ON "public"."creator_payout_profiles" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."creator_payout_profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."creator_profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."creator_revenue_events" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "creator_revenue_owner" ON "public"."creator_revenue_events" FOR SELECT USING (("auth"."uid"() = "creator_id"));



ALTER TABLE "public"."creator_reward_accounts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."creator_reward_events" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "creator_reward_events_read_own" ON "public"."creator_reward_events" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "creator_rewards_read_own" ON "public"."creator_reward_accounts" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."creator_subscriptions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "credits_account_own" ON "public"."baaro_credits_accounts" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "credits_ledger_own" ON "public"."baaro_credits_ledger" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."data_export_jobs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "data_export_jobs_owner_insert" ON "public"."data_export_jobs" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "data_export_jobs_owner_select" ON "public"."data_export_jobs" FOR SELECT USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."debate_messages" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "debate_messages_insert" ON "public"."debate_messages" FOR INSERT WITH CHECK (((EXISTS ( SELECT 1
   FROM "public"."debate_participants" "dp"
  WHERE (("dp"."room_id" = "debate_messages"."room_id") AND ("dp"."user_id" = "auth"."uid"())))) AND ((("sender_type" = 'user'::"text") AND ("sender_id" = "auth"."uid"())) OR ("sender_type" = ANY (ARRAY['ai'::"text", 'system'::"text"])))));



CREATE POLICY "debate_messages_read" ON "public"."debate_messages" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."debate_participants" "dp"
  WHERE (("dp"."room_id" = "debate_messages"."room_id") AND ("dp"."user_id" = "auth"."uid"())))));



ALTER TABLE "public"."debate_participants" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "debate_participants_insert" ON "public"."debate_participants" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "debate_participants_read" ON "public"."debate_participants" FOR SELECT USING (("auth"."uid"() IS NOT NULL));



CREATE POLICY "debate_participants_update_own" ON "public"."debate_participants" FOR UPDATE USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."debate_rooms" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "debate_rooms_insert" ON "public"."debate_rooms" FOR INSERT WITH CHECK (("auth"."uid"() = "host_id"));



CREATE POLICY "debate_rooms_private_read" ON "public"."debate_rooms" FOR SELECT TO "authenticated" USING ((("host_id" = "auth"."uid"()) OR "public"."is_debate_member"("id")));



CREATE POLICY "debate_rooms_update_host" ON "public"."debate_rooms" FOR UPDATE USING (("auth"."uid"() = "host_id"));



CREATE POLICY "delivery_insert_buyer" ON "public"."delivery_orders" FOR INSERT WITH CHECK (("buyer_id" = "auth"."uid"()));



ALTER TABLE "public"."delivery_orders" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "delivery_select_buyer_or_shop_owner" ON "public"."delivery_orders" FOR SELECT USING ((("buyer_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."shops"
  WHERE (("shops"."id" = "delivery_orders"."shop_id") AND ("shops"."owner_id" = "auth"."uid"()))))));



CREATE POLICY "delivery_update_shop_owner" ON "public"."delivery_orders" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."shops"
  WHERE (("shops"."id" = "delivery_orders"."shop_id") AND ("shops"."owner_id" = "auth"."uid"())))));



ALTER TABLE "public"."device_accounts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."e2e_key_backups" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."economy_accounts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "economy_accounts_own" ON "public"."economy_accounts" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."economy_ledger" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "economy_ledger_own" ON "public"."economy_ledger" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."economy_payouts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "economy_payouts_own" ON "public"."economy_payouts" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."event_attendees" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."feed_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."follows" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "follows_delete" ON "public"."follows" FOR DELETE TO "authenticated" USING ((("follower_id" = "auth"."uid"()) OR ("followed_id" = "auth"."uid"())));



CREATE POLICY "follows_insert" ON "public"."follows" FOR INSERT TO "authenticated" WITH CHECK (("follower_id" = "auth"."uid"()));



CREATE POLICY "follows_owner_delete" ON "public"."follows" FOR DELETE USING (("auth"."uid"() = "follower_id"));



CREATE POLICY "follows_owner_insert" ON "public"."follows" FOR INSERT WITH CHECK (("auth"."uid"() = "follower_id"));



CREATE POLICY "follows_read_all" ON "public"."follows" FOR SELECT USING (true);



CREATE POLICY "follows_select" ON "public"."follows" FOR SELECT TO "authenticated" USING ((("follower_id" = "auth"."uid"()) OR ("followed_id" = "auth"."uid"())));



CREATE POLICY "follows_update" ON "public"."follows" FOR UPDATE TO "authenticated" USING ((("follower_id" = "auth"."uid"()) OR ("followed_id" = "auth"."uid"()))) WITH CHECK ((("follower_id" = "auth"."uid"()) OR ("followed_id" = "auth"."uid"())));



ALTER TABLE "public"."group_bans" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."group_invites" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."group_members" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."groups" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "groups_owner" ON "public"."groups" USING (("auth"."uid"() = "owner_id"));



CREATE POLICY "groups_read" ON "public"."groups" FOR SELECT USING (true);



CREATE POLICY "hl_select" ON "public"."story_highlights" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "hl_write" ON "public"."story_highlights" TO "authenticated" USING (("owner_id" = "auth"."uid"())) WITH CHECK (("owner_id" = "auth"."uid"()));



CREATE POLICY "hli_select" ON "public"."story_highlight_items" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "hli_write" ON "public"."story_highlight_items" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."story_highlights" "h"
  WHERE (("h"."id" = "story_highlight_items"."highlight_id") AND ("h"."owner_id" = "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."story_highlights" "h"
  WHERE (("h"."id" = "story_highlight_items"."highlight_id") AND ("h"."owner_id" = "auth"."uid"())))));



CREATE POLICY "infos_all" ON "public"."company_infos" TO "authenticated" USING ("public"."company_is_mine"("company_id")) WITH CHECK ("public"."company_is_mine"("company_id"));



CREATE POLICY "infos_sel" ON "public"."company_infos" FOR SELECT TO "authenticated" USING (("public"."company_is_mine"("company_id") OR ("is_public" AND "public"."company_is_visible"("company_id"))));



CREATE POLICY "innovation_attendees_organizer_read" ON "public"."event_attendees" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."community_events" "e"
  WHERE (("e"."id" = "event_attendees"."event_id") AND ("e"."organizer_id" = "auth"."uid"())))));



CREATE POLICY "innovation_attendees_owner" ON "public"."event_attendees" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "innovation_blocks_owner" ON "public"."user_blocks" USING (("auth"."uid"() = "blocker_id")) WITH CHECK (("auth"."uid"() = "blocker_id"));



CREATE POLICY "innovation_bookmarks_owner" ON "public"."content_bookmarks" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "innovation_courses_owner" ON "public"."learning_courses" USING (("auth"."uid"() = "creator_id")) WITH CHECK (("auth"."uid"() = "creator_id"));



CREATE POLICY "innovation_courses_public" ON "public"."learning_courses" FOR SELECT USING ((("published" = true) OR ("auth"."uid"() = "creator_id")));



CREATE POLICY "innovation_creator_owner" ON "public"."creator_profiles" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "innovation_creator_public" ON "public"."creator_profiles" FOR SELECT USING (true);



CREATE POLICY "innovation_creator_update" ON "public"."creator_profiles" FOR UPDATE USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "innovation_events_owner" ON "public"."community_events" USING (("auth"."uid"() = "organizer_id")) WITH CHECK (("auth"."uid"() = "organizer_id"));



CREATE POLICY "innovation_events_public" ON "public"."community_events" FOR SELECT USING ((("status" = ANY (ARRAY['published'::"text", 'finished'::"text"])) OR ("auth"."uid"() = "organizer_id")));



CREATE POLICY "innovation_jobs_owner" ON "public"."job_listings" USING (("auth"."uid"() = "owner_id")) WITH CHECK (("auth"."uid"() = "owner_id"));



CREATE POLICY "innovation_jobs_public" ON "public"."job_listings" FOR SELECT USING ((("status" = 'open'::"text") OR ("auth"."uid"() = "owner_id")));



CREATE POLICY "innovation_preferences_owner" ON "public"."user_preferences" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "innovation_progress_owner" ON "public"."learning_progress" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "innovation_reports_owner" ON "public"."safety_reports" FOR INSERT WITH CHECK (("auth"."uid"() = "reporter_id"));



CREATE POLICY "innovation_reports_read_owner" ON "public"."safety_reports" FOR SELECT USING (("auth"."uid"() = "reporter_id"));



CREATE POLICY "innovation_reputation_public" ON "public"."reputation_events" FOR SELECT USING (true);



CREATE POLICY "innovation_searches_owner" ON "public"."saved_searches" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "innovation_services_owner" ON "public"."service_listings" USING (("auth"."uid"() = "owner_id")) WITH CHECK (("auth"."uid"() = "owner_id"));



CREATE POLICY "innovation_services_public" ON "public"."service_listings" FOR SELECT USING ((("status" = 'active'::"text") OR ("auth"."uid"() = "owner_id")));



CREATE POLICY "innovation_subscriptions_owner" ON "public"."creator_subscriptions" USING ((("auth"."uid"() = "subscriber_id") OR ("auth"."uid"() = "creator_id"))) WITH CHECK ((("auth"."uid"() = "subscriber_id") OR ("auth"."uid"() = "creator_id")));



CREATE POLICY "insight_own" ON "public"."b2b_insight_exports" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "requester_id"));



CREATE POLICY "invites_delete" ON "public"."group_invites" FOR DELETE TO "authenticated" USING (("public"."group_role"("group_id") = ANY (ARRAY['owner'::"text", 'admin'::"text"])));



CREATE POLICY "invites_insert" ON "public"."group_invites" FOR INSERT TO "authenticated" WITH CHECK ((("created_by" = "auth"."uid"()) AND ("public"."group_role"("group_id") = ANY (ARRAY['owner'::"text", 'admin'::"text"]))));



CREATE POLICY "invites_select" ON "public"."group_invites" FOR SELECT TO "authenticated" USING (("public"."group_role"("group_id") = ANY (ARRAY['owner'::"text", 'admin'::"text"])));



CREATE POLICY "job_boost_own" ON "public"."job_profile_boosts" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."job_listings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."job_profile_boosts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "join/leave self" ON "public"."voice_channel_members" USING (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."learning_courses" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."learning_progress" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."legal_consents" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "legal_consents_read_own" ON "public"."legal_consents" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "links_select" ON "public"."profile_links" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "links_write" ON "public"."profile_links" TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."live_trainings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."media_assets" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "media_assets_select_own" ON "public"."media_assets" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "owner_id"));



ALTER TABLE "public"."media_jobs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "media_jobs_owner_read" ON "public"."media_jobs" FOR SELECT USING (("auth"."uid"() = "owner_id"));



ALTER TABLE "public"."media_upload_tokens" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "members_join" ON "public"."group_members" FOR INSERT TO "authenticated" WITH CHECK ((("user_id" = "auth"."uid"()) AND ("role" = 'member'::"text") AND (NOT "public"."is_banned"("group_id", "user_id")) AND (EXISTS ( SELECT 1
   FROM "public"."groups" "g"
  WHERE (("g"."id" = "group_members"."group_id") AND COALESCE("g"."is_public", true))))));



CREATE POLICY "members_leave" ON "public"."group_members" FOR DELETE TO "authenticated" USING ((("user_id" = "auth"."uid"()) AND ("role" IS DISTINCT FROM 'owner'::"text")));



CREATE POLICY "members_select" ON "public"."group_members" FOR SELECT TO "authenticated" USING ("public"."can_see_group"("group_id"));



ALTER TABLE "public"."merchant_pro_subscriptions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."message_pins" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "message_pins_read" ON "public"."message_pins" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM ("public"."messages" "m"
     JOIN "public"."conversations" "c" ON (("c"."id" = "m"."conversation_id")))
  WHERE (("m"."id" = "message_pins"."message_id") AND (("c"."user1_id" = "auth"."uid"()) OR ("c"."user2_id" = "auth"."uid"()))))));



CREATE POLICY "message_pins_write" ON "public"."message_pins" TO "authenticated" USING (("pinned_by" = "auth"."uid"())) WITH CHECK (("pinned_by" = "auth"."uid"()));



ALTER TABLE "public"."message_reactions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."message_reports" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "message_reports_own" ON "public"."message_reports" FOR INSERT WITH CHECK (("reporter_id" = "auth"."uid"()));



CREATE POLICY "message_reports_read_own" ON "public"."message_reports" FOR SELECT USING (("reporter_id" = "auth"."uid"()));



ALTER TABLE "public"."message_stars" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "message_stars_own" ON "public"."message_stars" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."messages" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "messages_delete" ON "public"."channel_messages" FOR DELETE TO "authenticated" USING ((("sender_id" = "auth"."uid"()) OR ("public"."group_role"("public"."channel_group"("channel_id")) = ANY (ARRAY['owner'::"text", 'admin'::"text", 'moderator'::"text"]))));



CREATE POLICY "messages_insert" ON "public"."channel_messages" FOR INSERT TO "authenticated" WITH CHECK ((("sender_id" = "auth"."uid"()) AND "public"."can_post_in_channel"("channel_id")));



CREATE POLICY "messages_participants" ON "public"."messages" USING ((("auth"."uid"() = "sender_id") OR ("auth"."uid"() = "recipient_id") OR ("auth"."uid"() IN ( SELECT "conversations"."user1_id"
   FROM "public"."conversations"
  WHERE ("conversations"."id" = "messages"."conversation_id"))) OR ("auth"."uid"() IN ( SELECT "conversations"."user2_id"
   FROM "public"."conversations"
  WHERE ("conversations"."id" = "messages"."conversation_id")))));



CREATE POLICY "messages_select" ON "public"."channel_messages" FOR SELECT TO "authenticated" USING ("public"."can_see_group"("public"."channel_group"("channel_id")));



CREATE POLICY "messages_update" ON "public"."channel_messages" FOR UPDATE TO "authenticated" USING (("sender_id" = "auth"."uid"())) WITH CHECK ((("sender_id" = "auth"."uid"()) AND "public"."can_post_in_channel"("channel_id")));



CREATE POLICY "moderation_owner_read" ON "public"."video_moderation_results" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."videos" "v"
  WHERE (("v"."id" = "video_moderation_results"."video_id") AND ("v"."author_id" = "auth"."uid"())))));



ALTER TABLE "public"."module_preferences" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "module_preferences_owner" ON "public"."module_preferences" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."monetization_checkout_intents" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."monetization_products" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."nexus_actions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "nexus_actions_owner" ON "public"."nexus_actions" TO "authenticated" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."nexus_goals" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "nexus_goals_owner" ON "public"."nexus_goals" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."nexus_memory_items" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "nexus_memory_owner" ON "public"."nexus_memory_items" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "nexus_pref_owner" ON "public"."nexus_preferences" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."nexus_preferences" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "nexus_preferences_owner" ON "public"."nexus_preferences" TO "authenticated" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."nexus_trust_events" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "nexus_trust_subject" ON "public"."nexus_trust_events" FOR SELECT TO "authenticated" USING (("subject_id" = "auth"."uid"()));



CREATE POLICY "no_anon_conversations" ON "public"."conversations" AS RESTRICTIVE TO "authenticated" USING ("public"."is_real_user"()) WITH CHECK ("public"."is_real_user"());



ALTER TABLE "public"."notification_preferences" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "notification_preferences_own" ON "public"."notification_preferences" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."notifications" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "notifications_delete_own" ON "public"."notifications" FOR DELETE TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "notifications_select_own" ON "public"."notifications" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "notifications_update_own" ON "public"."notifications" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."observability_events" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "offline_sync_owner" ON "public"."offline_sync_queue" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."offline_sync_queue" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."order_items" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "order_items_buyer" ON "public"."order_items" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."orders" "o"
  WHERE (("o"."id" = "order_items"."order_id") AND ("o"."buyer_id" = "auth"."uid"())))));



CREATE POLICY "order_items_insert_buyer" ON "public"."order_items" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."orders" "o"
  WHERE (("o"."id" = "order_items"."order_id") AND ("o"."buyer_id" = "auth"."uid"())))));



CREATE POLICY "order_items_select_parties" ON "public"."order_items" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."orders" "o"
  WHERE (("o"."id" = "order_items"."order_id") AND (("o"."buyer_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
           FROM "public"."shops" "s"
          WHERE (("s"."id" = "o"."shop_id") AND ("s"."owner_id" = "auth"."uid"())))))))));



ALTER TABLE "public"."orders" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "orders_owner" ON "public"."orders" USING (("auth"."uid"() = "buyer_id"));



ALTER TABLE "public"."payment_webhook_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."poll_options" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "poll_options_insert_own_poll" ON "public"."poll_options" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."polls" "p"
     JOIN "public"."posts" "po" ON (("po"."id" = "p"."post_id")))
  WHERE (("p"."id" = "poll_options"."poll_id") AND ("po"."author_id" = "auth"."uid"())))));



CREATE POLICY "poll_options_read" ON "public"."poll_options" FOR SELECT USING (true);



ALTER TABLE "public"."poll_votes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "poll_votes_delete_own" ON "public"."poll_votes" FOR DELETE TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "poll_votes_insert_own" ON "public"."poll_votes" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "poll_votes_read_own" ON "public"."poll_votes" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."polls" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "polls_insert_own_post" ON "public"."polls" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."posts" "p"
  WHERE (("p"."id" = "polls"."post_id") AND ("p"."author_id" = "auth"."uid"())))));



CREATE POLICY "polls_read" ON "public"."polls" FOR SELECT USING (true);



ALTER TABLE "public"."post_bookmarks" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."post_likes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "post_likes_all" ON "public"."post_likes" USING (true);



ALTER TABLE "public"."post_poll_votes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."post_reports" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."post_reposts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."post_views" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "post_views_owner_read" ON "public"."post_views" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."posts" "p"
  WHERE (("p"."id" = "post_views"."post_id") AND ("p"."author_id" = "auth"."uid"())))));



ALTER TABLE "public"."posts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "posts_owner_insert" ON "public"."posts" FOR INSERT WITH CHECK (("auth"."uid"() = "author_id"));



CREATE POLICY "posts_owner_modify" ON "public"."posts" USING (("auth"."uid"() = "author_id"));



CREATE POLICY "posts_read_all" ON "public"."posts" FOR SELECT USING (true);



ALTER TABLE "public"."premium_subscriptions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "pricing_select_public" ON "public"."shop_pricing" FOR SELECT USING (true);



CREATE POLICY "products_select" ON "public"."shop_products" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."shops" "s"
  WHERE (("s"."id" = "shop_products"."shop_id") AND (("s"."owner_id" = "auth"."uid"()) OR "public"."shop_is_live"("s"."is_active", "s"."subscription_status", "s"."trial_ends_at", "s"."subscription_expires_at"))))));



CREATE POLICY "products_write_owner" ON "public"."shop_products" USING ((EXISTS ( SELECT 1
   FROM "public"."shops"
  WHERE (("shops"."id" = "shop_products"."shop_id") AND ("shops"."owner_id" = "auth"."uid"())))));



ALTER TABLE "public"."profile_contacts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profile_links" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profile_social_links" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "profile_view_own" ON "public"."profile_view_premium" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."profile_view_premium" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "profiles_owner_insert" ON "public"."profiles" FOR INSERT WITH CHECK (("auth"."uid"() = "id"));



CREATE POLICY "profiles_owner_update" ON "public"."profiles" FOR UPDATE USING (("auth"."uid"() = "id")) WITH CHECK (("auth"."uid"() = "id"));



CREATE POLICY "profiles_read_all" ON "public"."profiles" FOR SELECT USING (true);



CREATE POLICY "prog_all" ON "public"."company_programs" TO "authenticated" USING ("public"."company_is_mine"("company_id")) WITH CHECK ("public"."company_is_mine"("company_id"));



CREATE POLICY "prog_sel" ON "public"."company_programs" FOR SELECT TO "authenticated" USING (("public"."company_is_mine"("company_id") OR ("is_active" AND "public"."company_is_visible"("company_id"))));



ALTER TABLE "public"."push_notification_dead_letters" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."push_notification_jobs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."push_tokens" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "push_tokens_delete" ON "public"."push_tokens" FOR DELETE TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "push_tokens_insert" ON "public"."push_tokens" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "push_tokens_select" ON "public"."push_tokens" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "reactions_delete_own" ON "public"."message_reactions" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "reactions_insert_own" ON "public"."message_reactions" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "reactions_select_participants" ON "public"."message_reactions" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."conversations" "c"
  WHERE (("c"."id" = "message_reactions"."conversation_id") AND (("c"."user1_id" = "auth"."uid"()) OR ("c"."user2_id" = "auth"."uid"()))))));



CREATE POLICY "read all" ON "public"."voice_channel_members" FOR SELECT USING (true);



CREATE POLICY "recommendation_profile_own" ON "public"."video_recommendation_profiles" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "reports_select" ON "public"."community_reports" FOR SELECT TO "authenticated" USING (("public"."group_role"("group_id") = ANY (ARRAY['owner'::"text", 'admin'::"text", 'moderator'::"text"])));



CREATE POLICY "reports_update" ON "public"."community_reports" FOR UPDATE TO "authenticated" USING (("public"."group_role"("group_id") = ANY (ARRAY['owner'::"text", 'admin'::"text", 'moderator'::"text"]))) WITH CHECK (("public"."group_role"("group_id") = ANY (ARRAY['owner'::"text", 'admin'::"text", 'moderator'::"text"])));



ALTER TABLE "public"."reputation_events" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "rev_del" ON "public"."company_reviews" FOR DELETE TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "rev_ins" ON "public"."company_reviews" FOR INSERT TO "authenticated" WITH CHECK ((("user_id" = "auth"."uid"()) AND (NOT "public"."company_is_mine"("company_id"))));



CREATE POLICY "rev_sel" ON "public"."company_reviews" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "rev_upd" ON "public"."company_reviews" FOR UPDATE TO "authenticated" USING (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."safety_reports" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "safety_signal_owner" ON "public"."safety_signals" FOR SELECT USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."safety_signals" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."saved_searches" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."search_history" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "search_history_owner" ON "public"."search_history" TO "authenticated" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."security_devices" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "security_devices_owner" ON "public"."security_devices" USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."security_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."security_settings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "security_settings_owner" ON "public"."security_settings" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."service_listings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."shop_pricing" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."shop_products" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."shop_reviews" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "shop_reviews_insert_buyer" ON "public"."shop_reviews" FOR INSERT WITH CHECK ((("buyer_id" = "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM "public"."orders" "o"
  WHERE (("o"."id" = "shop_reviews"."order_id") AND ("o"."buyer_id" = "auth"."uid"()) AND ("o"."shop_id" = "shop_reviews"."shop_id") AND ("o"."status" = 'delivered'::"text"))))));



CREATE POLICY "shop_reviews_read" ON "public"."shop_reviews" FOR SELECT USING (true);



ALTER TABLE "public"."shop_subscriptions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."shops" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "shops_owner" ON "public"."shops" USING (("auth"."uid"() = "owner_id"));



CREATE POLICY "shops_read" ON "public"."shops" FOR SELECT USING (true);



CREATE POLICY "socials_select" ON "public"."profile_social_links" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "socials_write" ON "public"."profile_social_links" TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."sounds" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "sounds_read_all" ON "public"."sounds" FOR SELECT USING (true);



CREATE POLICY "sticker_resp_insert" ON "public"."story_sticker_responses" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "sticker_resp_select" ON "public"."story_sticker_responses" FOR SELECT TO "authenticated" USING ((("user_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."stories" "s"
  WHERE (("s"."id" = "story_sticker_responses"."story_id") AND ("s"."author_id" = "auth"."uid"()))))));



ALTER TABLE "public"."stories" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "stories_owner" ON "public"."stories" USING (("auth"."uid"() = "author_id"));



CREATE POLICY "stories_read" ON "public"."stories" FOR SELECT USING (true);



ALTER TABLE "public"."story_close_friends" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "story_close_friends_owner" ON "public"."story_close_friends" TO "authenticated" USING (("owner_id" = "auth"."uid"())) WITH CHECK (("owner_id" = "auth"."uid"()));



ALTER TABLE "public"."story_highlight_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."story_highlights" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."story_product_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."story_reactions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "story_reactions_owner" ON "public"."story_reactions" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "story_reactions_read" ON "public"."story_reactions" FOR SELECT USING (true);



ALTER TABLE "public"."story_replies" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "story_replies_ins" ON "public"."story_replies" FOR INSERT TO "authenticated" WITH CHECK (("sender_id" = "auth"."uid"()));



CREATE POLICY "story_replies_sel" ON "public"."story_replies" FOR SELECT TO "authenticated" USING ((("sender_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."stories" "s"
  WHERE (("s"."id" = "story_replies"."story_id") AND ("s"."author_id" = "auth"."uid"()))))));



ALTER TABLE "public"."story_sticker_responses" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."story_views" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "story_views_owner_read" ON "public"."story_views" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."stories" "s"
  WHERE (("s"."id" = "story_views"."story_id") AND ("s"."author_id" = "auth"."uid"())))));



CREATE POLICY "story_views_read" ON "public"."story_views" FOR SELECT TO "authenticated" USING ((("viewer_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."stories" "s"
  WHERE (("s"."id" = "story_views"."story_id") AND ("s"."author_id" = "auth"."uid"()))))));



CREATE POLICY "subs_ins" ON "public"."company_subscriptions" FOR INSERT TO "authenticated" WITH CHECK ("public"."company_is_mine"("company_id"));



CREATE POLICY "subs_sel" ON "public"."company_subscriptions" FOR SELECT TO "authenticated" USING ("public"."company_is_mine"("company_id"));



CREATE POLICY "subscriptions_insert_owner" ON "public"."shop_subscriptions" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."shops"
  WHERE (("shops"."id" = "shop_subscriptions"."shop_id") AND ("shops"."owner_id" = "auth"."uid"())))));



CREATE POLICY "subscriptions_select_owner" ON "public"."shop_subscriptions" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."shops"
  WHERE (("shops"."id" = "shop_subscriptions"."shop_id") AND ("shops"."owner_id" = "auth"."uid"())))));



CREATE POLICY "tariff_all" ON "public"."company_tariffs" TO "authenticated" USING ("public"."company_is_mine"("company_id")) WITH CHECK ("public"."company_is_mine"("company_id"));



CREATE POLICY "tariff_sel" ON "public"."company_tariffs" FOR SELECT TO "authenticated" USING (("public"."company_is_mine"("company_id") OR ("is_active" AND "public"."company_is_visible"("company_id"))));



ALTER TABLE "public"."tips" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "training_public" ON "public"."live_trainings" FOR SELECT TO "authenticated" USING ((("status" = ANY (ARRAY['published'::"text", 'live'::"text", 'finished'::"text"])) OR ("auth"."uid"() = "host_id")));



ALTER TABLE "public"."training_purchases" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "training_purchases_own" ON "public"."training_purchases" FOR SELECT TO "authenticated" USING (("buyer_id" = "auth"."uid"()));



ALTER TABLE "public"."trust_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_blocks" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "user_blocks_delete_own" ON "public"."user_blocks" FOR DELETE TO "authenticated" USING (("blocker_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "user_blocks_insert_own" ON "public"."user_blocks" FOR INSERT TO "authenticated" WITH CHECK (("blocker_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "user_blocks_select_own" ON "public"."user_blocks" FOR SELECT TO "authenticated" USING (("blocker_id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."user_cosmetics" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_preferences" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_settings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "user_settings_owner" ON "public"."user_settings" USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."video_ai_assets" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "video_ai_assets_owner" ON "public"."video_ai_assets" USING (((EXISTS ( SELECT 1
   FROM "public"."videos" "v"
  WHERE (("v"."id" = "video_ai_assets"."video_id") AND ("v"."author_id" = "auth"."uid"())))) OR (EXISTS ( SELECT 1
   FROM "public"."videos" "v"
  WHERE (("v"."id" = "video_ai_assets"."video_id") AND ("v"."visibility" = 'public'::"text")))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."videos" "v"
  WHERE (("v"."id" = "video_ai_assets"."video_id") AND ("v"."author_id" = "auth"."uid"())))));



ALTER TABLE "public"."video_bookmarks" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "video_bookmarks_own" ON "public"."video_bookmarks" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."video_captions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."video_challenge_entries" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "video_challenge_entries_delete" ON "public"."video_challenge_entries" FOR DELETE USING (("auth"."uid"() = "creator_id"));



CREATE POLICY "video_challenge_entries_read" ON "public"."video_challenge_entries" FOR SELECT USING (true);



ALTER TABLE "public"."video_challenges" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "video_challenges_read" ON "public"."video_challenges" FOR SELECT USING (true);



CREATE POLICY "video_challenges_write" ON "public"."video_challenges" USING (("auth"."uid"() = "creator_id")) WITH CHECK (("auth"."uid"() = "creator_id"));



ALTER TABLE "public"."video_chapters" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "video_chapters_read" ON "public"."video_chapters" FOR SELECT USING (true);



CREATE POLICY "video_chapters_write" ON "public"."video_chapters" USING (("auth"."uid"() = ( SELECT "videos"."author_id"
   FROM "public"."videos"
  WHERE ("videos"."id" = "video_chapters"."video_id")))) WITH CHECK (("auth"."uid"() = ( SELECT "videos"."author_id"
   FROM "public"."videos"
  WHERE ("videos"."id" = "video_chapters"."video_id"))));



ALTER TABLE "public"."video_collaborations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "video_collaborations_insert" ON "public"."video_collaborations" FOR INSERT WITH CHECK (("auth"."uid"() = "owner_id"));



CREATE POLICY "video_collaborations_read" ON "public"."video_collaborations" FOR SELECT USING ((("auth"."uid"() = "owner_id") OR ("auth"."uid"() = "collaborator_id")));



CREATE POLICY "video_collaborations_update" ON "public"."video_collaborations" FOR UPDATE USING ((("auth"."uid"() = "owner_id") OR ("auth"."uid"() = "collaborator_id"))) WITH CHECK ((("auth"."uid"() = "owner_id") OR ("auth"."uid"() = "collaborator_id")));



ALTER TABLE "public"."video_collections" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "video_collections_read" ON "public"."video_collections" FOR SELECT USING (("is_public" OR ("auth"."uid"() = "owner_id")));



CREATE POLICY "video_collections_write" ON "public"."video_collections" USING (("auth"."uid"() = "owner_id")) WITH CHECK (("auth"."uid"() = "owner_id"));



ALTER TABLE "public"."video_comments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "video_comments_delete_own" ON "public"."video_comments" FOR DELETE TO "authenticated" USING (("auth"."uid"() = "author_id"));



CREATE POLICY "video_comments_insert_own" ON "public"."video_comments" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "author_id"));



CREATE POLICY "video_comments_read" ON "public"."video_comments" FOR SELECT USING (true);



ALTER TABLE "public"."video_gift_events" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "video_gift_events_read" ON "public"."video_gift_events" FOR SELECT USING (true);



ALTER TABLE "public"."video_gifts_catalog" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "video_gifts_catalog_read" ON "public"."video_gifts_catalog" FOR SELECT USING (("active" = true));



ALTER TABLE "public"."video_hashtags" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "video_hashtags_insert" ON "public"."video_hashtags" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."videos" "v"
  WHERE (("v"."id" = "video_hashtags"."video_id") AND ("v"."author_id" = "auth"."uid"())))));



CREATE POLICY "video_hashtags_read" ON "public"."video_hashtags" FOR SELECT USING (true);



ALTER TABLE "public"."video_likes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "video_likes_all" ON "public"."video_likes" USING (true);



ALTER TABLE "public"."video_moderation_results" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."video_playlist_items" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "video_playlist_items_owner" ON "public"."video_playlist_items" USING ((EXISTS ( SELECT 1
   FROM "public"."video_playlists" "p"
  WHERE (("p"."id" = "video_playlist_items"."playlist_id") AND ("p"."author_id" = "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."video_playlists" "p"
  WHERE (("p"."id" = "video_playlist_items"."playlist_id") AND ("p"."author_id" = "auth"."uid"())))));



CREATE POLICY "video_playlist_items_read" ON "public"."video_playlist_items" FOR SELECT USING (true);



ALTER TABLE "public"."video_playlists" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "video_playlists_owner" ON "public"."video_playlists" USING (("auth"."uid"() = "author_id")) WITH CHECK (("auth"."uid"() = "author_id"));



CREATE POLICY "video_playlists_read" ON "public"."video_playlists" FOR SELECT USING (true);



ALTER TABLE "public"."video_poll_votes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "video_poll_votes_own" ON "public"."video_poll_votes" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."video_polls" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "video_polls_read" ON "public"."video_polls" FOR SELECT USING (true);



CREATE POLICY "video_polls_write" ON "public"."video_polls" USING (("auth"."uid"() = ( SELECT "videos"."author_id"
   FROM "public"."videos"
  WHERE ("videos"."id" = "video_polls"."video_id")))) WITH CHECK (("auth"."uid"() = ( SELECT "videos"."author_id"
   FROM "public"."videos"
  WHERE ("videos"."id" = "video_polls"."video_id"))));



ALTER TABLE "public"."video_questions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "video_questions_insert" ON "public"."video_questions" FOR INSERT WITH CHECK (("auth"."uid"() = "author_id"));



CREATE POLICY "video_questions_read" ON "public"."video_questions" FOR SELECT USING ((("status" <> 'hidden'::"text") OR ("auth"."uid"() = "author_id") OR ("auth"."uid"() = ( SELECT "videos"."author_id"
   FROM "public"."videos"
  WHERE ("videos"."id" = "video_questions"."video_id")))));



CREATE POLICY "video_questions_update" ON "public"."video_questions" FOR UPDATE USING ((("auth"."uid"() = "author_id") OR ("auth"."uid"() = ( SELECT "videos"."author_id"
   FROM "public"."videos"
  WHERE ("videos"."id" = "video_questions"."video_id"))))) WITH CHECK ((("auth"."uid"() = "author_id") OR ("auth"."uid"() = ( SELECT "videos"."author_id"
   FROM "public"."videos"
  WHERE ("videos"."id" = "video_questions"."video_id")))));



ALTER TABLE "public"."video_recommendation_explanations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."video_recommendation_profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."video_remixes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "video_remixes_delete" ON "public"."video_remixes" FOR DELETE USING (("auth"."uid"() = "creator_id"));



CREATE POLICY "video_remixes_read" ON "public"."video_remixes" FOR SELECT USING (true);



ALTER TABLE "public"."video_views" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "video_views_owner_or_self" ON "public"."video_views" FOR SELECT TO "authenticated" USING ((("viewer_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."videos" "v"
  WHERE (("v"."id" = "video_views"."video_id") AND ("v"."author_id" = "auth"."uid"()))))));



ALTER TABLE "public"."video_watch_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."videos" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "videos_owner" ON "public"."videos" USING (("auth"."uid"() = "author_id"));



CREATE POLICY "videos_read" ON "public"."videos" FOR SELECT USING (true);



ALTER TABLE "public"."voice_channel_members" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "watch_events_own" ON "public"."video_watch_events" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));





ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";






ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."calls";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."comments";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."debate_messages";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."debate_participants";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."message_reactions";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."message_stars";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."notifications";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."post_likes";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."profiles";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."video_collaborations";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."video_polls";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."video_questions";



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_in"("cstring") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_in"("cstring") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_in"("cstring") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_in"("cstring") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_out"("public"."gtrgm") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_out"("public"."gtrgm") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_out"("public"."gtrgm") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_out"("public"."gtrgm") TO "service_role";






















































































































































GRANT ALL ON FUNCTION "public"."accept_friend_request"("p_follow_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."accept_friend_request"("p_follow_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."accept_friend_request"("p_follow_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."activate_shop_subscription"("p_shop_id" "uuid", "p_payment_ref" "text", "p_amount" numeric, "p_currency" "text", "p_provider" "text", "p_was_premium" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."activate_shop_subscription"("p_shop_id" "uuid", "p_payment_ref" "text", "p_amount" numeric, "p_currency" "text", "p_provider" "text", "p_was_premium" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."add_to_cart"("p_item_id" "uuid", "p_quantity" integer, "p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."add_to_cart"("p_item_id" "uuid", "p_quantity" integer, "p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."add_to_cart"("p_item_id" "uuid", "p_quantity" integer, "p_user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."award_creator_points"("p_user_id" "uuid", "p_source" "text", "p_points" bigint, "p_reference_id" "uuid", "p_idempotency_key" "text", "p_metadata" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."award_creator_points"("p_user_id" "uuid", "p_source" "text", "p_points" bigint, "p_reference_id" "uuid", "p_idempotency_key" "text", "p_metadata" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."baaro_sync_post_comment_count"() TO "anon";
GRANT ALL ON FUNCTION "public"."baaro_sync_post_comment_count"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."baaro_sync_post_comment_count"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."baaro_sync_post_like_count"() FROM PUBLIC;



GRANT ALL ON FUNCTION "public"."baaro_sync_video_comment_count"() TO "anon";
GRANT ALL ON FUNCTION "public"."baaro_sync_video_comment_count"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."baaro_sync_video_comment_count"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."ban_community_member"("p_group" "uuid", "p_user" "uuid", "p_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."ban_community_member"("p_group" "uuid", "p_user" "uuid", "p_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."ban_community_member"("p_group" "uuid", "p_user" "uuid", "p_reason" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."can_post_in_channel"("p_channel" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."can_post_in_channel"("p_channel" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_post_in_channel"("p_channel" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."can_see_group"("p_group" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."can_see_group"("p_group" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_see_group"("p_group" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."channel_group"("p_channel" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."channel_group"("p_channel" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."channel_group"("p_channel" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."checkout_cart"("p_method" "text", "p_notes" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."checkout_cart"("p_method" "text", "p_notes" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."checkout_cart"("p_method" "text", "p_notes" "text") TO "service_role";



GRANT ALL ON TABLE "public"."media_jobs" TO "anon";
GRANT ALL ON TABLE "public"."media_jobs" TO "authenticated";
GRANT ALL ON TABLE "public"."media_jobs" TO "service_role";



REVOKE ALL ON FUNCTION "public"."claim_media_jobs"("p_limit" integer, "p_worker" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."claim_media_jobs"("p_limit" integer, "p_worker" "text") TO "service_role";



GRANT ALL ON TABLE "public"."push_notification_jobs" TO "service_role";



REVOKE ALL ON FUNCTION "public"."claim_push_notification_jobs"("p_limit" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."claim_push_notification_jobs"("p_limit" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."company_is_mine"("cid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."company_is_mine"("cid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."company_is_mine"("cid" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."company_is_visible"("cid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."company_is_visible"("cid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."company_is_visible"("cid" "uuid") TO "service_role";



GRANT ALL ON TABLE "public"."channels" TO "anon";
GRANT ALL ON TABLE "public"."channels" TO "authenticated";
GRANT ALL ON TABLE "public"."channels" TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_community_channel"("p_group_id" "uuid", "p_name" "text", "p_type" "text", "p_description" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_community_channel"("p_group_id" "uuid", "p_name" "text", "p_type" "text", "p_description" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_community_channel"("p_group_id" "uuid", "p_name" "text", "p_type" "text", "p_description" "text") TO "service_role";



GRANT ALL ON TABLE "public"."groups" TO "anon";
GRANT ALL ON TABLE "public"."groups" TO "authenticated";
GRANT ALL ON TABLE "public"."groups" TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_community_group"("p_name" "text", "p_description" "text", "p_is_public" boolean, "p_category" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_community_group"("p_name" "text", "p_description" "text", "p_is_public" boolean, "p_category" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_community_group"("p_name" "text", "p_description" "text", "p_is_public" boolean, "p_category" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."create_follow_notification"() TO "anon";
GRANT ALL ON FUNCTION "public"."create_follow_notification"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_follow_notification"() TO "service_role";



GRANT ALL ON TABLE "public"."group_invites" TO "anon";
GRANT ALL ON TABLE "public"."group_invites" TO "authenticated";
GRANT ALL ON TABLE "public"."group_invites" TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_group_invite"("p_group" "uuid", "p_max_uses" integer, "p_expires_hours" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_group_invite"("p_group" "uuid", "p_max_uses" integer, "p_expires_hours" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_group_invite"("p_group" "uuid", "p_max_uses" integer, "p_expires_hours" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."create_notification"("p_target_id" "uuid", "p_actor_id" "uuid", "p_type" "text", "p_message" "text", "p_source_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."create_notification"("p_target_id" "uuid", "p_actor_id" "uuid", "p_type" "text", "p_message" "text", "p_source_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_notification"("p_target_id" "uuid", "p_actor_id" "uuid", "p_type" "text", "p_message" "text", "p_source_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."create_order_secure"("p_shop_id" "uuid", "p_buyer_id" "uuid", "p_method" "text", "p_notes" "text", "p_dropoff_address" "text", "p_items" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."create_order_secure"("p_shop_id" "uuid", "p_buyer_id" "uuid", "p_method" "text", "p_notes" "text", "p_dropoff_address" "text", "p_items" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_order_secure"("p_shop_id" "uuid", "p_buyer_id" "uuid", "p_method" "text", "p_notes" "text", "p_dropoff_address" "text", "p_items" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_video_remix"("p_video_id" "uuid", "p_source_video_id" "uuid", "p_mode" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_video_remix"("p_video_id" "uuid", "p_source_video_id" "uuid", "p_mode" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_video_remix"("p_video_id" "uuid", "p_source_video_id" "uuid", "p_mode" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."creator_record_earning"("p_creator_id" "uuid", "p_source" "text", "p_gross_minor" bigint, "p_platform_fee_minor" bigint, "p_currency" "text", "p_reference_id" "uuid", "p_metadata" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."creator_record_earning"("p_creator_id" "uuid", "p_source" "text", "p_gross_minor" bigint, "p_platform_fee_minor" bigint, "p_currency" "text", "p_reference_id" "uuid", "p_metadata" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."credits_transfer"("p_from_user_id" "uuid", "p_to_user_id" "uuid", "p_amount" integer, "p_reason" "text", "p_idempotency_key" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."credits_transfer"("p_from_user_id" "uuid", "p_to_user_id" "uuid", "p_amount" integer, "p_reason" "text", "p_idempotency_key" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."credits_transfer"("p_from_user_id" "uuid", "p_to_user_id" "uuid", "p_amount" integer, "p_reason" "text", "p_idempotency_key" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."delete_own_account"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."delete_own_account"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."delete_own_account"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."economy_adjust_balance"("p_user_id" "uuid", "p_amount_minor" bigint, "p_entry_type" "text", "p_source" "text", "p_reference_id" "uuid", "p_idempotency_key" "text", "p_metadata" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."economy_adjust_balance"("p_user_id" "uuid", "p_amount_minor" bigint, "p_entry_type" "text", "p_source" "text", "p_reference_id" "uuid", "p_idempotency_key" "text", "p_metadata" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."economy_request_payout"("p_amount_minor" bigint, "p_method" "text", "p_destination_token" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."economy_request_payout"("p_amount_minor" bigint, "p_method" "text", "p_destination_token" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."export_my_data"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."export_my_data"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."export_my_data"() TO "service_role";



GRANT ALL ON FUNCTION "public"."find_users_by_contact_hashes"("hashes" "text"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."find_users_by_contact_hashes"("hashes" "text"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."find_users_by_contact_hashes"("hashes" "text"[]) TO "service_role";



REVOKE ALL ON FUNCTION "public"."fulfill_monetization_checkout"("p_intent_id" "uuid", "p_provider" "text", "p_provider_reference" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fulfill_monetization_checkout"("p_intent_id" "uuid", "p_provider" "text", "p_provider_reference" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."future_export_user_data"() TO "anon";
GRANT ALL ON FUNCTION "public"."future_export_user_data"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."future_export_user_data"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_creator_rewards_summary"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_creator_rewards_summary"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_creator_rewards_summary"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_creator_top_gifters"("p_creator_id" "uuid", "p_days" integer, "p_limit" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_creator_top_gifters"("p_creator_id" "uuid", "p_days" integer, "p_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_creator_top_gifters"("p_creator_id" "uuid", "p_days" integer, "p_limit" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_friends"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_friends"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_friends"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_hashtag_leaderboard"("p_tag" "text", "p_limit" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_hashtag_leaderboard"("p_tag" "text", "p_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_hashtag_leaderboard"("p_tag" "text", "p_limit" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_monetization_catalog"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_monetization_catalog"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_monetization_catalog"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_monetization_dashboard"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_monetization_dashboard"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_monetization_dashboard"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_playlist_videos"("p_playlist_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_playlist_videos"("p_playlist_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_playlist_videos"("p_playlist_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_poll_voters"("p_poll_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_poll_voters"("p_poll_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_poll_voters"("p_poll_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_post_likers"("p_post_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_post_likers"("p_post_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_post_likers"("p_post_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_post_viewers"("p_post_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_post_viewers"("p_post_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_post_viewers"("p_post_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_profile_stats"("p_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_profile_stats"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_profile_stats"("p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_story_product_stats"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_story_product_stats"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_story_product_stats"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_story_reactors"("p_story_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_story_reactors"("p_story_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_story_reactors"("p_story_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_story_viewers"("p_story_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_story_viewers"("p_story_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_story_viewers"("p_story_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_unread_notification_counts"("p_user_ids" "uuid"[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_unread_notification_counts"("p_user_ids" "uuid"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_user_friends"("p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_user_friends"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_friends"("p_user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_video_likers"("p_video_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_video_likers"("p_video_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_video_likers"("p_video_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_video_viewers"("p_video_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_video_viewers"("p_video_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_video_viewers"("p_video_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."gin_extract_query_trgm"("text", "internal", smallint, "internal", "internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_extract_query_trgm"("text", "internal", smallint, "internal", "internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_extract_query_trgm"("text", "internal", smallint, "internal", "internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_extract_query_trgm"("text", "internal", smallint, "internal", "internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gin_extract_value_trgm"("text", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_extract_value_trgm"("text", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_extract_value_trgm"("text", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_extract_value_trgm"("text", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gin_trgm_consistent"("internal", smallint, "text", integer, "internal", "internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_trgm_consistent"("internal", smallint, "text", integer, "internal", "internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_trgm_consistent"("internal", smallint, "text", integer, "internal", "internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_trgm_consistent"("internal", smallint, "text", integer, "internal", "internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gin_trgm_triconsistent"("internal", smallint, "text", integer, "internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_trgm_triconsistent"("internal", smallint, "text", integer, "internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_trgm_triconsistent"("internal", smallint, "text", integer, "internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_trgm_triconsistent"("internal", smallint, "text", integer, "internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."global_discovery_search"("p_query" "text", "p_limit" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."global_discovery_search"("p_query" "text", "p_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."global_discovery_search"("p_query" "text", "p_limit" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."group_role"("p_group" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."group_role"("p_group" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."group_role"("p_group" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."groups_guard"() TO "anon";
GRANT ALL ON FUNCTION "public"."groups_guard"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."groups_guard"() TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_consistent"("internal", "text", smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_consistent"("internal", "text", smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_consistent"("internal", "text", smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_consistent"("internal", "text", smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_decompress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_decompress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_decompress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_decompress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_distance"("internal", "text", smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_distance"("internal", "text", smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_distance"("internal", "text", smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_distance"("internal", "text", smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_options"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_options"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_options"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_options"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_same"("public"."gtrgm", "public"."gtrgm", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_same"("public"."gtrgm", "public"."gtrgm", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_same"("public"."gtrgm", "public"."gtrgm", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_same"("public"."gtrgm", "public"."gtrgm", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user_nexus"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user_nexus"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user_nexus"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_banned"("p_group" "uuid", "p_user" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_banned"("p_group" "uuid", "p_user" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_banned"("p_group" "uuid", "p_user" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_blocked"("a" "uuid", "b" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_blocked"("a" "uuid", "b" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_blocked"("a" "uuid", "b" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_debate_member"("p_room" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_debate_member"("p_room" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_debate_member"("p_room" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_friend_with"("other" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_friend_with"("other" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_friend_with"("other" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_real_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_real_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_real_user"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."join_community_group"("p_group" "uuid", "p_code" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."join_community_group"("p_group" "uuid", "p_code" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."join_community_group"("p_group" "uuid", "p_code" "text") TO "service_role";



GRANT ALL ON TABLE "public"."debate_rooms" TO "anon";
GRANT ALL ON TABLE "public"."debate_rooms" TO "authenticated";
GRANT ALL ON TABLE "public"."debate_rooms" TO "service_role";



GRANT ALL ON FUNCTION "public"."join_debate_by_code"("p_code" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."join_debate_by_code"("p_code" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."join_debate_by_code"("p_code" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."join_video_challenge"("p_challenge_id" "uuid", "p_video_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."join_video_challenge"("p_challenge_id" "uuid", "p_video_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."join_video_challenge"("p_challenge_id" "uuid", "p_video_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."list_group_invites"("p_group" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."list_group_invites"("p_group" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."list_group_invites"("p_group" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."mark_order_paid"("p_order_id" "uuid", "p_payment_ref" "text", "p_provider" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."mark_order_paid"("p_order_id" "uuid", "p_payment_ref" "text", "p_provider" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."messages_rate_limit"() TO "anon";
GRANT ALL ON FUNCTION "public"."messages_rate_limit"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."messages_rate_limit"() TO "service_role";



GRANT ALL ON FUNCTION "public"."nexus_bootstrap"() TO "anon";
GRANT ALL ON FUNCTION "public"."nexus_bootstrap"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."nexus_bootstrap"() TO "service_role";



GRANT ALL ON FUNCTION "public"."nexus_trust_score"("p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."nexus_trust_score"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."nexus_trust_score"("p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."notify_on_comment"() TO "anon";
GRANT ALL ON FUNCTION "public"."notify_on_comment"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."notify_on_comment"() TO "service_role";



GRANT ALL ON FUNCTION "public"."notify_on_poll_vote"() TO "anon";
GRANT ALL ON FUNCTION "public"."notify_on_poll_vote"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."notify_on_poll_vote"() TO "service_role";



GRANT ALL ON FUNCTION "public"."notify_user"("p_user" "uuid", "p_actor" "uuid", "p_type" "text", "p_story" "uuid", "p_message" "text", "p_preview" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."notify_user"("p_user" "uuid", "p_actor" "uuid", "p_type" "text", "p_story" "uuid", "p_message" "text", "p_preview" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."notify_user"("p_user" "uuid", "p_actor" "uuid", "p_type" "text", "p_story" "uuid", "p_message" "text", "p_preview" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."on_block_cleanup"() TO "anon";
GRANT ALL ON FUNCTION "public"."on_block_cleanup"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."on_block_cleanup"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."peek_group_invite"("p_code" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."peek_group_invite"("p_code" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."peek_group_invite"("p_code" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."phone_account_exists"("p_phone" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."phone_account_exists"("p_phone" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."phone_account_exists"("p_phone" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."phone_account_exists"("p_phone" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."phone_exists"("p_phone" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."phone_exists"("p_phone" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."phone_exists"("p_phone" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."phone_exists"("p_phone" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."prevent_client_role_change"() TO "anon";
GRANT ALL ON FUNCTION "public"."prevent_client_role_change"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."prevent_client_role_change"() TO "service_role";



GRANT ALL ON FUNCTION "public"."profiles_country_guard"() TO "anon";
GRANT ALL ON FUNCTION "public"."profiles_country_guard"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."profiles_country_guard"() TO "service_role";



GRANT ALL ON FUNCTION "public"."profiles_protect_flags"() TO "anon";
GRANT ALL ON FUNCTION "public"."profiles_protect_flags"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."profiles_protect_flags"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."prune_stale_push_tokens"("max_age" interval) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."prune_stale_push_tokens"("max_age" interval) TO "service_role";



REVOKE ALL ON FUNCTION "public"."record_ad_creator_revenue"("p_idempotency_key" "text", "p_creator_id" "uuid", "p_gross_minor" bigint, "p_provider_fee_minor" bigint, "p_reference_id" "uuid", "p_metadata" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."record_ad_creator_revenue"("p_idempotency_key" "text", "p_creator_id" "uuid", "p_gross_minor" bigint, "p_provider_fee_minor" bigint, "p_reference_id" "uuid", "p_metadata" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."record_economy_event"("p_idempotency_key" "text", "p_user_id" "uuid", "p_source" "text", "p_gross_minor" bigint, "p_provider_fee_minor" bigint, "p_currency" "text", "p_reference_id" "uuid", "p_metadata" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."record_economy_event"("p_idempotency_key" "text", "p_user_id" "uuid", "p_source" "text", "p_gross_minor" bigint, "p_provider_fee_minor" bigint, "p_currency" "text", "p_reference_id" "uuid", "p_metadata" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."record_legal_consent"("p_document_type" "text", "p_version" "text", "p_ip_hash" "text", "p_user_agent_hash" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."record_legal_consent"("p_document_type" "text", "p_version" "text", "p_ip_hash" "text", "p_user_agent_hash" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."record_legal_consent"("p_document_type" "text", "p_version" "text", "p_ip_hash" "text", "p_user_agent_hash" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."record_sound_usage"("p_sound_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."record_sound_usage"("p_sound_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."record_sound_usage"("p_sound_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."record_story_product_event"("p_story_id" "uuid", "p_product_id" "text", "p_event" "text", "p_quantity" integer, "p_order_id" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."record_story_product_event"("p_story_id" "uuid", "p_product_id" "text", "p_event" "text", "p_quantity" integer, "p_order_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."record_story_product_event"("p_story_id" "uuid", "p_product_id" "text", "p_event" "text", "p_quantity" integer, "p_order_id" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."record_story_view"("p_story_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."record_story_view"("p_story_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."record_story_view"("p_story_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."record_video_gift"("p_video_id" "uuid", "p_sender_id" "uuid", "p_gift_code" "text", "p_checkout_intent_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."record_video_gift"("p_video_id" "uuid", "p_sender_id" "uuid", "p_gift_code" "text", "p_checkout_intent_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."record_video_gift"("p_video_id" "uuid", "p_sender_id" "uuid", "p_gift_code" "text", "p_checkout_intent_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."record_video_watch"("p_video_id" "uuid", "p_watch_ms" integer, "p_duration_ms" integer, "p_completed" boolean, "p_rewatched" boolean, "p_liked" boolean, "p_shared" boolean, "p_negative_signal" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."record_video_watch"("p_video_id" "uuid", "p_watch_ms" integer, "p_duration_ms" integer, "p_completed" boolean, "p_rewatched" boolean, "p_liked" boolean, "p_shared" boolean, "p_negative_signal" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."record_video_watch"("p_video_id" "uuid", "p_watch_ms" integer, "p_duration_ms" integer, "p_completed" boolean, "p_rewatched" boolean, "p_liked" boolean, "p_shared" boolean, "p_negative_signal" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."register_post_view"("p_post_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."register_post_view"("p_post_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."register_post_view"("p_post_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."register_video_hashtags"("p_video_id" "uuid", "p_text" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."register_video_hashtags"("p_video_id" "uuid", "p_text" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."register_video_hashtags"("p_video_id" "uuid", "p_text" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."register_video_view"("p_video_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."register_video_view"("p_video_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."register_video_view"("p_video_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."reject_friend_request"("p_follow_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."reject_friend_request"("p_follow_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."reject_friend_request"("p_follow_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."remove_friend"("p_user" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."remove_friend"("p_user" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."remove_friend"("p_user" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."report_community_message"("p_message" "uuid", "p_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."report_community_message"("p_message" "uuid", "p_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."report_community_message"("p_message" "uuid", "p_reason" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."request_economy_payout"("p_amount_minor" bigint, "p_method" "text", "p_destination_token" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."request_economy_payout"("p_amount_minor" bigint, "p_method" "text", "p_destination_token" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."request_economy_payout"("p_amount_minor" bigint, "p_method" "text", "p_destination_token" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."revoke_group_invite"("p_invite_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."revoke_group_invite"("p_invite_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."revoke_group_invite"("p_invite_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "anon";
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "service_role";



GRANT ALL ON FUNCTION "public"."role_rank"("p_role" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."role_rank"("p_role" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."role_rank"("p_role" "text") TO "service_role";



GRANT ALL ON TABLE "public"."sounds" TO "anon";
GRANT ALL ON TABLE "public"."sounds" TO "authenticated";
GRANT ALL ON TABLE "public"."sounds" TO "service_role";



GRANT ALL ON FUNCTION "public"."search_audio_library"("q" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."search_audio_library"("q" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."search_audio_library"("q" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."search_audio_library"("p_query" "text", "p_genre" "text", "p_limit" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."search_audio_library"("p_query" "text", "p_genre" "text", "p_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."search_audio_library"("p_query" "text", "p_genre" "text", "p_limit" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."security_list_devices"() TO "anon";
GRANT ALL ON FUNCTION "public"."security_list_devices"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."security_list_devices"() TO "service_role";



GRANT ALL ON FUNCTION "public"."security_revoke_device"("target_device_id" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."security_revoke_device"("target_device_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."security_revoke_device"("target_device_id" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."send_friend_request"("p_target" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."send_friend_request"("p_target" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."send_friend_request"("p_target" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."send_tip"("p_recipient_id" "uuid", "p_amount_minor" bigint, "p_post_id" "uuid", "p_live_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."send_tip"("p_recipient_id" "uuid", "p_amount_minor" bigint, "p_post_id" "uuid", "p_live_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."send_tip"("p_recipient_id" "uuid", "p_amount_minor" bigint, "p_post_id" "uuid", "p_live_id" "uuid") TO "service_role";



GRANT ALL ON TABLE "public"."creator_monetization" TO "anon";
GRANT ALL ON TABLE "public"."creator_monetization" TO "authenticated";
GRANT ALL ON TABLE "public"."creator_monetization" TO "service_role";



REVOKE ALL ON FUNCTION "public"."set_creator_monetization_enabled"("p_enabled" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_creator_monetization_enabled"("p_enabled" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_creator_monetization_enabled"("p_enabled" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."set_debate_room_ended_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_debate_room_ended_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_debate_room_ended_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_limit"(real) TO "postgres";
GRANT ALL ON FUNCTION "public"."set_limit"(real) TO "anon";
GRANT ALL ON FUNCTION "public"."set_limit"(real) TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_limit"(real) TO "service_role";



GRANT ALL ON FUNCTION "public"."set_media_assets_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_media_assets_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_media_assets_updated_at"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."set_member_role"("p_group" "uuid", "p_user" "uuid", "p_role" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_member_role"("p_group" "uuid", "p_user" "uuid", "p_role" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_member_role"("p_group" "uuid", "p_user" "uuid", "p_role" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."set_message_expiry"("p_message_id" "uuid", "p_seconds" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."set_message_expiry"("p_message_id" "uuid", "p_seconds" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_message_expiry"("p_message_id" "uuid", "p_seconds" integer) TO "service_role";



GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."profile_view_premium" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."profile_view_premium" TO "authenticated";
GRANT ALL ON TABLE "public"."profile_view_premium" TO "service_role";



REVOKE ALL ON FUNCTION "public"."set_profile_view_premium"("p_enabled" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_profile_view_premium"("p_enabled" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_profile_view_premium"("p_enabled" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."shop_is_live"("p_active" boolean, "p_status" "text", "p_trial" timestamp with time zone, "p_expires" timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."shop_is_live"("p_active" boolean, "p_status" "text", "p_trial" timestamp with time zone, "p_expires" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."shop_is_live"("p_active" boolean, "p_status" "text", "p_trial" timestamp with time zone, "p_expires" timestamp with time zone) TO "service_role";



GRANT ALL ON FUNCTION "public"."shops_enforce_insert"() TO "anon";
GRANT ALL ON FUNCTION "public"."shops_enforce_insert"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."shops_enforce_insert"() TO "service_role";



GRANT ALL ON FUNCTION "public"."shops_protect_billing"() TO "anon";
GRANT ALL ON FUNCTION "public"."shops_protect_billing"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."shops_protect_billing"() TO "service_role";



GRANT ALL ON FUNCTION "public"."show_limit"() TO "postgres";
GRANT ALL ON FUNCTION "public"."show_limit"() TO "anon";
GRANT ALL ON FUNCTION "public"."show_limit"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."show_limit"() TO "service_role";



GRANT ALL ON FUNCTION "public"."show_trgm"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."show_trgm"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."show_trgm"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."show_trgm"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."similarity"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."similarity"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."similarity"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."similarity"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."similarity_dist"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."similarity_dist"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."similarity_dist"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."similarity_dist"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."similarity_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."similarity_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."similarity_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."similarity_op"("text", "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."start_creator_subscription_checkout"("p_creator_id" "uuid", "p_amount_minor" bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."start_creator_subscription_checkout"("p_creator_id" "uuid", "p_amount_minor" bigint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."start_creator_subscription_checkout"("p_creator_id" "uuid", "p_amount_minor" bigint) TO "service_role";



REVOKE ALL ON FUNCTION "public"."start_monetization_checkout"("p_product_code" "text", "p_metadata" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."start_monetization_checkout"("p_product_code" "text", "p_metadata" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."start_monetization_checkout"("p_product_code" "text", "p_metadata" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."stories_set_expiry"() TO "anon";
GRANT ALL ON FUNCTION "public"."stories_set_expiry"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."stories_set_expiry"() TO "service_role";



GRANT ALL ON FUNCTION "public"."story_actor_name"("p" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."story_actor_name"("p" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."story_actor_name"("p" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."strict_word_similarity"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."strict_word_similarity"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."strict_word_similarity"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."strict_word_similarity"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."strict_word_similarity_commutator_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_commutator_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_commutator_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_commutator_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_commutator_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_commutator_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_commutator_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_commutator_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."strict_word_similarity_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."touch_message_read"("p_message_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."touch_message_read"("p_message_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."touch_message_read"("p_message_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."touch_profile_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."touch_profile_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."touch_profile_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."trg_notify_sticker_answer"() TO "anon";
GRANT ALL ON FUNCTION "public"."trg_notify_sticker_answer"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trg_notify_sticker_answer"() TO "service_role";



GRANT ALL ON FUNCTION "public"."trg_notify_story_mentions"() TO "anon";
GRANT ALL ON FUNCTION "public"."trg_notify_story_mentions"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trg_notify_story_mentions"() TO "service_role";



GRANT ALL ON FUNCTION "public"."trg_notify_story_poll_vote"() TO "anon";
GRANT ALL ON FUNCTION "public"."trg_notify_story_poll_vote"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trg_notify_story_poll_vote"() TO "service_role";



GRANT ALL ON FUNCTION "public"."trg_notify_story_reaction"() TO "anon";
GRANT ALL ON FUNCTION "public"."trg_notify_story_reaction"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trg_notify_story_reaction"() TO "service_role";



GRANT ALL ON FUNCTION "public"."trg_notify_story_reply"() TO "anon";
GRANT ALL ON FUNCTION "public"."trg_notify_story_reply"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trg_notify_story_reply"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."unban_community_member"("p_group" "uuid", "p_user" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."unban_community_member"("p_group" "uuid", "p_user" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."unban_community_member"("p_group" "uuid", "p_user" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."update_notifications_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_notifications_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_notifications_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_video_comments_count"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_video_comments_count"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_video_comments_count"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."update_video_likes_count"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."upsert_push_token"("p_user_id" "uuid", "p_token" "text", "p_platform" "text", "p_user_agent" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."upsert_push_token"("p_user_id" "uuid", "p_token" "text", "p_platform" "text", "p_user_agent" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."upsert_push_token"("p_user_id" "uuid", "p_token" "text", "p_platform" "text", "p_user_agent" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."video_discovery_score"("p_video_id" "uuid", "p_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."video_discovery_score"("p_video_id" "uuid", "p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."video_discovery_score"("p_video_id" "uuid", "p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."video_discovery_score"("p_video_id" "uuid", "p_user_id" "uuid") TO "service_role";



GRANT ALL ON TABLE "public"."videos" TO "anon";
GRANT ALL ON TABLE "public"."videos" TO "authenticated";
GRANT ALL ON TABLE "public"."videos" TO "service_role";



GRANT ALL ON FUNCTION "public"."video_feed_candidates"("p_user_id" "uuid", "p_limit" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."video_feed_candidates"("p_user_id" "uuid", "p_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."video_feed_candidates"("p_user_id" "uuid", "p_limit" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."vote_poll"("p_poll_id" "uuid", "p_option_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."vote_poll"("p_poll_id" "uuid", "p_option_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vote_poll"("p_poll_id" "uuid", "p_option_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."word_similarity"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."word_similarity"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."word_similarity"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."word_similarity"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."word_similarity_commutator_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."word_similarity_commutator_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."word_similarity_commutator_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."word_similarity_commutator_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."word_similarity_dist_commutator_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_commutator_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_commutator_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_commutator_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."word_similarity_dist_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."word_similarity_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."word_similarity_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."word_similarity_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."word_similarity_op"("text", "text") TO "service_role";


















GRANT ALL ON TABLE "public"."abuse_counters" TO "service_role";



GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."affiliate_attributions" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."affiliate_attributions" TO "authenticated";
GRANT ALL ON TABLE "public"."affiliate_attributions" TO "service_role";



GRANT ALL ON TABLE "public"."ai_action_log" TO "anon";
GRANT ALL ON TABLE "public"."ai_action_log" TO "authenticated";
GRANT ALL ON TABLE "public"."ai_action_log" TO "service_role";



GRANT ALL ON TABLE "public"."ai_agent_tasks" TO "anon";
GRANT ALL ON TABLE "public"."ai_agent_tasks" TO "authenticated";
GRANT ALL ON TABLE "public"."ai_agent_tasks" TO "service_role";



GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."ai_usage_daily" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."ai_usage_daily" TO "authenticated";
GRANT ALL ON TABLE "public"."ai_usage_daily" TO "service_role";



GRANT ALL ON TABLE "public"."api_plans" TO "anon";
GRANT ALL ON TABLE "public"."api_plans" TO "authenticated";
GRANT ALL ON TABLE "public"."api_plans" TO "service_role";



GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."api_subscriptions" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."api_subscriptions" TO "authenticated";
GRANT ALL ON TABLE "public"."api_subscriptions" TO "service_role";



GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."api_usage_daily" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."api_usage_daily" TO "authenticated";
GRANT ALL ON TABLE "public"."api_usage_daily" TO "service_role";



GRANT ALL ON TABLE "public"."automation_rules" TO "anon";
GRANT ALL ON TABLE "public"."automation_rules" TO "authenticated";
GRANT ALL ON TABLE "public"."automation_rules" TO "service_role";



GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."b2b_insight_exports" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."b2b_insight_exports" TO "authenticated";
GRANT ALL ON TABLE "public"."b2b_insight_exports" TO "service_role";



GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."baaro_credits_accounts" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."baaro_credits_accounts" TO "authenticated";
GRANT ALL ON TABLE "public"."baaro_credits_accounts" TO "service_role";



GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."baaro_credits_ledger" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."baaro_credits_ledger" TO "authenticated";
GRANT ALL ON TABLE "public"."baaro_credits_ledger" TO "service_role";



GRANT ALL ON TABLE "public"."calls" TO "anon";
GRANT ALL ON TABLE "public"."calls" TO "authenticated";
GRANT ALL ON TABLE "public"."calls" TO "service_role";



GRANT ALL ON TABLE "public"."cart" TO "anon";
GRANT ALL ON TABLE "public"."cart" TO "authenticated";
GRANT ALL ON TABLE "public"."cart" TO "service_role";



GRANT ALL ON TABLE "public"."channel_messages" TO "anon";
GRANT ALL ON TABLE "public"."channel_messages" TO "authenticated";
GRANT ALL ON TABLE "public"."channel_messages" TO "service_role";



GRANT ALL ON TABLE "public"."chat_ai_jobs" TO "anon";
GRANT ALL ON TABLE "public"."chat_ai_jobs" TO "authenticated";
GRANT ALL ON TABLE "public"."chat_ai_jobs" TO "service_role";



GRANT ALL ON TABLE "public"."chat_devices" TO "anon";
GRANT ALL ON TABLE "public"."chat_devices" TO "authenticated";
GRANT ALL ON TABLE "public"."chat_devices" TO "service_role";



GRANT ALL ON TABLE "public"."comments" TO "anon";
GRANT ALL ON TABLE "public"."comments" TO "authenticated";
GRANT ALL ON TABLE "public"."comments" TO "service_role";



GRANT ALL ON TABLE "public"."community_events" TO "anon";
GRANT ALL ON TABLE "public"."community_events" TO "authenticated";
GRANT ALL ON TABLE "public"."community_events" TO "service_role";



GRANT ALL ON TABLE "public"."community_reports" TO "anon";
GRANT ALL ON TABLE "public"."community_reports" TO "authenticated";
GRANT ALL ON TABLE "public"."community_reports" TO "service_role";



GRANT ALL ON TABLE "public"."companies" TO "anon";
GRANT ALL ON TABLE "public"."companies" TO "authenticated";
GRANT ALL ON TABLE "public"."companies" TO "service_role";



GRANT ALL ON TABLE "public"."company_infos" TO "anon";
GRANT ALL ON TABLE "public"."company_infos" TO "authenticated";
GRANT ALL ON TABLE "public"."company_infos" TO "service_role";



GRANT ALL ON TABLE "public"."company_programs" TO "anon";
GRANT ALL ON TABLE "public"."company_programs" TO "authenticated";
GRANT ALL ON TABLE "public"."company_programs" TO "service_role";



GRANT ALL ON TABLE "public"."company_reviews" TO "anon";
GRANT ALL ON TABLE "public"."company_reviews" TO "authenticated";
GRANT ALL ON TABLE "public"."company_reviews" TO "service_role";



GRANT ALL ON TABLE "public"."company_subscriptions" TO "anon";
GRANT ALL ON TABLE "public"."company_subscriptions" TO "authenticated";
GRANT ALL ON TABLE "public"."company_subscriptions" TO "service_role";



GRANT ALL ON TABLE "public"."company_tariffs" TO "anon";
GRANT ALL ON TABLE "public"."company_tariffs" TO "authenticated";
GRANT ALL ON TABLE "public"."company_tariffs" TO "service_role";



GRANT ALL ON TABLE "public"."contact_hashes" TO "anon";
GRANT ALL ON TABLE "public"."contact_hashes" TO "authenticated";
GRANT ALL ON TABLE "public"."contact_hashes" TO "service_role";



GRANT ALL ON TABLE "public"."content_bookmarks" TO "anon";
GRANT ALL ON TABLE "public"."content_bookmarks" TO "authenticated";
GRANT ALL ON TABLE "public"."content_bookmarks" TO "service_role";



GRANT ALL ON TABLE "public"."conversation_settings" TO "anon";
GRANT ALL ON TABLE "public"."conversation_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."conversation_settings" TO "service_role";



GRANT ALL ON TABLE "public"."conversations" TO "anon";
GRANT ALL ON TABLE "public"."conversations" TO "authenticated";
GRANT ALL ON TABLE "public"."conversations" TO "service_role";



GRANT ALL ON TABLE "public"."creator_coach_tips" TO "anon";
GRANT ALL ON TABLE "public"."creator_coach_tips" TO "authenticated";
GRANT ALL ON TABLE "public"."creator_coach_tips" TO "service_role";



GRANT ALL ON TABLE "public"."creator_earnings" TO "service_role";
GRANT SELECT ON TABLE "public"."creator_earnings" TO "authenticated";



GRANT ALL ON TABLE "public"."creator_payout_profiles" TO "service_role";
GRANT SELECT ON TABLE "public"."creator_payout_profiles" TO "authenticated";



GRANT ALL ON TABLE "public"."creator_profiles" TO "anon";
GRANT ALL ON TABLE "public"."creator_profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."creator_profiles" TO "service_role";



GRANT ALL ON TABLE "public"."creator_revenue_events" TO "anon";
GRANT ALL ON TABLE "public"."creator_revenue_events" TO "authenticated";
GRANT ALL ON TABLE "public"."creator_revenue_events" TO "service_role";



GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."creator_reward_accounts" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."creator_reward_accounts" TO "authenticated";
GRANT ALL ON TABLE "public"."creator_reward_accounts" TO "service_role";



GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."creator_reward_events" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."creator_reward_events" TO "authenticated";
GRANT ALL ON TABLE "public"."creator_reward_events" TO "service_role";



GRANT ALL ON TABLE "public"."creator_subscriptions" TO "anon";
GRANT ALL ON TABLE "public"."creator_subscriptions" TO "authenticated";
GRANT ALL ON TABLE "public"."creator_subscriptions" TO "service_role";



GRANT ALL ON TABLE "public"."data_export_jobs" TO "anon";
GRANT ALL ON TABLE "public"."data_export_jobs" TO "authenticated";
GRANT ALL ON TABLE "public"."data_export_jobs" TO "service_role";



GRANT ALL ON TABLE "public"."debate_messages" TO "anon";
GRANT ALL ON TABLE "public"."debate_messages" TO "authenticated";
GRANT ALL ON TABLE "public"."debate_messages" TO "service_role";



GRANT ALL ON TABLE "public"."debate_participants" TO "anon";
GRANT ALL ON TABLE "public"."debate_participants" TO "authenticated";
GRANT ALL ON TABLE "public"."debate_participants" TO "service_role";



GRANT ALL ON TABLE "public"."delivery_orders" TO "anon";
GRANT ALL ON TABLE "public"."delivery_orders" TO "authenticated";
GRANT ALL ON TABLE "public"."delivery_orders" TO "service_role";



GRANT ALL ON TABLE "public"."device_accounts" TO "anon";
GRANT ALL ON TABLE "public"."device_accounts" TO "authenticated";
GRANT ALL ON TABLE "public"."device_accounts" TO "service_role";



GRANT ALL ON TABLE "public"."e2e_key_backups" TO "service_role";



GRANT ALL ON TABLE "public"."economy_accounts" TO "service_role";
GRANT SELECT ON TABLE "public"."economy_accounts" TO "authenticated";



GRANT ALL ON TABLE "public"."economy_ledger" TO "service_role";
GRANT SELECT ON TABLE "public"."economy_ledger" TO "authenticated";



GRANT ALL ON TABLE "public"."economy_payouts" TO "service_role";
GRANT SELECT ON TABLE "public"."economy_payouts" TO "authenticated";



GRANT ALL ON TABLE "public"."event_attendees" TO "anon";
GRANT ALL ON TABLE "public"."event_attendees" TO "authenticated";
GRANT ALL ON TABLE "public"."event_attendees" TO "service_role";



GRANT ALL ON TABLE "public"."feed_events" TO "anon";
GRANT ALL ON TABLE "public"."feed_events" TO "authenticated";
GRANT ALL ON TABLE "public"."feed_events" TO "service_role";



GRANT ALL ON TABLE "public"."follows" TO "anon";
GRANT ALL ON TABLE "public"."follows" TO "authenticated";
GRANT ALL ON TABLE "public"."follows" TO "service_role";



GRANT ALL ON TABLE "public"."group_bans" TO "anon";
GRANT ALL ON TABLE "public"."group_bans" TO "authenticated";
GRANT ALL ON TABLE "public"."group_bans" TO "service_role";



GRANT ALL ON TABLE "public"."group_members" TO "anon";
GRANT ALL ON TABLE "public"."group_members" TO "authenticated";
GRANT ALL ON TABLE "public"."group_members" TO "service_role";



GRANT ALL ON TABLE "public"."job_listings" TO "anon";
GRANT ALL ON TABLE "public"."job_listings" TO "authenticated";
GRANT ALL ON TABLE "public"."job_listings" TO "service_role";



GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."job_profile_boosts" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."job_profile_boosts" TO "authenticated";
GRANT ALL ON TABLE "public"."job_profile_boosts" TO "service_role";



GRANT ALL ON TABLE "public"."learning_courses" TO "anon";
GRANT ALL ON TABLE "public"."learning_courses" TO "authenticated";
GRANT ALL ON TABLE "public"."learning_courses" TO "service_role";



GRANT ALL ON TABLE "public"."learning_progress" TO "anon";
GRANT ALL ON TABLE "public"."learning_progress" TO "authenticated";
GRANT ALL ON TABLE "public"."learning_progress" TO "service_role";



GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."legal_consents" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."legal_consents" TO "authenticated";
GRANT ALL ON TABLE "public"."legal_consents" TO "service_role";



GRANT ALL ON TABLE "public"."live_trainings" TO "anon";
GRANT ALL ON TABLE "public"."live_trainings" TO "authenticated";
GRANT ALL ON TABLE "public"."live_trainings" TO "service_role";



GRANT ALL ON TABLE "public"."media_assets" TO "anon";
GRANT ALL ON TABLE "public"."media_assets" TO "authenticated";
GRANT ALL ON TABLE "public"."media_assets" TO "service_role";



GRANT ALL ON TABLE "public"."media_upload_tokens" TO "anon";
GRANT ALL ON TABLE "public"."media_upload_tokens" TO "authenticated";
GRANT ALL ON TABLE "public"."media_upload_tokens" TO "service_role";



GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."merchant_pro_subscriptions" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."merchant_pro_subscriptions" TO "authenticated";
GRANT ALL ON TABLE "public"."merchant_pro_subscriptions" TO "service_role";



GRANT ALL ON TABLE "public"."message_pins" TO "anon";
GRANT ALL ON TABLE "public"."message_pins" TO "authenticated";
GRANT ALL ON TABLE "public"."message_pins" TO "service_role";



GRANT ALL ON TABLE "public"."message_reactions" TO "anon";
GRANT ALL ON TABLE "public"."message_reactions" TO "authenticated";
GRANT ALL ON TABLE "public"."message_reactions" TO "service_role";



GRANT ALL ON TABLE "public"."message_reports" TO "anon";
GRANT ALL ON TABLE "public"."message_reports" TO "authenticated";
GRANT ALL ON TABLE "public"."message_reports" TO "service_role";



GRANT ALL ON TABLE "public"."message_stars" TO "anon";
GRANT ALL ON TABLE "public"."message_stars" TO "authenticated";
GRANT ALL ON TABLE "public"."message_stars" TO "service_role";



GRANT ALL ON TABLE "public"."messages" TO "anon";
GRANT ALL ON TABLE "public"."messages" TO "authenticated";
GRANT ALL ON TABLE "public"."messages" TO "service_role";



GRANT ALL ON TABLE "public"."module_preferences" TO "anon";
GRANT ALL ON TABLE "public"."module_preferences" TO "authenticated";
GRANT ALL ON TABLE "public"."module_preferences" TO "service_role";



GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."monetization_checkout_intents" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."monetization_checkout_intents" TO "authenticated";
GRANT ALL ON TABLE "public"."monetization_checkout_intents" TO "service_role";



GRANT ALL ON TABLE "public"."monetization_products" TO "anon";
GRANT ALL ON TABLE "public"."monetization_products" TO "authenticated";
GRANT ALL ON TABLE "public"."monetization_products" TO "service_role";



GRANT ALL ON TABLE "public"."nexus_actions" TO "anon";
GRANT ALL ON TABLE "public"."nexus_actions" TO "authenticated";
GRANT ALL ON TABLE "public"."nexus_actions" TO "service_role";



GRANT ALL ON TABLE "public"."nexus_goals" TO "anon";
GRANT ALL ON TABLE "public"."nexus_goals" TO "authenticated";
GRANT ALL ON TABLE "public"."nexus_goals" TO "service_role";



GRANT ALL ON TABLE "public"."nexus_memory_items" TO "anon";
GRANT ALL ON TABLE "public"."nexus_memory_items" TO "authenticated";
GRANT ALL ON TABLE "public"."nexus_memory_items" TO "service_role";



GRANT ALL ON TABLE "public"."nexus_preferences" TO "anon";
GRANT ALL ON TABLE "public"."nexus_preferences" TO "authenticated";
GRANT ALL ON TABLE "public"."nexus_preferences" TO "service_role";



GRANT ALL ON TABLE "public"."nexus_trust_events" TO "anon";
GRANT ALL ON TABLE "public"."nexus_trust_events" TO "authenticated";
GRANT ALL ON TABLE "public"."nexus_trust_events" TO "service_role";



GRANT ALL ON TABLE "public"."notification_preferences" TO "anon";
GRANT ALL ON TABLE "public"."notification_preferences" TO "authenticated";
GRANT ALL ON TABLE "public"."notification_preferences" TO "service_role";



GRANT ALL ON TABLE "public"."notifications" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."notifications" TO "authenticated";
GRANT ALL ON TABLE "public"."notifications" TO "service_role";



GRANT UPDATE("read") ON TABLE "public"."notifications" TO "authenticated";



GRANT UPDATE("read_at") ON TABLE "public"."notifications" TO "authenticated";



GRANT ALL ON TABLE "public"."notification_unread_counts" TO "anon";
GRANT ALL ON TABLE "public"."notification_unread_counts" TO "authenticated";
GRANT ALL ON TABLE "public"."notification_unread_counts" TO "service_role";



GRANT ALL ON TABLE "public"."observability_events" TO "service_role";



GRANT ALL ON SEQUENCE "public"."observability_events_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."observability_events_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."observability_events_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."offline_sync_queue" TO "anon";
GRANT ALL ON TABLE "public"."offline_sync_queue" TO "authenticated";
GRANT ALL ON TABLE "public"."offline_sync_queue" TO "service_role";



GRANT ALL ON TABLE "public"."order_items" TO "anon";
GRANT ALL ON TABLE "public"."order_items" TO "authenticated";
GRANT ALL ON TABLE "public"."order_items" TO "service_role";



GRANT ALL ON TABLE "public"."orders" TO "anon";
GRANT ALL ON TABLE "public"."orders" TO "authenticated";
GRANT ALL ON TABLE "public"."orders" TO "service_role";



GRANT ALL ON TABLE "public"."payment_webhook_events" TO "service_role";



GRANT ALL ON TABLE "public"."poll_options" TO "anon";
GRANT ALL ON TABLE "public"."poll_options" TO "authenticated";
GRANT ALL ON TABLE "public"."poll_options" TO "service_role";



GRANT ALL ON TABLE "public"."poll_votes" TO "anon";
GRANT ALL ON TABLE "public"."poll_votes" TO "authenticated";
GRANT ALL ON TABLE "public"."poll_votes" TO "service_role";



GRANT ALL ON TABLE "public"."poll_results" TO "anon";
GRANT ALL ON TABLE "public"."poll_results" TO "authenticated";
GRANT ALL ON TABLE "public"."poll_results" TO "service_role";



GRANT ALL ON TABLE "public"."polls" TO "anon";
GRANT ALL ON TABLE "public"."polls" TO "authenticated";
GRANT ALL ON TABLE "public"."polls" TO "service_role";



GRANT ALL ON TABLE "public"."post_bookmarks" TO "anon";
GRANT ALL ON TABLE "public"."post_bookmarks" TO "authenticated";
GRANT ALL ON TABLE "public"."post_bookmarks" TO "service_role";



GRANT ALL ON TABLE "public"."post_likes" TO "anon";
GRANT ALL ON TABLE "public"."post_likes" TO "authenticated";
GRANT ALL ON TABLE "public"."post_likes" TO "service_role";



GRANT ALL ON TABLE "public"."post_poll_votes" TO "anon";
GRANT ALL ON TABLE "public"."post_poll_votes" TO "authenticated";
GRANT ALL ON TABLE "public"."post_poll_votes" TO "service_role";



GRANT ALL ON TABLE "public"."post_reports" TO "anon";
GRANT ALL ON TABLE "public"."post_reports" TO "authenticated";
GRANT ALL ON TABLE "public"."post_reports" TO "service_role";



GRANT ALL ON TABLE "public"."post_reposts" TO "anon";
GRANT ALL ON TABLE "public"."post_reposts" TO "authenticated";
GRANT ALL ON TABLE "public"."post_reposts" TO "service_role";



GRANT ALL ON TABLE "public"."post_views" TO "anon";
GRANT ALL ON TABLE "public"."post_views" TO "authenticated";
GRANT ALL ON TABLE "public"."post_views" TO "service_role";



GRANT ALL ON TABLE "public"."posts" TO "anon";
GRANT ALL ON TABLE "public"."posts" TO "authenticated";
GRANT ALL ON TABLE "public"."posts" TO "service_role";



GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."premium_subscriptions" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."premium_subscriptions" TO "authenticated";
GRANT ALL ON TABLE "public"."premium_subscriptions" TO "service_role";



GRANT ALL ON TABLE "public"."profile_contacts" TO "anon";
GRANT ALL ON TABLE "public"."profile_contacts" TO "authenticated";
GRANT ALL ON TABLE "public"."profile_contacts" TO "service_role";



GRANT ALL ON TABLE "public"."profile_links" TO "anon";
GRANT ALL ON TABLE "public"."profile_links" TO "authenticated";
GRANT ALL ON TABLE "public"."profile_links" TO "service_role";



GRANT ALL ON TABLE "public"."profile_social_links" TO "anon";
GRANT ALL ON TABLE "public"."profile_social_links" TO "authenticated";
GRANT ALL ON TABLE "public"."profile_social_links" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT SELECT("id") ON TABLE "public"."profiles" TO "anon";
GRANT SELECT("id") ON TABLE "public"."profiles" TO "authenticated";



GRANT SELECT("display_name") ON TABLE "public"."profiles" TO "anon";
GRANT SELECT("display_name") ON TABLE "public"."profiles" TO "authenticated";



GRANT SELECT("handle") ON TABLE "public"."profiles" TO "anon";
GRANT SELECT("handle") ON TABLE "public"."profiles" TO "authenticated";



GRANT SELECT("flag") ON TABLE "public"."profiles" TO "anon";
GRANT SELECT("flag") ON TABLE "public"."profiles" TO "authenticated";



GRANT SELECT("bio") ON TABLE "public"."profiles" TO "anon";
GRANT SELECT("bio") ON TABLE "public"."profiles" TO "authenticated";



GRANT SELECT("avatar_url") ON TABLE "public"."profiles" TO "anon";
GRANT SELECT("avatar_url") ON TABLE "public"."profiles" TO "authenticated";



GRANT SELECT("created_at") ON TABLE "public"."profiles" TO "anon";
GRANT SELECT("created_at") ON TABLE "public"."profiles" TO "authenticated";



GRANT SELECT("updated_at") ON TABLE "public"."profiles" TO "anon";
GRANT SELECT("updated_at") ON TABLE "public"."profiles" TO "authenticated";



GRANT SELECT("restricted") ON TABLE "public"."profiles" TO "anon";
GRANT SELECT("restricted") ON TABLE "public"."profiles" TO "authenticated";



GRANT SELECT("last_seen_at") ON TABLE "public"."profiles" TO "anon";
GRANT SELECT("last_seen_at") ON TABLE "public"."profiles" TO "authenticated";



GRANT SELECT("is_premium") ON TABLE "public"."profiles" TO "anon";
GRANT SELECT("is_premium") ON TABLE "public"."profiles" TO "authenticated";



GRANT SELECT("location") ON TABLE "public"."profiles" TO "anon";
GRANT SELECT("location") ON TABLE "public"."profiles" TO "authenticated";



GRANT SELECT("country") ON TABLE "public"."profiles" TO "anon";
GRANT SELECT("country") ON TABLE "public"."profiles" TO "authenticated";



GRANT SELECT("registered_country") ON TABLE "public"."profiles" TO "anon";
GRANT SELECT("registered_country") ON TABLE "public"."profiles" TO "authenticated";



GRANT SELECT("country_changed_at") ON TABLE "public"."profiles" TO "anon";
GRANT SELECT("country_changed_at") ON TABLE "public"."profiles" TO "authenticated";



GRANT SELECT("country_change_available_at") ON TABLE "public"."profiles" TO "anon";
GRANT SELECT("country_change_available_at") ON TABLE "public"."profiles" TO "authenticated";



GRANT SELECT("cover_url") ON TABLE "public"."profiles" TO "anon";
GRANT SELECT("cover_url") ON TABLE "public"."profiles" TO "authenticated";



GRANT SELECT("is_verified") ON TABLE "public"."profiles" TO "anon";
GRANT SELECT("is_verified") ON TABLE "public"."profiles" TO "authenticated";



GRANT SELECT("public_key") ON TABLE "public"."profiles" TO "anon";
GRANT SELECT("public_key") ON TABLE "public"."profiles" TO "authenticated";



GRANT ALL ON TABLE "public"."push_notification_dead_letters" TO "service_role";



GRANT ALL ON TABLE "public"."push_tokens" TO "anon";
GRANT ALL ON TABLE "public"."push_tokens" TO "authenticated";
GRANT ALL ON TABLE "public"."push_tokens" TO "service_role";



GRANT ALL ON TABLE "public"."reputation_events" TO "anon";
GRANT ALL ON TABLE "public"."reputation_events" TO "authenticated";
GRANT ALL ON TABLE "public"."reputation_events" TO "service_role";



GRANT ALL ON TABLE "public"."safety_reports" TO "anon";
GRANT ALL ON TABLE "public"."safety_reports" TO "authenticated";
GRANT ALL ON TABLE "public"."safety_reports" TO "service_role";



GRANT ALL ON TABLE "public"."safety_signals" TO "anon";
GRANT ALL ON TABLE "public"."safety_signals" TO "authenticated";
GRANT ALL ON TABLE "public"."safety_signals" TO "service_role";



GRANT ALL ON TABLE "public"."saved_searches" TO "anon";
GRANT ALL ON TABLE "public"."saved_searches" TO "authenticated";
GRANT ALL ON TABLE "public"."saved_searches" TO "service_role";



GRANT ALL ON TABLE "public"."search_history" TO "anon";
GRANT ALL ON TABLE "public"."search_history" TO "authenticated";
GRANT ALL ON TABLE "public"."search_history" TO "service_role";



GRANT ALL ON TABLE "public"."security_devices" TO "anon";
GRANT ALL ON TABLE "public"."security_devices" TO "authenticated";
GRANT ALL ON TABLE "public"."security_devices" TO "service_role";



GRANT ALL ON TABLE "public"."security_events" TO "service_role";



GRANT ALL ON SEQUENCE "public"."security_events_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."security_events_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."security_events_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."security_settings" TO "anon";
GRANT ALL ON TABLE "public"."security_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."security_settings" TO "service_role";



GRANT ALL ON TABLE "public"."service_listings" TO "anon";
GRANT ALL ON TABLE "public"."service_listings" TO "authenticated";
GRANT ALL ON TABLE "public"."service_listings" TO "service_role";



GRANT ALL ON TABLE "public"."shop_pricing" TO "anon";
GRANT ALL ON TABLE "public"."shop_pricing" TO "authenticated";
GRANT ALL ON TABLE "public"."shop_pricing" TO "service_role";



GRANT ALL ON TABLE "public"."shop_products" TO "anon";
GRANT ALL ON TABLE "public"."shop_products" TO "authenticated";
GRANT ALL ON TABLE "public"."shop_products" TO "service_role";



GRANT ALL ON TABLE "public"."shop_reviews" TO "anon";
GRANT ALL ON TABLE "public"."shop_reviews" TO "authenticated";
GRANT ALL ON TABLE "public"."shop_reviews" TO "service_role";



GRANT ALL ON TABLE "public"."shop_subscriptions" TO "anon";
GRANT ALL ON TABLE "public"."shop_subscriptions" TO "authenticated";
GRANT ALL ON TABLE "public"."shop_subscriptions" TO "service_role";



GRANT ALL ON TABLE "public"."shops" TO "anon";
GRANT ALL ON TABLE "public"."shops" TO "authenticated";
GRANT ALL ON TABLE "public"."shops" TO "service_role";



GRANT ALL ON TABLE "public"."stories" TO "anon";
GRANT ALL ON TABLE "public"."stories" TO "authenticated";
GRANT ALL ON TABLE "public"."stories" TO "service_role";



GRANT ALL ON TABLE "public"."story_close_friends" TO "anon";
GRANT ALL ON TABLE "public"."story_close_friends" TO "authenticated";
GRANT ALL ON TABLE "public"."story_close_friends" TO "service_role";



GRANT ALL ON TABLE "public"."story_highlight_items" TO "anon";
GRANT ALL ON TABLE "public"."story_highlight_items" TO "authenticated";
GRANT ALL ON TABLE "public"."story_highlight_items" TO "service_role";



GRANT ALL ON TABLE "public"."story_highlights" TO "anon";
GRANT ALL ON TABLE "public"."story_highlights" TO "authenticated";
GRANT ALL ON TABLE "public"."story_highlights" TO "service_role";



GRANT ALL ON TABLE "public"."story_product_events" TO "anon";
GRANT ALL ON TABLE "public"."story_product_events" TO "authenticated";
GRANT ALL ON TABLE "public"."story_product_events" TO "service_role";



GRANT ALL ON SEQUENCE "public"."story_product_events_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."story_product_events_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."story_product_events_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."story_reactions" TO "anon";
GRANT ALL ON TABLE "public"."story_reactions" TO "authenticated";
GRANT ALL ON TABLE "public"."story_reactions" TO "service_role";



GRANT ALL ON TABLE "public"."story_replies" TO "anon";
GRANT ALL ON TABLE "public"."story_replies" TO "authenticated";
GRANT ALL ON TABLE "public"."story_replies" TO "service_role";



GRANT ALL ON TABLE "public"."story_sticker_responses" TO "anon";
GRANT ALL ON TABLE "public"."story_sticker_responses" TO "authenticated";
GRANT ALL ON TABLE "public"."story_sticker_responses" TO "service_role";



GRANT ALL ON TABLE "public"."story_views" TO "anon";
GRANT ALL ON TABLE "public"."story_views" TO "authenticated";
GRANT ALL ON TABLE "public"."story_views" TO "service_role";



GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."tips" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."tips" TO "authenticated";
GRANT ALL ON TABLE "public"."tips" TO "service_role";



GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."training_purchases" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."training_purchases" TO "authenticated";
GRANT ALL ON TABLE "public"."training_purchases" TO "service_role";



GRANT ALL ON TABLE "public"."trust_events" TO "service_role";



GRANT ALL ON TABLE "public"."user_blocks" TO "anon";
GRANT ALL ON TABLE "public"."user_blocks" TO "authenticated";
GRANT ALL ON TABLE "public"."user_blocks" TO "service_role";



GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."user_cosmetics" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."user_cosmetics" TO "authenticated";
GRANT ALL ON TABLE "public"."user_cosmetics" TO "service_role";



GRANT ALL ON TABLE "public"."user_preferences" TO "anon";
GRANT ALL ON TABLE "public"."user_preferences" TO "authenticated";
GRANT ALL ON TABLE "public"."user_preferences" TO "service_role";



GRANT ALL ON TABLE "public"."user_settings" TO "anon";
GRANT ALL ON TABLE "public"."user_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."user_settings" TO "service_role";



GRANT ALL ON TABLE "public"."v_trust_score" TO "anon";
GRANT ALL ON TABLE "public"."v_trust_score" TO "authenticated";
GRANT ALL ON TABLE "public"."v_trust_score" TO "service_role";



GRANT ALL ON TABLE "public"."video_ai_assets" TO "anon";
GRANT ALL ON TABLE "public"."video_ai_assets" TO "authenticated";
GRANT ALL ON TABLE "public"."video_ai_assets" TO "service_role";



GRANT ALL ON TABLE "public"."video_bookmarks" TO "anon";
GRANT ALL ON TABLE "public"."video_bookmarks" TO "authenticated";
GRANT ALL ON TABLE "public"."video_bookmarks" TO "service_role";



GRANT ALL ON TABLE "public"."video_captions" TO "anon";
GRANT ALL ON TABLE "public"."video_captions" TO "authenticated";
GRANT ALL ON TABLE "public"."video_captions" TO "service_role";



GRANT ALL ON TABLE "public"."video_challenge_entries" TO "anon";
GRANT ALL ON TABLE "public"."video_challenge_entries" TO "authenticated";
GRANT ALL ON TABLE "public"."video_challenge_entries" TO "service_role";



GRANT ALL ON TABLE "public"."video_challenges" TO "anon";
GRANT ALL ON TABLE "public"."video_challenges" TO "authenticated";
GRANT ALL ON TABLE "public"."video_challenges" TO "service_role";



GRANT ALL ON TABLE "public"."video_chapters" TO "anon";
GRANT ALL ON TABLE "public"."video_chapters" TO "authenticated";
GRANT ALL ON TABLE "public"."video_chapters" TO "service_role";



GRANT ALL ON TABLE "public"."video_collaborations" TO "anon";
GRANT ALL ON TABLE "public"."video_collaborations" TO "authenticated";
GRANT ALL ON TABLE "public"."video_collaborations" TO "service_role";



GRANT ALL ON TABLE "public"."video_collections" TO "anon";
GRANT ALL ON TABLE "public"."video_collections" TO "authenticated";
GRANT ALL ON TABLE "public"."video_collections" TO "service_role";



GRANT ALL ON TABLE "public"."video_comments" TO "anon";
GRANT ALL ON TABLE "public"."video_comments" TO "authenticated";
GRANT ALL ON TABLE "public"."video_comments" TO "service_role";



GRANT ALL ON TABLE "public"."video_gift_events" TO "anon";
GRANT ALL ON TABLE "public"."video_gift_events" TO "authenticated";
GRANT ALL ON TABLE "public"."video_gift_events" TO "service_role";



GRANT ALL ON TABLE "public"."video_gifts_catalog" TO "anon";
GRANT ALL ON TABLE "public"."video_gifts_catalog" TO "authenticated";
GRANT ALL ON TABLE "public"."video_gifts_catalog" TO "service_role";



GRANT ALL ON TABLE "public"."video_hashtags" TO "anon";
GRANT ALL ON TABLE "public"."video_hashtags" TO "authenticated";
GRANT ALL ON TABLE "public"."video_hashtags" TO "service_role";



GRANT ALL ON TABLE "public"."video_likes" TO "anon";
GRANT ALL ON TABLE "public"."video_likes" TO "authenticated";
GRANT ALL ON TABLE "public"."video_likes" TO "service_role";



GRANT ALL ON TABLE "public"."video_moderation_results" TO "anon";
GRANT ALL ON TABLE "public"."video_moderation_results" TO "authenticated";
GRANT ALL ON TABLE "public"."video_moderation_results" TO "service_role";



GRANT ALL ON TABLE "public"."video_playlist_items" TO "anon";
GRANT ALL ON TABLE "public"."video_playlist_items" TO "authenticated";
GRANT ALL ON TABLE "public"."video_playlist_items" TO "service_role";



GRANT ALL ON TABLE "public"."video_playlists" TO "anon";
GRANT ALL ON TABLE "public"."video_playlists" TO "authenticated";
GRANT ALL ON TABLE "public"."video_playlists" TO "service_role";



GRANT ALL ON TABLE "public"."video_poll_votes" TO "anon";
GRANT ALL ON TABLE "public"."video_poll_votes" TO "authenticated";
GRANT ALL ON TABLE "public"."video_poll_votes" TO "service_role";



GRANT ALL ON TABLE "public"."video_polls" TO "anon";
GRANT ALL ON TABLE "public"."video_polls" TO "authenticated";
GRANT ALL ON TABLE "public"."video_polls" TO "service_role";



GRANT ALL ON TABLE "public"."video_questions" TO "anon";
GRANT ALL ON TABLE "public"."video_questions" TO "authenticated";
GRANT ALL ON TABLE "public"."video_questions" TO "service_role";



GRANT ALL ON TABLE "public"."video_recommendation_explanations" TO "anon";
GRANT ALL ON TABLE "public"."video_recommendation_explanations" TO "authenticated";
GRANT ALL ON TABLE "public"."video_recommendation_explanations" TO "service_role";



GRANT ALL ON TABLE "public"."video_recommendation_profiles" TO "anon";
GRANT ALL ON TABLE "public"."video_recommendation_profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."video_recommendation_profiles" TO "service_role";



GRANT ALL ON TABLE "public"."video_remixes" TO "anon";
GRANT ALL ON TABLE "public"."video_remixes" TO "authenticated";
GRANT ALL ON TABLE "public"."video_remixes" TO "service_role";



GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."video_views" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."video_views" TO "authenticated";
GRANT ALL ON TABLE "public"."video_views" TO "service_role";



GRANT ALL ON TABLE "public"."video_watch_events" TO "anon";
GRANT ALL ON TABLE "public"."video_watch_events" TO "authenticated";
GRANT ALL ON TABLE "public"."video_watch_events" TO "service_role";



GRANT ALL ON TABLE "public"."voice_channel_members" TO "anon";
GRANT ALL ON TABLE "public"."voice_channel_members" TO "authenticated";
GRANT ALL ON TABLE "public"."voice_channel_members" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";



































