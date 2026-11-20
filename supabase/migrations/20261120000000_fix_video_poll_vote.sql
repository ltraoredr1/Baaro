-- Corrige le nom de colonne utilisé lors de l'enregistrement des votes.
-- Remplace la RPC existante : aucune nouvelle table ni fonction parallèle.
CREATE OR REPLACE FUNCTION public.vote_video_poll(p_poll_id uuid,p_option_keys text[])
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE uid uuid:=auth.uid(); p public.video_polls; valid text[]; chosen text[];
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  SELECT * INTO p FROM public.video_polls WHERE id=p_poll_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'POLL_NOT_FOUND'; END IF;
  IF p.duration_seconds IS NOT NULL AND now()>p.created_at+make_interval(secs=>p.duration_seconds)
    THEN RAISE EXCEPTION 'POLL_CLOSED'; END IF;
  SELECT array_agg(option_value) INTO valid FROM jsonb_array_elements_text(p.options) AS t(option_value);
  SELECT array_agg(DISTINCT btrim(option_value)) INTO chosen
  FROM unnest(coalesce(p_option_keys,ARRAY[]::text[])) AS t(option_value) WHERE btrim(option_value)<>'';
  IF chosen IS NULL OR cardinality(chosen)<1 OR cardinality(chosen)>4
     OR EXISTS(SELECT 1 FROM unnest(chosen) AS t(option_value) WHERE NOT(option_value=ANY(valid)))
    THEN RAISE EXCEPTION 'INVALID_POLL_CHOICE'; END IF;
  IF NOT p.allow_multiple AND cardinality(chosen)<>1 THEN RAISE EXCEPTION 'ONE_CHOICE_ONLY'; END IF;
  IF NOT p.allow_multiple THEN DELETE FROM public.video_poll_votes WHERE poll_id=p_poll_id AND user_id=uid; END IF;
  INSERT INTO public.video_poll_votes(poll_id,user_id,option_key)
  SELECT p_poll_id,uid,option_value FROM unnest(chosen) AS t(option_value)
  ON CONFLICT(poll_id,user_id,option_key) DO NOTHING;
  RETURN public.get_video_poll_results(p_poll_id);
END;
$$;

REVOKE ALL ON FUNCTION public.vote_video_poll(uuid,text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.vote_video_poll(uuid,text[]) TO authenticated;
