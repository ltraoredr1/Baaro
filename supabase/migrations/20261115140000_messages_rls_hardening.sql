-- Durcissement RLS de public.messages
--
-- Avant : une seule policy "messages_participants" (FOR ALL, sans WITH CHECK
-- distinct) permettait à tout participant de modifier/supprimer les messages de
-- l'autre et d'insérer un message avec un sender_id falsifié.
--
-- Après :
--  * SELECT  : expéditeur, destinataire ou participant de la conversation.
--  * INSERT  : sender_id = auth.uid(), vrai compte, participant de la conversation
--              et destinataire = l'autre participant.
--  * UPDATE  : expéditeur ou destinataire, avec un trigger qui limite les colonnes
--              modifiables (le destinataire ne peut que marquer lu/livré).
--  * DELETE  : expéditeur uniquement (l'app utilise la suppression logique).
--
-- Les appels service_role (auth.uid() NULL) ne sont pas restreints par le trigger.

DROP POLICY IF EXISTS "messages_participants" ON public.messages;
DROP POLICY IF EXISTS "messages_participants_select" ON public.messages;
DROP POLICY IF EXISTS "messages_participants_insert" ON public.messages;
DROP POLICY IF EXISTS "messages_participants_update" ON public.messages;
DROP POLICY IF EXISTS "messages_sender_delete" ON public.messages;

CREATE POLICY "messages_participants_select" ON public.messages
  FOR SELECT TO authenticated
  USING (
    (SELECT auth.uid()) = sender_id
    OR (SELECT auth.uid()) = recipient_id
    OR EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = messages.conversation_id
        AND (SELECT auth.uid()) IN (c.user1_id, c.user2_id)
    )
  );

CREATE POLICY "messages_participants_insert" ON public.messages
  FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = (SELECT auth.uid())
    AND public.is_real_user()
    AND EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = messages.conversation_id
        AND (
          (c.user1_id = (SELECT auth.uid()) AND c.user2_id = messages.recipient_id)
          OR (c.user2_id = (SELECT auth.uid()) AND c.user1_id = messages.recipient_id)
        )
    )
  );

CREATE POLICY "messages_participants_update" ON public.messages
  FOR UPDATE TO authenticated
  USING (
    (SELECT auth.uid()) = sender_id
    OR (SELECT auth.uid()) = recipient_id
  )
  WITH CHECK (
    (SELECT auth.uid()) = sender_id
    OR (SELECT auth.uid()) = recipient_id
  );

CREATE POLICY "messages_sender_delete" ON public.messages
  FOR DELETE TO authenticated
  USING (sender_id = (SELECT auth.uid()));

-- Colonnes modifiables selon le rôle de l'utilisateur dans le message.
CREATE OR REPLACE FUNCTION public.messages_guard_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  sender_cols text[] := ARRAY[
    'text', 'edited_at', 'deleted_at', 'expires_at', 'metadata', 'media_url',
    'media_mime', 'media_size', 'media_duration', 'file_name', 'scheduled_for'
  ];
  recipient_cols text[] := ARRAY['read_at', 'delivered_at'];
  old_j jsonb := to_jsonb(OLD);
  new_j jsonb := to_jsonb(NEW);
  allowed text[];
BEGIN
  -- service_role / jobs serveur : aucune restriction.
  IF uid IS NULL THEN
    RETURN NEW;
  END IF;

  -- Les colonnes immuables ne changent jamais.
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.conversation_id IS DISTINCT FROM OLD.conversation_id
     OR NEW.sender_id IS DISTINCT FROM OLD.sender_id
     OR NEW.recipient_id IS DISTINCT FROM OLD.recipient_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR NEW.client_message_id IS DISTINCT FROM OLD.client_message_id THEN
    RAISE EXCEPTION 'messages: colonnes immuables non modifiables'
      USING ERRCODE = '42501';
  END IF;

  IF uid = OLD.sender_id THEN
    allowed := sender_cols || recipient_cols;
  ELSIF uid = OLD.recipient_id THEN
    allowed := recipient_cols;
  ELSE
    RAISE EXCEPTION 'messages: modification non autorisée' USING ERRCODE = '42501';
  END IF;

  -- Toute autre colonne modifiée est refusée.
  IF (old_j - allowed) IS DISTINCT FROM (new_j - allowed) THEN
    RAISE EXCEPTION 'messages: colonne non modifiable pour ce rôle'
      USING ERRCODE = '42501';
  END IF;

  -- Un message supprimé ne revient pas.
  IF OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS DISTINCT FROM OLD.deleted_at THEN
    RAISE EXCEPTION 'messages: message déjà supprimé' USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS messages_guard_update ON public.messages;
CREATE TRIGGER messages_guard_update
  BEFORE UPDATE ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.messages_guard_update();
