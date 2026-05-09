-- ============================================================
-- PRAGMATA — Páginas del sitio público (CMS ligero)
-- 09_cms_pages.sql
-- ============================================================
-- Landing editable (`slug = home`) + páginas Markdown (`slug` único).
-- Astro usa anon SELECT solo si status = active e is_published.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.cms_pages (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by  UUID        REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_by  UUID        REFERENCES public.profiles(id) ON DELETE SET NULL,
  version     INTEGER     NOT NULL DEFAULT 0,

  status      TEXT        NOT NULL DEFAULT 'active'
              CHECK (status IN ('active', 'deleted')),
  deleted_at  TIMESTAMPTZ,

  slug        TEXT        NOT NULL UNIQUE,
  internal_title TEXT     NOT NULL DEFAULT '',
  page_kind   TEXT        NOT NULL DEFAULT 'standard'
              CHECK (page_kind IN ('landing', 'standard')),
  is_published BOOLEAN    NOT NULL DEFAULT false,

  seo_title       TEXT,
  seo_description TEXT,
  og_image_url    TEXT,

  content       JSONB       NOT NULL DEFAULT '{}'::jsonb,
  body_markdown TEXT,

  CONSTRAINT cms_pages_slug_home_kind CHECK (
    slug <> 'home' OR page_kind = 'landing'
  ),
  CONSTRAINT cms_pages_slug_pattern CHECK (
    slug = 'home'
    OR slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
  )
);

CREATE INDEX IF NOT EXISTS idx_cms_pages_slug_live
  ON public.cms_pages (slug)
  WHERE status = 'active';

DROP TRIGGER IF EXISTS set_updated_at_cms_pages ON public.cms_pages;
CREATE TRIGGER set_updated_at_cms_pages
  BEFORE UPDATE ON public.cms_pages
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.cms_pages ENABLE ROW LEVEL SECURITY;

-- Sitio público (anon + JWT): solo filas publicadas activas
DROP POLICY IF EXISTS "cms_pages_select_published" ON public.cms_pages;
DROP POLICY IF EXISTS "cms_pages_public_select_published" ON public.cms_pages;
CREATE POLICY "cms_pages_public_select_published" ON public.cms_pages
  FOR SELECT USING (status = 'active' AND is_published = true);

-- ERP: borradores + CRUD — recurso `page_seo_site_pages` (god/admin/member con permiso)
DROP POLICY IF EXISTS "cms_pages_staff_all" ON public.cms_pages;
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

NOTIFY pgrst, 'reload schema';
