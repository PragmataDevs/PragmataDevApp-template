-- ============================================================================
-- Storage por tema con aislamiento por equipo (C1 de la auditoría 12-sep-2026)
-- ============================================================================
-- Antes: el bucket `documents` era legible por anon y escribible entre tenants
-- (policies sin TO ni team), y `attachments` (avatares, chat, imágenes de
-- entidad) no existía en ninguna migración. Ahora:
--
--   * Los 3 buckets del template se DECLARAN aquí (no dependen de Studio ni de
--     scripts): documents (privado), attachments (privado), product-images (público).
--   * Patrón canónico: el path SIEMPRE empieza con el team_id → `<team_id>/...`.
--     Las 4 policies se atan a ese prefijo, con is_god() primero (mandamiento 6.6).
--   * `apply_tenant_bucket_policies(bucket, public_read)` es la única forma de
--     permisar un bucket. Un bucket nuevo por tema (contracts, invoices…) es:
--       SELECT public.apply_tenant_bucket_policies('contracts', false);
--
-- createSignedUrl respeta la policy de SELECT: nadie firma paths de otro equipo.
-- Reversa: down_20260912100000_storage_tenant_policies.sql
-- ============================================================================
BEGIN;

-- 1. Buckets declarados (idempotente)
INSERT INTO storage.buckets (id, name, public)
VALUES ('documents', 'documents', false),
       ('attachments', 'attachments', false),
       ('product-images', 'product-images', true)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public;

-- 2. El patrón
CREATE OR REPLACE FUNCTION public.apply_tenant_bucket_policies(bucket_name text, public_read boolean DEFAULT false)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  -- god ve todo; el resto solo la carpeta de su equipo (primer folder del path)
  owner_check text := '(public.is_god() OR (storage.foldername(name))[1] = public.get_my_team_id()::text)';
BEGIN
  EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', bucket_name || '_select');
  EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', bucket_name || '_insert');
  EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', bucket_name || '_update');
  EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', bucket_name || '_delete');

  IF public_read THEN
    EXECUTE format('CREATE POLICY %I ON storage.objects FOR SELECT USING (bucket_id = %L)',
                   bucket_name || '_select', bucket_name);
  ELSE
    EXECUTE format('CREATE POLICY %I ON storage.objects FOR SELECT TO authenticated USING (bucket_id = %L AND %s)',
                   bucket_name || '_select', bucket_name, owner_check);
  END IF;

  EXECUTE format('CREATE POLICY %I ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = %L AND %s)',
                 bucket_name || '_insert', bucket_name, owner_check);
  EXECUTE format('CREATE POLICY %I ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = %L AND %s) WITH CHECK (bucket_id = %L AND %s)',
                 bucket_name || '_update', bucket_name, owner_check, bucket_name, owner_check);
  EXECUTE format('CREATE POLICY %I ON storage.objects FOR DELETE TO authenticated USING (bucket_id = %L AND %s)',
                 bucket_name || '_delete', bucket_name, owner_check);
END;
$$;

COMMENT ON FUNCTION public.apply_tenant_bucket_policies(text, boolean) IS
  'Permisa un bucket por tema con aislamiento por team_id (prefijo del path). public_read=true deja la lectura abierta (catálogos).';

-- 3. Las policies viejas de product-images tenían otro nombre (product_images_*)
DROP POLICY IF EXISTS "product_images_select" ON storage.objects;
DROP POLICY IF EXISTS "product_images_insert" ON storage.objects;
DROP POLICY IF EXISTS "product_images_update" ON storage.objects;
DROP POLICY IF EXISTS "product_images_delete" ON storage.objects;

-- 4. Aplicar el patrón a los 3 buckets del template
SELECT public.apply_tenant_bucket_policies('documents',      false);
SELECT public.apply_tenant_bucket_policies('attachments',    false);
SELECT public.apply_tenant_bucket_policies('product-images', true);

COMMIT;
