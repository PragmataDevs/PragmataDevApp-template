-- ============================================================
-- PRAGMATA — E-Commerce Schema
-- 08_ecommerce.sql — v1.0
-- ============================================================
-- Tablas: products, orders, order_items
-- RLS: productos públicos (anon SELECT), pedidos privados.
-- ============================================================

-- 1. Products table (public catalog)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.products (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by  UUID        REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_by  UUID        REFERENCES public.profiles(id) ON DELETE SET NULL,
  version     INTEGER     NOT NULL DEFAULT 0,

  -- Taxonomy
  name        TEXT        NOT NULL,
  slug        TEXT        NOT NULL UNIQUE,
  description TEXT,
  category    TEXT,
  tags        TEXT[],

  -- Pricing
  price       NUMERIC(12,2) NOT NULL DEFAULT 0,
  compare_at_price NUMERIC(12,2),
  currency    TEXT        NOT NULL DEFAULT 'MXN',

  -- Media
  image_url   TEXT,
  images      JSONB       NOT NULL DEFAULT '[]'::jsonb,

  -- Inventory
  in_stock    BOOLEAN     NOT NULL DEFAULT true,
  stock_qty   INTEGER,

  -- Metadata
  status      TEXT        NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'deleted', 'draft')),
  metadata    JSONB       NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_products_slug   ON public.products(slug);
CREATE INDEX IF NOT EXISTS idx_products_status ON public.products(status);
CREATE INDEX IF NOT EXISTS idx_products_cat    ON public.products(category) WHERE status = 'active';

DROP TRIGGER IF EXISTS set_updated_at_products ON public.products;
CREATE TRIGGER set_updated_at_products
  BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- RLS: public read, admin write
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "products_select_public" ON public.products;
CREATE POLICY "products_select_public" ON public.products
  FOR SELECT USING (status = 'active');

DROP POLICY IF EXISTS "products_write_admin" ON public.products;
CREATE POLICY "products_write_admin" ON public.products
  FOR ALL USING (public.is_god() OR (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND access_level IN ('god', 'admin')
    )
  ));


-- 2. Orders table
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.orders (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  version           INTEGER     NOT NULL DEFAULT 0,

  -- Payment
  stripe_session_id TEXT        UNIQUE,
  stripe_payment_id TEXT,
  amount_total      NUMERIC(12,2) NOT NULL DEFAULT 0,
  currency          TEXT        NOT NULL DEFAULT 'mxn',
  order_status      TEXT        NOT NULL DEFAULT 'pending'
                    CHECK (order_status IN ('pending', 'paid', 'failed', 'refunded', 'cancelled')),
  paid_at           TIMESTAMPTZ,

  -- Customer
  customer_email    TEXT        NOT NULL,
  customer_name     TEXT,
  customer_phone    TEXT,
  customer_user_id  UUID        REFERENCES public.profiles(id) ON DELETE SET NULL,

  -- Metadata
  metadata          JSONB       NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_orders_status        ON public.orders(order_status);
CREATE INDEX IF NOT EXISTS idx_orders_customer_email ON public.orders(customer_email);
CREATE INDEX IF NOT EXISTS idx_orders_stripe_session ON public.orders(stripe_session_id) WHERE stripe_session_id IS NOT NULL;

DROP TRIGGER IF EXISTS set_updated_at_orders ON public.orders;
CREATE TRIGGER set_updated_at_orders
  BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

-- Only the webhook (service role) and god/admin can read orders
DROP POLICY IF EXISTS "orders_select" ON public.orders;
CREATE POLICY "orders_select" ON public.orders
  FOR SELECT USING (
    public.is_god()
    OR customer_user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND access_level = 'admin')
  );

DROP POLICY IF EXISTS "orders_insert_service" ON public.orders;
CREATE POLICY "orders_insert_service" ON public.orders
  FOR INSERT WITH CHECK (public.is_god());

DROP POLICY IF EXISTS "orders_update_service" ON public.orders;
CREATE POLICY "orders_update_service" ON public.orders
  FOR UPDATE USING (public.is_god());


-- 3. Order items
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.order_items (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id    UUID        NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  product_id  UUID        REFERENCES public.products(id) ON DELETE SET NULL,
  product_name TEXT       NOT NULL,
  unit_price  NUMERIC(12,2) NOT NULL,
  quantity    INTEGER     NOT NULL DEFAULT 1,
  subtotal    NUMERIC(12,2) NOT NULL
);

ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "order_items_select" ON public.order_items;
CREATE POLICY "order_items_select" ON public.order_items
  FOR SELECT USING (
    public.is_god()
    OR EXISTS (
      SELECT 1 FROM public.orders
      WHERE id = order_items.order_id AND (
        customer_user_id = auth.uid()
        OR public.is_god()
      )
    )
  );

DROP POLICY IF EXISTS "order_items_insert_service" ON public.order_items;
CREATE POLICY "order_items_insert_service" ON public.order_items
  FOR INSERT WITH CHECK (public.is_god());


-- 4. Schema reload
NOTIFY pgrst, 'reload schema';
