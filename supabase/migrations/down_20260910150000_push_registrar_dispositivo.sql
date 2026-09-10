-- ROLLBACK de 20260910150000_push_registrar_dispositivo.sql
BEGIN;
DROP FUNCTION IF EXISTS public.push_registrar_dispositivo(TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,UUID);
DROP FUNCTION IF EXISTS public.push_desvincular_dispositivo(TEXT);
DROP FUNCTION IF EXISTS public.push_tocar_dispositivo(TEXT);
COMMIT;
