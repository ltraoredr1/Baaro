-- BAARO 2.0 — Compatibility for legacy follows.following_id
-- Safe to run on installations created by older BAARO migrations.

DO $$
DECLARE
  has_followed boolean;
  has_following boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='follows' AND column_name='followed_id'
  ) INTO has_followed;
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='follows' AND column_name='following_id'
  ) INTO has_following;

  IF has_following AND NOT has_followed THEN
    ALTER TABLE public.follows RENAME COLUMN following_id TO followed_id;
  ELSIF has_following AND has_followed THEN
    -- Transitional installations that somehow contain both columns.
    UPDATE public.follows
       SET followed_id = COALESCE(followed_id, following_id)
     WHERE followed_id IS NULL;
    ALTER TABLE public.follows DROP COLUMN following_id;
  END IF;
END $$;

ALTER TABLE public.follows
  ALTER COLUMN followed_id SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_follows_follower_followed
  ON public.follows(follower_id, followed_id);

CREATE INDEX IF NOT EXISTS idx_follows_followed_status
  ON public.follows(followed_id, status);

CREATE INDEX IF NOT EXISTS idx_follows_followed_status_friend
  ON public.follows(followed_id, status, is_friend);
