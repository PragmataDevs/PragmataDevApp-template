-- ==============================================================================
-- MIGRATION: projects → entities
-- Version: 1.0
-- Run AFTER 01_security_engine.sql is already deployed.
--
-- Renames the "projects" concept to "entities" to make the template generic.
-- The UI label (Proyecto, Obra, Cliente…) is configured via VITE_ENTITY_LABEL.
-- ==============================================================================

-- 0. Ensure set_updated_at() exists (may be missing in older engine versions)
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = NOW();
    IF TG_TABLE_NAME IN (
        'tasks', 'task_comments', 'entities', 'sys_entity_access'
    ) THEN
        NEW.version = COALESCE(OLD.version, 0) + 1;
    END IF;
    RETURN NEW;
END;
$$;

-- 1. Rename main table
ALTER TABLE IF EXISTS public.projects RENAME TO entities;

-- 2. Rename access control table
ALTER TABLE IF EXISTS public.sys_project_access RENAME TO sys_entity_access;

-- 3. Rename column project_id → entity_id in sys_entity_access
ALTER TABLE IF EXISTS public.sys_entity_access
  RENAME COLUMN project_id TO entity_id;

-- 4. Rename column project_id → entity_id in tasks
--    Only needed if tasks table already exists (i.e. 04_tasks.sql was run before this migration).
--    If tasks does not exist yet, skip — 04_tasks.sql will create it with entity_id directly.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name   = 'tasks'
          AND column_name  = 'project_id'
    ) THEN
        ALTER TABLE public.tasks RENAME COLUMN project_id TO entity_id;
    END IF;
END $$;

-- 5. Rename column project_status → entity_status in entities
ALTER TABLE IF EXISTS public.entities
  RENAME COLUMN project_status TO entity_status;

-- 7. Rename triggers (drop old + recreate)
DROP TRIGGER IF EXISTS projects_updated_at ON public.entities;
CREATE TRIGGER entities_set_updated_at
    BEFORE UPDATE ON public.entities
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 8. Update FK constraint names (cosmetic — Postgres keeps them valid after rename)
-- No action needed: FK constraints follow the column/table rename automatically.

-- 9. Drop & recreate indexes with new names
DROP INDEX IF EXISTS idx_projects_team;
CREATE INDEX IF NOT EXISTS idx_entities_team ON public.entities(team_id);

DROP INDEX IF EXISTS idx_permissions_user;
CREATE INDEX IF NOT EXISTS idx_permissions_user ON public.sys_user_permissions(user_id);

DROP INDEX IF EXISTS idx_project_access_user;
CREATE INDEX IF NOT EXISTS idx_entity_access_user ON public.sys_entity_access(user_id);

-- tasks indexes only if the table exists
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'tasks') THEN
        DROP INDEX IF EXISTS idx_tasks_project_status;
        DROP INDEX IF EXISTS idx_tasks_project_order;
        CREATE INDEX IF NOT EXISTS idx_tasks_entity_status ON public.tasks(entity_id, task_status);
        CREATE INDEX IF NOT EXISTS idx_tasks_entity_order  ON public.tasks(entity_id, column_order);
    END IF;
END $$;

-- 10. Drop & recreate RLS policies that reference the old table/column names
-- (Supabase shows errors if you reference old names after rename)

-- entities (was: projects)
DROP POLICY IF EXISTS "View Authorized Projects" ON public.entities;
DROP POLICY IF EXISTS "Manage Projects" ON public.entities;

CREATE POLICY "View Authorized Entities" ON public.entities
    FOR SELECT USING (
        id IN (SELECT entity_id FROM public.sys_entity_access WHERE user_id = auth.uid())
        OR public.check_permission('page_settings_entities', 'read')
    );

CREATE POLICY "Manage Entities" ON public.entities
    FOR ALL USING (
        public.check_permission('page_settings_entities', 'update', id)
    );

-- sys_entity_access (was: sys_project_access)
DROP POLICY IF EXISTS "Sync Own Project Access" ON public.sys_entity_access;
DROP POLICY IF EXISTS "View Project Access" ON public.sys_entity_access;
DROP POLICY IF EXISTS "Admin Manage Project Access" ON public.sys_entity_access;

CREATE POLICY "Sync Own Entity Access" ON public.sys_entity_access
    FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "View Entity Access" ON public.sys_entity_access
    FOR SELECT USING (
        entity_id IN (
            SELECT id FROM public.entities
            WHERE id IN (SELECT entity_id FROM public.sys_entity_access WHERE user_id = auth.uid())
        )
    );

CREATE POLICY "Admin Manage Entity Access" ON public.sys_entity_access
    FOR ALL USING (
        public.check_permission('page_settings_entities', 'update')
    );

-- tasks policies: only if the table already existed before this migration.
-- If tasks was not yet created, 04_tasks.sql will create it with the correct policies.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'tasks') THEN
        -- Drop old policies (safe — IF EXISTS via exception handling not needed in DO blocks)
        EXECUTE 'DROP POLICY IF EXISTS "tasks_select" ON public.tasks';
        EXECUTE 'DROP POLICY IF EXISTS "tasks_insert" ON public.tasks';
        EXECUTE 'DROP POLICY IF EXISTS "tasks_update" ON public.tasks';
        EXECUTE 'DROP POLICY IF EXISTS "tasks_delete" ON public.tasks';

        EXECUTE $p$
            CREATE POLICY "tasks_select" ON public.tasks
                FOR SELECT USING (
                    status = 'active'
                    AND (
                        entity_id IN (SELECT entity_id FROM public.sys_entity_access WHERE user_id = auth.uid())
                        OR public.check_permission('page_workspace_tasks', 'read')
                    )
                )
        $p$;
        EXECUTE $p$
            CREATE POLICY "tasks_insert" ON public.tasks
                FOR INSERT WITH CHECK (
                    created_by = auth.uid()
                    AND (
                        entity_id IN (SELECT entity_id FROM public.sys_entity_access WHERE user_id = auth.uid())
                        OR public.check_permission('page_workspace_tasks', 'create')
                    )
                )
        $p$;
        EXECUTE $p$
            CREATE POLICY "tasks_update" ON public.tasks
                FOR UPDATE USING (
                    (created_by = auth.uid() OR assigned_to = auth.uid())
                    OR public.check_permission('page_workspace_tasks', 'update', entity_id)
                )
        $p$;
        EXECUTE $p$
            CREATE POLICY "tasks_delete" ON public.tasks
                FOR DELETE USING (
                    public.check_permission('page_workspace_tasks', 'delete', entity_id)
                )
        $p$;
    END IF;
END $$;

-- 11. Update get_my_project_ids function (if it exists)
CREATE OR REPLACE FUNCTION public.get_my_entity_ids()
RETURNS SETOF UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
    SELECT entity_id FROM public.sys_entity_access WHERE user_id = auth.uid()
$$;

-- Keep old function as alias for backwards compat during transition
CREATE OR REPLACE FUNCTION public.get_my_project_ids()
RETURNS SETOF UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
    SELECT entity_id FROM public.sys_entity_access WHERE user_id = auth.uid()
$$;
