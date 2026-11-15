-- BAARO audit fixes 2026-11-15
-- Privacy, notification counters, calls, and server-side payment support.

-- Private profile data is kept in a dedicated owner-only table.
CREATE TABLE IF NOT EXISTS public.profile_private (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  phone text,
  first_name text,
  last_name text,
  birth_date date,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.profile_private ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS profile_private_owner ON public.profile_private;
CREATE POLICY profile_private_owner ON public.profile_private
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
REVOKE ALL ON public.profile_private FROM anon;
GRANT SELECT, INSERT, UPDATE ON public.profile_private TO authenticated;
GRANT ALL ON public.profile_private TO service_role;

INSERT INTO public.profile_private (user_id, phone, first_name, last_name, birth_date)
SELECT id, phone, first_name, last_name, birth_date
FROM public.profiles
WHERE phone IS NOT NULL OR first_name IS NOT NULL OR last_name IS NOT NULL OR birth_date IS NOT NULL
ON CONFLICT (user_id) DO UPDATE SET
  phone = COALESCE(EXCLUDED.phone, profile_private.phone),
  first_name = COALESCE(EXCLUDED.first_name, profile_private.first_name),
  last_name = COALESCE(EXCLUDED.last_name, profile_private.last_name),
  birth_date = COALESCE(EXCLUDED.birth_date, profile_private.birth_date),
  updated_at = now();

CREATE OR REPLACE FUNCTION public.get_my_private_profile()
RETURNS TABLE(phone text, first_name text, last_name text, birth_date date)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, auth
AS $$
  SELECT p.phone, p.first_name, p.last_name, p.birth_date
  FROM public.profile_private p
  WHERE p.user_id = auth.uid();
$$;
REVOKE ALL ON FUNCTION public.get_my_private_profile() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_private_profile() TO authenticated;

CREATE OR REPLACE FUNCTION public.update_my_private_profile(
  p_phone text DEFAULT NULL,
  p_first_name text DEFAULT NULL,
  p_last_name text DEFAULT NULL,
  p_birth_date date DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  INSERT INTO public.profile_private(user_id, phone, first_name, last_name, birth_date, updated_at)
  VALUES (auth.uid(), NULLIF(trim(p_phone), ''), NULLIF(trim(p_first_name), ''), NULLIF(trim(p_last_name), ''), p_birth_date, now())
  ON CONFLICT (user_id) DO UPDATE SET
    phone = EXCLUDED.phone, first_name = EXCLUDED.first_name,
    last_name = EXCLUDED.last_name, birth_date = EXCLUDED.birth_date,
    updated_at = now();
END;
$$;
REVOKE ALL ON FUNCTION public.update_my_private_profile(text, text, text, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_my_private_profile(text, text, text, date) TO authenticated;

-- Never expose sensitive profile columns through the public PostgREST table.
REVOKE SELECT (phone, first_name, last_name, birth_date) ON public.profiles FROM anon, authenticated;

-- Notification counts must never be globally enumerable.
REVOKE ALL ON public.notification_unread_counts FROM anon, authenticated;
GRANT SELECT ON public.notification_unread_counts TO service_role;

-- Flutterwave webhook events are server-only and idempotent.
ALTER TABLE public.payment_webhook_events DROP CONSTRAINT IF EXISTS payment_webhook_events_provider_check;
ALTER TABLE public.payment_webhook_events ADD CONSTRAINT payment_webhook_events_provider_check
  CHECK (provider IN ('stripe', 'paypal', 'cinetpay', 'flutterwave'));

-- A cancelled call is a valid terminal state.
ALTER TABLE public.calls DROP CONSTRAINT IF EXISTS calls_status_check;
ALTER TABLE public.calls ADD CONSTRAINT calls_status_check
  CHECK (status IN ('ringing', 'ongoing', 'ended', 'rejected', 'missed', 'cancelled'));

-- Prevent duplicate share/repost rows from generating duplicate effects.
-- Guarded: these tables may not exist in every environment.
DO $$
BEGIN
  IF to_regclass('public.post_shares') IS NOT NULL THEN
    CREATE UNIQUE INDEX IF NOT EXISTS post_shares_post_user_unique
      ON public.post_shares(post_id, user_id);
  END IF;
  IF to_regclass('public.post_reposts') IS NOT NULL THEN
    CREATE UNIQUE INDEX IF NOT EXISTS post_reposts_post_user_unique
      ON public.post_reposts(post_id, user_id);
  END IF;
END $$;
