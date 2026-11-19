-- Association sécurisée de produits Shop aux vidéos BAARO.
CREATE TABLE IF NOT EXISTS public.video_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id uuid NOT NULL REFERENCES public.videos(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.shop_products(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT video_products_video_product_unique UNIQUE(video_id, product_id)
);

CREATE INDEX IF NOT EXISTS video_products_video_idx
  ON public.video_products(video_id, created_at);

ALTER TABLE public.video_products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "video_products_read_available" ON public.video_products;
CREATE POLICY "video_products_read_available"
ON public.video_products FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.shop_products p
    JOIN public.shops s ON s.id = p.shop_id
    WHERE p.id = product_id AND p.is_available = true AND s.is_active = true
  )
);

DROP POLICY IF EXISTS "video_products_owner_insert" ON public.video_products;
CREATE POLICY "video_products_owner_insert"
ON public.video_products FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (SELECT 1 FROM public.videos v WHERE v.id = video_id AND v.author_id = auth.uid())
  AND EXISTS (
    SELECT 1 FROM public.shop_products p
    JOIN public.shops s ON s.id = p.shop_id
    WHERE p.id = product_id AND s.owner_id = auth.uid()
      AND s.is_active = true AND p.is_available = true
  )
  AND (SELECT count(*) FROM public.video_products vp WHERE vp.video_id = video_id) < 3
);

DROP POLICY IF EXISTS "video_products_owner_delete" ON public.video_products;
CREATE POLICY "video_products_owner_delete"
ON public.video_products FOR DELETE TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.videos v WHERE v.id = video_id AND v.author_id = auth.uid())
);

GRANT SELECT ON public.video_products TO anon, authenticated;
GRANT INSERT, DELETE ON public.video_products TO authenticated;
