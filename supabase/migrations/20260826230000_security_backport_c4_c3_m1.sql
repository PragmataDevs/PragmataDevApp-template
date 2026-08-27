-- ==============================================================================
-- security_backport_c4_c3_m1.sql
-- Backport de la auditoría de crm-objetiva (26-ago-2026) al template. Cierra tres
-- hoyos que TODO cliente instanciado heredó del schema base:
--
-- C4 — sys_user_permissions escribible por admin: "Admin Manage Permissions" era
--   FOR ALL con predicado por usuario (check_permission) y sin WITH CHECK → quien
--   tuviera page_settings_usuarios:update se auto-otorgaba los 30 recursos con un
--   INSERT a la caché que lee check_permission. Ahora la caché solo la escribe el
--   motor (trigger definer) + service_role; authenticated solo lee lo suyo.
--   ⚠️ REQUIERE el cambio de front que lo acompaña (permisos SOLO por rol): el
--   panel de usuarios ya no escribe la caché directo. Ver useUsers/UserFormModal.
--
-- C3 — profiles/teams editable/borrable cross-team: "Admin Manage Profiles" y
--   "Admin Edit Team" eran FOR ALL sin WITH CHECK de fila → un admin de cualquier
--   equipo editaba/borraba perfiles de otros equipos y renombraba cualquier team.
--   Ahora: admin CREATE/UPDATE solo dentro de su team; god (platform owner) ve y
--   gestiona todos; SIN policy de DELETE (baja lógica por profile_status). El
--   trigger anti-escalada ya protege is_god/is_platform_owner (no se toca).
--   NOTA multi-tenant: en un cliente donde un equipo "operador" deba gestionar a
--   los demás sin ser platform_owner, ver el patrón manages_all_teams de
--   crm-objetiva (20260826170000) — NO se incluye aquí por ser caso específico.
--
-- M1 — pg_default_acl le da a anon write sobre objetos nuevos: raíz sistémica que
--   hace nacer expuesto cada CREATE VIEW/FUNCTION. Se revoca en el default del rol
--   de migraciones (postgres). Solo afecta objetos FUTUROS.
--
-- Reversa: supabase/migrations/down_20260826230000_security_backport_c4_c3_m1.sql
-- ==============================================================================

BEGIN;

-- ── C4: cerrar la caché de permisos a escritura directa ──────────────────────
DROP POLICY IF EXISTS "Admin Manage Permissions" ON public.sys_user_permissions;
REVOKE INSERT, UPDATE, DELETE ON public.sys_user_permissions FROM anon, authenticated;
-- "Sync Own Permissions" (SELECT propio) se conserva; el motor de sync (definer)
-- y service_role escriben saltando RLS/grants.

-- ── C3: profiles por fila ────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admin Manage Profiles" ON public.profiles;

CREATE POLICY "God View All Profiles" ON public.profiles
    FOR SELECT USING (public.is_god());

CREATE POLICY "Admin Insert Team Profiles" ON public.profiles
    FOR INSERT WITH CHECK (
        public.is_god()
        OR (public.check_permission('page_settings_usuarios', 'create')
            AND team_id = public.get_my_team_id())
    );

CREATE POLICY "Admin Update Team Profiles" ON public.profiles
    FOR UPDATE USING (
        public.is_god()
        OR (public.check_permission('page_settings_usuarios', 'update')
            AND team_id = public.get_my_team_id())
    ) WITH CHECK (
        public.is_god()
        OR (public.check_permission('page_settings_usuarios', 'update')
            AND team_id = public.get_my_team_id())
    );
-- Sin policy de DELETE: nadie borra perfiles desde la app (baja por profile_status).

-- ── C3: teams — admin edita solo su propio equipo ────────────────────────────
DROP POLICY IF EXISTS "Admin Edit Team" ON public.teams;
CREATE POLICY "Admin Edit Team" ON public.teams
    FOR UPDATE USING (
        public.is_god()
        OR (public.check_permission('page_settings_usuarios', 'update')
            AND id = public.get_my_team_id())
    ) WITH CHECK (
        public.is_god()
        OR (public.check_permission('page_settings_usuarios', 'update')
            AND id = public.get_my_team_id())
    );

-- ── M1: que nada nuevo nazca con write de anon ───────────────────────────────
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLES FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    REVOKE EXECUTE ON FUNCTIONS FROM anon;

COMMIT;
