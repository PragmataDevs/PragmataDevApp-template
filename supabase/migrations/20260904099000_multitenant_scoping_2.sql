-- ============================================================================
-- multitenant_scoping_2 — cierra los hallazgos de la auditoría de Cancerbero
-- (cuentaaparte/docs/auditoria-cancerbero-hito0.md, 4-5 sep 2026)
-- ============================================================================
-- Patrón raíz: check_permission() de 2 argumentos devuelve TRUE a cualquier admin
-- sin mirar el team. En mono-tenant el alcance era "todo"; en modo plataforma cada
-- policy que lo use sin team_id es una fuga entre tenants. Cada fix es idéntico
-- en comportamiento para clientes mono-tenant.
--
--   C1 tasks        acotadas al team (helper entity_in_my_team)
--   C2 sys_entity_access  team_id + WITH CHECK explícito
--   C3 catálogo RBAC (sys_roles/sys_resources/sys_role_definitions): en modo
--      plataforma solo god escribe; apagado → igual que antes
--   A1 slug de teams validado también en UPDATE (aab_guard_team_slug)
--   A2 notificaciones y adjuntos solo a destinatarios del propio team;
--      task_comments_delete acotado a la entity del team
--   check_permission: la rama admin con contexto fuera de su team devuelve FALSE
--      (antes caía al bloque MEMBER)
--   A3 ai_can_run fail-closed (feature sin fila en plan_limits → negado en modo
--      plataforma) + tope diario por team (platform_settings.ai_team_daily_budget_usd)
--
-- Idempotente. Reversa: down_20260904099000_multitenant_scoping_2.sql
-- ============================================================================
BEGIN;

-- ── Helper ───────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.entity_in_my_team(p_entity UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.entities e
    WHERE e.id = p_entity AND e.team_id = public.get_my_team_id()
  );
$$;
GRANT EXECUTE ON FUNCTION public.entity_in_my_team(UUID) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.entity_in_my_team(UUID) FROM anon;

-- ── check_permission: sin fall-through de admin ──────────────────────────────
-- Único cambio respecto al schema base: `RETURN FALSE;` tras la rama admin con
-- context_project_id. Se respeta la regla "no se modifica" en cuanto a firma y
-- semántica; esto corrige un bug de alcance, no agrega reglas.
CREATE OR REPLACE FUNCTION public.check_permission(
    requested_resource TEXT,
    requested_action   TEXT,
    context_project_id UUID DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
    current_uid  UUID := auth.uid();
    user_profile public.profiles%ROWTYPE;
    has_action   BOOLEAN;
BEGIN
    IF current_uid IS NULL THEN RETURN FALSE; END IF;

    SELECT * INTO user_profile FROM public.profiles WHERE id = current_uid;
    IF NOT FOUND THEN RETURN FALSE; END IF;

    IF user_profile.profile_status <> 'active' OR user_profile.status <> 'active' THEN
        RETURN FALSE;
    END IF;

    -- GOD: bypass total
    IF user_profile.access_level = 'god' THEN
        IF EXISTS (SELECT 1 FROM public.teams WHERE id = user_profile.team_id AND is_platform_owner = TRUE) THEN
            RETURN TRUE;
        END IF;
    END IF;

    -- ADMIN: acceso total en su propio equipo; fuera de él, NO (antes caía a MEMBER)
    IF user_profile.access_level = 'admin' THEN
        IF context_project_id IS NOT NULL THEN
            RETURN EXISTS (
                SELECT 1 FROM public.entities
                WHERE id = context_project_id AND team_id = user_profile.team_id
            );
        END IF;
        RETURN TRUE;
    END IF;

    -- MEMBER: whitelist de entidad + permisos granulares
    IF context_project_id IS NOT NULL THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.sys_entity_access
            WHERE user_id = current_uid AND entity_id = context_project_id
        ) THEN
            RETURN FALSE;
        END IF;
    END IF;

    SELECT TRUE INTO has_action
    FROM public.sys_user_permissions
    WHERE user_id = current_uid
      AND resource_code = requested_resource
      AND granted_actions @> ARRAY[requested_action]::text[];

    RETURN COALESCE(has_action, FALSE);
END;
$$;

-- ── C1: tasks ────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "tasks_select" ON public.tasks;
CREATE POLICY "tasks_select" ON public.tasks FOR SELECT USING (
  public.is_god() OR (status = 'active' AND public.entity_in_my_team(entity_id) AND (
     entity_id IN (SELECT entity_id FROM public.sys_entity_access WHERE user_id = auth.uid())
     OR public.check_permission('page_workspace_tasks', 'read')))
);
DROP POLICY IF EXISTS "tasks_insert" ON public.tasks;
CREATE POLICY "tasks_insert" ON public.tasks FOR INSERT WITH CHECK (
  public.is_god() OR (created_by = auth.uid() AND public.entity_in_my_team(entity_id) AND (
     entity_id IN (SELECT entity_id FROM public.sys_entity_access WHERE user_id = auth.uid())
     OR public.check_permission('page_workspace_tasks', 'create')))
);
DROP POLICY IF EXISTS "tasks_update" ON public.tasks;
CREATE POLICY "tasks_update" ON public.tasks FOR UPDATE USING (
  public.is_god() OR (public.entity_in_my_team(entity_id) AND (
     created_by = auth.uid() OR assigned_to = auth.uid()
     OR public.check_permission('page_workspace_tasks', 'update', entity_id)))
) WITH CHECK (public.is_god() OR public.entity_in_my_team(entity_id));
DROP POLICY IF EXISTS "tasks_delete" ON public.tasks;
CREATE POLICY "tasks_delete" ON public.tasks FOR DELETE USING (
  public.is_god() OR (public.entity_in_my_team(entity_id)
    AND public.check_permission('page_workspace_tasks', 'delete', entity_id))
);
DROP POLICY IF EXISTS "task_comments_delete" ON public.task_comments;
CREATE POLICY "task_comments_delete" ON public.task_comments FOR DELETE USING (
  public.is_god()
  OR created_by = auth.uid()
  OR EXISTS (
       SELECT 1 FROM public.tasks t
       WHERE t.id = task_comments.task_id
         AND public.entity_in_my_team(t.entity_id)
         AND public.check_permission('page_workspace_tasks', 'delete', t.entity_id))
);

-- ── C2: sys_entity_access ────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admin Manage Entity Access" ON public.sys_entity_access;
CREATE POLICY "Admin Manage Entity Access" ON public.sys_entity_access FOR ALL
  USING (public.is_god() OR (team_id = public.get_my_team_id()
         AND public.check_permission('page_settings_entities', 'update')))
  WITH CHECK (public.is_god() OR (team_id = public.get_my_team_id()
         AND public.entity_in_my_team(entity_id)
         AND public.check_permission('page_settings_entities', 'update')));

-- ── C3: catálogo RBAC global ─────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admin Write Roles" ON public.sys_roles;
CREATE POLICY "Admin Write Roles" ON public.sys_roles FOR ALL
  USING (public.is_god() OR (NOT public.is_platform_mode() AND public.check_permission('page_settings_roles', 'update')))
  WITH CHECK (public.is_god() OR (NOT public.is_platform_mode() AND public.check_permission('page_settings_roles', 'update')));
DROP POLICY IF EXISTS "Admin Write Resources" ON public.sys_resources;
CREATE POLICY "Admin Write Resources" ON public.sys_resources FOR ALL
  USING (public.is_god() OR (NOT public.is_platform_mode() AND public.check_permission('page_settings_roles', 'update')))
  WITH CHECK (public.is_god() OR (NOT public.is_platform_mode() AND public.check_permission('page_settings_roles', 'update')));
DROP POLICY IF EXISTS "Admin Write RoleDefs" ON public.sys_role_definitions;
CREATE POLICY "Admin Write RoleDefs" ON public.sys_role_definitions FOR ALL
  USING (public.is_god() OR (NOT public.is_platform_mode() AND public.check_permission('page_settings_roles', 'update')))
  WITH CHECK (public.is_god() OR (NOT public.is_platform_mode() AND public.check_permission('page_settings_roles', 'update')));

-- ── A2: notificaciones y adjuntos dentro del team ────────────────────────────
DROP POLICY IF EXISTS "Send Direct Notification" ON public.notifications;
CREATE POLICY "Send Direct Notification" ON public.notifications FOR INSERT WITH CHECK (
  public.is_god() OR (sender_id = auth.uid()
    AND public.check_permission('feature_notifications_send', 'create')
    AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = recipient_id AND p.team_id = public.get_my_team_id()))
);
DROP POLICY IF EXISTS "Insert Notification Attachments" ON public.notification_attachments;
CREATE POLICY "Insert Notification Attachments" ON public.notification_attachments FOR INSERT WITH CHECK (
  public.is_god() OR (public.check_permission('feature_notifications_send', 'create') AND (
    (notification_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.notifications n JOIN public.profiles p ON p.id = n.recipient_id
        WHERE n.id = notification_id AND p.team_id = public.get_my_team_id()))
    OR (broadcast_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.notification_broadcasts b WHERE b.id = broadcast_id AND b.sender_id = auth.uid()))
  ))
);

-- ── A1: slug validado también en UPDATE ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.enforce_team_slug_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.slug IS NOT DISTINCT FROM OLD.slug THEN RETURN NEW; END IF;
  IF public.is_god() OR auth.uid() IS NULL THEN RETURN NEW; END IF;
  NEW.slug := lower(trim(NEW.slug));
  IF NOT (public.check_slug_available(NEW.slug)->>'available')::boolean THEN
    RAISE EXCEPTION 'slug_not_available: %', NEW.slug USING ERRCODE = '23505';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS aab_guard_team_slug ON public.teams;
CREATE TRIGGER aab_guard_team_slug BEFORE INSERT OR UPDATE OF slug ON public.teams
  FOR EACH ROW EXECUTE FUNCTION public.enforce_team_slug_guard();

-- ── A3: IA fail-closed + tope por team ───────────────────────────────────────
ALTER TABLE public.platform_settings
  ADD COLUMN IF NOT EXISTS ai_team_daily_budget_usd NUMERIC(8,2) NOT NULL DEFAULT 0.50 CHECK (ai_team_daily_budget_usd >= 0);

CREATE OR REPLACE FUNCTION public.ai_can_run(p_feature TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
    v_uid        UUID := auth.uid();
    v_settings   public.platform_settings%ROWTYPE;
    v_team       UUID;
    v_month_used INTEGER;
    v_limit      INTEGER;
    v_has_limit  BOOLEAN;
    v_today_usd  NUMERIC;
    v_team_usd   NUMERIC;
    v_privileged BOOLEAN;
BEGIN
    SELECT * INTO v_settings FROM public.platform_settings WHERE id = 1;

    IF NOT COALESCE(v_settings.ai_enabled, FALSE) THEN
        RETURN jsonb_build_object('allowed', FALSE, 'reason', 'ai_disabled');
    END IF;
    IF v_uid IS NULL THEN
        RETURN jsonb_build_object('allowed', FALSE, 'reason', 'not_authenticated');
    END IF;
    IF COALESCE((auth.jwt()->>'is_anonymous')::boolean, FALSE) THEN
        RETURN jsonb_build_object('allowed', FALSE, 'reason', 'anonymous_not_allowed');
    END IF;
    IF p_feature IS NULL OR p_feature !~ '^[a-z_]{2,40}$' THEN
        RETURN jsonb_build_object('allowed', FALSE, 'reason', 'feature_invalid');
    END IF;

    v_team := public.get_my_team_id();
    IF v_team IS NULL THEN
        RETURN jsonb_build_object('allowed', FALSE, 'reason', 'no_team');
    END IF;
    v_privileged := public.is_god() OR public.my_team_is_platform_owner();

    -- Presupuesto global del día
    SELECT COALESCE(SUM(cost_usd), 0) INTO v_today_usd
    FROM public.ai_usage WHERE created_at >= date_trunc('day', now());
    IF v_today_usd >= v_settings.ai_daily_budget_usd AND NOT public.is_god() THEN
        RETURN jsonb_build_object('allowed', FALSE, 'reason', 'global_budget_exhausted');
    END IF;

    -- Tope diario por team (un tenant no deja sin IA a los demás)
    IF NOT v_privileged THEN
        SELECT COALESCE(SUM(cost_usd), 0) INTO v_team_usd
        FROM public.ai_usage WHERE team_id = v_team AND created_at >= date_trunc('day', now());
        IF v_team_usd >= v_settings.ai_team_daily_budget_usd THEN
            RETURN jsonb_build_object('allowed', FALSE, 'reason', 'team_budget_exhausted');
        END IF;
    END IF;

    -- Morosidad y cuota por plan (modo plataforma, tenants normales)
    IF public.is_platform_mode() AND NOT v_privileged THEN
        IF NOT public.team_can_write() THEN
            RETURN jsonb_build_object('allowed', FALSE, 'reason', 'team_cannot_write');
        END IF;

        SELECT TRUE, pl.limit_value INTO v_has_limit, v_limit
        FROM public.plan_limits pl
        WHERE pl.plan_code = public.my_plan_code()
          AND pl.limit_code = 'ia_' || p_feature || '_mes'
          AND pl.status = 'active';

        -- FAIL-CLOSED: una feature sin fila en plan_limits no existe para este plan
        IF NOT COALESCE(v_has_limit, FALSE) THEN
            RETURN jsonb_build_object('allowed', FALSE, 'reason', 'feature_not_in_plan');
        END IF;

        IF v_limit IS NOT NULL THEN
            SELECT count(*) INTO v_month_used
            FROM public.ai_usage
            WHERE team_id = v_team AND feature = p_feature AND ok
              AND created_at >= date_trunc('month', now());
            IF v_month_used >= v_limit THEN
                RETURN jsonb_build_object('allowed', FALSE, 'reason', 'plan_quota_exhausted',
                                          'used', v_month_used, 'limit', v_limit);
            END IF;
            RETURN jsonb_build_object('allowed', TRUE, 'model', v_settings.ai_default_model,
                                      'used', v_month_used, 'limit', v_limit,
                                      'remaining', v_limit - v_month_used);
        END IF;
    END IF;

    RETURN jsonb_build_object('allowed', TRUE, 'model', v_settings.ai_default_model);
END;
$$;

COMMIT;
