-- ==============================================================================
-- PATCH: God User RLS Bypass
-- Crea la función is_god() y la aplica como primera condición en todas las
-- políticas críticas. El usuario god SIEMPRE puede ver y hacer todo.
-- ==============================================================================

-- 1. Función helper is_god()
--    Retorna TRUE si el usuario actual tiene access_level='god' y su equipo
--    es platform_owner. Se usa como cortocircuito en todas las RLS policies.
CREATE OR REPLACE FUNCTION public.is_god()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.profiles p
        JOIN public.teams t ON t.id = p.team_id
        WHERE p.id = auth.uid()
          AND p.access_level = 'god'
          AND t.is_platform_owner = TRUE
    );
$$;

-- 2. Actualizar check_permission() para que el god tenga cortocircuito
--    aunque no pase por el bloque IF access_level = 'god'
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
    current_uid    UUID := auth.uid();
    user_profile   public.profiles%ROWTYPE;
    has_action     BOOLEAN;
BEGIN
    IF current_uid IS NULL THEN RETURN FALSE; END IF;

    SELECT * INTO user_profile FROM public.profiles WHERE id = current_uid;
    IF NOT FOUND THEN RETURN FALSE; END IF;

    -- GOD: bypass total
    IF user_profile.access_level = 'god' THEN
        IF EXISTS (
            SELECT 1 FROM public.teams
            WHERE id = user_profile.team_id AND is_platform_owner = TRUE
        ) THEN
            RETURN TRUE;
        END IF;
    END IF;

    -- ADMIN: acceso total en su equipo
    IF user_profile.access_level = 'admin' THEN
        IF context_project_id IS NOT NULL THEN
            IF EXISTS (
                SELECT 1 FROM public.entities
                WHERE id = context_project_id AND team_id = user_profile.team_id
            ) THEN
                RETURN TRUE;
            END IF;
        ELSE
            RETURN TRUE;
        END IF;
    END IF;

    -- MEMBER: whitelist de entity + permisos granulares
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

-- 3. RLS: entities
DROP POLICY IF EXISTS "View Authorized Projects"  ON public.entities;
DROP POLICY IF EXISTS "Manage Projects"           ON public.entities;
DROP POLICY IF EXISTS "View Authorized Entities"  ON public.entities;
DROP POLICY IF EXISTS "Manage Entities"           ON public.entities;

CREATE POLICY "View Authorized Entities" ON public.entities
    FOR SELECT USING (
        public.is_god()
        OR id IN (SELECT entity_id FROM public.sys_entity_access WHERE user_id = auth.uid())
        OR public.check_permission('page_settings_entities', 'read')
    );

CREATE POLICY "Manage Entities" ON public.entities
    FOR ALL USING (
        public.is_god()
        OR public.check_permission('page_settings_entities', 'update', id)
    );

-- 4. RLS: sys_entity_access
DROP POLICY IF EXISTS "Sync Own Project Access"   ON public.sys_entity_access;
DROP POLICY IF EXISTS "View Project Access"       ON public.sys_entity_access;
DROP POLICY IF EXISTS "Admin Manage Project Access" ON public.sys_entity_access;
DROP POLICY IF EXISTS "Sync Own Entity Access"    ON public.sys_entity_access;
DROP POLICY IF EXISTS "View Entity Access"        ON public.sys_entity_access;
DROP POLICY IF EXISTS "Admin Manage Entity Access" ON public.sys_entity_access;

CREATE POLICY "Sync Own Entity Access" ON public.sys_entity_access
    FOR SELECT USING (public.is_god() OR user_id = auth.uid());

CREATE POLICY "View Entity Access" ON public.sys_entity_access
    FOR SELECT USING (
        public.is_god()
        OR entity_id IN (SELECT public.get_my_entity_ids())
    );

CREATE POLICY "Admin Manage Entity Access" ON public.sys_entity_access
    FOR ALL USING (
        public.is_god()
        OR public.check_permission('page_settings_entities', 'update')
    );

-- 5. RLS: profiles
DROP POLICY IF EXISTS "Admin Manage Profiles" ON public.profiles;
CREATE POLICY "Admin Manage Profiles" ON public.profiles
    FOR ALL USING (
        public.is_god()
        OR id = auth.uid()
        OR public.check_permission('page_settings_usuarios', 'update')
    );

-- 6. RLS: tasks (si ya existe la tabla)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'tasks'
    ) THEN
        EXECUTE 'DROP POLICY IF EXISTS "tasks_select" ON public.tasks';
        EXECUTE 'DROP POLICY IF EXISTS "tasks_insert" ON public.tasks';
        EXECUTE 'DROP POLICY IF EXISTS "tasks_update" ON public.tasks';
        EXECUTE 'DROP POLICY IF EXISTS "tasks_delete" ON public.tasks';

        EXECUTE $p$
            CREATE POLICY "tasks_select" ON public.tasks FOR SELECT USING (
                public.is_god()
                OR (status = 'active' AND (
                    entity_id IN (SELECT entity_id FROM public.sys_entity_access WHERE user_id = auth.uid())
                    OR public.check_permission('page_workspace_tasks', 'read')
                ))
            )
        $p$;
        EXECUTE $p$
            CREATE POLICY "tasks_insert" ON public.tasks FOR INSERT WITH CHECK (
                public.is_god()
                OR (created_by = auth.uid() AND (
                    entity_id IN (SELECT entity_id FROM public.sys_entity_access WHERE user_id = auth.uid())
                    OR public.check_permission('page_workspace_tasks', 'create')
                ))
            )
        $p$;
        EXECUTE $p$
            CREATE POLICY "tasks_update" ON public.tasks FOR UPDATE USING (
                public.is_god()
                OR (created_by = auth.uid() OR assigned_to = auth.uid())
                OR public.check_permission('page_workspace_tasks', 'update', entity_id)
            )
        $p$;
        EXECUTE $p$
            CREATE POLICY "tasks_delete" ON public.tasks FOR DELETE USING (
                public.is_god()
                OR public.check_permission('page_workspace_tasks', 'delete', entity_id)
            )
        $p$;
    END IF;
END $$;

-- 7. Refrescar schema cache de PostgREST
NOTIFY pgrst, 'reload schema';
