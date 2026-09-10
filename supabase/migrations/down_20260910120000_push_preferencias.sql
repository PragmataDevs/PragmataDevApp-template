-- ==============================================================================
-- ROLLBACK de 20260910120000_push_preferencias.sql
-- OJO: quitar notifications.category_code pierde el tema de los avisos ya
-- emitidos. Es reversa real, no un "por si acaso".
-- ==============================================================================
BEGIN;
DROP FUNCTION IF EXISTS public.push_debe_enviar(UUID, TEXT, TEXT);
DROP TABLE IF EXISTS public.push_preferences;
DROP TABLE IF EXISTS public.push_settings;
DROP TABLE IF EXISTS public.push_categories;
ALTER TABLE public.notifications DROP COLUMN IF EXISTS category_code;
COMMIT;
