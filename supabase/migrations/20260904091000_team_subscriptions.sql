-- ============================================================================
-- team_subscriptions — Modo plataforma, parte 2 de 3: planes y suscripción
-- ============================================================================
-- Spec: docs/spec-capa-comun-self-serve.md §2. Stripe BILLING (la mensualidad
-- que cobra PragmataDevs), no Connect. Va antes de tenant_self_signup porque
-- create_tenant() inscribe al team en el plan gratis.
--
-- Tablas (todas AuditBase, RLS, set_updated_at):
--   subscription_plans  catálogo por producto (cambiar precio = fila, no deploy)
--   plan_features       qué recursos RBAC habilita cada plan (el corte por plan
--                       vive en RBAC, no en código)
--   plan_limits         cuotas numéricas (sucursales, tickets_mes, …)
--   team_subscriptions  estado por tenant. Tabla APARTE de teams porque teams la
--                       edita el admin del tenant y el plan NO puede serlo.
--   billing_events      idempotencia + auditoría del webhook de Stripe
--
-- Funciones de gate (todas devuelven TRUE con platform_mode apagado → cero
-- cambio para clientes existentes):
--   my_plan_code(), plan_allows(recurso, acción), plan_within_limit(código, actual),
--   team_can_write()
--
-- Regla de composición: check_permission dice QUÉ acción; plan_allows es un AND
-- que nunca amplía alcance; team_can_write es el interruptor de morosidad.
-- Los SELECT nunca se bloquean por plan (un moroso ve y exporta, no escribe).
--
-- El template NO siembra planes: cada producto trae su migración de planes
-- (ver cuentaaparte 20260904100000_cuentaaparte_planes.sql).
--
-- Idempotente. Reversa: down_20260904091000_team_subscriptions.sql
-- ============================================================================

BEGIN;

-- ── subscription_plans ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.subscription_plans (
    code            TEXT        PRIMARY KEY,           -- 'gratis', 'pro'
    producto        TEXT        NOT NULL DEFAULT 'app', -- 'cuentaaparte', 'gaston', …
    nombre          TEXT        NOT NULL,
    descripcion     TEXT,
    precio_mxn      NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (precio_mxn >= 0),
    periodo         TEXT        NOT NULL DEFAULT 'mes' CHECK (periodo IN ('mes','anio')),
    stripe_price_id TEXT,
    is_public       BOOLEAN     NOT NULL DEFAULT TRUE,
    -- el plan al que entra un tenant recién creado (uno por producto)
    is_default_free BOOLEAN     NOT NULL DEFAULT FALSE,
    sort_order      INTEGER     NOT NULL DEFAULT 0,
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
CREATE UNIQUE INDEX IF NOT EXISTS uq_subscription_plans_default_free
    ON public.subscription_plans (producto) WHERE is_default_free AND status = 'active';

-- ── plan_features ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.plan_features (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_code       TEXT        NOT NULL REFERENCES public.subscription_plans(code) ON DELETE CASCADE,
    resource_code   TEXT        NOT NULL REFERENCES public.sys_resources(code) ON DELETE CASCADE,
    granted_actions TEXT[]      NOT NULL DEFAULT ARRAY['read']::text[],
    -- AuditBase
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by  UUID        REFERENCES public.profiles(id) ON DELETE SET NULL,
    updated_by  UUID        REFERENCES public.profiles(id) ON DELETE SET NULL,
    version     INTEGER     NOT NULL DEFAULT 0,
    status      TEXT        NOT NULL DEFAULT 'active' CHECK (status IN ('active','deleted')),
    deleted_at  TIMESTAMPTZ,
    CONSTRAINT plan_features_plan_resource_unique UNIQUE (plan_code, resource_code)
);

-- ── plan_limits ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.plan_limits (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_code   TEXT        NOT NULL REFERENCES public.subscription_plans(code) ON DELETE CASCADE,
    limit_code  TEXT        NOT NULL,             -- 'sucursales', 'mesas', 'tickets_mes', 'usuarios'
    limit_value INTEGER,                          -- NULL = ilimitado
    -- AuditBase
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by  UUID        REFERENCES public.profiles(id) ON DELETE SET NULL,
    updated_by  UUID        REFERENCES public.profiles(id) ON DELETE SET NULL,
    version     INTEGER     NOT NULL DEFAULT 0,
    status      TEXT        NOT NULL DEFAULT 'active' CHECK (status IN ('active','deleted')),
    deleted_at  TIMESTAMPTZ,
    CONSTRAINT plan_limits_plan_code_unique UNIQUE (plan_code, limit_code)
);

-- ── team_subscriptions ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.team_subscriptions (
    id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id                 UUID        NOT NULL UNIQUE REFERENCES public.teams(id) ON DELETE CASCADE,
    plan_code               TEXT        NOT NULL REFERENCES public.subscription_plans(code),
    sub_status              TEXT        NOT NULL DEFAULT 'gratis'
        CHECK (sub_status IN ('gratis','de_paga','periodo_gracia','suspendido','cancelado')),
    stripe_customer_id      TEXT,
    stripe_subscription_id  TEXT,
    current_period_end      TIMESTAMPTZ,
    trial_end               TIMESTAMPTZ,
    grace_until             TIMESTAMPTZ,
    cancel_at_period_end    BOOLEAN     NOT NULL DEFAULT FALSE,
    -- AuditBase
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by  UUID        REFERENCES public.profiles(id) ON DELETE SET NULL,
    updated_by  UUID        REFERENCES public.profiles(id) ON DELETE SET NULL,
    version     INTEGER     NOT NULL DEFAULT 0,
    status      TEXT        NOT NULL DEFAULT 'active' CHECK (status IN ('active','deleted')),
    deleted_at  TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_team_subscriptions_stripe_customer ON public.team_subscriptions(stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_team_subscriptions_stripe_sub      ON public.team_subscriptions(stripe_subscription_id);
CREATE INDEX IF NOT EXISTS idx_team_subscriptions_status          ON public.team_subscriptions(sub_status);

-- ── billing_events ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.billing_events (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    stripe_event_id TEXT        NOT NULL UNIQUE,
    type            TEXT        NOT NULL,
    team_id         UUID        REFERENCES public.teams(id) ON DELETE SET NULL,
    payload         JSONB       NOT NULL DEFAULT '{}'::jsonb,
    processed_at    TIMESTAMPTZ,
    error_detail    TEXT,
    -- AuditBase
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by  UUID        REFERENCES public.profiles(id) ON DELETE SET NULL,
    updated_by  UUID        REFERENCES public.profiles(id) ON DELETE SET NULL,
    version     INTEGER     NOT NULL DEFAULT 0,
    status      TEXT        NOT NULL DEFAULT 'active' CHECK (status IN ('active','deleted')),
    deleted_at  TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_billing_events_team ON public.billing_events(team_id);
CREATE INDEX IF NOT EXISTS idx_billing_events_type ON public.billing_events(type);

-- ── set_updated_at en las 5 ──────────────────────────────────────────────────
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['subscription_plans','plan_features','plan_limits','team_subscriptions','billing_events'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%1$s_set_updated_at ON public.%1$s', t);
    EXECUTE format('CREATE TRIGGER trg_%1$s_set_updated_at BEFORE UPDATE ON public.%1$s FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()', t);
    EXECUTE format('ALTER TABLE public.%1$s ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;

-- ── RLS ──────────────────────────────────────────────────────────────────────
-- Catálogo: lo lee cualquiera (la página de precios es anon). Escribe god.
DROP POLICY IF EXISTS "subscription_plans_select" ON public.subscription_plans;
CREATE POLICY "subscription_plans_select" ON public.subscription_plans
  FOR SELECT TO anon, authenticated USING (is_public OR public.is_god());
DROP POLICY IF EXISTS "subscription_plans_write_god" ON public.subscription_plans;
CREATE POLICY "subscription_plans_write_god" ON public.subscription_plans
  FOR ALL TO authenticated USING (public.is_god()) WITH CHECK (public.is_god());

DROP POLICY IF EXISTS "plan_features_select" ON public.plan_features;
CREATE POLICY "plan_features_select" ON public.plan_features
  FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "plan_features_write_god" ON public.plan_features;
CREATE POLICY "plan_features_write_god" ON public.plan_features
  FOR ALL TO authenticated USING (public.is_god()) WITH CHECK (public.is_god());

DROP POLICY IF EXISTS "plan_limits_select" ON public.plan_limits;
CREATE POLICY "plan_limits_select" ON public.plan_limits
  FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "plan_limits_write_god" ON public.plan_limits;
CREATE POLICY "plan_limits_write_god" ON public.plan_limits
  FOR ALL TO authenticated USING (public.is_god()) WITH CHECK (public.is_god());

-- Suscripción: el team ve la suya; NADIE escribe por PostgREST salvo god.
-- Escriben create_tenant (definer) y el webhook (service_role). Patrón C4.
DROP POLICY IF EXISTS "team_subscriptions_select" ON public.team_subscriptions;
CREATE POLICY "team_subscriptions_select" ON public.team_subscriptions
  FOR SELECT TO authenticated USING (public.is_god() OR team_id = public.get_my_team_id());
DROP POLICY IF EXISTS "team_subscriptions_write_god" ON public.team_subscriptions;
CREATE POLICY "team_subscriptions_write_god" ON public.team_subscriptions
  FOR ALL TO authenticated USING (public.is_god()) WITH CHECK (public.is_god());
REVOKE INSERT, UPDATE, DELETE ON public.team_subscriptions FROM anon;

-- Eventos de Stripe: solo god los lee; nadie los escribe por PostgREST.
DROP POLICY IF EXISTS "billing_events_select_god" ON public.billing_events;
CREATE POLICY "billing_events_select_god" ON public.billing_events
  FOR SELECT TO authenticated USING (public.is_god());
REVOKE INSERT, UPDATE, DELETE ON public.billing_events FROM anon, authenticated;

-- ── Funciones de gate ────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.my_plan_code()
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
    SELECT ts.plan_code
    FROM public.team_subscriptions ts
    WHERE ts.team_id = public.get_my_team_id()
      AND ts.status = 'active'
    LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.my_team_is_platform_owner()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
    SELECT COALESCE(
        (SELECT t.is_platform_owner FROM public.teams t WHERE t.id = public.get_my_team_id()),
        FALSE
    );
$$;

-- ¿El plan del caller habilita esta acción sobre este recurso?
-- Un recurso que NO aparece en plan_features de ningún plan de su producto no
-- está gated → TRUE (no hay que listar todo el chasis en cada plan).
CREATE OR REPLACE FUNCTION public.plan_allows(p_resource TEXT, p_action TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
    v_plan     TEXT;
    v_producto TEXT;
BEGIN
    IF NOT public.is_platform_mode() THEN RETURN TRUE; END IF;
    IF public.is_god() OR public.my_team_is_platform_owner() THEN RETURN TRUE; END IF;

    v_plan := public.my_plan_code();
    IF v_plan IS NULL THEN RETURN FALSE; END IF;   -- tenant sin suscripción: fail-closed

    SELECT producto INTO v_producto FROM public.subscription_plans WHERE code = v_plan;

    -- ¿Está gated en este producto?
    IF NOT EXISTS (
        SELECT 1
        FROM public.plan_features pf
        JOIN public.subscription_plans sp ON sp.code = pf.plan_code
        WHERE pf.resource_code = p_resource
          AND sp.producto = v_producto
          AND pf.status = 'active'
    ) THEN
        RETURN TRUE;
    END IF;

    RETURN EXISTS (
        SELECT 1
        FROM public.plan_features pf
        WHERE pf.plan_code = v_plan
          AND pf.resource_code = p_resource
          AND pf.status = 'active'
          AND pf.granted_actions @> ARRAY[p_action]::text[]
    );
END;
$$;

-- ¿p_actual (lo que YA hay) está por debajo del tope del plan? NULL = ilimitado.
CREATE OR REPLACE FUNCTION public.plan_within_limit(p_limit_code TEXT, p_actual INTEGER)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
    v_plan  TEXT;
    v_limit INTEGER;
    v_found BOOLEAN;
BEGIN
    IF NOT public.is_platform_mode() THEN RETURN TRUE; END IF;
    IF public.is_god() OR public.my_team_is_platform_owner() THEN RETURN TRUE; END IF;

    v_plan := public.my_plan_code();
    IF v_plan IS NULL THEN RETURN FALSE; END IF;

    SELECT TRUE, pl.limit_value INTO v_found, v_limit
    FROM public.plan_limits pl
    WHERE pl.plan_code = v_plan AND pl.limit_code = p_limit_code AND pl.status = 'active';

    IF NOT COALESCE(v_found, FALSE) OR v_limit IS NULL THEN RETURN TRUE; END IF;
    RETURN COALESCE(p_actual, 0) < v_limit;
END;
$$;

-- Interruptor de morosidad. Suspendido/cancelado: lee y exporta, no escribe.
CREATE OR REPLACE FUNCTION public.team_can_write()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
    v_status TEXT;
BEGIN
    IF NOT public.is_platform_mode() THEN RETURN TRUE; END IF;
    IF public.is_god() OR public.my_team_is_platform_owner() THEN RETURN TRUE; END IF;

    SELECT ts.sub_status INTO v_status
    FROM public.team_subscriptions ts
    WHERE ts.team_id = public.get_my_team_id() AND ts.status = 'active';

    RETURN COALESCE(v_status IN ('gratis','de_paga','periodo_gracia'), FALSE);
END;
$$;

GRANT EXECUTE ON FUNCTION public.my_plan_code(), public.my_team_is_platform_owner(),
      public.plan_allows(TEXT, TEXT), public.plan_within_limit(TEXT, INTEGER),
      public.team_can_write() TO authenticated;
REVOKE EXECUTE ON FUNCTION public.my_plan_code(), public.my_team_is_platform_owner(),
      public.plan_allows(TEXT, TEXT), public.plan_within_limit(TEXT, INTEGER),
      public.team_can_write() FROM anon;

-- ── Publicación PowerSync (si existe) ────────────────────────────────────────
DO $$
DECLARE t TEXT;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'powersync') THEN
    FOREACH t IN ARRAY ARRAY['subscription_plans','plan_features','plan_limits','team_subscriptions'] LOOP
      IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables WHERE pubname = 'powersync' AND schemaname = 'public' AND tablename = t
      ) THEN
        EXECUTE format('ALTER PUBLICATION powersync ADD TABLE public.%I', t);
      END IF;
    END LOOP;
  END IF;
END $$;

COMMIT;
