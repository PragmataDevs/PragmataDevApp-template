-- ==============================================================================
-- MÓDULO: TASKS (Kanban por Proyecto)
-- Version: 1.0
--
-- Extiende el Security Engine (01_security_engine.sql).
-- REQUIERE `entities` y `sys_entity_access` (01_security_engine.sql).
--
-- Tablas:
--   tasks        — Tarjetas del Kanban (AuditBase completo)
--   task_comments — Comentarios en tareas (AuditBase completo)
--
-- Buckets PowerSync:
--   Ver docs/powersync/sync-rules.yaml → bucket "tasks"
-- ==============================================================================


-- ------------------------------------------------------------------------------
-- ENUMS / CHECK CONSTRAINTS  (sin tipo ENUM para facilitar migraciones)
-- task_status  : ciclo de vida del Kanban
-- priority     : urgencia de la tarea
-- ------------------------------------------------------------------------------


-- ------------------------------------------------------------------------------
-- 1. TABLA: tasks
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tasks (
    -- AuditBase
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by    UUID        REFERENCES public.profiles(id) ON DELETE SET NULL,
    updated_by    UUID        REFERENCES public.profiles(id) ON DELETE SET NULL,
    version       INTEGER     NOT NULL DEFAULT 0,
    status        TEXT        NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'deleted')),
    deleted_at    TIMESTAMPTZ,

    -- Negocio
    entity_id     UUID        NOT NULL REFERENCES public.entities(id) ON DELETE CASCADE,
    title         TEXT        NOT NULL CHECK (length(trim(title)) > 0),
    description   TEXT,
    assigned_to   UUID        REFERENCES public.profiles(id) ON DELETE SET NULL,
    due_date      DATE,
    priority      TEXT        NOT NULL DEFAULT 'medium'
                                CHECK (priority IN ('low', 'medium', 'high', 'critical')),
    task_status   TEXT        NOT NULL DEFAULT 'backlog'
                                CHECK (task_status IN ('backlog', 'todo', 'in_progress', 'review', 'done')),
    column_order  FLOAT8      NOT NULL DEFAULT 0,  -- fractional indexing dentro de la columna
    tags          TEXT[],                           -- etiquetas libres
    metadata      JSONB                             -- extensión sin esquema (checklists, links, etc.)
);

-- AuditBase trigger
CREATE TRIGGER tasks_set_updated_at
    BEFORE UPDATE ON public.tasks
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ------------------------------------------------------------------------------
-- 2. TABLA: task_comments
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.task_comments (
    -- AuditBase
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by  UUID        REFERENCES public.profiles(id) ON DELETE SET NULL,
    updated_by  UUID        REFERENCES public.profiles(id) ON DELETE SET NULL,
    version     INTEGER     NOT NULL DEFAULT 0,
    status      TEXT        NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'deleted')),
    deleted_at  TIMESTAMPTZ,

    -- Negocio
    task_id     UUID        NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
    body        TEXT        NOT NULL CHECK (length(trim(body)) > 0)
);

CREATE TRIGGER task_comments_set_updated_at
    BEFORE UPDATE ON public.task_comments
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ------------------------------------------------------------------------------
-- 3. INDEXES
-- ------------------------------------------------------------------------------
CREATE INDEX idx_tasks_entity_status        ON public.tasks(entity_id, task_status);
CREATE INDEX idx_tasks_entity_order         ON public.tasks(entity_id, column_order);
CREATE INDEX idx_tasks_assigned             ON public.tasks(assigned_to);
CREATE INDEX idx_tasks_due_date             ON public.tasks(due_date) WHERE due_date IS NOT NULL;
CREATE INDEX idx_task_comments_task         ON public.task_comments(task_id);


-- ------------------------------------------------------------------------------
-- 4. ROW LEVEL SECURITY
-- ------------------------------------------------------------------------------
ALTER TABLE public.tasks         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_comments ENABLE ROW LEVEL SECURITY;

-- TASKS -----------------------------------------------------------------------

-- GOD siempre ve y puede hacer todo; el resto sigue las reglas normales
CREATE POLICY "tasks_select" ON public.tasks
    FOR SELECT USING (
        public.is_god()
        OR (status = 'active' AND (
            entity_id IN (
                SELECT entity_id FROM public.sys_entity_access
                WHERE user_id = auth.uid()
            )
            OR public.check_permission('page_workspace_tasks', 'read')
        ))
    );

CREATE POLICY "tasks_insert" ON public.tasks
    FOR INSERT WITH CHECK (
        public.is_god()
        OR (created_by = auth.uid() AND (
            entity_id IN (
                SELECT entity_id FROM public.sys_entity_access
                WHERE user_id = auth.uid()
            )
            OR public.check_permission('page_workspace_tasks', 'create')
        ))
    );

CREATE POLICY "tasks_update" ON public.tasks
    FOR UPDATE USING (
        public.is_god()
        OR (created_by = auth.uid() OR assigned_to = auth.uid())
        OR public.check_permission('page_workspace_tasks', 'update', entity_id)
    );

CREATE POLICY "tasks_delete" ON public.tasks
    FOR DELETE USING (
        public.is_god()
        OR public.check_permission('page_workspace_tasks', 'delete', entity_id)
    );

-- TASK_COMMENTS ---------------------------------------------------------------

CREATE POLICY "task_comments_select" ON public.task_comments
    FOR SELECT USING (
        public.is_god()
        OR (status = 'active' AND task_id IN (
            SELECT id FROM public.tasks
            WHERE entity_id IN (
                SELECT entity_id FROM public.sys_entity_access
                WHERE user_id = auth.uid()
            )
        ))
    );

CREATE POLICY "task_comments_insert" ON public.task_comments
    FOR INSERT WITH CHECK (
        public.is_god()
        OR (created_by = auth.uid() AND task_id IN (
            SELECT id FROM public.tasks
            WHERE entity_id IN (
                SELECT entity_id FROM public.sys_entity_access
                WHERE user_id = auth.uid()
            )
        ))
    );

CREATE POLICY "task_comments_update" ON public.task_comments
    FOR UPDATE USING (public.is_god() OR created_by = auth.uid());

CREATE POLICY "task_comments_delete" ON public.task_comments
    FOR DELETE USING (
        public.is_god()
        OR created_by = auth.uid()
        OR public.check_permission('page_workspace_tasks', 'delete')
    );
