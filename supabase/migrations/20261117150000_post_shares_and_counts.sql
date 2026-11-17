BEGIN;

CREATE TABLE IF NOT EXISTS public.post_shares (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id uuid NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    channel text NOT NULL DEFAULT 'copy',
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT post_shares_channel_check
        CHECK (channel IN ('copy', 'native'))
);

CREATE INDEX IF NOT EXISTS idx_post_shares_post_id
    ON public.post_shares(post_id);

CREATE INDEX IF NOT EXISTS idx_post_shares_user_id
    ON public.post_shares(user_id);

ALTER TABLE public.post_shares ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS post_shares_select_own ON public.post_shares;
CREATE POLICY post_shares_select_own
    ON public.post_shares
    FOR SELECT TO authenticated
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS post_shares_insert_own ON public.post_shares;
CREATE POLICY post_shares_insert_own
    ON public.post_shares
    FOR INSERT TO authenticated
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS post_shares_delete_own ON public.post_shares;
CREATE POLICY post_shares_delete_own
    ON public.post_shares
    FOR DELETE TO authenticated
    USING (auth.uid() = user_id);

REVOKE ALL ON TABLE public.post_shares FROM PUBLIC, anon;
GRANT SELECT, INSERT, DELETE ON TABLE public.post_shares TO authenticated;
GRANT ALL ON TABLE public.post_shares TO service_role;

CREATE OR REPLACE FUNCTION public.get_post_share_counts(p_post_ids uuid[])
RETURNS TABLE(post_id uuid, share_count bigint)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
BEGIN
    IF p_post_ids IS NULL OR cardinality(p_post_ids) = 0 THEN
        RETURN;
    END IF;

    IF cardinality(p_post_ids) > 100 THEN
        RAISE EXCEPTION 'TOO_MANY_POST_IDS'
            USING ERRCODE = '22023';
    END IF;

    RETURN QUERY
    SELECT s.post_id, count(*)::bigint
    FROM public.post_shares AS s
    INNER JOIN public.posts AS p ON p.id = s.post_id
    WHERE s.post_id = ANY (p_post_ids)
      AND NOT COALESCE(public.is_blocked(auth.uid(), p.author_id), false)
    GROUP BY s.post_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_post_share_counts(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_post_share_counts(uuid[])
    TO anon, authenticated, service_role;

COMMIT;
