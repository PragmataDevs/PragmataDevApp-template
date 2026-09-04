BEGIN;
DROP FUNCTION IF EXISTS public.end_god_access(UUID);
DROP FUNCTION IF EXISTS public.log_god_access(UUID, TEXT, JSONB);
DROP TABLE IF EXISTS public.god_access_log;
COMMIT;
