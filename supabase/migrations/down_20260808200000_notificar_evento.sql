-- ==============================================================================
-- ROLLBACK de 20260808200000_notificar_evento.sql
-- Quita los emisores. Los triggers que los invoquen en cada cliente truenan,
-- así que primero se quitan esos. Prefijo down_ para que el CLI no lo tome.
-- ==============================================================================
BEGIN;
DROP FUNCTION IF EXISTS public.notificar_con_permiso(TEXT, TEXT, UUID, TEXT, TEXT, TEXT, TEXT, UUID);
DROP FUNCTION IF EXISTS public.notificar_equipo(UUID, TEXT, TEXT, TEXT, TEXT, UUID);
DROP FUNCTION IF EXISTS public.notificar_a(UUID, TEXT, TEXT, TEXT, TEXT, UUID);
COMMIT;
