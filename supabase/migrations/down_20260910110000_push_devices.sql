-- ==============================================================================
-- ROLLBACK de 20260910110000_push_devices.sql
-- Prefijo down_ para que el CLI no lo tome como migración.
-- ==============================================================================
BEGIN;
DROP TRIGGER IF EXISTS trg_push_devices_set_updated_at ON public.push_devices;
DROP TABLE IF EXISTS public.push_devices;   -- índices y policies se van con ella
COMMIT;
