-- BAARO — recherche globale sécurisée et indépendante de pg_trgm.
-- SECURITY DEFINER impose de filtrer explicitement les profils privés et blocages.

BEGIN;

CREATE OR REPLACE FUNCTION public.global_discovery_search(
  p_query text,
  p_limit integer DEFAULT 8
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $baaro_search$
DECLARE
  q text := left(
    regexp_replace(lower(btrim(coalesce(p_query, ''))), '\s+', ' ', 'g'),
    100
  );
  lim integer := least(greatest(coalesce(p_limit, 8), 1), 20);
  current_uid uuid := auth.uid();
BEGIN
  IF char_length(q) < 2 THEN
    RETURN jsonb_build_object(
      'users', '[]'::jsonb,
      'groups', '[]'::jsonb,
      'debates', '[]'::jsonb,
      'posts', '[]'::jsonb,
      'hashtags', '[]'::jsonb
    );
  END IF;

  RETURN jsonb_build_object(
    'users', coalesce((
      SELECT jsonb_agg(to_jsonb(x) ORDER BY x.score DESC, x.display_name)
      FROM (
        SELECT p.id, p.display_name, p.handle, p.avatar_url, p.flag, p.is_verified,
          CASE
            WHEN lower(coalesce(p.display_name, '')) = q
              OR lower(coalesce(p.handle, '')) = q THEN 3
            WHEN strpos(lower(coalesce(p.display_name, '')), q) = 1
              OR strpos(lower(coalesce(p.handle, '')), q) = 1 THEN 2
            ELSE 1
          END AS score
        FROM public.profiles AS p
        WHERE p.restricted IS FALSE
          AND (
            strpos(lower(coalesce(p.display_name, '')), q) > 0
            OR strpos(lower(coalesce(p.handle, '')), q) > 0
          )
          AND (
            p.is_private IS NOT TRUE
            OR p.id = current_uid
            OR EXISTS (
              SELECT 1 FROM public.follows AS f
              WHERE f.follower_id = current_uid
                AND f.followed_id = p.id
                AND f.status = 'accepted'
            )
          )
          AND NOT EXISTS (
            SELECT 1 FROM public.user_blocks AS b
            WHERE current_uid IS NOT NULL
              AND (
                (b.blocker_id = current_uid AND b.blocked_id = p.id)
                OR (b.blocker_id = p.id AND b.blocked_id = current_uid)
              )
          )
        ORDER BY score DESC, p.display_name
        LIMIT lim
      ) AS x
    ), '[]'::jsonb),

    'groups', coalesce((
      SELECT jsonb_agg(to_jsonb(x) ORDER BY x.created_at DESC)
      FROM (
        SELECT id, name, description, avatar_url, category, created_at
        FROM public.groups
        WHERE is_public IS TRUE
          AND (
            strpos(lower(coalesce(name, '')), q) > 0
            OR strpos(lower(coalesce(description, '')), q) > 0
          )
        ORDER BY created_at DESC
        LIMIT lim
      ) AS x
    ), '[]'::jsonb),

    'debates', coalesce((
      SELECT jsonb_agg(to_jsonb(x) ORDER BY x.created_at DESC)
      FROM (
        SELECT id, title, topic, status, created_at
        FROM public.debate_rooms
        WHERE status = 'active'
          AND (
            strpos(lower(coalesce(title, '')), q) > 0
            OR strpos(lower(coalesce(topic, '')), q) > 0
          )
        ORDER BY created_at DESC
        LIMIT lim
      ) AS x
    ), '[]'::jsonb),

    'posts', coalesce((
      SELECT jsonb_agg(to_jsonb(x) ORDER BY x.created_at DESC)
      FROM (
        SELECT po.id, po.author_id, po.text, po.media_url, po.created_at
        FROM public.posts AS po
        INNER JOIN public.profiles AS author ON author.id = po.author_id
        WHERE strpos(lower(coalesce(po.text, '')), q) > 0
          AND author.restricted IS FALSE
          AND (
            author.is_private IS NOT TRUE
            OR author.id = current_uid
            OR EXISTS (
              SELECT 1 FROM public.follows AS f
              WHERE f.follower_id = current_uid
                AND f.followed_id = author.id
                AND f.status = 'accepted'
            )
          )
          AND NOT EXISTS (
            SELECT 1 FROM public.user_blocks AS b
            WHERE current_uid IS NOT NULL
              AND (
                (b.blocker_id = current_uid AND b.blocked_id = author.id)
                OR (b.blocker_id = author.id AND b.blocked_id = current_uid)
              )
          )
        ORDER BY po.created_at DESC
        LIMIT lim
      ) AS x
    ), '[]'::jsonb),

    'hashtags', coalesce((
      SELECT jsonb_agg(to_jsonb(x) ORDER BY x.count DESC, x.tag)
      FROM (
        SELECT vh.tag, count(*)::integer AS count
        FROM public.video_hashtags AS vh
        INNER JOIN public.videos AS v ON v.id = vh.video_id
        INNER JOIN public.profiles AS author ON author.id = v.author_id
        WHERE strpos(lower(coalesce(vh.tag, '')), q) = 1
          AND author.restricted IS FALSE
          AND (
            author.is_private IS NOT TRUE
            OR author.id = current_uid
            OR EXISTS (
              SELECT 1 FROM public.follows AS f
              WHERE f.follower_id = current_uid
                AND f.followed_id = author.id
                AND f.status = 'accepted'
            )
          )
          AND NOT EXISTS (
            SELECT 1 FROM public.user_blocks AS b
            WHERE current_uid IS NOT NULL
              AND (
                (b.blocker_id = current_uid AND b.blocked_id = author.id)
                OR (b.blocker_id = author.id AND b.blocked_id = current_uid)
              )
          )
        GROUP BY vh.tag
        ORDER BY count DESC, vh.tag
        LIMIT 6
      ) AS x
    ), '[]'::jsonb)
  );
END;
$baaro_search$;

REVOKE ALL ON FUNCTION public.global_discovery_search(text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.global_discovery_search(text, integer)
  TO anon, authenticated, service_role;

COMMIT;
