-- ============================================================
-- BAARO — Correction des interactions sociales (Feed & Sondages)
-- Fichier : 053_fix_social_interactions.sql
-- Date : 26 septembre 2026
-- 
-- Objectif : Aligner les fonctions SQL avec le schéma réel 
-- (user_id au lieu de id, display_name au lieu de full_name, 
-- et éviter les UPDATE sur les vues).
-- ============================================================

-- 1. Corriger vote_poll (ne pas UPDATE la vue poll_results, le COUNT est automatique)
CREATE OR REPLACE FUNCTION public.vote_poll(p_poll_id uuid, p_option_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  v_post_id uuid;
  v_user_id uuid;
  v_option_index integer;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'User not authenticated'; END IF;
  
  SELECT p.post_id, po.position INTO v_post_id, v_option_index
  FROM polls p
  JOIN poll_options po ON po.poll_id = p.id AND po.id = p_option_id
  WHERE p.id = p_poll_id;
  
  IF v_post_id IS NULL THEN RAISE EXCEPTION 'Poll or option not found'; END IF;
  
  DELETE FROM public.poll_votes WHERE poll_id = p_poll_id AND user_id = v_user_id;
  
  INSERT INTO public.poll_votes (poll_id, option_id, user_id, post_id, option_index)
  VALUES (p_poll_id, p_option_id, v_user_id, v_post_id, v_option_index);
END;
$function$;

-- 2. Corriger notify_on_poll_vote (utiliser user_id et display_name)
CREATE OR REPLACE FUNCTION public.notify_on_poll_vote()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  v_post_id UUID;
  v_post_author UUID;
  v_actor_name TEXT;
  v_question TEXT;
BEGIN
  SELECT post_id INTO v_post_id FROM public.polls WHERE id = NEW.poll_id;
  SELECT author_id INTO v_post_author FROM public.posts WHERE id = v_post_id;
  SELECT question INTO v_question FROM public.polls WHERE id = NEW.poll_id;
  
  SELECT COALESCE(display_name, handle, 'Quelqu''un') INTO v_actor_name
    FROM public.profiles WHERE id = NEW.user_id;

  PERFORM public.create_notification(
    v_post_author, NEW.user_id, 'poll_vote',
    v_actor_name || ' a voté à votre sondage : ' || LEFT(v_question, 50),
    v_post_id
  );
  RETURN NEW;
END;
$function$;

-- 3. Corriger create_notification (utiliser notification_id et user_id)
CREATE OR REPLACE FUNCTION public.create_notification(
  p_target_id uuid, p_actor_id uuid, p_type text, p_message text, p_source_id uuid DEFAULT NULL::uuid
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
BEGIN
  IF p_target_id = p_actor_id THEN RETURN; END IF;
  
  IF p_source_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.notifications
    WHERE user_id = p_target_id AND type = p_type AND source_id = p_source_id
    AND created_at > NOW() - INTERVAL '5 minutes'
  ) THEN RETURN; END IF;

  INSERT INTO public.notifications (notification_id, user_id, actor_id, type, message, source_id, read, created_at)
  VALUES (gen_random_uuid(), p_target_id, p_actor_id, p_type, p_message, p_source_id, false, NOW());
END;
$function$;

-- 4. Corriger notify_on_comment (utiliser display_name)
CREATE OR REPLACE FUNCTION public.notify_on_comment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  v_post_author UUID;
  v_actor_name TEXT;
BEGIN
  SELECT author_id INTO v_post_author FROM public.posts WHERE id = NEW.post_id;
  
  SELECT COALESCE(display_name, handle, 'Quelqu''un') INTO v_actor_name
    FROM public.profiles WHERE id = NEW.author_id;

  PERFORM public.create_notification(
    v_post_author, NEW.author_id, 'comment',
    v_actor_name || ' a commenté votre publication', NEW.post_id
  );
  RETURN NEW;
END;
$function$;

-- 5. Corriger get_poll_voters (joindre sur user_id, pas id)
CREATE OR REPLACE FUNCTION public.get_poll_voters(p_poll_id uuid)
RETURNS TABLE(option_id uuid, option_text text, voters jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.poll_votes WHERE poll_id = p_poll_id AND user_id = auth.uid()
  ) AND NOT EXISTS (
    SELECT 1 FROM public.polls p
    JOIN public.posts po ON po.id = p.post_id
    WHERE p.id = p_poll_id AND po.author_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'ACCESS_DENIED';
  END IF;

  RETURN QUERY
  SELECT 
    po.id AS option_id,
    po.option_text,
    COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'id', pv.user_id,
          'display_name', COALESCE(pr.display_name, pr.handle, 'Membre'),
          'avatar_url', pr.avatar_url,
          'handle', pr.handle
        )
        ORDER BY pv.created_at DESC
      ) FILTER (WHERE pv.id IS NOT NULL),
      '[]'::jsonb
    ) AS voters
  FROM public.poll_options po
  LEFT JOIN public.poll_votes pv ON po.id = pv.option_id
  LEFT JOIN public.profiles pr ON pv.user_id = pr.id
  WHERE po.poll_id = p_poll_id
  GROUP BY po.id, po.option_text, po.position
  ORDER BY po.position;
END;
$function$;
