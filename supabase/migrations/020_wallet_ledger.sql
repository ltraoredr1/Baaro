-- BAARO 2.0 — Migration 020 : wallet_ledger append-only
-- Exécuter APRÈS les migrations précédentes (jusqu'à 019 inclus).

-- Table ledger immuable (append-only)
CREATE TABLE IF NOT EXISTS public.wallet_ledger (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action_key    text NOT NULL,
  pts           integer NOT NULL,          -- positif = crédit, négatif = débit
  balance_after integer NOT NULL,
  reference_id  uuid,
  metadata      jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wallet_ledger_user_created
  ON public.wallet_ledger (user_id, created_at DESC);

-- Idempotence : une seule ligne par (user, action, reference)
CREATE UNIQUE INDEX IF NOT EXISTS idx_wallet_ledger_idempotency
  ON public.wallet_ledger (user_id, action_key, reference_id)
  WHERE reference_id IS NOT NULL;

-- RLS
ALTER TABLE public.wallet_ledger ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own ledger" ON public.wallet_ledger;
CREATE POLICY "Users can read own ledger"
  ON public.wallet_ledger
  FOR SELECT
  USING (auth.uid() = user_id);

-- Aucune policy INSERT/UPDATE/DELETE pour le rôle authentifié.
-- Seul service_role (côté serveur) peut écrire.

-- Fonction helper pour insérer dans le ledger (appelée depuis les RPC wallet_*)
CREATE OR REPLACE FUNCTION public.wallet_ledger_append(
  p_user_id       uuid,
  p_action_key    text,
  p_pts           integer,
  p_balance_after integer,
  p_reference_id  uuid DEFAULT NULL,
  p_metadata      jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO public.wallet_ledger (
    user_id, action_key, pts, balance_after, reference_id, metadata
  )
  VALUES (
    p_user_id, p_action_key, p_pts, p_balance_after, p_reference_id, COALESCE(p_metadata, '{}'::jsonb)
  )
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.wallet_ledger_append FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.wallet_ledger_append TO service_role;

COMMENT ON TABLE public.wallet_ledger IS
  'Ledger append-only des mouvements wallet BAARO. Écriture uniquement via service_role / RPC.';
