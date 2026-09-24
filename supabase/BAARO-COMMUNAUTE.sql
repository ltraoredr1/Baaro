-- ============================================================
-- BAARO — COMMUNAUTÉ RLS (corrigé)
-- Compatible groupes publics/privés + création atomique
-- À exécuter dans Supabase SQL Editor
-- ============================================================

-- ------------------------------------------------------------
-- 0. Colonnes manquantes (idempotent)
-- ------------------------------------------------------------
ALTER TABLE public.groups ADD COLUMN IF NOT EXISTS is_public boolean DEFAULT true;
ALTER TABLE public.groups ADD COLUMN IF NOT EXISTS is_private boolean DEFAULT false;
ALTER TABLE public.groups ADD COLUMN IF NOT EXISTS category text DEFAULT 'community';
ALTER TABLE public.groups ADD COLUMN IF NOT EXISTS avatar_url text;
ALTER TABLE public.groups ADD COLUMN IF NOT EXISTS description text;

ALTER TABLE public.channels ADD COLUMN IF NOT EXISTS topic text;
ALTER TABLE public.channels ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE public.channels ADD COLUMN IF NOT EXISTS type text DEFAULT 'text';

-- Synchroniser is_public / is_private si besoin
UPDATE public.groups
SET is_public = NOT COALESCE(is_private, false)
WHERE is_public IS NULL;

UPDATE public.groups
SET is_public = true
WHERE is_public IS NULL;

-- ------------------------------------------------------------
-- 1. ACTIVER RLS
-- ------------------------------------------------------------
ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.channel_messages ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  ALTER TABLE public.group_roles ENABLE ROW LEVEL SECURITY;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.voice_participants ENABLE ROW LEVEL SECURITY;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- ------------------------------------------------------------
-- 2. SUPPRIMER ANCIENNES POLICIES (toutes variantes)
-- ------------------------------------------------------------
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT policyname, tablename
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN (
        'groups', 'group_members', 'channels',
        'channel_messages', 'group_roles', 'voice_participants'
      )
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename);
  END LOOP;
END $$;

-- ============================================================
-- GROUPES
-- ============================================================

-- Lecture : public OU owner OU membre
CREATE POLICY "community_groups_select"
ON public.groups
FOR SELECT
TO authenticated
USING (
  COALESCE(is_public, true) = true
  OR owner_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.group_members gm
    WHERE gm.group_id = groups.id
      AND gm.user_id = auth.uid()
  )
);

-- Création : owner_id = soi
CREATE POLICY "community_groups_insert"
ON public.groups
FOR INSERT
TO authenticated
WITH CHECK (owner_id = auth.uid());

-- Update : owner ou admin
CREATE POLICY "community_groups_update"
ON public.groups
FOR UPDATE
TO authenticated
USING (
  owner_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.group_members gm
    WHERE gm.group_id = groups.id
      AND gm.user_id = auth.uid()
      AND gm.role IN ('owner', 'admin')
  )
)
WITH CHECK (
  owner_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.group_members gm
    WHERE gm.group_id = groups.id
      AND gm.user_id = auth.uid()
      AND gm.role IN ('owner', 'admin')
  )
);

CREATE POLICY "community_groups_delete"
ON public.groups
FOR DELETE
TO authenticated
USING (owner_id = auth.uid());

-- ============================================================
-- MEMBRES  (CRITIQUE : permettre auto-join owner à la création)
-- ============================================================

-- Voir membres d'un groupe public, ou si on est membre/owner
CREATE POLICY "community_members_select"
ON public.group_members
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.groups g
    WHERE g.id = group_members.group_id
      AND (
        COALESCE(g.is_public, true) = true
        OR g.owner_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.group_members me
          WHERE me.group_id = g.id AND me.user_id = auth.uid()
        )
      )
  )
);

-- Insert :
--  1) s'ajouter soi-même si groupe public
--  2) s'ajouter soi-même si on est owner_id du groupe (création)
--  3) être ajouté par owner/admin déjà membre
CREATE POLICY "community_members_insert"
ON public.group_members
FOR INSERT
TO authenticated
WITH CHECK (
  (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.groups g
      WHERE g.id = group_members.group_id
        AND (
          COALESCE(g.is_public, true) = true
          OR g.owner_id = auth.uid()
        )
    )
  )
  OR EXISTS (
    SELECT 1 FROM public.group_members me
    WHERE me.group_id = group_members.group_id
      AND me.user_id = auth.uid()
      AND me.role IN ('owner', 'admin')
  )
);

CREATE POLICY "community_members_delete"
ON public.group_members
FOR DELETE
TO authenticated
USING (
  user_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.group_members me
    WHERE me.group_id = group_members.group_id
      AND me.user_id = auth.uid()
      AND me.role IN ('owner', 'admin')
  )
);

CREATE POLICY "community_members_update"
ON public.group_members
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.group_members me
    WHERE me.group_id = group_members.group_id
      AND me.user_id = auth.uid()
      AND me.role IN ('owner', 'admin')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.group_members me
    WHERE me.group_id = group_members.group_id
      AND me.user_id = auth.uid()
      AND me.role IN ('owner', 'admin')
  )
);

-- ============================================================
-- CANAUX
-- ============================================================

-- Lire canaux : membre OU owner du groupe OU groupe public
CREATE POLICY "community_channels_select"
ON public.channels
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.groups g
    WHERE g.id = channels.group_id
      AND (
        COALESCE(g.is_public, true) = true
        OR g.owner_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.group_members gm
          WHERE gm.group_id = g.id AND gm.user_id = auth.uid()
        )
      )
  )
);

-- Créer canal : owner du groupe OU membre owner/admin
CREATE POLICY "community_channels_insert"
ON public.channels
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.groups g
    WHERE g.id = channels.group_id
      AND g.owner_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM public.group_members gm
    WHERE gm.group_id = channels.group_id
      AND gm.user_id = auth.uid()
      AND gm.role IN ('owner', 'admin')
  )
);

CREATE POLICY "community_channels_update"
ON public.channels
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.groups g
    WHERE g.id = channels.group_id AND g.owner_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM public.group_members gm
    WHERE gm.group_id = channels.group_id
      AND gm.user_id = auth.uid()
      AND gm.role IN ('owner', 'admin')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.groups g
    WHERE g.id = channels.group_id AND g.owner_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM public.group_members gm
    WHERE gm.group_id = channels.group_id
      AND gm.user_id = auth.uid()
      AND gm.role IN ('owner', 'admin')
  )
);

CREATE POLICY "community_channels_delete"
ON public.channels
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.groups g
    WHERE g.id = channels.group_id AND g.owner_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM public.group_members gm
    WHERE gm.group_id = channels.group_id
      AND gm.user_id = auth.uid()
      AND gm.role IN ('owner', 'admin')
  )
);

-- ============================================================
-- MESSAGES
-- ============================================================

CREATE POLICY "community_messages_select"
ON public.channel_messages
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.channels c
    JOIN public.groups g ON g.id = c.group_id
    WHERE c.id = channel_messages.channel_id
      AND (
        g.owner_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.group_members gm
          WHERE gm.group_id = c.group_id AND gm.user_id = auth.uid()
        )
      )
  )
);

CREATE POLICY "community_messages_insert"
ON public.channel_messages
FOR INSERT
TO authenticated
WITH CHECK (
  sender_id = auth.uid()
  AND EXISTS (
    SELECT 1
    FROM public.channels c
    JOIN public.groups g ON g.id = c.group_id
    WHERE c.id = channel_messages.channel_id
      AND (
        g.owner_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.group_members gm
          WHERE gm.group_id = c.group_id AND gm.user_id = auth.uid()
        )
      )
  )
);

CREATE POLICY "community_messages_update"
ON public.channel_messages
FOR UPDATE
TO authenticated
USING (sender_id = auth.uid())
WITH CHECK (sender_id = auth.uid());

CREATE POLICY "community_messages_delete"
ON public.channel_messages
FOR DELETE
TO authenticated
USING (sender_id = auth.uid());

-- ============================================================
-- group_roles / voice (si tables existent)
-- ============================================================

DO $$ BEGIN
  CREATE POLICY "community_roles_select" ON public.group_roles
    FOR SELECT TO authenticated
    USING (EXISTS (
      SELECT 1 FROM public.group_members gm
      WHERE gm.group_id = group_roles.group_id AND gm.user_id = auth.uid()
    ));
  CREATE POLICY "community_roles_insert" ON public.group_roles
    FOR INSERT TO authenticated
    WITH CHECK (EXISTS (
      SELECT 1 FROM public.group_members gm
      WHERE gm.group_id = group_roles.group_id AND gm.user_id = auth.uid()
        AND gm.role IN ('owner', 'admin')
    ));
  CREATE POLICY "community_roles_update" ON public.group_roles
    FOR UPDATE TO authenticated
    USING (EXISTS (
      SELECT 1 FROM public.group_members gm
      WHERE gm.group_id = group_roles.group_id AND gm.user_id = auth.uid()
        AND gm.role IN ('owner', 'admin')
    ));
  CREATE POLICY "community_roles_delete" ON public.group_roles
    FOR DELETE TO authenticated
    USING (EXISTS (
      SELECT 1 FROM public.group_members gm
      WHERE gm.group_id = group_roles.group_id AND gm.user_id = auth.uid()
        AND gm.role IN ('owner', 'admin')
    ));
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "community_voice_select" ON public.voice_participants
    FOR SELECT TO authenticated
    USING (EXISTS (
      SELECT 1 FROM public.channels c
      JOIN public.group_members gm ON gm.group_id = c.group_id
      WHERE c.id = voice_participants.channel_id AND c.type = 'voice'
        AND gm.user_id = auth.uid()
    ));
  CREATE POLICY "community_voice_insert" ON public.voice_participants
    FOR INSERT TO authenticated
    WITH CHECK (
      user_id = auth.uid()
      AND EXISTS (
        SELECT 1 FROM public.channels c
        JOIN public.group_members gm ON gm.group_id = c.group_id
        WHERE c.id = voice_participants.channel_id AND c.type = 'voice'
          AND gm.user_id = auth.uid()
      )
    );
  CREATE POLICY "community_voice_delete" ON public.voice_participants
    FOR DELETE TO authenticated USING (user_id = auth.uid());
  CREATE POLICY "community_voice_update" ON public.voice_participants
    FOR UPDATE TO authenticated
    USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- ============================================================
-- FONCTION ATOMIQUE : créer groupe + owner + #general
-- Contourne les courses RLS (SECURITY DEFINER)
-- ============================================================

CREATE OR REPLACE FUNCTION public.create_community_group(
  p_name text,
  p_description text DEFAULT NULL,
  p_is_public boolean DEFAULT true,
  p_category text DEFAULT 'community'
)
RETURNS public.groups
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_group public.groups;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Non authentifié';
  END IF;

  IF p_name IS NULL OR length(trim(p_name)) < 2 THEN
    RAISE EXCEPTION 'Nom du groupe trop court';
  END IF;

  INSERT INTO public.groups (
    name, description, owner_id, is_public, is_private, category
  ) VALUES (
    left(trim(p_name), 80),
    NULLIF(left(trim(COALESCE(p_description, '')), 500), ''),
    v_uid,
    COALESCE(p_is_public, true),
    NOT COALESCE(p_is_public, true),
    COALESCE(NULLIF(trim(p_category), ''), 'community')
  )
  RETURNING * INTO v_group;

  INSERT INTO public.group_members (group_id, user_id, role)
  VALUES (v_group.id, v_uid, 'owner')
  ON CONFLICT (group_id, user_id) DO UPDATE SET role = 'owner';

  INSERT INTO public.channels (group_id, name, type, description)
  VALUES (v_group.id, 'general', 'text', 'Canal principal')
  ON CONFLICT DO NOTHING;

  RETURN v_group;
END;
$$;

REVOKE ALL ON FUNCTION public.create_community_group FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_community_group TO authenticated;

-- Canal additionnel (owner/admin)
CREATE OR REPLACE FUNCTION public.create_community_channel(
  p_group_id uuid,
  p_name text,
  p_type text DEFAULT 'text',
  p_description text DEFAULT NULL
)
RETURNS public.channels
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_role text;
  v_owner uuid;
  v_name text;
  v_channel public.channels;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Non authentifié';
  END IF;

  SELECT owner_id INTO v_owner FROM public.groups WHERE id = p_group_id;
  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'Groupe introuvable';
  END IF;

  SELECT role INTO v_role
  FROM public.group_members
  WHERE group_id = p_group_id AND user_id = v_uid;

  IF v_owner <> v_uid AND (v_role IS NULL OR v_role NOT IN ('owner', 'admin')) THEN
    RAISE EXCEPTION 'Droits insuffisants';
  END IF;

  v_name := lower(regexp_replace(trim(p_name), '\s+', '-', 'g'));
  v_name := regexp_replace(v_name, '[^a-z0-9\-_]', '', 'g');
  v_name := left(v_name, 40);
  IF v_name IS NULL OR length(v_name) < 1 THEN
    RAISE EXCEPTION 'Nom de canal invalide';
  END IF;

  INSERT INTO public.channels (group_id, name, type, description)
  VALUES (
    p_group_id,
    v_name,
    CASE WHEN p_type = 'voice' THEN 'voice' ELSE 'text' END,
    NULLIF(left(trim(COALESCE(p_description, '')), 200), '')
  )
  RETURNING * INTO v_channel;

  RETURN v_channel;
END;
$$;

REVOKE ALL ON FUNCTION public.create_community_channel FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_community_channel TO authenticated;

-- Realtime
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.channel_messages;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.group_members;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.channels;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
