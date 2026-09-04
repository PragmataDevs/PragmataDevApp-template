-- ============================================================================
-- platform_owner_visibility — el team is_platform_owner ve a los demás teams
-- ============================================================================
-- Modelo canónico de permisos (~/PragmataDevs/CLAUDE.md): "is_platform_owner
-- (team): ¿este equipo gestiona el proyecto completo? Si sí, ve la info de
-- TODOS los equipos participantes". Hasta hoy solo `entities` lo cumplía; el
-- dashboard de plataforma solo servía a god. Se extiende a las tablas que el
-- operador de la plataforma necesita leer, acotado a **admins** del team
-- platform owner (member del team plataforma no ve tenants ajenos: mínimo
-- privilegio, y el acceso interno además se registra en god_access_log).
--
-- Mono-tenant: el único team ES el platform owner → cero cambio.
-- Solo SELECT. Ninguna escritura cruzada.
-- Idempotente. Reversa: down_20260904098000_platform_owner_visibility.sql
-- ============================================================================
BEGIN;

CREATE OR REPLACE FUNCTION public.is_platform_owner_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.profiles p
        JOIN public.teams t ON t.id = p.team_id
        WHERE p.id = auth.uid()
          AND p.access_level IN ('admin','god')
          AND p.profile_status = 'active' AND p.status = 'active'
          AND t.is_platform_owner = TRUE
    );
$$;
GRANT EXECUTE ON FUNCTION public.is_platform_owner_admin() TO authenticated;
REVOKE EXECUTE ON FUNCTION public.is_platform_owner_admin() FROM anon;

DROP POLICY IF EXISTS "Platform Owner View Teams" ON public.teams;
CREATE POLICY "Platform Owner View Teams" ON public.teams
  FOR SELECT TO authenticated USING (public.is_platform_owner_admin());

DROP POLICY IF EXISTS "Platform Owner View Profiles" ON public.profiles;
CREATE POLICY "Platform Owner View Profiles" ON public.profiles
  FOR SELECT TO authenticated USING (public.is_platform_owner_admin());

DROP POLICY IF EXISTS "Platform Owner View Subscriptions" ON public.team_subscriptions;
CREATE POLICY "Platform Owner View Subscriptions" ON public.team_subscriptions
  FOR SELECT TO authenticated USING (public.is_platform_owner_admin());

DROP POLICY IF EXISTS "Platform Owner View AI Usage" ON public.ai_usage;
CREATE POLICY "Platform Owner View AI Usage" ON public.ai_usage
  FOR SELECT TO authenticated USING (public.is_platform_owner_admin());

DROP POLICY IF EXISTS "Platform Owner View Signup Log" ON public.tenant_signup_log;
CREATE POLICY "Platform Owner View Signup Log" ON public.tenant_signup_log
  FOR SELECT TO authenticated USING (public.is_platform_owner_admin());

DROP POLICY IF EXISTS "Platform Owner View Billing Events" ON public.billing_events;
CREATE POLICY "Platform Owner View Billing Events" ON public.billing_events
  FOR SELECT TO authenticated USING (public.is_platform_owner_admin());

DROP POLICY IF EXISTS "Platform Owner View God Access Log" ON public.god_access_log;
CREATE POLICY "Platform Owner View God Access Log" ON public.god_access_log
  FOR SELECT TO authenticated USING (public.is_platform_owner_admin());

COMMIT;
