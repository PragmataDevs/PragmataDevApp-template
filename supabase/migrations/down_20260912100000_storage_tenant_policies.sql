-- Reversa de 20260912100000_storage_tenant_policies.sql
-- Restaura las policies EXACTAS que había antes (sin "mejorarlas": un down restaura).
-- Los buckets NO se eliminan: borrar un bucket con objetos es destructivo.
-- ⚠️ Al revertir vuelve el hoyo C1 (documents legible por anon). Solo para local.
BEGIN;

DROP POLICY IF EXISTS "documents_select"      ON storage.objects;
DROP POLICY IF EXISTS "documents_insert"      ON storage.objects;
DROP POLICY IF EXISTS "documents_update"      ON storage.objects;
DROP POLICY IF EXISTS "documents_delete"      ON storage.objects;
DROP POLICY IF EXISTS "attachments_select"    ON storage.objects;
DROP POLICY IF EXISTS "attachments_insert"    ON storage.objects;
DROP POLICY IF EXISTS "attachments_update"    ON storage.objects;
DROP POLICY IF EXISTS "attachments_delete"    ON storage.objects;
DROP POLICY IF EXISTS "product-images_select" ON storage.objects;
DROP POLICY IF EXISTS "product-images_insert" ON storage.objects;
DROP POLICY IF EXISTS "product-images_update" ON storage.objects;
DROP POLICY IF EXISTS "product-images_delete" ON storage.objects;

DROP FUNCTION IF EXISTS public.apply_tenant_bucket_policies(text, boolean);

-- Policies originales del schema base (20260111120000_pragmata_schema.sql:1487-1536)
CREATE POLICY "product_images_select" ON storage.objects
  FOR SELECT USING (bucket_id = 'product-images');
CREATE POLICY "product_images_insert" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'product-images' AND auth.role() = 'authenticated');
CREATE POLICY "product_images_update" ON storage.objects
  FOR UPDATE USING (bucket_id = 'product-images' AND auth.role() = 'authenticated');
CREATE POLICY "product_images_delete" ON storage.objects
  FOR DELETE USING (bucket_id = 'product-images' AND auth.role() = 'authenticated');

CREATE POLICY "documents_select" ON storage.objects
  FOR SELECT USING (bucket_id = 'documents');
CREATE POLICY "documents_insert" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'documents' AND auth.role() = 'authenticated');
CREATE POLICY "documents_update" ON storage.objects
  FOR UPDATE USING (bucket_id = 'documents' AND auth.role() = 'authenticated');
CREATE POLICY "documents_delete" ON storage.objects
  FOR DELETE USING (bucket_id = 'documents' AND auth.role() = 'authenticated');

COMMIT;
