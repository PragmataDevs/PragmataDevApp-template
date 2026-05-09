-- ============================================================
-- PRAGMATA — Products patch
-- 08b_products_patch.sql
-- ============================================================
-- Agrega updated_by (faltante de AuditBase) y crea el bucket
-- de Storage para imágenes de productos.
-- ============================================================

-- 1. Columna updated_by (alinear con AuditBase)
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

-- 2. Storage bucket: product-images (público para lectura anon)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'product-images',
  'product-images',
  true,                        -- acceso público (anon puede leer URLs)
  5242880,                     -- 5 MB por archivo
  ARRAY['image/jpeg','image/png','image/webp','image/gif','image/avif']
)
ON CONFLICT (id) DO NOTHING;

-- 3. Storage RLS — lectura pública, escritura solo autenticados
DROP POLICY IF EXISTS "product_images_select" ON storage.objects;
CREATE POLICY "product_images_select" ON storage.objects
  FOR SELECT USING (bucket_id = 'product-images');

DROP POLICY IF EXISTS "product_images_insert" ON storage.objects;
CREATE POLICY "product_images_insert" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'product-images'
    AND auth.role() = 'authenticated'
  );

DROP POLICY IF EXISTS "product_images_update" ON storage.objects;
CREATE POLICY "product_images_update" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'product-images'
    AND auth.role() = 'authenticated'
  );

DROP POLICY IF EXISTS "product_images_delete" ON storage.objects;
CREATE POLICY "product_images_delete" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'product-images'
    AND auth.role() = 'authenticated'
  );

-- 4. Reload schema cache
NOTIFY pgrst, 'reload schema';
