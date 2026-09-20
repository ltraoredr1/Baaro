-- ============================================================
-- BAARO — 046 Friend System
-- Abonnements + demandes d'amis
--
-- IMPORTANT :
-- - Ne supprime aucune donnée existante.
-- - Conserve follower_id / followed_id.
-- - Compatible avec le système actuel de follows.
-- ============================================================

BEGIN;

-- ============================================================
-- 1. Vérification de la table follows
-- ============================================================

CREATE TABLE IF NOT EXISTS public.follows (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    follower_id uuid NOT NULL,
    created_at timestamptz DEFAULT now(),
    followed_id uuid NOT NULL,
    status text NOT NULL DEFAULT 'accepted',
    is_friend boolean NOT NULL DEFAULT false
);

-- ============================================================
-- 2. Colonnes manquantes
-- ============================================================

ALTER TABLE public.follows
    ADD COLUMN IF NOT EXISTS status text;

ALTER TABLE public.follows
    ADD COLUMN IF NOT EXISTS is_friend boolean;

ALTER TABLE public.follows
    ADD COLUMN IF NOT EXISTS created_at timestamptz;

-- Valeurs par défaut pour les anciennes lignes
UPDATE public.follows
SET status = 'accepted'
WHERE status IS NULL;

UPDATE public.follows
SET is_friend = false
WHERE is_friend IS NULL;

UPDATE public.follows
SET created_at = now()
WHERE created_at IS NULL;

ALTER TABLE public.follows
    ALTER COLUMN status SET DEFAULT 'accepted';

ALTER TABLE public.follows
    ALTER COLUMN status SET NOT NULL;

ALTER TABLE public.follows
    ALTER COLUMN is_friend SET DEFAULT false;

ALTER TABLE public.follows
    ALTER COLUMN is_friend SET NOT NULL;

ALTER TABLE public.follows
    ALTER COLUMN created_at SET DEFAULT now();

-- ============================================================
-- 3. Contraintes sur status
-- ============================================================

ALTER TABLE public.follows
DROP CONSTRAINT IF EXISTS follows_status_check;

ALTER TABLE public.follows
ADD CONSTRAINT follows_status_check
CHECK (
    status IN ('pending', 'accepted', 'rejected')
);

-- ============================================================
-- 4. Empêcher de se suivre soi-même
-- ============================================================

ALTER TABLE public.follows
DROP CONSTRAINT IF EXISTS follows_no_self;

ALTER TABLE public.follows
ADD CONSTRAINT follows_no_self
CHECK (follower_id <> followed_id);

-- ============================================================
-- 5. Un seul lien A → B
-- ============================================================

CREATE UNIQUE INDEX IF NOT EXISTS uq_follows_user_pair
ON public.follows (follower_id, followed_id);

-- ============================================================
-- 6. Index pour les abonnements
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_follows_follower
ON public.follows (follower_id);

CREATE INDEX IF NOT EXISTS idx_follows_followed
ON public.follows (followed_id);

CREATE INDEX IF NOT EXISTS idx_follows_follower_status
ON public.follows (follower_id, status);

CREATE INDEX IF NOT EXISTS idx_follows_followed_status
ON public.follows (followed_id, status);

CREATE INDEX IF NOT EXISTS idx_follows_friends
ON public.follows (follower_id, followed_id)
WHERE is_friend = true
  AND status = 'accepted';

-- ============================================================
-- 7. RLS
-- ============================================================

ALTER TABLE public.follows ENABLE ROW LEVEL SECURITY;

-- Lecture publique des relations
DROP POLICY IF EXISTS follows_select_public ON public.follows;

CREATE POLICY follows_select_public
ON public.follows
FOR SELECT
USING (true);

-- Création d'un abonnement / demande par l'utilisateur
DROP POLICY IF EXISTS follows_insert_own ON public.follows;

CREATE POLICY follows_insert_own
ON public.follows
FOR INSERT
WITH CHECK (
    auth.uid() = follower_id
);

-- Suppression de son propre abonnement
DROP POLICY IF EXISTS follows_delete_own ON public.follows;

CREATE POLICY follows_delete_own
ON public.follows
FOR DELETE
USING (
    auth.uid() = follower_id
);

-- Modification de sa propre relation
DROP POLICY IF EXISTS follows_update_own ON public.follows;

CREATE POLICY follows_update_own
ON public.follows
FOR UPDATE
USING (
    auth.uid() = follower_id
)
WITH CHECK (
    auth.uid() = follower_id
);

-- Le destinataire peut accepter/refuser une demande d'ami
DROP POLICY IF EXISTS follows_request_receiver ON public.follows;

CREATE POLICY follows_request_receiver
ON public.follows
FOR UPDATE
USING (
    auth.uid() = followed_id
    AND status = 'pending'
    AND is_friend = true
)
WITH CHECK (
    auth.uid() = followed_id
    AND follower_id <> followed_id
);

-- ============================================================
-- 8. Fonction : envoyer une demande d'ami
-- ============================================================

CREATE OR REPLACE FUNCTION public.send_friend_request(
    p_target uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
    v_user uuid := auth.uid();
BEGIN
    IF v_user IS NULL THEN
        RAISE EXCEPTION 'NOT_AUTHENTICATED';
    END IF;

    IF p_target IS NULL THEN
        RAISE EXCEPTION 'INVALID_TARGET';
    END IF;

    IF v_user = p_target THEN
        RAISE EXCEPTION 'CANNOT_FRIEND_SELF';
    END IF;

    INSERT INTO public.follows (
        follower_id,
        followed_id,
        status,
        is_friend
    )
    VALUES (
        v_user,
        p_target,
        'pending',
        true
    )
    ON CONFLICT (follower_id, followed_id)
    DO UPDATE SET
        status = 'pending',
        is_friend = true;

    RETURN true;
END;
$function$;

-- ============================================================
-- 9. Fonction : accepter une demande d'ami
-- ============================================================

CREATE OR REPLACE FUNCTION public.accept_friend_request(
    p_follow_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
    v_user uuid := auth.uid();
    v_follower uuid;
BEGIN
    SELECT follower_id
    INTO v_follower
    FROM public.follows
    WHERE id = p_follow_id
      AND followed_id = v_user
      AND status = 'pending'
      AND is_friend = true
    FOR UPDATE;

    IF v_follower IS NULL THEN
        RAISE EXCEPTION 'FRIEND_REQUEST_NOT_FOUND';
    END IF;

    UPDATE public.follows
    SET
        status = 'accepted',
        is_friend = true
    WHERE id = p_follow_id;

    -- Crée également la relation inverse.
    INSERT INTO public.follows (
        follower_id,
        followed_id,
        status,
        is_friend
    )
    VALUES (
        v_user,
        v_follower,
        'accepted',
        true
    )
    ON CONFLICT (follower_id, followed_id)
    DO UPDATE SET
        status = 'accepted',
        is_friend = true;

    RETURN true;
END;
$function$;

-- ============================================================
-- 10. Fonction : refuser une demande
-- ============================================================

CREATE OR REPLACE FUNCTION public.reject_friend_request(
    p_follow_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
    UPDATE public.follows
    SET
        status = 'rejected',
        is_friend = false
    WHERE id = p_follow_id
      AND followed_id = auth.uid()
      AND status = 'pending'
      AND is_friend = true;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'FRIEND_REQUEST_NOT_FOUND';
    END IF;

    RETURN true;
END;
$function$;

-- ============================================================
-- 11. Fonction : supprimer un ami
-- ============================================================

CREATE OR REPLACE FUNCTION public.remove_friend(
    p_user uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
    v_user uuid := auth.uid();
BEGIN
    IF v_user IS NULL THEN
        RAISE EXCEPTION 'NOT_AUTHENTICATED';
    END IF;

    DELETE FROM public.follows
    WHERE (
        follower_id = v_user
        AND followed_id = p_user
    )
    OR (
        follower_id = p_user
        AND followed_id = v_user
    )
    AND is_friend = true;

    RETURN true;
END;
$function$;

-- ============================================================
-- 12. Fonction : obtenir les amis
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_user_friends(
    p_user_id uuid
)
RETURNS TABLE (
    friend_id uuid
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
    SELECT DISTINCT
        f1.followed_id AS friend_id
    FROM public.follows f1
    INNER JOIN public.follows f2
        ON f1.follower_id = f2.followed_id
       AND f1.followed_id = f2.follower_id
    WHERE f1.follower_id = p_user_id
      AND f1.status = 'accepted'
      AND f1.is_friend = true
      AND f2.status = 'accepted'
      AND f2.is_friend = true;
$function$;

-- ============================================================
-- 13. Permissions RPC
-- ============================================================

GRANT EXECUTE ON FUNCTION public.send_friend_request(uuid)
TO authenticated;

GRANT EXECUTE ON FUNCTION public.accept_friend_request(uuid)
TO authenticated;

GRANT EXECUTE ON FUNCTION public.reject_friend_request(uuid)
TO authenticated;

GRANT EXECUTE ON FUNCTION public.remove_friend(uuid)
TO authenticated;

GRANT EXECUTE ON FUNCTION public.get_user_friends(uuid)
TO authenticated;

COMMIT;
