-- ============================================================================
-- god_access_log — bitácora de acceso interno (soporte) a datos de un tenant
-- ============================================================================
-- Regla de la casa (~/PragmataDevs/CLAUDE.md, "software honesto"): is_god() ve
-- todo para soporte, por eso deja rastro y se declara en el aviso de privacidad.
-- El tenant puede VER quién de PragmataDevs entró a sus datos y por qué
-- (transparencia = argumento de venta, no solo cumplimiento).
--
--   god_access_log         una fila por sesión de soporte sobre un team
--   log_god_access(team, motivo, contexto) → id     (solo god)
--   end_god_access(id)                              (solo god)
--
-- Idempotente. Reversa: down_20260904095000_god_access_log.sql
-- ============================================================================
BEGIN;

CREATE TABLE IF NOT EXISTS public.god_access_log (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_id    UUID        NOT NULL,                       -- sin FK: el log sobrevive al usuario
    actor_email TEXT,
    team_id     UUID        NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
    reason      TEXT        NOT NULL CHECK (length(reason) BETWEEN 5 AND 500),
    context     JSONB       NOT NULL DEFAULT '{}'::jsonb,   -- ticket, ruta, qué se tocó
    started_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    ended_at    TIMESTAMPTZ,
    -- AuditBase
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by  UUID        REFERENCES public.profiles(id) ON DELETE SET NULL,
    updated_by  UUID        REFERENCES public.profiles(id) ON DELETE SET NULL,
    version     INTEGER     NOT NULL DEFAULT 0,
    status      TEXT        NOT NULL DEFAULT 'active' CHECK (status IN ('active','deleted')),
    deleted_at  TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_god_access_log_team    ON public.god_access_log(team_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_god_access_log_actor   ON public.god_access_log(actor_id);
ALTER TABLE public.god_access_log ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS trg_god_access_log_set_updated_at ON public.god_access_log;
CREATE TRIGGER trg_god_access_log_set_updated_at
  BEFORE UPDATE ON public.god_access_log
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- god ve todo; el admin del tenant ve los accesos a SU team. Nadie escribe por PostgREST.
DROP POLICY IF EXISTS "god_access_log_select" ON public.god_access_log;
CREATE POLICY "god_access_log_select" ON public.god_access_log
  FOR SELECT TO authenticated USING (
    public.is_god()
    OR (team_id = public.get_my_team_id()
        AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND access_level = 'admin'))
  );
REVOKE INSERT, UPDATE, DELETE ON public.god_access_log FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.log_god_access(p_team_id UUID, p_reason TEXT, p_context JSONB DEFAULT '{}'::jsonb)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_id UUID;
    v_email TEXT;
BEGIN
    IF NOT public.is_god() THEN
        RAISE EXCEPTION 'only_god' USING ERRCODE = '42501';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.teams WHERE id = p_team_id) THEN
        RAISE EXCEPTION 'team_not_found' USING ERRCODE = '42704';
    END IF;
    SELECT email INTO v_email FROM public.profiles WHERE id = auth.uid();
    INSERT INTO public.god_access_log (actor_id, actor_email, team_id, reason, context, created_by, updated_by)
    VALUES (auth.uid(), v_email, p_team_id, p_reason, COALESCE(p_context, '{}'::jsonb), auth.uid(), auth.uid())
    RETURNING id INTO v_id;
    RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.end_god_access(p_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT public.is_god() THEN
        RAISE EXCEPTION 'only_god' USING ERRCODE = '42501';
    END IF;
    UPDATE public.god_access_log SET ended_at = now(), updated_by = auth.uid()
    WHERE id = p_id AND actor_id = auth.uid() AND ended_at IS NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.log_god_access(UUID, TEXT, JSONB) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.end_god_access(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.log_god_access(UUID, TEXT, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.end_god_access(UUID) TO authenticated;

COMMIT;
