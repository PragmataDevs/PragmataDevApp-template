-- ============================================================================
-- ai_usage — Medición y control de costo de IA (Gemini) por tenant
-- ============================================================================
-- Ver docs/estrategia-costos-ia.md (cuentaaparte). Heredable por todo producto.
--
--   platform_settings.ai_enabled / ai_daily_budget_usd / ai_default_model
--   ai_model_prices   precio por modelo (USD por 1M tokens) para estimar costo
--   ai_usage          una fila por llamada; escribe SOLO la edge function (service_role)
--   ai_can_run(f)     gate que la edge function consulta con el JWT del usuario
--   ai_estimate_cost  costo estimado de una llamada
--
-- Con platform_mode apagado: ai_can_run sigue exigiendo sesión no anónima y
-- respeta kill switch y presupuesto global, pero no aplica cuotas por plan.
-- Idempotente. Reversa: down_20260904094000_ai_usage.sql
-- ============================================================================
BEGIN;

ALTER TABLE public.platform_settings
  ADD COLUMN IF NOT EXISTS ai_enabled           BOOLEAN       NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS ai_daily_budget_usd  NUMERIC(8,2)  NOT NULL DEFAULT 5.00 CHECK (ai_daily_budget_usd >= 0),
  ADD COLUMN IF NOT EXISTS ai_default_model     TEXT          NOT NULL DEFAULT 'gemini-2.5-flash-lite';

-- ── Precios ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ai_model_prices (
    model            TEXT           PRIMARY KEY,
    usd_in_per_m     NUMERIC(10,4)  NOT NULL CHECK (usd_in_per_m >= 0),
    usd_out_per_m    NUMERIC(10,4)  NOT NULL CHECK (usd_out_per_m >= 0),
    allowed_in_app   BOOLEAN        NOT NULL DEFAULT TRUE,
    verified_at      DATE,
    -- AuditBase
    id          UUID        NOT NULL DEFAULT gen_random_uuid(),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by  UUID        REFERENCES public.profiles(id) ON DELETE SET NULL,
    updated_by  UUID        REFERENCES public.profiles(id) ON DELETE SET NULL,
    version     INTEGER     NOT NULL DEFAULT 0,
    status      TEXT        NOT NULL DEFAULT 'active' CHECK (status IN ('active','deleted')),
    deleted_at  TIMESTAMPTZ
);
INSERT INTO public.ai_model_prices (model, usd_in_per_m, usd_out_per_m, allowed_in_app, verified_at) VALUES
  ('gemini-2.5-flash-lite', 0.10, 0.40, TRUE,  '2026-09-04'),
  ('gemini-2.5-flash',      0.30, 2.50, TRUE,  '2026-09-04'),
  ('gemini-2.5-pro',        1.25, 10.00, FALSE, '2026-09-04')
ON CONFLICT (model) DO NOTHING;

-- ── Uso ──────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ai_usage (
    id           UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id      UUID          NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
    entity_id    UUID          REFERENCES public.entities(id) ON DELETE SET NULL,
    user_id      UUID,                                    -- sin FK: el log sobrevive al usuario
    feature      TEXT          NOT NULL,                  -- 'menu_foto', 'descripcion', 'asistente'…
    model        TEXT          NOT NULL,
    tokens_in    INTEGER       NOT NULL DEFAULT 0 CHECK (tokens_in >= 0),
    tokens_out   INTEGER       NOT NULL DEFAULT 0 CHECK (tokens_out >= 0),
    cost_usd     NUMERIC(12,6) NOT NULL DEFAULT 0,
    latency_ms   INTEGER,
    ok           BOOLEAN       NOT NULL DEFAULT TRUE,
    error_detail TEXT,
    -- AuditBase
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by  UUID        REFERENCES public.profiles(id) ON DELETE SET NULL,
    updated_by  UUID        REFERENCES public.profiles(id) ON DELETE SET NULL,
    version     INTEGER     NOT NULL DEFAULT 0,
    status      TEXT        NOT NULL DEFAULT 'active' CHECK (status IN ('active','deleted')),
    deleted_at  TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_ai_usage_team_created ON public.ai_usage(team_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_usage_created      ON public.ai_usage(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_usage_feature      ON public.ai_usage(feature);

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['ai_model_prices','ai_usage'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%1$s_set_updated_at ON public.%1$s', t);
    EXECUTE format('CREATE TRIGGER trg_%1$s_set_updated_at BEFORE UPDATE ON public.%1$s FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()', t);
    EXECUTE format('ALTER TABLE public.%1$s ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;

DROP POLICY IF EXISTS "ai_model_prices_select" ON public.ai_model_prices;
CREATE POLICY "ai_model_prices_select" ON public.ai_model_prices
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "ai_model_prices_write_god" ON public.ai_model_prices;
CREATE POLICY "ai_model_prices_write_god" ON public.ai_model_prices
  FOR ALL TO authenticated USING (public.is_god()) WITH CHECK (public.is_god());

-- El team ve su consumo (admin: todo el team; member: solo lo suyo). Nadie escribe por PostgREST.
DROP POLICY IF EXISTS "ai_usage_select" ON public.ai_usage;
CREATE POLICY "ai_usage_select" ON public.ai_usage
  FOR SELECT TO authenticated USING (
    public.is_god()
    OR (team_id = public.get_my_team_id() AND (
          user_id = auth.uid()
          OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND access_level = 'admin')
    ))
  );
REVOKE INSERT, UPDATE, DELETE ON public.ai_usage FROM anon, authenticated;
REVOKE ALL ON public.ai_model_prices FROM anon;

-- ── Funciones ────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.ai_estimate_cost(p_model TEXT, p_tokens_in INTEGER, p_tokens_out INTEGER)
RETURNS NUMERIC
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
    SELECT COALESCE(
      (SELECT (COALESCE(p_tokens_in,0) * usd_in_per_m + COALESCE(p_tokens_out,0) * usd_out_per_m) / 1000000.0
       FROM public.ai_model_prices WHERE model = p_model AND status = 'active'),
      0);
$$;

-- Gate previo a llamar a Gemini. Lo consulta la edge function con el JWT del usuario.
-- La cuota por plan usa plan_limits con limit_code = 'ia_' || p_feature || '_mes'.
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

    -- Presupuesto global del día (todos los tenants)
    SELECT COALESCE(SUM(cost_usd), 0) INTO v_today_usd
    FROM public.ai_usage
    WHERE created_at >= date_trunc('day', now());
    IF v_today_usd >= v_settings.ai_daily_budget_usd AND NOT public.is_god() THEN
        RETURN jsonb_build_object('allowed', FALSE, 'reason', 'global_budget_exhausted');
    END IF;

    -- Morosidad y cuota por plan (solo en modo plataforma; god/platform owner pasan)
    IF public.is_platform_mode() AND NOT public.is_god() AND NOT public.my_team_is_platform_owner() THEN
        IF NOT public.team_can_write() THEN
            RETURN jsonb_build_object('allowed', FALSE, 'reason', 'team_cannot_write');
        END IF;

        SELECT TRUE, pl.limit_value INTO v_has_limit, v_limit
        FROM public.plan_limits pl
        WHERE pl.plan_code = public.my_plan_code()
          AND pl.limit_code = 'ia_' || p_feature || '_mes'
          AND pl.status = 'active';

        IF COALESCE(v_has_limit, FALSE) AND v_limit IS NOT NULL THEN
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

REVOKE ALL ON FUNCTION public.ai_can_run(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ai_can_run(TEXT) TO authenticated;
REVOKE ALL ON FUNCTION public.ai_estimate_cost(TEXT, INTEGER, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ai_estimate_cost(TEXT, INTEGER, INTEGER) TO authenticated, service_role;

COMMIT;
