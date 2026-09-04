-- ROLLBACK de 20260904099000_multitenant_scoping_2.sql — restaura las policies y
-- funciones del schema base. ⚠️ Vuelven los hallazgos C1-C3, A1-A3 de Cancerbero.
BEGIN;
DROP TRIGGER IF EXISTS aab_guard_team_slug ON public.teams;
DROP FUNCTION IF EXISTS public.enforce_team_slug_guard();

DROP POLICY IF EXISTS "tasks_select" ON public.tasks;
CREATE POLICY "tasks_select" ON public.tasks FOR SELECT USING (
    public.is_god() OR (status = 'active' AND (
        entity_id IN (SELECT entity_id FROM public.sys_entity_access WHERE user_id = auth.uid())
        OR public.check_permission('page_workspace_tasks', 'read'))));
DROP POLICY IF EXISTS "tasks_insert" ON public.tasks;
CREATE POLICY "tasks_insert" ON public.tasks FOR INSERT WITH CHECK (
    public.is_god() OR (created_by = auth.uid() AND (
        entity_id IN (SELECT entity_id FROM public.sys_entity_access WHERE user_id = auth.uid())
        OR public.check_permission('page_workspace_tasks', 'create'))));
DROP POLICY IF EXISTS "tasks_update" ON public.tasks;
CREATE POLICY "tasks_update" ON public.tasks FOR UPDATE USING (
    public.is_god() OR (created_by = auth.uid() OR assigned_to = auth.uid())
    OR public.check_permission('page_workspace_tasks', 'update', entity_id));
DROP POLICY IF EXISTS "tasks_delete" ON public.tasks;
CREATE POLICY "tasks_delete" ON public.tasks FOR DELETE USING (
    public.is_god() OR public.check_permission('page_workspace_tasks', 'delete', entity_id));
DROP POLICY IF EXISTS "task_comments_delete" ON public.task_comments;
CREATE POLICY "task_comments_delete" ON public.task_comments FOR DELETE USING (
    public.is_god() OR created_by = auth.uid() OR public.check_permission('page_workspace_tasks', 'delete'));

DROP POLICY IF EXISTS "Admin Manage Entity Access" ON public.sys_entity_access;
CREATE POLICY "Admin Manage Entity Access" ON public.sys_entity_access FOR ALL USING (
    public.is_god() OR public.check_permission('page_settings_entities', 'update'));

DROP POLICY IF EXISTS "Admin Write Roles" ON public.sys_roles;
CREATE POLICY "Admin Write Roles" ON public.sys_roles FOR ALL USING (
    public.is_god() OR public.check_permission('page_settings_roles', 'update'));
DROP POLICY IF EXISTS "Admin Write Resources" ON public.sys_resources;
CREATE POLICY "Admin Write Resources" ON public.sys_resources FOR ALL USING (
    public.is_god() OR public.check_permission('page_settings_roles', 'update'));
DROP POLICY IF EXISTS "Admin Write RoleDefs" ON public.sys_role_definitions;
CREATE POLICY "Admin Write RoleDefs" ON public.sys_role_definitions FOR ALL USING (
    public.is_god() OR public.check_permission('page_settings_roles', 'update'));

DROP POLICY IF EXISTS "Send Direct Notification" ON public.notifications;
CREATE POLICY "Send Direct Notification" ON public.notifications FOR INSERT WITH CHECK (
    public.is_god() OR (sender_id = auth.uid() AND public.check_permission('feature_notifications_send', 'create')));
DROP POLICY IF EXISTS "Insert Notification Attachments" ON public.notification_attachments;
CREATE POLICY "Insert Notification Attachments" ON public.notification_attachments FOR INSERT WITH CHECK (
    public.is_god() OR public.check_permission('feature_notifications_send', 'create'));

-- check_permission: versión del schema base (con el fall-through de admin)
CREATE OR REPLACE FUNCTION public.check_permission(requested_resource TEXT, requested_action TEXT, context_project_id UUID DEFAULT NULL)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public STABLE AS $$
DECLARE current_uid UUID := auth.uid(); user_profile public.profiles%ROWTYPE; has_action BOOLEAN;
BEGIN
    IF current_uid IS NULL THEN RETURN FALSE; END IF;
    SELECT * INTO user_profile FROM public.profiles WHERE id = current_uid;
    IF NOT FOUND THEN RETURN FALSE; END IF;
    IF user_profile.profile_status <> 'active' OR user_profile.status <> 'active' THEN RETURN FALSE; END IF;
    IF user_profile.access_level = 'god' THEN
        IF EXISTS (SELECT 1 FROM public.teams WHERE id = user_profile.team_id AND is_platform_owner = TRUE) THEN RETURN TRUE; END IF;
    END IF;
    IF user_profile.access_level = 'admin' THEN
        IF context_project_id IS NOT NULL THEN
            IF EXISTS (SELECT 1 FROM public.entities WHERE id = context_project_id AND team_id = user_profile.team_id) THEN RETURN TRUE; END IF;
        ELSE RETURN TRUE; END IF;
    END IF;
    IF context_project_id IS NOT NULL THEN
        IF NOT EXISTS (SELECT 1 FROM public.sys_entity_access WHERE user_id = current_uid AND entity_id = context_project_id) THEN RETURN FALSE; END IF;
    END IF;
    SELECT TRUE INTO has_action FROM public.sys_user_permissions
    WHERE user_id = current_uid AND resource_code = requested_resource AND granted_actions @> ARRAY[requested_action]::text[];
    RETURN COALESCE(has_action, FALSE);
END; $$;

-- ai_can_run: volver a la versión de 094000 (fail-open por feature) y quitar tope por team
ALTER TABLE public.platform_settings DROP COLUMN IF EXISTS ai_team_daily_budget_usd;
DROP FUNCTION IF EXISTS public.entity_in_my_team(UUID);
-- (ai_can_run se restaura reaplicando 20260904094000_ai_usage.sql, que es idempotente)
COMMIT;
