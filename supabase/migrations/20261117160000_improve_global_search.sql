-- Amélioration de la recherche globale BAARO
-- Ranking + is_verified + hashtags + filtrage basique des blocs

CREATE OR REPLACE FUNCTION public.global_discovery_search(
  p_query text,
  p_limit integer DEFAULT 8
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS \[ DECLARE
  q text := lower(trim(coalesce(p_query, '')));
  lim int := least(greatest(coalesce(p_limit, 8), 1), 20);
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
      SELECT jsonb_agg(to_jsonb(x) ORDER BY x.score DESC)
      FROM (
        SELECT
          p.id,
          p.display_name,
          p.handle,
          p.avatar_url,
          p.flag,
          p.is_verified,
          greatest(
            similarity(lower(p.display_name), q),
            similarity(lower(p.handle), q)
          ) AS score
        FROM profiles p
        WHERE p.restricted = false
          AND (
            p.display_name ILIKE '%' || q || '%'
            OR p.handle ILIKE '%' || q || '%'
            OR p.display_name % q
            OR p.handle % q
          )
          AND (
            current_uid IS NULL
            OR NOT EXISTS (
              SELECT 1 FROM blocks b
              WHERE (b.blocker_id = current_uid AND b.blocked_id = p.id)
                 OR (b.blocker_id = p.id AND b.blocked_id = current_uid)
            )
          )
        ORDER BY score DESC, p.display_name
        LIMIT lim
      ) x
    ), '[]'::jsonb),

    'groups', coalesce((
      SELECT jsonb_agg(to_jsonb(x))
      FROM (
        SELECT id, name, description, avatar_url, category
        FROM groups
        WHERE is_public = true
          AND (name ILIKE '%' || q || '%' OR description ILIKE '%' || q || '%')
        ORDER BY created_at DESC
        LIMIT lim
      ) x
    ), '[]'::jsonb),

    'debates', coalesce((
      SELECT jsonb_agg(to_jsonb(x))
      FROM (
        SELECT id, title, topic, status
        FROM debate_rooms
        WHERE status = 'active'
          AND (title ILIKE '%' || q || '%' OR topic ILIKE '%' || q || '%')
        ORDER BY created_at DESC
        LIMIT lim
      ) x
    ), '[]'::jsonb),

    'posts', coalesce((
      SELECT jsonb_agg(to_jsonb(x))
      FROM (
        SELECT id, author_id, text, media_url, created_at
        FROM posts
        WHERE text ILIKE '%' || q || '%'
        ORDER BY created_at DESC
        LIMIT lim
      ) x
    ), '[]'::jsonb),

    'hashtags', coalesce((
      SELECT jsonb_agg(to_jsonb(x))
      FROM (
        SELECT tag, count(*)::int AS count
        FROM video_hashtags
        WHERE tag ILIKE q || '%'
        GROUP BY tag
        ORDER BY count DESC
        LIMIT 6
      ) x
    ), '[]'::jsonb)
  );
END; \];

-- S'assurer que les grants existent
GRANT EXECUTE ON FUNCTION public.global_discovery_search(text, integer) TO anon, authenticated, service_role;
