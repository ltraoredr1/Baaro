-- ============================================================
-- BAARO 043 — SCHEMA FINAL DES NOTIFICATIONS
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. Table notifications
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.notifications (
  notification_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  actor_id UUID NULL,
  type TEXT NULL DEFAULT 'general',
  message TEXT NOT NULL DEFAULT '',
  source_id UUID NULL,
  read BOOLEAN NOT NULL DEFAULT false,
  read_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- 2. Normalisation des anciennes colonnes
-- ------------------------------------------------------------

DO $$
BEGIN
  -- Ancien schéma : id = identifiant notification
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'notifications'
      AND column_name = 'id'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'notifications'
      AND column_name = 'notification_id'
  ) THEN
    ALTER TABLE public.notifications
      RENAME COLUMN id TO notification_id;
  END IF;
END $$;

-- Ajouter les colonnes finales si elles manquent.

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS notification_id UUID;

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS user_id UUID;

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS actor_id UUID;

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS type TEXT;

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS message TEXT;

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS source_id UUID;

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS read BOOLEAN;

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ;

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ;

-- ------------------------------------------------------------
-- 3. Valeurs par défaut
-- ------------------------------------------------------------

ALTER TABLE public.notifications
  ALTER COLUMN notification_id SET DEFAULT gen_random_uuid();

ALTER TABLE public.notifications
  ALTER COLUMN type SET DEFAULT 'general';

ALTER TABLE public.notifications
  ALTER COLUMN message SET DEFAULT '';

ALTER TABLE public.notifications
  ALTER COLUMN read SET DEFAULT false;

ALTER TABLE public.notifications
  ALTER COLUMN created_at SET DEFAULT now();

-- ------------------------------------------------------------
-- 4. Nettoyage des anciennes valeurs NULL
-- ------------------------------------------------------------

UPDATE public.notifications
SET notification_id = gen_random_uuid()
WHERE notification_id IS NULL;

UPDATE public.notifications
SET type = 'general'
WHERE type IS NULL;

UPDATE public.notifications
SET message = ''
WHERE message IS NULL;

UPDATE public.notifications
SET read = false
WHERE read IS NULL;

UPDATE public.notifications
SET created_at = now()
WHERE created_at IS NULL;

-- ------------------------------------------------------------
-- 5. Contraintes
-- ------------------------------------------------------------

ALTER TABLE public.notifications
  ALTER COLUMN notification_id SET NOT NULL;

ALTER TABLE public.notifications
  ALTER COLUMN user_id SET NOT NULL;

ALTER TABLE public.notifications
  ALTER COLUMN message SET NOT NULL;

ALTER TABLE public.notifications
  ALTER COLUMN read SET NOT NULL;

ALTER TABLE public.notifications
  ALTER COLUMN created_at SET NOT NULL;

-- Supprimer les anciennes contraintes FK.

ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS notifications_user_id_fkey;

ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS notifications_actor_id_fkey;

-- Recréer les FK.

ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_user_id_fkey
  FOREIGN KEY (user_id)
  REFERENCES public.profiles(id)
  ON DELETE CASCADE;

ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_actor_id_fkey
  FOREIGN KEY (actor_id)
  REFERENCES public.profiles(id)
  ON DELETE SET NULL;

-- ------------------------------------------------------------
-- 6. Clé primaire notification_id
-- ------------------------------------------------------------

DO $$
DECLARE
  pk_name TEXT;
BEGIN
  SELECT conname
  INTO pk_name
  FROM pg_constraint
  WHERE conrelid = 'public.notifications'::regclass
    AND contype = 'p'
  LIMIT 1;

  IF pk_name IS NOT NULL
     AND pk_name <> 'notifications_pkey' THEN

    EXECUTE format(
      'ALTER TABLE public.notifications DROP CONSTRAINT %I',
      pk_name
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.notifications'::regclass
      AND contype = 'p'
  ) THEN
    ALTER TABLE public.notifications
      ADD CONSTRAINT notifications_pkey
      PRIMARY KEY (notification_id);
  END IF;
END $$;

-- ------------------------------------------------------------
-- 7. Index
-- ------------------------------------------------------------

CREATE INDEX IF NOT EXISTS
  idx_notifications_user_created
ON public.notifications(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS
  idx_notifications_user_read
ON public.notifications(user_id, read);

CREATE INDEX IF NOT EXISTS
  idx_notifications_actor
ON public.notifications(actor_id);

-- ------------------------------------------------------------
-- 8. RLS
-- ------------------------------------------------------------

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notifications_read"
  ON public.notifications;

DROP POLICY IF EXISTS "notifications_insert"
  ON public.notifications;

DROP POLICY IF EXISTS "notifications_select_own"
  ON public.notifications;

DROP POLICY IF EXISTS "notifications_update_own"
  ON public.notifications;

DROP POLICY IF EXISTS "notifications_delete_own"
  ON public.notifications;

DROP POLICY IF EXISTS "notif_own"
  ON public.notifications;

CREATE POLICY "notifications_select_own"
ON public.notifications
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "notifications_update_own"
ON public.notifications
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "notifications_delete_own"
ON public.notifications
FOR DELETE
USING (auth.uid() = user_id);

-- ------------------------------------------------------------
-- 9. Compteur notifications non lues
-- ------------------------------------------------------------

DROP VIEW IF EXISTS public.notification_unread_counts;

CREATE VIEW public.notification_unread_counts AS
SELECT
  user_id,
  COUNT(*)::BIGINT AS unread_count
FROM public.notifications
WHERE read = false
GROUP BY user_id;

-- ------------------------------------------------------------
-- 10. Notification automatique lors d'un follow
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_follow_notification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN

  IF TG_OP = 'INSERT' THEN

    INSERT INTO public.notifications (
      user_id,
      actor_id,
      type,
      message,
      source_id
    )
    VALUES (
      NEW.followed_id,
      NEW.follower_id,
      'follow',
      'a commencé à vous suivre',
      NEW.follower_id
    );

  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_follow_created
ON public.follows;

CREATE TRIGGER on_follow_created
AFTER INSERT ON public.follows
FOR EACH ROW
EXECUTE FUNCTION public.create_follow_notification();

-- ------------------------------------------------------------
-- 11. Realtime
-- ------------------------------------------------------------

ALTER TABLE public.notifications
REPLICA IDENTITY FULL;

DO $$
BEGIN

  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'notifications'
  ) THEN

    ALTER PUBLICATION supabase_realtime
      ADD TABLE public.notifications;

  END IF;

END $$;

COMMIT;
