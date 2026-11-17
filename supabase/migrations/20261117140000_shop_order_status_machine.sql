-- ============================================================================
-- MIGRATION: Machine à états stricte pour update_order_status_secure
-- Empêche les transitions illégales (pending→delivered, annulation sans remboursement, etc.)
-- Date: 2026-11-17
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

  -- MACHINE À ÉTATS STRICTE
  IF v_order.status = 'delivered' THEN
    RAISE EXCEPTION 'ORDER_ALREADY_DELIVERED_USE_DISPUTE';
  END IF;

  IF v_order.status = 'cancelled' THEN
    RAISE EXCEPTION 'ORDER_ALREADY_CANCELLED';
  END IF;

  -- Une commande payée ne peut PAS être annulée via cette fonction
  -- (utiliser cancel_order_secure pour déclencher le remboursement)
  IF v_order.payment_status = 'paid' AND p_status = 'cancelled' THEN
    RAISE EXCEPTION 'CANNOT_CANCEL_PAID_ORDER_USE_REFUND';
  END IF;

  -- Transitions autorisées
  IF v_order.status = 'pending' AND p_status NOT IN ('confirmed', 'cancelled') THEN
    RAISE EXCEPTION 'INVALID_TRANSITION_FROM_PENDING';
  END IF;

  IF v_order.status = 'confirmed' AND p_status NOT IN ('shipped', 'delivered', 'cancelled') THEN
    RAISE EXCEPTION 'INVALID_TRANSITION_FROM_CONFIRMED';
  END IF;

  IF v_order.status = 'shipped' AND p_status != 'delivered' THEN
    RAISE EXCEPTION 'INVALID_TRANSITION_FROM_SHIPPED';
  END IF;

  -- Si annulation depuis pending, restaurer le stock
  IF v_order.status = 'pending' AND p_status = 'cancelled' THEN
    UPDATE public.shop_products sp
    SET stock = stock + oi.quantity, updated_at = now()
    FROM public.order_items oi
    WHERE oi.order_id = p_order_id
      AND oi.product_id = sp.id
      AND sp.type = 'produit'
      AND sp.stock IS NOT NULL;
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

GRANT EXECUTE ON FUNCTION public.update_order_status_secure(uuid, text) TO authenticated;
