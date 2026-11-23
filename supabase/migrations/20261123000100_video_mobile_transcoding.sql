-- Version mobile des vidéos : l'original reste intact.
ALTER TABLE public.videos
ADD COLUMN IF NOT EXISTS video_mobile_url text;

-- Crée automatiquement une tâche uniquement pour les vidéos BAARO
-- stockées dans le dossier R2 videos/<author_id>/.
CREATE OR REPLACE FUNCTION public.enqueue_video_mobile_transcode()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_url text;
  v_key text;
  v_prefix text;
BEGIN
  v_url := split_part(split_part(COALESCE(NEW.video_url, ''), '?', 1), '#', 1);
  v_key := regexp_replace(v_url, '^https?://[^/]+/', '', 'i');
  v_key := regexp_replace(v_key, '^/+', '');
  v_prefix := 'videos/' || NEW.author_id::text || '/';

  IF left(v_key, length(v_prefix)) = v_prefix
     AND position('..' in v_key) = 0
     AND lower(v_key) ~ '\.(mp4|m4v|mov|webm|mkv|avi|3gp)$'
     AND NOT EXISTS (
       SELECT 1 FROM public.media_jobs
       WHERE video_id = NEW.id
         AND job_type = 'transcode'
     )
  THEN
    INSERT INTO public.media_jobs (
      owner_id,
      video_id,
      job_type,
      status,
      priority,
      payload
    )
    VALUES (
      NEW.author_id,
      NEW.id,
      'transcode',
      'queued',
      65,
      jsonb_build_object(
        'sourceKey', v_key,
        'profile', 'mobile'
      )
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS videos_enqueue_mobile_transcode ON public.videos;

CREATE TRIGGER videos_enqueue_mobile_transcode
AFTER INSERT ON public.videos
FOR EACH ROW
EXECUTE FUNCTION public.enqueue_video_mobile_transcode();

CREATE INDEX IF NOT EXISTS idx_media_jobs_transcode_queue
ON public.media_jobs (priority DESC, available_at, created_at)
WHERE job_type = 'transcode'
  AND status IN ('queued', 'processing');

-- File dédiée : ne consomme pas les autres types de tâches BAARO.
CREATE OR REPLACE FUNCTION public.claim_video_transcode_jobs(
  p_limit integer DEFAULT 1,
  p_worker text DEFAULT 'cloud-run-job'
)
RETURNS SETOF public.media_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Termine les tâches dont le verrou a expiré et qui ont épuisé leurs essais.
  UPDATE public.media_jobs
  SET status = 'dead',
      error = COALESCE(error, 'Verrou expiré : nombre maximal de tentatives atteint'),
      locked_at = NULL,
      locked_by = NULL,
      updated_at = now()
  WHERE job_type = 'transcode'
    AND status = 'processing'
    AND (locked_at IS NULL OR locked_at < now() - interval '3 hours')
    AND attempts >= max_attempts;

  RETURN QUERY
  WITH claimed AS (
    UPDATE public.media_jobs
    SET status = 'processing',
        locked_at = now(),
        locked_by = left(COALESCE(NULLIF(p_worker, ''), 'cloud-run-job'), 120),
        attempts = COALESCE(attempts, 0) + 1,
        updated_at = now()
    WHERE id IN (
      SELECT id
      FROM public.media_jobs
      WHERE job_type = 'transcode'
        AND (
          (status = 'queued' AND available_at <= now())
          OR (
            status = 'processing'
            AND (locked_at IS NULL OR locked_at < now() - interval '3 hours')
            AND attempts < max_attempts
          )
        )
      ORDER BY priority DESC, created_at ASC
      LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 1), 3))
      FOR UPDATE SKIP LOCKED
    )
    RETURNING *
  )
  SELECT * FROM claimed;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_video_transcode_jobs(integer, text)
FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.claim_video_transcode_jobs(integer, text)
TO service_role;
