-- Compteurs globaux de partages et d'enregistrements par vidéo.
-- Les triggers sont SECURITY DEFINER : la RLS bloque le comptage côté client.

ALTER TABLE public.videos
  ADD COLUMN IF NOT EXISTS saves_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS shares_count integer NOT NULL DEFAULT 0;

-- video_shares : même type de video_id que videos.id (uuid ou bigint)
DO $$
DECLARE vtype text;
BEGIN
  SELECT format_type(a.atttypid, a.atttypmod) INTO vtype
  FROM pg_attribute a
  WHERE a.attrelid = 'public.videos'::regclass
    AND a.attname = 'id' AND NOT a.attisdropped;

  EXECUTE format($f$
    CREATE TABLE IF NOT EXISTS public.video_shares (
      user_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
      video_id   %s   NOT NULL REFERENCES public.videos(id) ON DELETE CASCADE,
      created_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (user_id, video_id)
    )$f$, vtype);
END $$;

CREATE INDEX IF NOT EXISTS idx_video_shares_video ON public.video_shares (video_id);

ALTER TABLE public.video_shares ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS video_shares_insert_own ON public.video_shares;
CREATE POLICY video_shares_insert_own ON public.video_shares
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS video_shares_select_own ON public.video_shares;
CREATE POLICY video_shares_select_own ON public.video_shares
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

REVOKE ALL ON public.video_shares FROM anon;
GRANT SELECT, INSERT ON public.video_shares TO authenticated;

-- Triggers de comptage
CREATE OR REPLACE FUNCTION public.bump_video_counter()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE delta integer;
BEGIN
  delta := CASE TG_OP WHEN 'INSERT' THEN 1 ELSE -1 END;
  IF TG_TABLE_NAME = 'video_bookmarks' THEN
    UPDATE public.videos
       SET saves_count = GREATEST(0, saves_count + delta)
     WHERE id = COALESCE(NEW.video_id, OLD.video_id);
  ELSE
    UPDATE public.videos
       SET shares_count = GREATEST(0, shares_count + delta)
     WHERE id = COALESCE(NEW.video_id, OLD.video_id);
  END IF;
  RETURN NULL;
END $$;

REVOKE ALL ON FUNCTION public.bump_video_counter() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_video_bookmarks_count ON public.video_bookmarks;
CREATE TRIGGER trg_video_bookmarks_count
  AFTER INSERT OR DELETE ON public.video_bookmarks
  FOR EACH ROW EXECUTE FUNCTION public.bump_video_counter();

DROP TRIGGER IF EXISTS trg_video_shares_count ON public.video_shares;
CREATE TRIGGER trg_video_shares_count
  AFTER INSERT OR DELETE ON public.video_shares
  FOR EACH ROW EXECUTE FUNCTION public.bump_video_counter();

-- Rattrapage des enregistrements existants
UPDATE public.videos v
   SET saves_count = s.n
  FROM (SELECT video_id, count(*)::int AS n FROM public.video_bookmarks GROUP BY video_id) s
 WHERE v.id = s.video_id;
