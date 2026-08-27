-- Reversa de 20260826230000_security_backport_c4_c3_m1.sql
-- Restaura las policies FOR ALL originales (inseguras) y los grants.

BEGIN;

-- C4
GRANT INSERT, UPDATE, DELETE ON public.sys_user_permissions TO authenticated;
CREATE POLICY "Admin Manage Permissions" ON public.sys_user_permissions FOR ALL USING (
    public.is_god() OR public.check_permission('page_settings_usuarios', 'update')
);

-- C3 profiles
DROP POLICY IF EXISTS "God View All Profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admin Insert Team Profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admin Update Team Profiles" ON public.profiles;
CREATE POLICY "Admin Manage Profiles" ON public.profiles FOR ALL USING (
    public.is_god()
    OR id = auth.uid()
    OR public.check_permission('page_settings_usuarios', 'update')
);

-- C3 teams
DROP POLICY IF EXISTS "Admin Edit Team" ON public.teams;
CREATE POLICY "Admin Edit Team" ON public.teams FOR UPDATE USING (
    public.is_god() OR public.check_permission('page_settings_usuarios', 'update')
);

-- M1
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT INSERT, UPDATE, DELETE, TRUNCATE ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT EXECUTE ON FUNCTIONS TO anon;

COMMIT;
