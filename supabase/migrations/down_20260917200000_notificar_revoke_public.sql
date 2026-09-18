-- Reversa de 20260917200000_notificar_revoke_public.sql
--
-- ⚠️ Devuelve a `anon` la capacidad de mandar notificaciones a cualquier usuario
-- o equipo sin autenticarse. No se revierte salvo que algo se haya roto y se
-- necesite aislar la causa.

BEGIN;

DO $$
DECLARE
    f RECORD;
BEGIN
    FOR f IN
        SELECT p.oid::regprocedure AS sig
          FROM pg_proc p
          JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public'
           AND p.proname IN ('notificar_a', 'notificar_equipo', 'notificar_con_permiso')
    LOOP
        EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO PUBLIC', f.sig);
    END LOOP;
END $$;

ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO PUBLIC;

COMMIT;
