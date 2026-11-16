ALTER TABLE public.calls DROP CONSTRAINT IF EXISTS calls_status_check;
ALTER TABLE public.calls ADD CONSTRAINT calls_status_check
  CHECK (status = ANY (ARRAY['ringing','ongoing','ended','rejected','missed','cancelled']));
