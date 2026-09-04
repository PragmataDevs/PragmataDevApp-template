BEGIN;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    BEGIN PERFORM cron.unschedule('privacy-cleanup-anonymous-users'); EXCEPTION WHEN OTHERS THEN NULL; END;
  END IF;
END $$;
DROP FUNCTION IF EXISTS public.privacy_cleanup_anonymous_users(INTEGER);
COMMIT;
