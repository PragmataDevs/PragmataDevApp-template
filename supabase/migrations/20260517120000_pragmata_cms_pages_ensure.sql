-- ==============================================================================
-- CMS sitio público — asegurar tabla cms_pages y dependencias
-- Idempotente: seguro en DB nuevas y en instalaciones que aplicaron un schema
-- anterior sin CMS (p. ej. solo docs/database/01 antiguo en Studio).
-- Ejecuta automáticamente con `supabase start` / `supabase migration up`.
-- Mantener alineado con docs/database/01_security_engine.sql (bloque cms_pages).
-- ==============================================================================

-- --- Tabla ---
CREATE TABLE IF NOT EXISTS public.cms_pages (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by      UUID        REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_by      UUID        REFERENCES public.profiles(id) ON DELETE SET NULL,
  version         INTEGER     NOT NULL DEFAULT 0,
  status          TEXT        NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active', 'deleted')),
  deleted_at      TIMESTAMPTZ,
  slug            TEXT        NOT NULL UNIQUE,
  internal_title  TEXT        NOT NULL DEFAULT '',
  page_kind       TEXT        NOT NULL DEFAULT 'standard'
                  CHECK (page_kind IN ('landing', 'standard')),
  is_published    BOOLEAN     NOT NULL DEFAULT false,
  seo_title       TEXT,
  seo_description TEXT,
  og_image_url    TEXT,
  content         JSONB       NOT NULL DEFAULT '{}'::jsonb,
  body_markdown   TEXT,
  CONSTRAINT cms_pages_slug_home_kind CHECK (
    slug <> 'home' OR page_kind = 'landing'
  ),
  CONSTRAINT cms_pages_slug_pattern CHECK (
    slug = 'home'
    OR slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
  )
);

ALTER TABLE public.cms_pages
  ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_cms_pages_slug_live
  ON public.cms_pages (slug)
  WHERE status = 'active';

-- --- Trigger updated_at + OCC ---
DO $$
BEGIN
  IF to_regclass('public.cms_pages') IS NOT NULL
     AND to_regprocedure('public.set_updated_at()') IS NOT NULL THEN
    EXECUTE 'DROP TRIGGER IF EXISTS trg_cms_pages_set_updated_at ON public.cms_pages';
    EXECUTE '
      CREATE TRIGGER trg_cms_pages_set_updated_at
      BEFORE UPDATE ON public.cms_pages
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()';
  END IF;
END $$;

-- --- RLS ---
ALTER TABLE public.cms_pages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cms_pages_public_select_published" ON public.cms_pages;
CREATE POLICY "cms_pages_public_select_published" ON public.cms_pages
  FOR SELECT USING (status = 'active' AND is_published = true);

DROP POLICY IF EXISTS "cms_pages_staff_select" ON public.cms_pages;
CREATE POLICY "cms_pages_staff_select" ON public.cms_pages
  FOR SELECT USING (
    public.is_god()
    OR public.check_permission('page_seo_site_pages', 'read')
  );

DROP POLICY IF EXISTS "cms_pages_staff_insert" ON public.cms_pages;
CREATE POLICY "cms_pages_staff_insert" ON public.cms_pages
  FOR INSERT WITH CHECK (
    public.is_god()
    OR public.check_permission('page_seo_site_pages', 'create')
  );

DROP POLICY IF EXISTS "cms_pages_staff_update" ON public.cms_pages;
CREATE POLICY "cms_pages_staff_update" ON public.cms_pages
  FOR UPDATE USING (
    public.is_god()
    OR public.check_permission('page_seo_site_pages', 'update')
  )
  WITH CHECK (
    public.is_god()
    OR public.check_permission('page_seo_site_pages', 'update')
  );

-- --- Recurso RBAC (catálogo) ---
INSERT INTO public.sys_resources (
  code,
  name,
  description,
  category,
  type,
  default_actions,
  resource_status,
  status
)
VALUES (
  'page_seo_site_pages',
  'Páginas del sitio (CMS)',
  'Editar landing y páginas públicas Markdown',
  'SEO',
  'page',
  ARRAY['read', 'create', 'update', 'delete']::text[],
  'active',
  'active'
)
ON CONFLICT (code) DO UPDATE SET
  name            = EXCLUDED.name,
  description     = EXCLUDED.description,
  category        = EXCLUDED.category,
  type            = EXCLUDED.type,
  default_actions = EXCLUDED.default_actions,
  resource_status = 'active',
  status          = 'active',
  updated_at      = now();

-- --- Fila inicial landing ---
INSERT INTO public.cms_pages (
  slug,
  internal_title,
  page_kind,
  is_published,
  content,
  status
)
VALUES (
  'home',
  'Landing principal',
  'landing',
  false,
  '{}'::jsonb,
  'active'
)
ON CONFLICT (slug) DO NOTHING;

-- --- Realtime (supabase_realtime) ---
DO $cms_realtime$
DECLARE
  tbl text := 'cms_pages';
BEGIN
  IF to_regclass(format('public.%I', tbl)) IS NULL THEN
    RAISE NOTICE 'cms_pages_ensure: tabla % no existe, se omite realtime', tbl;
    RETURN;
  END IF;

  EXECUTE format('ALTER TABLE public.%I REPLICA IDENTITY FULL', tbl);

  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = tbl
  ) THEN
    EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', tbl);
    RAISE NOTICE 'cms_pages_ensure: Realtime enabled for public.%', tbl;
  END IF;
END $cms_realtime$;

-- --- PowerSync (publicación opcional) ---
DO $cms_powersync$
BEGIN
  IF to_regclass('public.cms_pages') IS NULL THEN
    RETURN;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'powersync') THEN
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'powersync'
      AND schemaname = 'public'
      AND tablename = 'cms_pages'
  ) THEN
    ALTER PUBLICATION powersync ADD TABLE public.cms_pages;
    RAISE NOTICE 'cms_pages_ensure: PowerSync publication includes cms_pages';
  END IF;
END $cms_powersync$;

NOTIFY pgrst, 'reload schema';
