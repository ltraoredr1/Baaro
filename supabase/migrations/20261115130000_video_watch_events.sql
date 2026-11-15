-- Temps de visionnage par utilisateur et par vidéo (meilleur ratio conservé)
-- + moyenne globale par vidéo (somme et nombre de spectateurs).

ALTER TABLE public.videos
  ADD COLUMN IF NOT EXISTS watch_ratio_sum real NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS watch_ratio_count integer NOT NULL DEFAULT 0;

DO $$
DECLARE vtype text;
BEGIN
  SELECT format_type(a.atttypid, a.atttypmod) INTO vtype
  FROM pg_attribute a
  WHERE a.attrelid = 'public.videos'::regclass
    AND a.attname = 'id' AND NOT a.attisdropped;

  EXECUTE format($t$
    CREATE TABLE IF NOT EXISTS public.video_watch_events (
      user_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
      video_id   %s   NOT NULL REFERENCES public.videos(id) ON DELETE CASCADE,
      ratio      real NOT NULL CHECK (ratio >= 0 AND ratio <= 1),
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (user_id, video_id)
    )$t$, vtype);

  EXECUTE format($f$
    CREATE OR REPLACE FUNCTION public.record_video_watch(p_video_id %s, p_ratio real)
    RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $body$
    DECLARE
      uid uuid := auth.uid();
      r   real := LEAST(1, GREATEST(0, COALESCE(p_ratio, 0)));
      old real;
    BEGIN
      IF uid IS NULL OR r < 0.03 THEN RETURN; END IF;

      SELECT ratio INTO old FROM public.video_watch_events
       WHERE user_id = uid AND video_id = p_video_id;

      IF NOT FOUND THEN
        INSERT INTO public.video_watch_events (user_id, video_id, ratio)
        VALUES (uid, p_video_id, r);
        UPDATE public.videos
           SET watch_ratio_sum = watch_ratio_sum + r,
               watch_ratio_count = watch_ratio_count + 1
         WHERE id = p_video_id;
      ELSIF r > old THEN
        UPDATE public.video_watch_events
           SET ratio = r, updated_at = now()
         WHERE user_id = uid AND video_id = p_video_id;
        UPDATE public.videos
           SET watch_ratio_sum = watch_ratio_sum + (r - old)
         WHERE id = p_video_id;
      END IF;
    END
    $body$$f$, vtype);

  EXECUTE format('REVOKE ALL ON FUNCTION public.record_video_watch(%s, real) FROM PUBLIC, anon', vtype);
  EXECUTE format('GRANT EXECUTE ON FUNCTION public.record_video_watch(%s, real) TO authenticated', vtype);
END $$;

CREATE INDEX IF NOT EXISTS idx_video_watch_user_updated
  ON public.video_watch_events (user_id, updated_at DESC);

ALTER TABLE public.video_watch_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS video_watch_select_own ON public.video_watch_events;
CREATE POLICY video_watch_select_own ON public.video_watch_events
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- Aucune écriture directe : tout passe par record_video_watch
REVOKE ALL ON public.video_watch_events FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.video_watch_events FROM authenticated;
GRANT SELECT ON public.video_watch_events TO authenticated;
