-- ============================================================
-- PRAGMATA — Módulo de Documentos
-- 07_documents.sql — v1.0
-- ============================================================
-- Ejecutar DESPUÉS de 01_security_engine.sql y 04_tasks.sql.
-- Idempotente: usa IF NOT EXISTS / CREATE OR REPLACE.
-- ============================================================

-- 1. Tabla documents
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.documents (
  -- AuditBase
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at  TIMESTAMPTZ NOT NULL    DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL    DEFAULT now(),
  created_by  UUID        REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_by  UUID        REFERENCES public.profiles(id) ON DELETE SET NULL,
  version     INTEGER     NOT NULL    DEFAULT 0,
  status      TEXT        NOT NULL    DEFAULT 'active' CHECK (status IN ('active', 'deleted')),
  deleted_at  TIMESTAMPTZ,

  -- Contexto
  entity_id   UUID        REFERENCES public.entities(id) ON DELETE SET NULL,
  team_id     UUID        NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,

  -- Datos del documento
  name        TEXT        NOT NULL,
  description TEXT,
  doc_type    TEXT,                     -- 'Contrato', 'Factura', 'Reporte', etc.

  -- Storage (Supabase)
  bucket      TEXT        NOT NULL DEFAULT 'documents',
  storage_path TEXT,                    -- path dentro del bucket
  mime_type   TEXT,                     -- 'application/pdf', 'image/png', etc.
  file_size   BIGINT,                   -- bytes

  -- Estado del documento
  doc_status  TEXT        NOT NULL DEFAULT 'pending'
              CHECK (doc_status IN ('pending', 'verified', 'expired', 'rejected')),
  expires_at  TIMESTAMPTZ,

  -- Extensible
  metadata    JSONB       NOT NULL DEFAULT '{}'::jsonb
);

-- 2. Trigger set_updated_at
-- ─────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS set_updated_at_documents ON public.documents;
CREATE TRIGGER set_updated_at_documents
  BEFORE UPDATE ON public.documents
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 3. Índices
-- ─────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_documents_entity_id  ON public.documents(entity_id)
  WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_documents_team_id    ON public.documents(team_id)
  WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_documents_doc_status ON public.documents(doc_status)
  WHERE status = 'active';

-- 4. RLS
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

-- SELECT: god bypass OR miembro con acceso a la entidad
DROP POLICY IF EXISTS "documents_select" ON public.documents;
CREATE POLICY "documents_select" ON public.documents
  FOR SELECT USING (
    public.is_god()
    OR (
      team_id = (SELECT team_id FROM public.profiles WHERE id = auth.uid())
      AND (
        entity_id IS NULL
        OR EXISTS (
          SELECT 1 FROM public.sys_entity_access
          WHERE user_id = auth.uid() AND entity_id = documents.entity_id
        )
      )
    )
  );

-- INSERT: miembros autenticados de su equipo
DROP POLICY IF EXISTS "documents_insert" ON public.documents;
CREATE POLICY "documents_insert" ON public.documents
  FOR INSERT WITH CHECK (
    public.is_god()
    OR (
      auth.uid() IS NOT NULL
      AND team_id = (SELECT team_id FROM public.profiles WHERE id = auth.uid())
    )
  );

-- UPDATE: mismo equipo + check_permission o god
DROP POLICY IF EXISTS "documents_update" ON public.documents;
CREATE POLICY "documents_update" ON public.documents
  FOR UPDATE USING (
    public.is_god()
    OR (
      team_id = (SELECT team_id FROM public.profiles WHERE id = auth.uid())
      AND public.check_permission('documents', 'update', entity_id)
    )
  );

-- DELETE: no usar DELETE físico — usar soft delete via UPDATE status='deleted'
DROP POLICY IF EXISTS "documents_delete" ON public.documents;
CREATE POLICY "documents_delete" ON public.documents
  FOR DELETE USING (public.is_god());

-- 5. Storage bucket (ejecutar en Dashboard o via CLI si aún no existe)
-- ─────────────────────────────────────────────────────────────
-- CREATE POLICY "documents_bucket_read" ...
-- Nota: los buckets se crean desde el Dashboard de Supabase → Storage.
-- Nombre recomendado: "documents" (privado, con signed URLs)

-- 6. Recargar schema cache de PostgREST
-- ─────────────────────────────────────────────────────────────
NOTIFY pgrst, 'reload schema';
