-- Reversa de 20260917210000_revoke_execute_public.sql
--
-- ⚠️ Vuelve a abrir a PUBLIC todas las funciones del esquema, incluidas ~32
-- SECURITY DEFINER. Cualquiera con la llave pública de la app podría llamarlas
-- sin autenticarse. Solo para aislar una causa, nunca como estado final.

BEGIN;

GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO PUBLIC;

COMMIT;
