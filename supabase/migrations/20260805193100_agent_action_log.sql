-- ============================================================================
-- agent_action_log — F0 Módulo Agente Operativo
-- ============================================================================
-- Bitácora de toda acción que un agente embebido ejecuta (o intenta ejecutar).
-- Sin esto no hay producción: cualquier `mutate`/`rpc` que corra `runAction()`
-- (packages/core/src/agent/policy.ts) debe quedar registrado aquí, incluyendo
-- los rechazos por falta de permiso y las esperas de confirmación resueltas.
--
-- AuditBase completo (id, created_at, updated_at, created_by, updated_by,
-- version, status, deleted_at) + columnas propias del log.
-- ============================================================================

CREATE TABLE public.agent_action_log (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at  TIMESTAMPTZ NOT NULL    DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL    DEFAULT now(),
  created_by  UUID        REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_by  UUID        REFERENCES public.profiles(id) ON DELETE SET NULL,
  version     INTEGER     NOT NULL    DEFAULT 0,
  status      TEXT        NOT NULL    DEFAULT 'active' CHECK (status IN ('active', 'deleted')),
  deleted_at  TIMESTAMPTZ,

  -- Scope: a qué equipo/entidad pertenece esta ejecución (para RLS + reportes).
  team_id     UUID        NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  entity_id   UUID        REFERENCES public.entities(id) ON DELETE SET NULL,

  -- Qué acción, con qué params, y qué pasó.
  agent_action_key TEXT   NOT NULL,
  params      JSONB       NOT NULL DEFAULT '{}'::jsonb,
  risk_level  TEXT        NOT NULL CHECK (risk_level IN ('safe', 'write', 'financial', 'destructive')),
  result      TEXT        NOT NULL CHECK (result IN ('success', 'error', 'rejected')),
  error_detail TEXT,

  -- Confirmación humana (obligatoria en código para financial/destructive — ver policy.ts).
  confirmed_by UUID       REFERENCES public.profiles(id) ON DELETE SET NULL,
  confirmed_at TIMESTAMPTZ
);

COMMENT ON TABLE public.agent_action_log IS
  'Bitácora de ejecuciones del agente operativo (F0). Append-only desde la app: '
  'solo god puede UPDATE/DELETE (housekeeping). Ver runAction() en @pragmata/core.';

ALTER TABLE public.agent_action_log ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER trg_agent_action_log_set_updated_at
  BEFORE UPDATE ON public.agent_action_log
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_agent_action_log_team        ON public.agent_action_log(team_id);
CREATE INDEX idx_agent_action_log_entity      ON public.agent_action_log(entity_id);
CREATE INDEX idx_agent_action_log_created_by  ON public.agent_action_log(created_by);
CREATE INDEX idx_agent_action_log_action_key  ON public.agent_action_log(agent_action_key);
CREATE INDEX idx_agent_action_log_created_at  ON public.agent_action_log(created_at DESC);

-- RLS: el propio usuario ve su log; admin/god ven todo el log de su team.
-- Append-only: INSERT solo de tu propia ejecución; UPDATE/DELETE reservado a god
-- (un log que el propio usuario puede reescribir no audita nada).
CREATE POLICY "agent_action_log_select" ON public.agent_action_log
  FOR SELECT USING (
    public.is_god()
    OR created_by = auth.uid()
    OR (
      team_id = public.get_my_team_id()
      AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND access_level = 'admin')
    )
  );

CREATE POLICY "agent_action_log_insert" ON public.agent_action_log
  FOR INSERT WITH CHECK (
    public.is_god()
    OR (created_by = auth.uid() AND team_id = public.get_my_team_id())
  );

CREATE POLICY "agent_action_log_update" ON public.agent_action_log
  FOR UPDATE USING (public.is_god());

CREATE POLICY "agent_action_log_delete" ON public.agent_action_log
  FOR DELETE USING (public.is_god());
