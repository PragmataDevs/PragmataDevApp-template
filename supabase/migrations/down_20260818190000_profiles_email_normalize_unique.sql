-- ==============================================================================
-- REVERSA de 20260818190000_profiles_email_normalize_unique.sql
-- ==============================================================================
-- Nota: el paso 1 (bajar los correos a minúsculas) NO se revierte. La
-- capitalización original no se guardó en ningún lado, así que restaurarla sería
-- inventar datos — y el lowercase es justamente lo que auth.users ya tenía, así
-- que "deshacerlo" volvería a desincronizar lo que la migración alineó.
-- ==============================================================================

BEGIN;

DROP INDEX IF EXISTS public.uq_profiles_email_active;
DROP TRIGGER IF EXISTS trg_profiles_normalize_email ON public.profiles;
DROP FUNCTION IF EXISTS public.normalize_profile_email();

COMMIT;
