BEGIN;

-- 1. Colonnes nécessaires au suivi fournisseur
ALTER TABLE public.economy_payouts
  ADD COLUMN IF NOT EXISTS provider text,
  ADD COLUMN IF NOT EXISTS provider_reference text,
  ADD COLUMN IF NOT EXISTS failure_reason text;

-- 2. Statuts cohérents avec le cycle réel
ALTER TABLE public.economy_payouts
  DROP CONSTRAINT IF EXISTS economy_payouts_status_check;

ALTER TABLE public.economy_payouts
  ADD CONSTRAINT economy_payouts_status_check
  CHECK (status IN (
    'requested',
    'processing',
    'unknown',
    'paid',
    'failed',
    'cancelled'
  ));

CREATE UNIQUE INDEX IF NOT EXISTS
  economy_payouts_provider_reference_uidx
ON public.economy_payouts(provider, provider_reference)
WHERE provider IS NOT NULL
  AND provider_reference IS NOT NULL;

CREATE INDEX IF NOT EXISTS
  economy_payouts_pending_reconciliation_idx
ON public.economy_payouts(status, created_at)
WHERE status IN ('requested', 'processing', 'unknown');

-- 3. Réservation atomique du solde
CREATE OR REPLACE FUNCTION public.request_economy_payout(
  p_amount_minor bigint,
  p_method text,
  p_destination_token text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  a public.economy_accounts%ROWTYPE;
  k public.creator_payout_profiles%ROWTYPE;
  p uuid;
  min_cash bigint;
  destination jsonb;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED';
  END IF;

  IF p_amount_minor IS NULL OR p_amount_minor <= 0 THEN
    RAISE EXCEPTION 'INVALID_AMOUNT';
  END IF;

  -- Les virements bancaires restent désactivés
  -- jusqu'à l'intégration d'une destination bancaire vérifiée.
  IF p_method <> 'mobile_money' THEN
    RAISE EXCEPTION 'PAYOUT_METHOD_NOT_AVAILABLE';
  END IF;

  BEGIN
    destination := p_destination_token::jsonb;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'PAYOUT_DESTINATION_INVALID';
  END;

  IF destination IS NULL
     OR length(coalesce(destination->>'prefix', '')) NOT BETWEEN 1 AND 4
     OR (destination->>'prefix') !~ '^[0-9]+$'
     OR length(coalesce(destination->>'phone', '')) NOT BETWEEN 6 AND 15
     OR (destination->>'phone') !~ '^[0-9]+$'
  THEN
    RAISE EXCEPTION 'PAYOUT_DESTINATION_INVALID';
  END IF;

  SELECT *
  INTO k
  FROM public.creator_payout_profiles
  WHERE user_id = uid
  FOR UPDATE;

  IF NOT FOUND
     OR k.kyc_status <> 'verified'
     OR NOT k.payout_verified
  THEN
    RAISE EXCEPTION 'PAYOUT_KYC_REQUIRED';
  END IF;

  IF k.risk_level <> 'normal' THEN
    RAISE EXCEPTION 'PAYOUT_BLOCKED_FOR_RISK';
  END IF;

  SELECT *
  INTO a
  FROM public.economy_accounts
  WHERE user_id = uid
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NO_EARNINGS_ACCOUNT';
  END IF;

  IF upper(a.currency::text) <> 'XOF' THEN
    RAISE EXCEPTION 'PAYOUT_CURRENCY_NOT_SUPPORTED';
  END IF;

  IF p_amount_minor % 500 <> 0 THEN
    RAISE EXCEPTION 'PAYOUT_AMOUNT_INVALID';
  END IF;

  SELECT round(min_cashout * 100)::bigint
  INTO min_cash
  FROM public.creator_monetization
  WHERE creator_id = uid;

  min_cash := coalesce(min_cash, 100000);

  IF p_amount_minor < min_cash THEN
    RAISE EXCEPTION 'MIN_CASHOUT';
  END IF;

  IF p_amount_minor > a.available_minor THEN
    RAISE EXCEPTION 'INSUFFICIENT_AVAILABLE';
  END IF;

  INSERT INTO public.economy_payouts (
    user_id,
    amount_minor,
    currency,
    method,
    destination_token,
    status
  )
  VALUES (
    uid,
    p_amount_minor,
    a.currency::text,
    'mobile_money',
    p_destination_token,
    'requested'
  )
  RETURNING id INTO p;

  UPDATE public.economy_accounts
  SET available_minor = available_minor - p_amount_minor,
      payout_hold_minor = payout_hold_minor + p_amount_minor,
      updated_at = now()
  WHERE user_id = uid;

  INSERT INTO public.economy_ledger (
    user_id,
    entry_type,
    bucket,
    direction,
    source,
    amount_minor,
    currency,
    reference_id,
    idempotency_key,
    metadata
  )
  VALUES (
    uid,
    'payout_hold',
    'payout_hold',
    'credit',
    'payout',
    p_amount_minor,
    a.currency::text,
    p,
    'payout_hold:' || p::text,
    jsonb_build_object('status', 'reserved')
  );

  RETURN p;
END;
$$;

-- 4. Finalisation après confirmation fournisseur
CREATE OR REPLACE FUNCTION public.complete_economy_payout(
  p_payout_id uuid,
  p_provider text,
  p_provider_reference text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  p public.economy_payouts%ROWTYPE;
  a public.economy_accounts%ROWTYPE;
BEGIN
  IF p_payout_id IS NULL
     OR nullif(trim(p_provider), '') IS NULL
     OR nullif(trim(p_provider_reference), '') IS NULL
  THEN
    RAISE EXCEPTION 'PAYOUT_REFERENCE_REQUIRED';
  END IF;

  SELECT *
  INTO p
  FROM public.economy_payouts
  WHERE id = p_payout_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PAYOUT_NOT_FOUND';
  END IF;

  IF p.status = 'paid' THEN
    RETURN true;
  END IF;

  IF p.status NOT IN ('requested', 'processing', 'unknown') THEN
    RAISE EXCEPTION 'PAYOUT_NOT_COMPLETABLE';
  END IF;

  IF upper(p.currency) <> 'XOF' THEN
    RAISE EXCEPTION 'PAYOUT_CURRENCY_MISMATCH';
  END IF;

  SELECT *
  INTO a
  FROM public.economy_accounts
  WHERE user_id = p.user_id
  FOR UPDATE;

  IF NOT FOUND OR a.payout_hold_minor < p.amount_minor THEN
    RAISE EXCEPTION 'PAYOUT_HOLD_INCONSISTENT';
  END IF;

  UPDATE public.economy_accounts
  SET payout_hold_minor = payout_hold_minor - p.amount_minor,
      updated_at = now()
  WHERE user_id = p.user_id;

  UPDATE public.economy_payouts
  SET status = 'paid',
      provider = lower(trim(p_provider)),
      provider_reference = trim(p_provider_reference),
      processed_at = now(),
      failure_reason = NULL
  WHERE id = p.id;

  INSERT INTO public.economy_ledger (
    user_id, entry_type, bucket, direction, source,
    amount_minor, currency, reference_id,
    idempotency_key, metadata
  )
  SELECT
    p.user_id, 'payout_settlement', 'payout_hold', 'debit',
    'payout', p.amount_minor, p.currency, p.id,
    'payout_settlement:' || p.id::text,
    jsonb_build_object(
      'provider', lower(trim(p_provider)),
      'provider_reference', trim(p_provider_reference)
    )
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.economy_ledger
    WHERE idempotency_key = 'payout_settlement:' || p.id::text
  );

  RETURN true;
END;
$$;

-- 5. Annulation après échec fournisseur confirmé
CREATE OR REPLACE FUNCTION public.cancel_economy_payout(
  p_payout_id uuid,
  p_reason text DEFAULT 'PROVIDER_FAILURE'
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  p public.economy_payouts%ROWTYPE;
  a public.economy_accounts%ROWTYPE;
BEGIN
  IF p_payout_id IS NULL THEN
    RAISE EXCEPTION 'PAYOUT_ID_REQUIRED';
  END IF;

  SELECT *
  INTO p
  FROM public.economy_payouts
  WHERE id = p_payout_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PAYOUT_NOT_FOUND';
  END IF;

  IF p.status = 'cancelled' THEN
    RETURN true;
  END IF;

  IF p.status = 'paid' THEN
    RAISE EXCEPTION 'PAYOUT_ALREADY_PAID';
  END IF;

  IF p.status NOT IN ('requested', 'processing', 'unknown', 'failed') THEN
    RAISE EXCEPTION 'PAYOUT_NOT_CANCELLABLE';
  END IF;

  SELECT *
  INTO a
  FROM public.economy_accounts
  WHERE user_id = p.user_id
  FOR UPDATE;

  IF NOT FOUND OR a.payout_hold_minor < p.amount_minor THEN
    RAISE EXCEPTION 'PAYOUT_HOLD_INCONSISTENT';
  END IF;

  UPDATE public.economy_accounts
  SET payout_hold_minor = payout_hold_minor - p.amount_minor,
      available_minor = available_minor + p.amount_minor,
      updated_at = now()
  WHERE user_id = p.user_id;

  UPDATE public.economy_payouts
  SET status = 'cancelled',
      failure_reason = left(coalesce(p_reason, 'PROVIDER_FAILURE'), 500),
      processed_at = now()
  WHERE id = p.id;

  INSERT INTO public.economy_ledger (
    user_id, entry_type, bucket, direction, source,
    amount_minor, currency, reference_id,
    idempotency_key, metadata
  )
  SELECT
    p.user_id, 'payout_release', 'available', 'credit',
    'payout', p.amount_minor, p.currency, p.id,
    'payout_release:' || p.id::text,
    jsonb_build_object('reason', left(coalesce(p_reason, ''), 500))
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.economy_ledger
    WHERE idempotency_key = 'payout_release:' || p.id::text
  );

  RETURN true;
END;
$$;

-- 6. Permissions explicites
REVOKE ALL ON FUNCTION public.complete_economy_payout(uuid, text, text)
  FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.cancel_economy_payout(uuid, text)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.complete_economy_payout(uuid, text, text)
  TO service_role;

GRANT EXECUTE ON FUNCTION public.cancel_economy_payout(uuid, text)
  TO service_role;

REVOKE ALL ON FUNCTION public.request_economy_payout(bigint, text, text)
  FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.request_economy_payout(bigint, text, text)
  TO authenticated;

COMMIT;
