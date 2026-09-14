-- ============================================================================
-- Los catálogos del sistema dejan de ser legibles por anon (C3, auditoría 12-sep-2026)
-- ============================================================================
-- Antes: `sys_resources`, `sys_roles` y `sys_role_definitions` tenían
-- `FOR SELECT USING (true)` **sin cláusula TO**. Sin TO, una policy aplica a
-- todos los roles, `anon` incluido: cualquiera con la anon key y un `curl`
-- se bajaba el mapa completo de permisos del sistema — qué recursos existen,
-- qué roles hay y qué acciones concede cada uno. Es el plano de la casa.
--
-- Ahora: las mismas policies, pero `TO authenticated`. Se cierra el agujero
-- sin cambiar nada para quien ya tiene sesión.
--
-- Por qué NO se filtra por equipo: las tres tablas son catálogos GLOBALES —
-- ninguna tiene `team_id` (ver el CREATE TABLE en
-- 20260111120000_pragmata_schema.sql). Aislarlas por tenant no es una policy,
-- es un cambio de modelo (roles por equipo) y va como decisión aparte.
-- Por eso este fix NO usa `is_platform_mode()`: esa variante dejaría la
-- pantalla de Roles solo para god y rompería a los admins del cliente, sin
-- aportar aislamiento real mientras el catálogo siga siendo global.
--
-- Las policies de escritura (`Admin Write *`) no se tocan: ya exigen
-- `is_god() OR check_permission('page_settings_roles','update')`.
--
-- Quién lee estas tablas (verificado): `features/users/hooks/useUsers.ts` y
-- `features/roles/hooks/useRoles.ts`, ambas pantallas autenticadas. El sitio
-- público de `astro/` no las consulta.
--
-- Reversa: down_20260913230000_sys_catalogs_authenticated_only.sql
-- ============================================================================
BEGIN;

DROP POLICY IF EXISTS "Public Read Resources" ON public.sys_resources;
CREATE POLICY "Read Resources" ON public.sys_resources
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Public Read Roles" ON public.sys_roles;
CREATE POLICY "Read Roles" ON public.sys_roles
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Public Read RoleDefs" ON public.sys_role_definitions;
CREATE POLICY "Read RoleDefs" ON public.sys_role_definitions
  FOR SELECT TO authenticated USING (true);

COMMIT;
