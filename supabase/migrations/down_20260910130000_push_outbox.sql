-- ==============================================================================
-- ROLLBACK de 20260910130000_push_outbox.sql
-- ==============================================================================
BEGIN;
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
        PERFORM cron.unschedule('push-purgar-inactivos');
    END IF;
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DROP TRIGGER IF EXISTS trigger_push_encolar ON public.notifications;
DROP FUNCTION IF EXISTS public.push_encolar();
DROP FUNCTION IF EXISTS public.push_token_muerto(TEXT);
DROP FUNCTION IF EXISTS public.push_purgar_inactivos(INTEGER);
DROP TABLE IF EXISTS public.push_outbox;
COMMIT;
