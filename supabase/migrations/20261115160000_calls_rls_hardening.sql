-- Durcissement RLS de public.calls
--
-- Avant : la policy "calls_participants" (FOR ALL) laissait un participant modifier
-- n'importe quelle colonne (caller_id, daily_room_name…) et insérer des lignes
-- arbitraires, ce qui pouvait servir à obtenir un jeton pour la salle d'un autre appel.
--
-- Après :
--  * SELECT : participants (appelant ou appelé).
--  * UPDATE : participants, limité par trigger à status / started_at / ended_at /
--             duration_seconds, et un appel terminé ne repart pas.
--  * INSERT / DELETE : plus possible côté client (l'insertion est faite par /api/live
--    avec la clé service, qui n'est pas soumise à la RLS).

DROP POLICY IF EXISTS "calls_participants" ON public.calls;
DROP POLICY IF EXISTS "calls_participants_select" ON public.calls;
DROP POLICY IF EXISTS "calls_participants_update" ON public.calls;

CREATE POLICY "calls_participants_select" ON public.calls
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) IN (caller_id, callee_id));

CREATE POLICY "calls_participants_update" ON public.calls
  FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) IN (caller_id, callee_id))
  WITH CHECK ((SELECT auth.uid()) IN (caller_id, callee_id));

CREATE OR REPLACE FUNCTION public.calls_guard_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- service_role / jobs serveur : aucune restriction.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.conversation_id IS DISTINCT FROM OLD.conversation_id
     OR NEW.caller_id IS DISTINCT FROM OLD.caller_id
     OR NEW.callee_id IS DISTINCT FROM OLD.callee_id
     OR NEW.type IS DISTINCT FROM OLD.type
     OR NEW.daily_room_name IS DISTINCT FROM OLD.daily_room_name
     OR NEW.daily_room_url IS DISTINCT FROM OLD.daily_room_url
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'calls: colonnes non modifiables' USING ERRCODE = '42501';
  END IF;

  -- Un appel terminé, refusé ou manqué ne repart pas.
  IF OLD.status IN ('ended', 'rejected', 'missed')
     AND NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'calls: appel déjà terminé' USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS calls_guard_update ON public.calls;
CREATE TRIGGER calls_guard_update
  BEFORE UPDATE ON public.calls
  FOR EACH ROW EXECUTE FUNCTION public.calls_guard_update();
