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
