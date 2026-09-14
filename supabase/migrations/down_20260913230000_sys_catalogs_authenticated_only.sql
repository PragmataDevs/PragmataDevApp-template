-- Reversa de 20260913230000_sys_catalogs_authenticated_only.sql
-- Restaura las policies EXACTAS que había antes, sin "mejorarlas" (mandamiento 6.13).
-- ⚠️ Al revertir vuelve el hoyo C3: el mapa de permisos queda legible por anon.
--    Solo para un local desechable.
BEGIN;

DROP POLICY IF EXISTS "Read Resources" ON public.sys_resources;
CREATE POLICY "Public Read Resources" ON public.sys_resources FOR SELECT USING (true);

DROP POLICY IF EXISTS "Read Roles" ON public.sys_roles;
CREATE POLICY "Public Read Roles" ON public.sys_roles FOR SELECT USING (true);

DROP POLICY IF EXISTS "Read RoleDefs" ON public.sys_role_definitions;
CREATE POLICY "Public Read RoleDefs" ON public.sys_role_definitions FOR SELECT USING (true);

COMMIT;
