-- Sondages vidéo : fonctions serveur sécurisées, tables déjà présentes dans le baseline.
CREATE OR REPLACE FUNCTION public.create_video_poll(
  p_video_id uuid, p_question text, p_options text[],
  p_duration_seconds integer DEFAULT NULL, p_allow_multiple boolean DEFAULT false
) RETURNS public.video_polls
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
DECLARE uid uuid := auth.uid(); created public.video_polls; clean text[];
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.videos WHERE id=p_video_id AND author_id=uid)
    THEN RAISE EXCEPTION 'VIDEO_OWNER_REQUIRED'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_video_id::text, 0));
  IF length(btrim(coalesce(p_question,''))) NOT BETWEEN 1 AND 240
    THEN RAISE EXCEPTION 'INVALID_POLL_QUESTION'; END IF;
  IF p_options IS NULL OR cardinality(p_options) NOT BETWEEN 2 AND 4
    THEN RAISE EXCEPTION 'INVALID_POLL_OPTIONS'; END IF;
  SELECT array_agg(btrim(v) ORDER BY n) INTO clean
  FROM unnest(p_options) WITH ORDINALITY AS t(v,n)
  WHERE length(btrim(v)) BETWEEN 1 AND 80;
  IF clean IS NULL OR cardinality(clean)<>cardinality(p_options)
     OR (SELECT count(DISTINCT lower(option_value)) FROM unnest(clean) AS t(option_value))<>cardinality(clean)
    THEN RAISE EXCEPTION 'INVALID_POLL_OPTIONS'; END IF;
  IF p_duration_seconds IS NOT NULL AND p_duration_seconds NOT BETWEEN 5 AND 604800
    THEN RAISE EXCEPTION 'INVALID_POLL_DURATION'; END IF;
  IF EXISTS(SELECT 1 FROM public.video_polls WHERE video_id=p_video_id)
    THEN RAISE EXCEPTION 'POLL_ALREADY_EXISTS'; END IF;
  INSERT INTO public.video_polls(video_id,question,options,duration_seconds,allow_multiple)
  VALUES(p_video_id,btrim(p_question),to_jsonb(clean),p_duration_seconds,coalesce(p_allow_multiple,false))
  RETURNING * INTO created;
  RETURN created;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_video_poll_results(p_poll_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE uid uuid:=auth.uid(); p public.video_polls; owner_id uuid; has_voted boolean; rows jsonb; total bigint;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  SELECT * INTO p FROM public.video_polls WHERE id=p_poll_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'POLL_NOT_FOUND'; END IF;
  SELECT author_id INTO owner_id FROM public.videos WHERE id=p.video_id;
  SELECT EXISTS(SELECT 1 FROM public.video_poll_votes WHERE poll_id=p_poll_id AND user_id=uid) INTO has_voted;
  IF owner_id<>uid AND NOT has_voted THEN RAISE EXCEPTION 'VOTE_REQUIRED'; END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('option_key',q.option_key,'votes',q.votes) ORDER BY q.position),'[]'::jsonb),
         coalesce(sum(q.votes),0)
  INTO rows,total
  FROM (
    SELECT c.option_key,c.position,count(v.option_key)::bigint votes
    FROM jsonb_array_elements_text(p.options) WITH ORDINALITY c(option_key,position)
    LEFT JOIN public.video_poll_votes v ON v.poll_id=p_poll_id AND v.option_key=c.option_key
    GROUP BY c.option_key,c.position
  ) q;
  RETURN jsonb_build_object('results',rows,'total_votes',total);
END;
$$;

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
  SELECT array_agg(DISTINCT btrim(value)) INTO chosen
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

REVOKE ALL ON FUNCTION public.create_video_poll(uuid,text,text[],integer,boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_video_poll_results(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.vote_video_poll(uuid,text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_video_poll(uuid,text,text[],integer,boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_video_poll_results(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.vote_video_poll(uuid,text[]) TO authenticated;
