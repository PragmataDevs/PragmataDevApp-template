-- ROLLBACK de 20260907120000_permission_sync_definer.sql
-- ⚠️ Con C4 aplicado, esto vuelve a romper el alta de usuarios y el cambio de rol
-- (`permission denied for table sys_user_permissions`).
BEGIN;
ALTER FUNCTION public.handle_permission_sync() SECURITY INVOKER;
ALTER FUNCTION public.handle_permission_sync() RESET search_path;
COMMIT;
