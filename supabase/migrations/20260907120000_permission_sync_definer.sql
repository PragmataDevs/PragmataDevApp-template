-- ============================================================================
-- permission_sync_definer — arregla el alta de usuarios rota por C4
-- ============================================================================
-- `20260826230000_security_backport_c4_c3_m1` (C4) revocó INSERT/UPDATE/DELETE
-- de `sys_user_permissions` a `authenticated` con el argumento, escrito en su
-- propio comentario, de que "el motor de sync (definer) y service_role escriben
-- saltando RLS/grants". **`handle_permission_sync()` nunca fue SECURITY DEFINER.**
--
-- Consecuencia real, reproducida el 7-sep-2026 en local y confirmada en nube:
-- cualquier admin que da de alta a un usuario de su equipo, o que le cambia el
-- rol, revienta con `permission denied for table sys_user_permissions` dentro
-- del trigger `trigger_sync_profile_role`. Lo mismo al editar un rol
-- (`trigger_sync_role_def`). El alta self-serve no lo mostraba porque
-- `create_tenant()` sí es SECURITY DEFINER y el trigger heredaba su dueño.
--
-- Fix: la función pasa a SECURITY DEFINER con `search_path` fijo (obligatorio en
-- toda definer: sin él, un search_path del llamador la vuelve explotable). No
-- cambia el cuerpo ni a quién se le sincronizan permisos: sigue derivándolos de
-- `sys_role_definitions` del rol asignado, así que no amplía el alcance de nadie.
-- La caché sigue cerrada a escritura directa desde el cliente (C4 intacto).
--
-- Idempotente. Reversa: down_20260907120000_permission_sync_definer.sql
-- ============================================================================
BEGIN;

ALTER FUNCTION public.handle_permission_sync() SECURITY DEFINER;
ALTER FUNCTION public.handle_permission_sync() SET search_path = public;

COMMIT;
