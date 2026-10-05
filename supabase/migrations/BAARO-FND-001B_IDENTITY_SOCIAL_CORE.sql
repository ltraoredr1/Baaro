-- ============================================================
-- BAARO-FND-001B — suite de BAARO-FND-001A (exécuter APRÈS BAARO-FND-001A)
-- ============================================================

-- ============================================================
-- 7. RLS
-- ============================================================

ALTER TABLE public.follows ENABLE ROW LEVEL SECURITY;

-- Lecture publique des relations
DROP POLICY IF EXISTS follows_select_public ON public.follows;

CREATE POLICY follows_select_public
ON public.follows
FOR SELECT
USING (true);

-- Création d'un abonnement / demande par l'utilisateur
DROP POLICY IF EXISTS follows_insert_own ON public.follows;


-- Suppression de son propre abonnement
DROP POLICY IF EXISTS follows_delete_own ON public.follows;


-- Modification de sa propre relation
DROP POLICY IF EXISTS follows_update_own ON public.follows;


-- Le destinataire peut accepter/refuser une demande d'ami
DROP POLICY IF EXISTS follows_request_receiver ON public.follows;

CREATE POLICY follows_request_receiver
ON public.follows
FOR UPDATE
USING (
    auth.uid() = followed_id
    AND status = 'pending'
    AND is_friend = true
)
WITH CHECK (
    auth.uid() = followed_id
    AND follower_id <> followed_id
);

-- ============================================================
-- 8. Fonction : envoyer une demande d'ami
-- ============================================================

CREATE OR REPLACE FUNCTION public.send_friend_request(
    p_target uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
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
$function$;

-- ============================================================
-- 9. Fonction : accepter une demande d'ami
-- ============================================================

CREATE OR REPLACE FUNCTION public.accept_friend_request(
    p_follow_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
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
$function$;

-- ============================================================
-- 10. Fonction : refuser une demande
-- ============================================================

CREATE OR REPLACE FUNCTION public.reject_friend_request(
    p_follow_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
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
$function$;

-- ============================================================
-- 11. Fonction : supprimer un ami
-- ============================================================

CREATE OR REPLACE FUNCTION public.remove_friend(
    p_user uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
    v_user uuid := auth.uid();
BEGIN
    IF v_user IS NULL THEN
        RAISE EXCEPTION 'NOT_AUTHENTICATED';
    END IF;

    DELETE FROM public.follows
    WHERE (
        follower_id = v_user
        AND followed_id = p_user
    )
    OR (
        follower_id = p_user
        AND followed_id = v_user
    )
    AND is_friend = true;

    RETURN true;
END;
$function$;

-- ============================================================
-- 12. Fonction : obtenir les amis
-- ============================================================

DROP FUNCTION IF EXISTS public.get_user_friends(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.get_user_friends(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.get_user_friends(uuid) CASCADE;
CREATE OR REPLACE FUNCTION public.get_user_friends(
    p_user_id uuid
)
RETURNS TABLE (
    friend_id uuid
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
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
$function$;

-- ============================================================
-- 13. Permissions RPC
-- ============================================================

GRANT EXECUTE ON FUNCTION public.send_friend_request(uuid)
TO authenticated;

GRANT EXECUTE ON FUNCTION public.accept_friend_request(uuid)
TO authenticated;

GRANT EXECUTE ON FUNCTION public.reject_friend_request(uuid)
TO authenticated;

GRANT EXECUTE ON FUNCTION public.remove_friend(uuid)
TO authenticated;

GRANT EXECUTE ON FUNCTION public.get_user_friends(uuid)
TO authenticated;

COMMIT;


-- ============================================================
-- SOURCE: 0044_add_messaging_improvements.sql
-- ============================================================
-- ============================================================
-- BAARO — Amélioration messagerie (sans régression)
-- À exécuter dans Supabase > SQL Editor, après les scripts existants
-- ============================================================

-- 1) Statut en ligne / "vu"
alter table profiles
  add column if not exists last_seen_at timestamptz;

alter table messages
  add column if not exists read_at timestamptz;

-- 2) Modification / suppression de message (soft delete)
alter table messages
  add column if not exists edited_at timestamptz;

alter table messages
  add column if not exists deleted_at timestamptz;

-- RLS : autoriser l'expéditeur à modifier/supprimer (soft) son propre message
drop policy if exists "messages_update_own" on messages;
create policy "messages_update_own"
  on messages for update
  using (auth.uid() = sender_id)
  with check (auth.uid() = sender_id);

-- RLS : autoriser un utilisateur à mettre à jour read_at sur les messages
-- qu'il reçoit (pour marquer "vu")
drop policy if exists "messages_mark_read" on messages;
create policy "messages_mark_read"
  on messages for update
  using (auth.uid() = recipient_id)
  with check (auth.uid() = recipient_id);

-- RLS : autoriser chaque utilisateur à mettre à jour son propre last_seen_at
drop policy if exists "profiles_update_last_seen" on profiles;
create policy "profiles_update_last_seen"
  on profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- 3) Réactions sur les messages
create table if not exists message_reactions (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references messages(id) on delete cascade,
  conversation_id uuid not null references conversations(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  emoji text not null,
  created_at timestamptz not null default now(),
  unique (message_id, user_id, emoji)
);

alter table message_reactions enable row level security;

drop policy if exists "reactions_select_participants" on message_reactions;
create policy "reactions_select_participants"
  on message_reactions for select
  using (
    exists (
      select 1 from conversations c
      where c.id = message_reactions.conversation_id
        and (c.user1_id = auth.uid() or c.user2_id = auth.uid())
    )
  );

drop policy if exists "reactions_insert_own" on message_reactions;
create policy "reactions_insert_own"
  on message_reactions for insert
  with check (auth.uid() = user_id);

drop policy if exists "reactions_delete_own" on message_reactions;
create policy "reactions_delete_own"
  on message_reactions for delete
  using (auth.uid() = user_id);

-- 4) Activer le Realtime sur les nouvelles tables / colonnes suivies
-- (Database > Replication dans Supabase, ou via SQL si la publication existe déjà) :
do $$ begin alter publication supabase_realtime add table public.message_reactions; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.profiles; exception when duplicate_object then null; end $$;

-- NB: la table "messages" est déjà en Realtime (utilisée pour les INSERT) ;
-- ce script ne fait qu'ajouter les UPDATE nécessaires aux accusés de
-- lecture, à l'édition et à la suppression, qui passent par le même canal.


-- ============================================================
-- SOURCE: 0045_device_accounts_id_only.sql
-- ============================================================
-- BAARO 047: device_accounts — identité = id (auth.users.id), plus de user_id
-- Clés étrangères métier (author_id, sender_id, etc.) non concernées.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'device_accounts'
      AND column_name = 'user_id'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'device_accounts'
      AND column_name = 'id'
  ) THEN
    ALTER TABLE public.device_accounts RENAME COLUMN user_id TO id;
  END IF;
END $$;

-- PK (device_id, id)
DO $$
BEGIN
  IF to_regclass('public.device_accounts') IS NOT NULL THEN
    ALTER TABLE public.device_accounts DROP CONSTRAINT IF EXISTS device_accounts_pkey;
    ALTER TABLE public.device_accounts
      ALTER COLUMN id SET NOT NULL,
      ALTER COLUMN device_id SET NOT NULL;
    BEGIN
      ALTER TABLE public.device_accounts
        ADD PRIMARY KEY (device_id, id);
    EXCEPTION WHEN OTHERS THEN
      -- déjà en place
      NULL;
    END;

    ALTER TABLE public.device_accounts DROP CONSTRAINT IF EXISTS device_accounts_id_fkey;
    ALTER TABLE public.device_accounts
      ADD CONSTRAINT device_accounts_id_fkey
      FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;

    COMMENT ON COLUMN public.device_accounts.id IS
      'Identifiant utilisateur = auth.users.id (plus de user_id)';
  END IF;
END $$;


-- ============================================================
-- SOURCE: 0046_join_debate_code_case.sql
-- ============================================================
-- Codes d'invitation : comparaison insensible à la casse
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

grant execute on function public.join_debate_by_code(text) to authenticated, anon;


-- ============================================================
-- SOURCE: 0047_fix_phone_auth_id_only.sql
-- ============================================================
-- ============================================================
-- BAARO 049
-- Correction définitive de l'authentification téléphone
--
-- Architecture BAARO :
--
--   auth.users.id
--          =
--      profiles.id
--
-- Aucun autre identifiant technique de compte n'est créé ici.
-- ============================================================


-- ============================================================
-- 1. Colonnes nécessaires dans profiles
-- ============================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS phone text;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS bio text;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS flag text;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS created_at timestamptz
  DEFAULT now();

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS updated_at timestamptz
  DEFAULT now();


-- ============================================================
-- 2. Identifiant canonique
-- ============================================================

ALTER TABLE public.profiles
  ALTER COLUMN id SET NOT NULL;


-- ============================================================
-- 3. Relation profiles -> auth.users
-- ============================================================

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_id_fkey;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_id_fkey
  FOREIGN KEY (id)
  REFERENCES auth.users(id)
  ON DELETE CASCADE;


-- ============================================================
-- 4. Réparer les anciens profils sans handle
-- ============================================================

UPDATE public.profiles
SET
  handle =
    '@user_' ||
    substr(
      replace(id::text, '-', ''),
      1,
      12
    )
WHERE handle IS NULL
   OR length(trim(handle)) = 0;


-- ============================================================
-- 5. Normaliser les handles
-- ============================================================

UPDATE public.profiles
SET handle = lower(trim(handle))
WHERE handle IS NOT NULL
  AND handle <> lower(trim(handle));


UPDATE public.profiles
SET handle = '@' || handle
WHERE handle IS NOT NULL
  AND left(handle, 1) <> '@';


-- ============================================================
-- 6. Index unique des handles
-- ============================================================

DROP INDEX IF EXISTS public.profiles_handle_unique;



-- ============================================================
-- 7. handle obligatoire
-- ============================================================

ALTER TABLE public.profiles
  ALTER COLUMN handle SET NOT NULL;


-- ============================================================
-- 8. Fonction automatique de création du profil
--
-- IMPORTANT :
-- l'identifiant utilisé est NEW.id.
-- ============================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name text;
  v_handle text;
  v_fallback_handle text;
  v_flag text;
  v_bio text;
  v_phone text;
BEGIN

  -- ----------------------------------------------------------
  -- Nom affiché
  -- ----------------------------------------------------------

  v_name := left(
    coalesce(
      nullif(
        new.raw_user_meta_data ->> 'display_name',
        ''
      ),

      nullif(
        new.raw_user_meta_data ->> 'full_name',
        ''
      ),

      nullif(
        new.raw_user_meta_data ->> 'name',
        ''
      ),

      nullif(
        split_part(
          coalesce(new.email, ''),
          '@',
          1
        ),
        ''
      ),

      nullif(new.phone, ''),

      'Membre BAARO'
    ),
    80
  );


  -- ----------------------------------------------------------
  -- Téléphone
  -- ----------------------------------------------------------

  v_phone := nullif(
    trim(coalesce(new.phone, '')),
    ''
  );


  -- ----------------------------------------------------------
  -- Drapeau
  -- ----------------------------------------------------------

  v_flag := coalesce(
    nullif(
      new.raw_user_meta_data ->> 'flag',
      ''
    ),
    '🌍'
  );


  -- ----------------------------------------------------------
  -- Biographie
  -- ----------------------------------------------------------

  v_bio := coalesce(
    new.raw_user_meta_data ->> 'bio',
    ''
  );


  -- ----------------------------------------------------------
  -- Handle demandé par les métadonnées
  -- ----------------------------------------------------------

  v_handle := lower(
    trim(
      coalesce(
        nullif(
          new.raw_user_meta_data ->> 'handle',
          ''
        ),

        '@user_' ||
        substr(
          replace(new.id::text, '-', ''),
          1,
          12
        )
      )
    )
  );


  -- Ajouter @ si nécessaire
  IF left(v_handle, 1) <> '@' THEN
    v_handle := '@' || v_handle;
  END IF;


  -- Limiter la longueur
  v_handle := left(v_handle, 40);


  -- ----------------------------------------------------------
  -- Handle garanti unique
  -- ----------------------------------------------------------

  v_fallback_handle :=
    '@user_' ||
    substr(
      replace(new.id::text, '-', ''),
      1,
      12
    );


  -- ----------------------------------------------------------
  -- Création du profil
  -- ----------------------------------------------------------

  BEGIN

    INSERT INTO public.profiles (
      id,
      display_name,
      handle,
      flag,
      bio,
      phone,
      created_at,
      updated_at
    )

    VALUES (
      new.id,
      v_name,
      v_handle,
      v_flag,
      v_bio,
      v_phone,
      now(),
      now()
    )

    ON CONFLICT (id)
    DO UPDATE SET
      phone =
        coalesce(
          excluded.phone,
          public.profiles.phone
        ),

      display_name =
        coalesce(
          nullif(
            excluded.display_name,
            ''
          ),
          public.profiles.display_name
        ),

      flag =
        coalesce(
          nullif(
            excluded.flag,
            ''
          ),
          public.profiles.flag
        ),

      updated_at = now();


  EXCEPTION
    WHEN unique_violation THEN

      -- Le handle demandé existe déjà.
      -- Utilisation d'un handle déterministe basé sur id.

      INSERT INTO public.profiles (
        id,
        display_name,
        handle,
        flag,
        bio,
        phone,
        created_at,
        updated_at
      )

      VALUES (
        new.id,
        v_name,
        v_fallback_handle,
        v_flag,
        v_bio,
        v_phone,
        now(),
        now()
      )

      ON CONFLICT (id)
      DO UPDATE SET
        phone =
          coalesce(
            excluded.phone,
            public.profiles.phone
          ),

        updated_at = now();

  END;


  RETURN new;

END;
$$;


-- ============================================================
-- 9. Recréer le trigger auth
-- ============================================================

DROP TRIGGER IF EXISTS
  on_auth_user_created
ON auth.users;




-- ============================================================
-- 10. Réparer les comptes déjà créés
-- ============================================================

INSERT INTO public.profiles (
  id,
  display_name,
  handle,
  flag,
  bio,
  phone,
  created_at,
  updated_at
)

SELECT
  u.id,

  left(
    coalesce(
      nullif(
        u.raw_user_meta_data ->> 'display_name',
        ''
      ),

      nullif(
        u.raw_user_meta_data ->> 'full_name',
        ''
      ),

      nullif(
        u.raw_user_meta_data ->> 'name',
        ''
      ),

      nullif(
        split_part(
          coalesce(u.email, ''),
          '@',
          1
        ),
        ''
      ),

      nullif(u.phone, ''),

      'Membre BAARO'
    ),
    80
  ),

  '@user_' ||
  substr(
    replace(u.id::text, '-', ''),
    1,
    12
  ),

  '🌍',

  '',

  nullif(
    trim(coalesce(u.phone, '')),
    ''
  ),

  now(),

  now()

FROM auth.users AS u

LEFT JOIN public.profiles AS p
  ON p.id = u.id

WHERE p.id IS NULL

ON CONFLICT (id) DO NOTHING;


-- ============================================================
-- 11. Trigger updated_at
-- ============================================================

CREATE OR REPLACE FUNCTION
  public.touch_profile_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN

  NEW.updated_at := now();

  RETURN NEW;

END;
$$;


DROP TRIGGER IF EXISTS
  profiles_touch_updated_at
ON public.profiles;




-- ============================================================
-- 12. Index téléphone
-- ============================================================

CREATE INDEX IF NOT EXISTS
  idx_profiles_phone
ON public.profiles(phone);


-- ============================================================
-- 13. Index updated_at
-- ============================================================



-- ============================================================
-- 14. Commentaire d'architecture
-- ============================================================

COMMENT ON COLUMN public.profiles.id IS
  'Identifiant unique du compte BAARO = auth.users.id';


-- ============================================================

-- ============================================================
-- FOUNDATION COMPATIBILITY: VIDEO SOCIAL CORE
-- These objects are required by the existing video counter RPCs/triggers.
-- They were referenced by the old migration but were not actually created.
-- ============================================================

create table if not exists public.video_comments (
  id uuid primary key default gen_random_uuid(),
  video_id uuid not null references public.videos(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  content text not null check (char_length(trim(content)) between 1 and 2000),
  created_at timestamptz not null default now()
);

create index if not exists idx_video_comments_video_created
  on public.video_comments(video_id, created_at);

alter table public.video_comments enable row level security;

drop policy if exists video_comments_read on public.video_comments;
create policy video_comments_read on public.video_comments
for select using (true);

drop policy if exists video_comments_insert_own on public.video_comments;
create policy video_comments_insert_own on public.video_comments
for insert to authenticated
with check (auth.uid() = author_id);

drop policy if exists video_comments_delete_own on public.video_comments;
create policy video_comments_delete_own on public.video_comments
for delete to authenticated
using (auth.uid() = author_id);

create table if not exists public.video_likes (
  video_id uuid not null references public.videos(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (video_id, user_id)
);

create index if not exists idx_video_likes_user
  on public.video_likes(user_id, created_at desc);

alter table public.video_likes enable row level security;

drop policy if exists video_likes_read on public.video_likes;
create policy video_likes_read on public.video_likes
for select using (true);

drop policy if exists video_likes_insert_own on public.video_likes;
create policy video_likes_insert_own on public.video_likes
for insert to authenticated
with check (auth.uid() = user_id);

drop policy if exists video_likes_delete_own on public.video_likes;
create policy video_likes_delete_own on public.video_likes
for delete to authenticated
using (auth.uid() = user_id);

-- One counted view per authenticated viewer per UTC day.
create table if not exists public.video_views (
  video_id uuid not null references public.videos(id) on delete cascade,
  viewer_id uuid not null references public.profiles(id) on delete cascade,
  view_date date not null default current_date,
  viewed_at timestamptz not null default now(),
  primary key (video_id, viewer_id, view_date)
);

create index if not exists idx_video_views_video_date
  on public.video_views(video_id, view_date desc);

alter table public.video_views enable row level security;

drop policy if exists video_views_owner_or_self on public.video_views;
create policy video_views_owner_or_self on public.video_views
for select to authenticated
using (
  viewer_id = auth.uid()
  or exists (
    select 1 from public.videos v
    where v.id = video_id and v.author_id = auth.uid()
  )
);

-- Inserts are performed through the server-side view-count RPC.
revoke insert, update, delete on public.video_views from anon, authenticated;


-- SOURCE: 0048_repair_comment_counters.sql
-- ============================================================
-- ============================================================
-- BAARO
-- Réparation définitive des compteurs de commentaires
-- Feed + Vidéos
--
-- Ne modifie PAS le modèle d'identité.
-- Ne modifie PAS follows / friends / notifications.
-- Migration idempotente.
-- ============================================================


-- ============================================================
-- 1. POSTS : compteur exact des commentaires
-- ============================================================

create or replace function public.baaro_sync_post_comment_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_post_id uuid;
begin
  target_post_id :=
    case
      when tg_op = 'DELETE' then old.post_id
      else new.post_id
    end;

  update public.posts p
  set comments_count = (
    select count(*)
    from public.comments c
    where c.post_id = target_post_id
  )
  where p.id = target_post_id;

  return case
    when tg_op = 'DELETE' then old
    else new
  end;
end;
$$;


drop trigger if exists trg_baaro_post_comment_count
on public.comments;




-- ============================================================
-- 2. VIDEOS : compteur exact des commentaires
-- ============================================================

create or replace function public.baaro_sync_video_comment_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
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


drop trigger if exists trg_baaro_video_comment_count
on public.video_comments;


create trigger trg_baaro_video_comment_count
after insert or delete
on public.video_comments
for each row
execute function public.baaro_sync_video_comment_count();


-- ============================================================
-- 3. RECALCUL INITIAL DES COMPTEURS POSTS
-- ============================================================

update public.posts p
set comments_count = coalesce(
  (
    select count(*)
    from public.comments c
    where c.post_id = p.id
  ),
  0
);


-- ============================================================
-- 4. RECALCUL INITIAL DES COMPTEURS VIDÉOS
-- ============================================================

update public.videos v
set comments_count = coalesce(
  (
    select count(*)
    from public.video_comments c
    where c.video_id = v.id
  ),
  0
);


-- ============================================================
-- FIN
-- ============================================================


-- ============================================================
-- SOURCE: 0049_repair_post_like_counters.sql
-- ============================================================
-- ============================================================
-- BAARO
-- Réparation définitive du compteur de likes des publications
--
-- Source de vérité :
--   public.post_likes(post_id, user_id)
--
-- Compteur :
--   public.posts.likes_count
--
-- Ne modifie PAS :
--   - identité
--   - profiles
--   - follows / friends
--   - notifications
--   - commentaires
-- ============================================================

-- ------------------------------------------------------------
-- 1. Garantir l'existence du compteur
-- ------------------------------------------------------------

alter table public.posts
add column if not exists likes_count integer not null default 0;


-- ------------------------------------------------------------
-- 2. Fonction de synchronisation
-- ------------------------------------------------------------

create or replace function public.baaro_sync_post_like_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_post_id uuid;
begin

  target_post_id :=
    case
      when tg_op = 'DELETE' then old.post_id
      else new.post_id
    end;

  update public.posts
  set likes_count = (
    select count(*)
    from public.post_likes
    where post_id = target_post_id
  )
  where id = target_post_id;

  return case
    when tg_op = 'DELETE' then old
    else new
  end;

end;
$$;


-- ------------------------------------------------------------
-- 3. Remplacer proprement l'ancien trigger éventuel
-- ------------------------------------------------------------

drop trigger if exists trg_baaro_post_like_count
on public.post_likes;


-- ------------------------------------------------------------
-- 4. Trigger INSERT / DELETE
-- ------------------------------------------------------------



-- ------------------------------------------------------------
-- 5. Recalcul initial de TOUS les compteurs
-- ------------------------------------------------------------

update public.posts p
set likes_count = (
  select count(*)
  from public.post_likes l
  where l.post_id = p.id
);


-- ------------------------------------------------------------
-- 6. Sécurité : empêcher un compteur négatif
-- ------------------------------------------------------------

update public.posts
set likes_count = 0
where likes_count < 0;


-- ============================================================
-- SOURCE: 0050_identity_profile_final_hardening.sql
-- ============================================================
-- BAARO 052 — identité/profil final hardening
-- Règle unique : auth.users.id = profiles.id
-- Cette migration est idempotente et répare aussi les comptes créés avant le
-- trigger canonique.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS last_seen_at timestamptz,
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS bio text,
  ADD COLUMN IF NOT EXISTS flag text,
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.profiles
  ALTER COLUMN id SET NOT NULL;

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_id_fkey;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_id_fkey
  FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- Toute ligne de profil doit avoir un handle déterministe avant l'index unique.
UPDATE public.profiles
SET handle = '@user_' || substr(replace(id::text, '-', ''), 1, 12)
WHERE handle IS NULL OR length(trim(handle)) = 0;

UPDATE public.profiles
SET handle = lower(trim(handle))
WHERE handle IS NOT NULL AND handle <> lower(trim(handle));

UPDATE public.profiles
SET handle = '@' || handle
WHERE handle IS NOT NULL AND left(handle, 1) <> '@';

DROP INDEX IF EXISTS public.profiles_handle_unique;
CREATE UNIQUE INDEX profiles_handle_unique
  ON public.profiles (lower(handle));

ALTER TABLE public.profiles
  ALTER COLUMN handle SET NOT NULL;

-- Trigger unique de création de profil : jamais de profiles.user_id.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE OR REPLACE FUNCTION public.touch_profile_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_touch_updated_at ON public.profiles;
CREATE TRIGGER profiles_touch_updated_at
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.touch_profile_updated_at();

-- Réparer les comptes sans profil, sans écraser les profils existants.
INSERT INTO public.profiles (id, display_name, handle, flag, bio, created_at, updated_at, phone)
SELECT
  u.id,
  left(coalesce(
    nullif(u.raw_user_meta_data ->> 'display_name', ''),
    nullif(u.raw_user_meta_data ->> 'full_name', ''),
    nullif(u.raw_user_meta_data ->> 'name', ''),
    nullif(split_part(coalesce(u.email, ''), '@', 1), ''),
    nullif(u.phone, ''),
    'Membre BAARO'
  ), 80),
  '@user_' || substr(replace(u.id::text, '-', ''), 1, 12),
  '🌍',
  '', now(), now(), nullif(u.phone, '')
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE p.id IS NULL
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_read" ON public.profiles;
CREATE POLICY "profiles_read" ON public.profiles
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "profiles_insert" ON public.profiles;
CREATE POLICY "profiles_insert" ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "profiles_update" ON public.profiles;
CREATE POLICY "profiles_update" ON public.profiles
  FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "profiles_delete" ON public.profiles;
CREATE POLICY "profiles_delete" ON public.profiles
  FOR DELETE USING (auth.uid() = id);

CREATE INDEX IF NOT EXISTS idx_profiles_updated_at
  ON public.profiles(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_profiles_last_seen_at
  ON public.profiles(last_seen_at DESC);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'user_id'
  ) THEN
    RAISE EXCEPTION 'BAARO identity violation: public.profiles.user_id still exists; profiles.id is canonical';
  END IF;
END $$;


-- ============================================================
-- SOURCE: 0051_baaro_community_final.sql
-- ============================================================
-- FIX: prerequis deplaces ici. Les policies invites_* et la fonction SQL
-- can_post_in_channel (plus bas) appellent group_role()/is_banned(), qui
-- n'etaient definies que bien plus tard => erreur "function does not exist".
-- Tout est idempotent (if not exists / create or replace).
-- ============================================================
create table if not exists public.group_bans (
  group_id uuid references public.groups(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  banned_by uuid references auth.users(id),
  reason text,
  created_at timestamptz default now(),
  primary key (group_id, user_id)
);

create or replace function public.group_role(p_group uuid)
returns text language sql stable security definer set search_path = public as $$
  select case when g.owner_id = auth.uid() then 'owner' else gm.role end
  from public.groups g
  left join public.group_members gm
    on gm.group_id = g.id and gm.user_id = auth.uid()
  where g.id = p_group;
$$;

create or replace function public.is_banned(p_group uuid, p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.group_bans
    where group_id = p_group and user_id = p_user
  );
$$;

-- ============================================================
-- ============================================================
-- BAARO COMMUNAUTE — FINAL (invites + canaux style Telegram)
-- Pre-requis: script communaute v4 deja applique
-- (group_role, is_banned, tables groups/channels/group_members)
-- ============================================================

alter table public.channels drop constraint if exists channels_type_check;

alter table public.channels
  add constraint channels_type_check
  check (type in ('text', 'voice', 'announce'));

create table if not exists public.group_invites (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  code text not null,
  created_by uuid not null references auth.users(id) on delete cascade,
  max_uses int default 0,
  uses int not null default 0,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  unique (group_id, code)
);


alter table public.group_invites enable row level security;

drop policy if exists invites_select on public.group_invites;

drop policy if exists invites_insert on public.group_invites;

drop policy if exists invites_delete on public.group_invites;

create or replace function public.can_post_in_channel(p_channel uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
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

drop policy if exists messages_insert on public.channel_messages;

create or replace function public.create_community_channel(
  p_group_id uuid,
  p_name text,
  p_type text default 'text',
  p_description text default null
)
returns public.channels
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
  v_type text;
  v_channel public.channels;
  v_role text := public.group_role(p_group_id);
begin
  if auth.uid() is null then
    raise exception 'Non authentifie';
  end if;

  if coalesce(v_role, '') not in ('owner', 'admin') then
    raise exception 'Seuls les admins peuvent creer un canal';
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
$$;

create or replace function public.create_group_invite(
  p_group uuid,
  p_max_uses int default 0,
  p_expires_hours int default null
)
returns public.group_invites
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_code text;
  v_row public.group_invites;
begin
  if v_uid is null then
    raise exception 'Non authentifie';
  end if;

  if public.group_role(p_group) not in ('owner', 'admin') then
    raise exception 'Seuls les admins peuvent creer une invitation';
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

create or replace function public.list_group_invites(p_group uuid)
returns setof public.group_invites
language plpgsql
security definer
set search_path = public
as $$
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

create or replace function public.revoke_group_invite(p_invite_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
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

create or replace function public.peek_group_invite(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
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

-- Ancienne version (v4) retournait void — DROP obligatoire avant changement de type
drop function if exists public.join_community_group(uuid, text);
drop function if exists public.join_community_group(uuid);

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  token text not null,
  platform text not null check (platform in ('web', 'ios', 'android')),
  created_at timestamptz default now(),
  unique (user_id, token)
);

alter table public.push_subscriptions enable row level security;

create policy push_sub_insert on public.push_subscriptions
  for insert to authenticated with check (user_id = auth.uid());

create policy push_sub_delete on public.push_subscriptions
  for delete to authenticated using (user_id = auth.uid());


-- ============================================================
-- SOURCE: 0052_baaro_fix_comments_likes.sql
-- ============================================================
-- ============================================================
-- BAARO — Reparation commentaires + likes + compteurs
-- Idempotent. A executer dans Supabase > SQL Editor.
-- ============================================================

-- 1. Colonnes compteurs sur posts
alter table public.posts
  add column if not exists comments_count integer not null default 0;
alter table public.posts
  add column if not exists likes_count integer not null default 0;

-- 2. Table comments

create index if not exists comments_post_id_idx
  on public.comments (post_id, created_at desc);

alter table public.comments enable row level security;

drop policy if exists "comments_read" on public.comments;
drop policy if exists "comments_insert" on public.comments;
drop policy if exists "comments_own_delete" on public.comments;
drop policy if exists "comments_own_update" on public.comments;
drop policy if exists comments_read on public.comments;
drop policy if exists comments_insert on public.comments;
drop policy if exists comments_own_delete on public.comments;
drop policy if exists comments_own_update on public.comments;

create policy comments_read on public.comments
  for select using (true);

create policy comments_insert on public.comments
  for insert to authenticated
  with check (auth.uid() = author_id);

create policy comments_own_delete on public.comments
  for delete to authenticated
  using (auth.uid() = author_id);

create policy comments_own_update on public.comments
  for update to authenticated
  using (auth.uid() = author_id)
  with check (auth.uid() = author_id);

-- 3. Table post_likes

create index if not exists post_likes_user_idx
  on public.post_likes (user_id);

alter table public.post_likes enable row level security;

drop policy if exists post_likes_read on public.post_likes;
drop policy if exists post_likes_insert on public.post_likes;
drop policy if exists post_likes_delete on public.post_likes;
drop policy if exists "post_likes_read" on public.post_likes;
drop policy if exists "post_likes_own" on public.post_likes;

create policy post_likes_read on public.post_likes
  for select using (true);

create policy post_likes_insert on public.post_likes
  for insert to authenticated
  with check (auth.uid() = user_id);

create policy post_likes_delete on public.post_likes
  for delete to authenticated
  using (auth.uid() = user_id);

-- 4. Trigger compteur commentaires
create or replace function public.baaro_sync_post_comment_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
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

drop trigger if exists trg_baaro_post_comment_count on public.comments;
create trigger trg_baaro_post_comment_count
  after insert or delete on public.comments
  for each row execute function public.baaro_sync_post_comment_count();

-- 5. Trigger compteur likes
create or replace function public.baaro_sync_post_like_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
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

drop trigger if exists trg_baaro_post_like_count on public.post_likes;
create trigger trg_baaro_post_like_count
  after insert or delete on public.post_likes
  for each row execute function public.baaro_sync_post_like_count();

-- 6. Recalcul global des compteurs
update public.posts p
set comments_count = coalesce((
  select count(*)::int from public.comments c where c.post_id = p.id
), 0);

update public.posts p
set likes_count = coalesce((
  select count(*)::int from public.post_likes l where l.post_id = p.id
), 0);

update public.posts set comments_count = 0 where comments_count < 0;
update public.posts set likes_count = 0 where likes_count < 0;

-- 7. Realtime (ignore si deja present)
do $$
begin
  begin
    alter publication supabase_realtime add table public.comments;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.post_likes;
  exception when duplicate_object then null;
  end;
end $$;


-- ============================================================
-- SOURCE: 0053_baaro_shop_global.sql
-- ============================================================
-- ============================================

-- ============================================================
-- END BAARO-FND-001
-- ============================================================
