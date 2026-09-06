BEGIN;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    BEGIN PERFORM cron.unschedule('privacy-cleanup-logs'); EXCEPTION WHEN OTHERS THEN NULL; END;
  END IF;
END $$;
DROP FUNCTION IF EXISTS public.privacy_cleanup_logs();
-- privacy_cleanup_anonymous_users vuelve a la versión de 096000 al reaplicarla (idempotente). pg_cron se conserva.
COMMIT;
