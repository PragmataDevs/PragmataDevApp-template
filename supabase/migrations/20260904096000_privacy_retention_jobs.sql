-- ============================================================================
-- privacy_retention_jobs — retención de datos: lo que el aviso promete, el
-- código lo cumple (docs/datos-personales.md §2.6, cuentaaparte).
-- ============================================================================
--   privacy_cleanup_anonymous_users(days) — borra auth.users anónimos viejos.
--     Es a la vez la medida de privacidad y la de costo (MAU de Supabase).
--     Patrón recomendado por la doc oficial de Supabase (auth-anonymous).
--   Si pg_cron está disponible, se agenda diario a las 04:17 UTC. Si no, la
--   función queda lista para llamarla desde un cron externo / edge schedule.
-- ⚠️ Las FKs que apunten a auth.users desde tablas de negocio deben ser
--     ON DELETE SET NULL (nunca CASCADE): borrar al comensal no borra la venta.
-- Idempotente. Reversa: down_20260904096000_privacy_retention_jobs.sql
-- ============================================================================
BEGIN;

CREATE OR REPLACE FUNCTION public.privacy_cleanup_anonymous_users(p_days INTEGER DEFAULT 30)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_count INTEGER;
BEGIN
    IF p_days < 1 THEN
        RAISE EXCEPTION 'p_days must be >= 1';
    END IF;
    WITH del AS (
        DELETE FROM auth.users
        WHERE is_anonymous IS TRUE
          AND created_at < now() - make_interval(days => p_days)
        RETURNING id
    )
    SELECT count(*) INTO v_count FROM del;
    RETURN v_count;
END;
$$;
REVOKE ALL ON FUNCTION public.privacy_cleanup_anonymous_users(INTEGER) FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    BEGIN
      PERFORM cron.unschedule('privacy-cleanup-anonymous-users');
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
    PERFORM cron.schedule('privacy-cleanup-anonymous-users', '17 4 * * *',
                          $job$SELECT public.privacy_cleanup_anonymous_users(30)$job$);
  ELSE
    RAISE NOTICE 'pg_cron no disponible: agendar privacy_cleanup_anonymous_users(30) externamente';
  END IF;
END $$;

COMMIT;
