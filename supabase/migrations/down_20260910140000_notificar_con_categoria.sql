-- ==============================================================================
-- ROLLBACK de 20260910140000_notificar_con_categoria.sql
-- Vuelve a las firmas de 6 argumentos: reaplicar 20260910100000_notificar_evento.sql
-- después de correr esto, o los triggers que llamen a los emisores truenan.
-- ==============================================================================
BEGIN;
DROP FUNCTION IF EXISTS public.notificar_con_permiso(TEXT, TEXT, UUID, TEXT, TEXT, TEXT, TEXT, UUID, TEXT);
DROP FUNCTION IF EXISTS public.notificar_equipo(UUID, TEXT, TEXT, TEXT, TEXT, UUID, TEXT);
DROP FUNCTION IF EXISTS public.notificar_a(UUID, TEXT, TEXT, TEXT, TEXT, UUID, TEXT);
COMMIT;
