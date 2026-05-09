-- ============================================================
-- PRAGMATA — Products SEO fields (catálogo público)
-- 08c_products_seo.sql
-- ============================================================
-- Campos opcionales editables desde el ERP para meta title/description
-- e imagen Open Graph distinta a la imagen principal del producto.
-- La ficha Astro usa fallback a name / description / image_url si van NULL.
-- ============================================================

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS seo_title TEXT,
  ADD COLUMN IF NOT EXISTS seo_description TEXT,
  ADD COLUMN IF NOT EXISTS seo_image_url TEXT;

COMMENT ON COLUMN public.products.seo_title IS 'Meta <title> principal (sin sufijo de marca; BaseLayout añade marca). Opcional.';
COMMENT ON COLUMN public.products.seo_description IS 'Meta description / OG description. Opcional.';
COMMENT ON COLUMN public.products.seo_image_url IS 'OG/Twitter image absoluta https. Opcional; si NULL usa image_url.';

NOTIFY pgrst, 'reload schema';
