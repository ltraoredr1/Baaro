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

CREATE UNIQUE INDEX IF NOT EXISTS
  profiles_handle_unique
ON public.profiles (lower(handle));


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


CREATE TRIGGER
  on_auth_user_created

AFTER INSERT ON auth.users

FOR EACH ROW

EXECUTE FUNCTION
  public.handle_new_user();


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


CREATE TRIGGER
  profiles_touch_updated_at

BEFORE UPDATE ON public.profiles

FOR EACH ROW

EXECUTE FUNCTION
  public.touch_profile_updated_at();


-- ============================================================
-- 12. Index téléphone
-- ============================================================

CREATE INDEX IF NOT EXISTS
  idx_profiles_phone
ON public.profiles(phone);


-- ============================================================
-- 13. Index updated_at
-- ============================================================

CREATE INDEX IF NOT EXISTS
  idx_profiles_updated_at
ON public.profiles(updated_at DESC);


-- ============================================================
-- 14. Commentaire d'architecture
-- ============================================================

COMMENT ON COLUMN public.profiles.id IS
  'Identifiant unique du compte BAARO = auth.users.id';
