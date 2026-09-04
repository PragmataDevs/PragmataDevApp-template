-- ROLLBACK de 20260904092000_tenant_self_signup.sql
-- No borra los tenants ya creados (son datos de clientes). Quita la maquinaria.
BEGIN;
DROP FUNCTION IF EXISTS public.create_tenant(TEXT, TEXT, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.check_slug_available(TEXT);
DROP TABLE IF EXISTS public.tenant_signup_log;
-- El rol tenant_admin se conserva si algún profile lo usa (FK); si no, se borra.
DELETE FROM public.sys_role_definitions rd
USING public.sys_roles r
WHERE rd.role_id = r.id AND r.name = 'tenant_admin'
  AND NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.role_id = r.id);
DELETE FROM public.sys_roles r
WHERE r.name = 'tenant_admin'
  AND NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.role_id = r.id);
COMMIT;
