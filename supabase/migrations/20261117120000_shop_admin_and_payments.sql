-- ============================================================================
-- MIGRATION: Administration shop + paiements avancés
-- Date: 2026-11-17
-- Dépend de: 20261113000000_baseline.sql
-- ============================================================================

-- ============================================================================
-- 1. AJOUT DE is_admin DANS profiles
-- ============================================================================
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_admin boolean NOT NULL DEFAULT false;

-- Trigger de protection : seul service_role peut modifier is_admin
CREATE OR REPLACE FUNCTION public.profiles_protect_admin_flag()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
begin
  if auth.role() = 'authenticated' then
    if tg_op = 'INSERT' then
      new.is_admin := false;
    else
      new.is_admin := old.is_admin;
    end if;
  end if;
  return new;
end;
$$;

DROP TRIGGER IF EXISTS trg_profiles_protect_admin ON public.profiles;
CREATE TRIGGER trg_profiles_protect_admin
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.profiles_protect_admin_flag();

-- ============================================================================
-- 2. COLONNES DE MODÉRATION DANS shops
-- ============================================================================
ALTER TABLE public.shops
  ADD COLUMN IF NOT EXISTS is_verified boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS moderation_status text DEFAULT 'pending'::text,
  ADD COLUMN IF NOT EXISTS moderation_reason text,
  ADD COLUMN IF NOT EXISTS moderated_at timestamptz,
  ADD COLUMN IF NOT EXISTS verified_at timestamptz;

-- ============================================================================
-- 3. TABLE: commissions (réutilise economy_ledger pour le reversement)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.shop_commissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  shop_id uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  total_amount numeric(12,2) NOT NULL,
  commission_rate numeric(5,4) NOT NULL DEFAULT 0.10,
  commission_amount numeric(12,2) NOT NULL,
  seller_amount numeric(12,2) NOT NULL,
  currency text NOT NULL DEFAULT 'XOF',
  status text NOT NULL DEFAULT 'pending',
  economy_ledger_id uuid,
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT shop_commissions_status_check CHECK (
    status IN ('pending', 'paid', 'failed', 'reversed')
  )
);

CREATE INDEX IF NOT EXISTS idx_shop_commissions_order ON public.shop_commissions(order_id);
CREATE INDEX IF NOT EXISTS idx_shop_commissions_shop ON public.shop_commissions(shop_id);
CREATE INDEX IF NOT EXISTS idx_shop_commissions_status ON public.shop_commissions(status);
CREATE INDEX IF NOT EXISTS idx_shop_commissions_created ON public.shop_commissions(created_at DESC);

ALTER TABLE public.shop_commissions ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 4. TABLE: refunds
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.shop_refunds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  amount numeric(12,2) NOT NULL,
  currency text NOT NULL DEFAULT 'XOF',
  status text NOT NULL DEFAULT 'pending',
  reason text,
  provider_ref text,
  requested_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT shop_refunds_status_check CHECK (
    status IN ('pending', 'processing', 'completed', 'failed')
  )
);

CREATE INDEX IF NOT EXISTS idx_shop_refunds_order ON public.shop_refunds(order_id);
CREATE INDEX IF NOT EXISTS idx_shop_refunds_status ON public.shop_refunds(status);

ALTER TABLE public.shop_refunds ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 5. TABLE: product_reports
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.shop_product_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.shop_products(id) ON DELETE CASCADE,
  reporter_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reason text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'pending',
  admin_notes text,
  handled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT shop_product_reports_status_check CHECK (
    status IN ('pending', 'reviewed', 'disabled', 'dismissed')
  ),
  CONSTRAINT shop_product_reports_reason_check CHECK (
    reason IN ('spam', 'counterfeit', 'inappropriate', 'illegal', 'other')
  )
);

CREATE INDEX IF NOT EXISTS idx_shop_product_reports_product ON public.shop_product_reports(product_id);
CREATE INDEX IF NOT EXISTS idx_shop_product_reports_status ON public.shop_product_reports(status);

ALTER TABLE public.shop_product_reports ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 6. TABLE: disputes
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.shop_disputes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reason text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'open',
  resolution text,
  admin_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT shop_disputes_status_check CHECK (
    status IN ('open', 'investigating', 'resolved', 'closed')
  ),
  CONSTRAINT shop_disputes_reason_check CHECK (
    reason IN ('not_received', 'damaged', 'wrong_item', 'not_as_described', 'other')
  ),
  CONSTRAINT shop_disputes_resolution_check CHECK (
    resolution IS NULL OR resolution IN ('refund_buyer', 'favor_seller', 'partial_refund')
  )
);

CREATE INDEX IF NOT EXISTS idx_shop_disputes_order ON public.shop_disputes(order_id);
CREATE INDEX IF NOT EXISTS idx_shop_disputes_status ON public.shop_disputes(status);

ALTER TABLE public.shop_disputes ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 7. TABLE: shop_config (configuration globale)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.shop_config (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  description text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.shop_config (key, value, description) VALUES
  ('default_commission_rate', '{"rate": 0.10}'::jsonb, 'Taux de commission BAARO par défaut (10%)'),
  ('max_orders_per_hour', '{"limit": 10}'::jsonb, 'Nombre max de commandes par heure par utilisateur'),
  ('min_order_amount', '{"amount": 100, "currency": "XOF"}'::jsonb, 'Montant minimum de commande'),
  ('max_order_amount', '{"amount": 5000000, "currency": "XOF"}'::jsonb, 'Montant maximum de commande')
ON CONFLICT (key) DO NOTHING;

ALTER TABLE public.shop_config ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 8. POLICIES RLS
-- ============================================================================

-- shop_commissions : admin + propriétaire de la boutique
CREATE POLICY "shop_commissions_admin_or_owner"
  ON public.shop_commissions FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
    OR shop_id IN (SELECT id FROM public.shops WHERE owner_id = auth.uid())
  );

CREATE POLICY "shop_commissions_admin_manage"
  ON public.shop_commissions FOR ALL
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
  );

-- shop_refunds : admin + acheteur
CREATE POLICY "shop_refunds_admin_or_buyer"
  ON public.shop_refunds FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
    OR order_id IN (SELECT id FROM public.orders WHERE buyer_id = auth.uid())
  );

CREATE POLICY "shop_refunds_admin_manage"
  ON public.shop_refunds FOR ALL
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
  );

-- shop_product_reports : tout utilisateur authentifié peut signaler
CREATE POLICY "shop_product_reports_insert"
  ON public.shop_product_reports FOR INSERT
  TO authenticated
  WITH CHECK (reporter_id = auth.uid());

CREATE POLICY "shop_product_reports_own"
  ON public.shop_product_reports FOR SELECT
  TO authenticated
  USING (reporter_id = auth.uid());

CREATE POLICY "shop_product_reports_admin"
  ON public.shop_product_reports FOR ALL
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
  );

-- shop_disputes : acheteur de la commande peut créer
CREATE POLICY "shop_disputes_insert"
  ON public.shop_disputes FOR INSERT
  TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND order_id IN (SELECT id FROM public.orders WHERE buyer_id = auth.uid())
  );

CREATE POLICY "shop_disputes_parties"
  ON public.shop_disputes FOR SELECT
  TO authenticated
  USING (
    created_by = auth.uid()
    OR order_id IN (
      SELECT id FROM public.orders
      WHERE buyer_id = auth.uid()
      OR shop_id IN (SELECT id FROM public.shops WHERE owner_id = auth.uid())
    )
  );

CREATE POLICY "shop_disputes_admin"
  ON public.shop_disputes FOR ALL
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
  );

-- shop_config : lecture publique, écriture admin uniquement
CREATE POLICY "shop_config_read"
  ON public.shop_config FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "shop_config_admin_write"
  ON public.shop_config FOR ALL
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
  );

-- Admin : accès aux tables existantes
CREATE POLICY "shops_admin_read"
  ON public.shops FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
    OR owner_id = auth.uid()
    OR is_active = true
  );

CREATE POLICY "shops_admin_manage"
  ON public.shops FOR UPDATE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
  );

-- orders : admin peut tout voir
CREATE POLICY "orders_admin_read"
  ON public.orders FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
    OR buyer_id = auth.uid()
    OR shop_id IN (SELECT id FROM public.shops WHERE owner_id = auth.uid())
  );

-- ============================================================================
-- 9. FONCTIONS RPC
-- ============================================================================

-- ============================================================================
-- cancel_order_secure : annulation avec vérification des droits
-- ============================================================================
CREATE OR REPLACE FUNCTION public.cancel_order_secure(
  p_order_id uuid,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_order public.orders;
  v_user_id uuid;
  v_is_seller boolean;
  v_is_admin boolean;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED';
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ORDER_NOT_FOUND';
  END IF;

  -- Vérifier les droits
  v_is_seller := EXISTS (
    SELECT 1 FROM public.shops
    WHERE id = v_order.shop_id AND owner_id = v_user_id
  );
  v_is_admin := EXISTS (
    SELECT 1 FROM public.profiles WHERE id = v_user_id AND is_admin = true
  );

  IF v_order.buyer_id != v_user_id AND NOT v_is_seller AND NOT v_is_admin THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED';
  END IF;

  -- Vérifier le statut
  IF v_order.status = 'delivered' THEN
    RAISE EXCEPTION 'CANNOT_CANCEL_DELIVERED';
  END IF;
  IF v_order.status = 'cancelled' THEN
    RAISE EXCEPTION 'ALREADY_CANCELLED';
  END IF;

  -- Annuler la commande
  UPDATE public.orders
  SET
    status = 'cancelled',
    payment_status = CASE
      WHEN payment_status = 'paid' THEN 'refunded'
      ELSE payment_status
    END,
    updated_at = now()
  WHERE id = p_order_id;

  -- Restaurer le stock
  UPDATE public.shop_products sp
  SET stock = stock + oi.quantity, updated_at = now()
  FROM public.order_items oi
  WHERE oi.order_id = p_order_id
    AND oi.product_id = sp.id
    AND sp.type = 'produit'
    AND sp.stock IS NOT NULL;

  -- Si payé, créer un remboursement
  IF v_order.payment_status = 'paid' THEN
    INSERT INTO public.shop_refunds (order_id, amount, currency, status, reason)
    VALUES (p_order_id, v_order.total_amount, v_order.currency, 'pending', p_reason);
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'order_id', p_order_id,
    'status', 'cancelled',
    'refund_initiated', v_order.payment_status = 'paid'
  );
END;
$$;

-- ============================================================================
-- update_order_status_secure : changement de statut avec vérification
-- ============================================================================
CREATE OR REPLACE FUNCTION public.update_order_status_secure(
  p_order_id uuid,
  p_status text
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_order public.orders;
  v_user_id uuid;
  v_is_seller boolean;
  v_is_admin boolean;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED';
  END IF;

  IF p_status NOT IN ('pending', 'confirmed', 'shipped', 'delivered', 'cancelled') THEN
    RAISE EXCEPTION 'INVALID_STATUS';
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ORDER_NOT_FOUND';
  END IF;

  v_is_seller := EXISTS (
    SELECT 1 FROM public.shops
    WHERE id = v_order.shop_id AND owner_id = v_user_id
  );
  v_is_admin := EXISTS (
    SELECT 1 FROM public.profiles WHERE id = v_user_id AND is_admin = true
  );

  IF NOT v_is_seller AND NOT v_is_admin THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED';
  END IF;

  UPDATE public.orders
  SET status = p_status, updated_at = now()
  WHERE id = p_order_id;

  RETURN jsonb_build_object(
    'success', true,
    'order_id', p_order_id,
    'status', p_status
  );
END;
$$;

-- ============================================================================
-- confirm_payment_webhook : confirmation via webhook (réutilise payment_webhook_events)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.confirm_payment_webhook(
  p_order_id uuid,
  p_provider text,
  p_provider_reference text
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_order public.orders;
  v_commission_rate numeric(5,4);
  v_commission_amount numeric(12,2);
  v_seller_amount numeric(12,2);
  v_ledger_id uuid;
  v_commission_id uuid;
BEGIN
  -- Seul service_role peut appeler (via webhook)
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'SERVICE_ROLE_REQUIRED';
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ORDER_NOT_FOUND';
  END IF;

  IF v_order.payment_status = 'paid' THEN
    RETURN jsonb_build_object('success', false, 'message', 'ALREADY_PAID');
  END IF;

  -- Marquer payé via mark_order_paid existant
  PERFORM public.mark_order_paid(p_order_id, p_provider_reference, p_provider);

  -- Récupérer le taux de commission
  SELECT COALESCE((value->>'rate')::numeric(5,4), 0.10)
  INTO v_commission_rate
  FROM public.shop_config
  WHERE key = 'default_commission_rate';

  v_commission_amount := v_order.total_amount * v_commission_rate;
  v_seller_amount := v_order.total_amount - v_commission_amount;

  -- Enregistrer la commission
  INSERT INTO public.shop_commissions (
    order_id, shop_id, total_amount, commission_rate,
    commission_amount, seller_amount, currency, status
  ) VALUES (
    p_order_id, v_order.shop_id, v_order.total_amount, v_commission_rate,
    v_commission_amount, v_seller_amount, v_order.currency, 'pending'
  ) RETURNING id INTO v_commission_id;

  -- Reversement au vendeur via economy_ledger
  IF v_order.shop_id IS NOT NULL THEN
    DECLARE
      v_merchant_id uuid;
    BEGIN
      SELECT owner_id INTO v_merchant_id FROM public.shops WHERE id = v_order.shop_id;
      IF v_merchant_id IS NOT NULL THEN
        v_ledger_id := public.record_economy_event(
          'shop-commission:' || p_order_id,
          v_merchant_id,
          'marketplace',
          ROUND(v_seller_amount * 100)::bigint,
          0,
          v_order.currency,
          p_order_id,
          jsonb_build_object(
            'provider', p_provider,
            'payment_ref', p_provider_reference,
            'commission_rate', v_commission_rate
          )
        );

        UPDATE public.shop_commissions
        SET economy_ledger_id = v_ledger_id, status = 'paid', paid_at = now()
        WHERE id = v_commission_id;
      END IF;
    END;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'order_id', p_order_id,
    'commission_id', v_commission_id,
    'commission_amount', v_commission_amount,
    'seller_amount', v_seller_amount
  );
END;
$$;

-- ============================================================================
-- admin_moderate_shop : modération admin
-- ============================================================================
CREATE OR REPLACE FUNCTION public.admin_moderate_shop(
  p_shop_id uuid,
  p_action text,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user_id uuid;
  v_is_admin boolean;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED';
  END IF;

  SELECT is_admin INTO v_is_admin FROM public.profiles WHERE id = v_user_id;
  IF NOT v_is_admin THEN
    RAISE EXCEPTION 'NOT_ADMIN';
  END IF;

  IF p_action NOT IN ('approve', 'reject', 'verify', 'unverify') THEN
    RAISE EXCEPTION 'INVALID_ACTION';
  END IF;

  IF p_action = 'approve' THEN
    UPDATE public.shops
    SET is_active = true,
        moderation_status = 'approved',
        moderation_reason = p_reason,
        moderated_at = now()
    WHERE id = p_shop_id;
  ELSIF p_action = 'reject' THEN
    UPDATE public.shops
    SET is_active = false,
        moderation_status = 'rejected',
        moderation_reason = p_reason,
        moderated_at = now()
    WHERE id = p_shop_id;
  ELSIF p_action = 'verify' THEN
    UPDATE public.shops
    SET is_verified = true, verified_at = now()
    WHERE id = p_shop_id;
  ELSIF p_action = 'unverify' THEN
    UPDATE public.shops
    SET is_verified = false, verified_at = NULL
    WHERE id = p_shop_id;
  END IF;

  RETURN jsonb_build_object('success', true, 'shop_id', p_shop_id, 'action', p_action);
END;
$$;

-- ============================================================================
-- admin_handle_product_report : traitement d'un signalement
-- ============================================================================
CREATE OR REPLACE FUNCTION public.admin_handle_product_report(
  p_report_id uuid,
  p_action text,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user_id uuid;
  v_is_admin boolean;
  v_product_id uuid;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED';
  END IF;

  SELECT is_admin INTO v_is_admin FROM public.profiles WHERE id = v_user_id;
  IF NOT v_is_admin THEN
    RAISE EXCEPTION 'NOT_ADMIN';
  END IF;

  IF p_action NOT IN ('disable', 'dismiss') THEN
    RAISE EXCEPTION 'INVALID_ACTION';
  END IF;

  SELECT product_id INTO v_product_id
  FROM public.shop_product_reports WHERE id = p_report_id;

  UPDATE public.shop_product_reports
  SET status = p_action,
      admin_notes = p_notes,
      handled_at = now()
  WHERE id = p_report_id;

  IF p_action = 'disable' AND v_product_id IS NOT NULL THEN
    UPDATE public.shop_products
    SET is_available = false
    WHERE id = v_product_id;
  END IF;

  RETURN jsonb_build_object('success', true, 'report_id', p_report_id, 'action', p_action);
END;
$$;

-- ============================================================================
-- admin_resolve_dispute : résolution d'un litige
-- ============================================================================
CREATE OR REPLACE FUNCTION public.admin_resolve_dispute(
  p_dispute_id uuid,
  p_resolution text,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user_id uuid;
  v_is_admin boolean;
  v_dispute public.shop_disputes;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED';
  END IF;

  SELECT is_admin INTO v_is_admin FROM public.profiles WHERE id = v_user_id;
  IF NOT v_is_admin THEN
    RAISE EXCEPTION 'NOT_ADMIN';
  END IF;

  IF p_resolution NOT IN ('refund_buyer', 'favor_seller', 'partial_refund') THEN
    RAISE EXCEPTION 'INVALID_RESOLUTION';
  END IF;

  SELECT * INTO v_dispute FROM public.shop_disputes WHERE id = p_dispute_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'DISPUTE_NOT_FOUND';
  END IF;

  UPDATE public.shop_disputes
  SET status = 'resolved',
      resolution = p_resolution,
      admin_notes = p_notes,
      resolved_at = now()
  WHERE id = p_dispute_id;

  -- Si remboursement, créer un refund
  IF p_resolution = 'refund_buyer' THEN
    DECLARE
      v_order public.orders;
    BEGIN
      SELECT * INTO v_order FROM public.orders WHERE id = v_dispute.order_id;
      IF v_order.payment_status = 'paid' THEN
        INSERT INTO public.shop_refunds (order_id, amount, currency, status, reason)
        VALUES (v_dispute.order_id, v_order.total_amount, v_order.currency, 'pending', 'Dispute resolution');
      END IF;
    END;
  END IF;

  RETURN jsonb_build_object('success', true, 'dispute_id', p_dispute_id, 'resolution', p_resolution);
END;
$$;

-- ============================================================================
-- GRANTS
-- ============================================================================
GRANT ALL ON TABLE public.shop_commissions TO service_role;
GRANT SELECT ON TABLE public.shop_commissions TO authenticated;

GRANT ALL ON TABLE public.shop_refunds TO service_role;
GRANT SELECT ON TABLE public.shop_refunds TO authenticated;

GRANT ALL ON TABLE public.shop_product_reports TO service_role;
GRANT ALL ON TABLE public.shop_product_reports TO authenticated;

GRANT ALL ON TABLE public.shop_disputes TO service_role;
GRANT ALL ON TABLE public.shop_disputes TO authenticated;

GRANT ALL ON TABLE public.shop_config TO service_role;
GRANT SELECT ON TABLE public.shop_config TO authenticated;

GRANT EXECUTE ON FUNCTION public.cancel_order_secure(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_order_status_secure(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_payment_webhook(uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_moderate_shop(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_handle_product_report(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_resolve_dispute(uuid, text, text) TO authenticated;
