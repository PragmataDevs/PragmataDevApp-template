-- ============================================================================
-- platform_hygiene — cierra los pendientes M1, M3–M8 y A5 de la auditoría de
-- Cancerbero (cuentaaparte/docs/auditoria-cancerbero-hito0.md, 4-5 sep 2026)
-- ============================================================================
-- Todo idéntico en comportamiento para clientes mono-tenant (platform_mode off):
--
--   M4  platform_settings ya NO es legible por anon. Lo público (¿está abierto el
--       registro?, ¿qué producto?) sale por get_platform_public_settings().
--   M6  chat_participants: nadie se agrega solo a una conversación conociendo el
--       UUID; agrega el creador o un participante, y solo a gente de su team.
--   M7  slug: `ab-cd` es válido. La regla es 3–40 chars en total, segmentos de
--       [a-z0-9] separados por un guion.
--   M8  passthrough del guard de perfiles (create_tenant): además del GUC, el
--       team debe estar VACÍO de perfiles. El comentario original decía que un
--       authenticated no podía fijar el GUC; sí puede (set_config es de
--       pg_catalog pero PostgREST ejecuta SQL arbitrario dentro de funciones
--       propias). Lo que frenaba el ataque era el RLS de profiles; ahora el guard
--       también lo frena por sí solo (defensa en profundidad real).
--   M3  cuota de IA sin carrera: ai_reserve() toma un advisory lock por team,
--       expira reservas viejas, re-evalúa ai_can_run() y deja una fila
--       `state='reserved'` que CUENTA para la cuota hasta que la edge function la
--       cierre (state='done') o caduque (10 min → 'expired', costo 0).
--   A5  lectura cruzada de PragmataDevs con bitácora y MFA:
--       - session_mfa_ok(): quien tiene TOTP verificado debe venir en aal2; si
--         platform_settings.require_mfa_platform_owner está encendido, los admins
--         del team platform owner necesitan aal2 aunque no hayan enrolado.
--       - las policies "Platform Owner View …" exigen session_mfa_ok(); la de
--         profiles (datos personales) exige además support_session_open(team):
--         una fila abierta en god_access_log de ESE actor para ESE team (<8 h).
--       - log_god_access()/end_god_access() ahora también para el admin del team
--         platform owner. platform_tenant_stats() da los conteos del dashboard
--         sin abrir sesión (no expone datos personales).
--   E1  "View Authorized Entities" (093000) dejaba pasar a CUALQUIER miembro del
--       team platform owner (`my_team_is_platform_owner()`): en un mono-tenant el
--       único team es el platform owner y todo member sin sys_entity_access veía
--       todas las entities; en Cuenta Aparte un member de PragmataDevs veía las
--       sucursales de todos los restaurantes. Ahora esa rama exige admin/god del
--       team platform owner con MFA ok (hallazgo de Sócrates, backport 7-sep).
--   M1  cobro por sucursal: team_subscriptions.quantity (lo escribe el webhook),
--       plan_limits.seat_based (el tope es la cantidad pagada) y la policy de
--       INSERT en entities compone entities_within_plan_limit(). El código del
--       límite es platform_settings.entity_limit_code ('entities' por default;
--       Cuenta Aparte lo pone en 'sucursales').
--
-- Idempotente. Reversa: down_20260907100000_platform_hygiene.sql
-- ============================================================================
BEGIN;

-- ── M4: platform_settings solo para authenticated + lectura pública acotada ─
DROP POLICY IF EXISTS "platform_settings_select" ON public.platform_settings;
CREATE POLICY "platform_settings_select" ON public.platform_settings
  FOR SELECT TO authenticated USING (true);

CREATE OR REPLACE FUNCTION public.get_platform_public_settings()
RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT COALESCE(
    (SELECT jsonb_build_object('platform_mode', platform_mode, 'default_product', default_product)
       FROM public.platform_settings WHERE id = 1 AND status = 'active'),
    jsonb_build_object('platform_mode', FALSE, 'default_product', NULL)
  );
$$;
REVOKE ALL ON FUNCTION public.get_platform_public_settings() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_platform_public_settings() TO anon, authenticated;

-- ── M6: chat_participants sin auto-invitación y dentro del team ──────────────
DROP POLICY IF EXISTS "Add Participant" ON public.chat_participants;
CREATE POLICY "Add Participant" ON public.chat_participants
  FOR INSERT WITH CHECK (
    public.is_god()
    OR (
      -- quien agrega: el creador de la conversación o alguien que ya está dentro
      (
        EXISTS (SELECT 1 FROM public.chat_conversations c WHERE c.id = conversation_id AND c.created_by = auth.uid())
        OR public.is_chat_participant(conversation_id)
      )
      -- a quién agrega: alguien de su propio team (el creador se agrega a sí mismo por esta vía)
      AND EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = user_id AND p.team_id = public.get_my_team_id() AND p.status = 'active'
      )
    )
  );

-- ── M7: slug 3–40 en total, segmentos [a-z0-9] con guion ─────────────────────
CREATE OR REPLACE FUNCTION public.check_slug_available(p_slug TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
    v_slug TEXT := lower(trim(coalesce(p_slug, '')));
BEGIN
    IF length(v_slug) NOT BETWEEN 3 AND 40 OR v_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' THEN
        RETURN jsonb_build_object('available', FALSE, 'reason', 'slug_invalid');
    END IF;
    IF EXISTS (SELECT 1 FROM public.platform_reserved_slugs WHERE slug = v_slug AND status = 'active') THEN
        RETURN jsonb_build_object('available', FALSE, 'reason', 'slug_reserved');
    END IF;
    IF EXISTS (SELECT 1 FROM public.teams WHERE lower(slug) = v_slug) THEN
        RETURN jsonb_build_object('available', FALSE, 'reason', 'slug_taken');
    END IF;
    RETURN jsonb_build_object('available', TRUE, 'slug', v_slug);
END;
$$;

-- ── M8: passthrough del guard solo hacia un team todavía vacío ───────────────
CREATE OR REPLACE FUNCTION public.enforce_profile_privilege_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    current_uid UUID := auth.uid();
    actor_level TEXT;
    actor_team  UUID;
    bootstrap_team TEXT := current_setting('pragmata.tenant_bootstrap', true);
BEGIN
    IF public.is_god() THEN
        RETURN NEW;
    END IF;

    IF current_uid IS NULL THEN
        RETURN NEW; -- trusted backend (service_role) / internal definer chain
    END IF;

    -- Passthrough de alta self-serve (create_tenant): solo el INSERT del PROPIO
    -- perfil, como admin, en el team que la misma transacción acaba de crear y
    -- que por lo tanto NO tiene perfiles todavía. Un authenticated SÍ puede
    -- fijar el GUC (set_config); por eso el guard exige el team vacío y el RLS
    -- de profiles exige team_id = get_my_team_id(): dos frenos independientes.
    IF TG_OP = 'INSERT'
       AND bootstrap_team IS NOT NULL
       AND bootstrap_team <> ''
       AND bootstrap_team = NEW.team_id::text
       AND NEW.id = current_uid
       AND NEW.access_level = 'admin'
       AND NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.team_id = NEW.team_id) THEN
        RETURN NEW;
    END IF;

    SELECT p.access_level, p.team_id INTO actor_level, actor_team
    FROM public.profiles p
    WHERE p.id = current_uid;

    IF TG_OP = 'INSERT' THEN
        IF NEW.access_level IS DISTINCT FROM 'member' THEN
            IF actor_level IS DISTINCT FROM 'admin' THEN
                RAISE EXCEPTION 'Not authorized to create a user with this access level'
                    USING ERRCODE = '42501';
            END IF;
            IF NEW.access_level = 'god' THEN
                RAISE EXCEPTION 'Only a god may create a god user'
                    USING ERRCODE = '42501';
            END IF;
        END IF;
        IF NEW.team_id IS DISTINCT FROM actor_team THEN
            RAISE EXCEPTION 'Cannot create a user in another team'
                USING ERRCODE = '42501';
        END IF;
        RETURN NEW;
    END IF;

    IF NEW.access_level IS DISTINCT FROM OLD.access_level THEN
        IF actor_level IS DISTINCT FROM 'admin' THEN
            RAISE EXCEPTION 'Not authorized to change access_level'
                USING ERRCODE = '42501';
        END IF;
        IF NEW.access_level = 'god' THEN
            RAISE EXCEPTION 'Only a god may grant the god access level'
                USING ERRCODE = '42501';
        END IF;
    END IF;

    IF NEW.role_id IS DISTINCT FROM OLD.role_id THEN
        IF NOT public.check_permission('page_settings_usuarios', 'update') THEN
            RAISE EXCEPTION 'Not authorized to change role'
                USING ERRCODE = '42501';
        END IF;
    END IF;

    IF NEW.team_id IS DISTINCT FROM OLD.team_id THEN
        RAISE EXCEPTION 'Not authorized to change team'
            USING ERRCODE = '42501';
    END IF;

    RETURN NEW;
END;
$$;

-- ── M3: reservas de cuota de IA (sin TOCTOU) ─────────────────────────────────
ALTER TABLE public.ai_usage
  ADD COLUMN IF NOT EXISTS state TEXT NOT NULL DEFAULT 'done'
  CHECK (state IN ('reserved','done','expired'));
CREATE INDEX IF NOT EXISTS idx_ai_usage_team_state ON public.ai_usage(team_id, state, created_at DESC);

-- ai_can_run: igual que antes, pero las reservas vivas cuentan para la cuota
-- mensual (las expiradas ya tienen costo 0 y ok=false, no cuentan en nada).
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

    -- Presupuesto global del día (las reservas vivas llevan su costo estimado)
    SELECT COALESCE(SUM(cost_usd), 0) INTO v_today_usd
    FROM public.ai_usage WHERE created_at >= date_trunc('day', now()) AND state <> 'expired';
    IF v_today_usd >= v_settings.ai_daily_budget_usd AND NOT public.is_god() THEN
        RETURN jsonb_build_object('allowed', FALSE, 'reason', 'global_budget_exhausted');
    END IF;

    -- Tope diario por team (un tenant no deja sin IA a los demás)
    IF NOT v_privileged THEN
        SELECT COALESCE(SUM(cost_usd), 0) INTO v_team_usd
        FROM public.ai_usage WHERE team_id = v_team AND created_at >= date_trunc('day', now()) AND state <> 'expired';
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
            WHERE team_id = v_team AND feature = p_feature
              AND (ok OR (state = 'reserved' AND created_at > now() - interval '10 minutes'))
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

-- Caduca reservas que nadie cerró (edge function caída): costo 0, no cuentan.
CREATE OR REPLACE FUNCTION public.ai_expire_reservations(p_team UUID DEFAULT NULL)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_n INTEGER;
BEGIN
    UPDATE public.ai_usage
       SET state = 'expired', cost_usd = 0, ok = FALSE, error_detail = 'reservation_expired'
     WHERE state = 'reserved'
       AND created_at < now() - interval '10 minutes'
       AND (p_team IS NULL OR team_id = p_team);
    GET DIAGNOSTICS v_n = ROW_COUNT;
    RETURN v_n;
END;
$$;
REVOKE ALL ON FUNCTION public.ai_expire_reservations(UUID) FROM PUBLIC, anon, authenticated;

-- ai_reserve: la ÚNICA puerta que deben usar las edge functions antes de llamar
-- al modelo. Serializa por team, re-evalúa y deja la reserva contando.
CREATE OR REPLACE FUNCTION public.ai_reserve(p_feature TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_team  UUID := public.get_my_team_id();
    v_gate  JSONB;
    v_model TEXT;
    v_cost  NUMERIC;
    v_id    UUID;
BEGIN
    IF v_team IS NULL THEN
        RETURN public.ai_can_run(p_feature); -- devuelve el motivo (no_team / not_authenticated…)
    END IF;

    PERFORM pg_advisory_xact_lock(hashtext('ai_reserve'), hashtext(v_team::text));
    PERFORM public.ai_expire_reservations(v_team);

    v_gate := public.ai_can_run(p_feature);
    IF NOT COALESCE((v_gate->>'allowed')::boolean, FALSE) THEN
        RETURN v_gate;
    END IF;

    v_model := v_gate->>'model';
    -- Estimación conservadora de una llamada típica; la edge function la sustituye por el costo real.
    v_cost  := COALESCE(public.ai_estimate_cost(v_model, 4000, 1500), 0);

    INSERT INTO public.ai_usage (team_id, user_id, feature, model, cost_usd, ok, state, error_detail, created_by, updated_by)
    VALUES (v_team, auth.uid(), p_feature, v_model, v_cost, FALSE, 'reserved', 'reserved', auth.uid(), auth.uid())
    RETURNING id INTO v_id;

    RETURN v_gate || jsonb_build_object('reservation_id', v_id);
END;
$$;
REVOKE ALL ON FUNCTION public.ai_reserve(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ai_reserve(TEXT) TO authenticated;

-- El log de consumo (privacy_cleanup_logs) ya corre diario; la caducidad de
-- reservas es lazy por team en ai_reserve y global cada 15 min si hay pg_cron.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    BEGIN PERFORM cron.unschedule('ai-expire-reservations'); EXCEPTION WHEN OTHERS THEN NULL; END;
    PERFORM cron.schedule('ai-expire-reservations', '*/15 * * * *', $job$SELECT public.ai_expire_reservations()$job$);
  ELSE
    RAISE NOTICE 'pg_cron no disponible: ai_expire_reservations() corre lazy por team en ai_reserve()';
  END IF;
END $$;

-- ── A5: MFA + bitácora obligatoria en la lectura cruzada ─────────────────────
ALTER TABLE public.platform_settings
  ADD COLUMN IF NOT EXISTS require_mfa_platform_owner BOOLEAN NOT NULL DEFAULT FALSE;

-- ¿La sesión trae el segundo factor cuando debe traerlo?
--   · aal2 → sí.
--   · el usuario tiene TOTP verificado y viene en aal1 → no (enroló, debe usarlo).
--   · no tiene factor → sí, salvo que la plataforma exija MFA a los admins del
--     team platform owner y este usuario sea uno de ellos.
--   · sin usuario (service_role / definer) → sí.
CREATE OR REPLACE FUNCTION public.session_mfa_ok()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
    v_uid     UUID := auth.uid();
    v_aal     TEXT := COALESCE(auth.jwt()->>'aal', 'aal1');
    v_require BOOLEAN;
BEGIN
    IF v_uid IS NULL THEN RETURN TRUE; END IF;
    IF v_aal = 'aal2' THEN RETURN TRUE; END IF;
    IF EXISTS (SELECT 1 FROM auth.mfa_factors f WHERE f.user_id = v_uid AND f.status = 'verified') THEN
        RETURN FALSE;
    END IF;
    SELECT require_mfa_platform_owner INTO v_require FROM public.platform_settings WHERE id = 1;
    IF COALESCE(v_require, FALSE) AND public.is_platform_owner_admin() THEN
        RETURN FALSE;
    END IF;
    RETURN TRUE;
END;
$$;
GRANT EXECUTE ON FUNCTION public.session_mfa_ok() TO authenticated;
REVOKE EXECUTE ON FUNCTION public.session_mfa_ok() FROM anon;

-- ¿Este actor tiene una sesión de soporte abierta sobre ese team?
CREATE OR REPLACE FUNCTION public.support_session_open(p_team UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.god_access_log g
    WHERE g.team_id = p_team
      AND g.actor_id = auth.uid()
      AND g.ended_at IS NULL
      AND g.status = 'active'
      AND g.started_at > now() - interval '8 hours'
  );
$$;
GRANT EXECUTE ON FUNCTION public.support_session_open(UUID) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.support_session_open(UUID) FROM anon;

-- Abrir/cerrar sesión también para el admin del team platform owner (con MFA ok).
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
    IF NOT (public.is_god() OR (public.is_platform_owner_admin() AND public.session_mfa_ok())) THEN
        RAISE EXCEPTION 'only_platform_staff' USING ERRCODE = '42501';
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
    IF NOT (public.is_god() OR public.is_platform_owner_admin()) THEN
        RAISE EXCEPTION 'only_platform_staff' USING ERRCODE = '42501';
    END IF;
    UPDATE public.god_access_log SET ended_at = now(), updated_by = auth.uid()
    WHERE id = p_id AND actor_id = auth.uid() AND ended_at IS NULL;
END;
$$;
GRANT EXECUTE ON FUNCTION public.end_god_access(UUID) TO authenticated;

-- El actor ve sus propias sesiones (para mostrar "sesión abierta" en la UI).
DROP POLICY IF EXISTS "god_access_log_select_own" ON public.god_access_log;
CREATE POLICY "god_access_log_select_own" ON public.god_access_log
  FOR SELECT TO authenticated USING (actor_id = auth.uid());

-- Conteos del dashboard sin abrir sesión: no exponen datos personales.
CREATE OR REPLACE FUNCTION public.platform_tenant_stats()
RETURNS TABLE (team_id UUID, usuarios INTEGER, entidades INTEGER)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT t.id,
         (SELECT count(*)::int FROM public.profiles p WHERE p.team_id = t.id AND p.status = 'active'),
         (SELECT count(*)::int FROM public.entities e WHERE e.team_id = t.id AND e.status = 'active')
  FROM public.teams t
  WHERE t.status = 'active'
    AND (public.is_god() OR (public.is_platform_owner_admin() AND public.session_mfa_ok()));
$$;
REVOKE ALL ON FUNCTION public.platform_tenant_stats() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_tenant_stats() TO authenticated;

-- Policies de lectura cruzada (098000) con MFA; profiles además con sesión.
DROP POLICY IF EXISTS "Platform Owner View Teams" ON public.teams;
CREATE POLICY "Platform Owner View Teams" ON public.teams
  FOR SELECT TO authenticated USING (public.is_platform_owner_admin() AND public.session_mfa_ok());

DROP POLICY IF EXISTS "Platform Owner View Profiles" ON public.profiles;
CREATE POLICY "Platform Owner View Profiles" ON public.profiles
  FOR SELECT TO authenticated USING (
    public.is_platform_owner_admin() AND public.session_mfa_ok() AND public.support_session_open(team_id)
  );

DROP POLICY IF EXISTS "Platform Owner View Subscriptions" ON public.team_subscriptions;
CREATE POLICY "Platform Owner View Subscriptions" ON public.team_subscriptions
  FOR SELECT TO authenticated USING (public.is_platform_owner_admin() AND public.session_mfa_ok());

DROP POLICY IF EXISTS "Platform Owner View AI Usage" ON public.ai_usage;
CREATE POLICY "Platform Owner View AI Usage" ON public.ai_usage
  FOR SELECT TO authenticated USING (public.is_platform_owner_admin() AND public.session_mfa_ok());

DROP POLICY IF EXISTS "Platform Owner View Signup Log" ON public.tenant_signup_log;
CREATE POLICY "Platform Owner View Signup Log" ON public.tenant_signup_log
  FOR SELECT TO authenticated USING (public.is_platform_owner_admin() AND public.session_mfa_ok());

DROP POLICY IF EXISTS "Platform Owner View Billing Events" ON public.billing_events;
CREATE POLICY "Platform Owner View Billing Events" ON public.billing_events
  FOR SELECT TO authenticated USING (public.is_platform_owner_admin() AND public.session_mfa_ok());

DROP POLICY IF EXISTS "Platform Owner View God Access Log" ON public.god_access_log;
CREATE POLICY "Platform Owner View God Access Log" ON public.god_access_log
  FOR SELECT TO authenticated USING (public.is_platform_owner_admin() AND public.session_mfa_ok());

-- ── M1: cobro por sucursal (seats) ───────────────────────────────────────────
ALTER TABLE public.team_subscriptions
  ADD COLUMN IF NOT EXISTS quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity >= 1);
ALTER TABLE public.plan_limits
  ADD COLUMN IF NOT EXISTS seat_based BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.platform_settings
  ADD COLUMN IF NOT EXISTS entity_limit_code TEXT NOT NULL DEFAULT 'entities';

-- plan_within_limit: un límite seat_based vale lo que el team paga (quantity).
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
    v_seat  BOOLEAN;
BEGIN
    IF NOT public.is_platform_mode() THEN RETURN TRUE; END IF;
    IF public.is_god() OR public.my_team_is_platform_owner() THEN RETURN TRUE; END IF;

    v_plan := public.my_plan_code();
    IF v_plan IS NULL THEN RETURN FALSE; END IF;

    SELECT TRUE, pl.limit_value, pl.seat_based INTO v_found, v_limit, v_seat
    FROM public.plan_limits pl
    WHERE pl.plan_code = v_plan AND pl.limit_code = p_limit_code AND pl.status = 'active';

    IF NOT COALESCE(v_found, FALSE) THEN RETURN TRUE; END IF;

    IF COALESCE(v_seat, FALSE) THEN
        SELECT ts.quantity INTO v_limit
        FROM public.team_subscriptions ts
        WHERE ts.team_id = public.get_my_team_id() AND ts.status = 'active';
        v_limit := COALESCE(v_limit, 1);
    END IF;

    IF v_limit IS NULL THEN RETURN TRUE; END IF;
    RETURN COALESCE(p_actual, 0) < v_limit;
END;
$$;

CREATE OR REPLACE FUNCTION public.entities_within_plan_limit()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT public.plan_within_limit(
    COALESCE((SELECT entity_limit_code FROM public.platform_settings WHERE id = 1), 'entities'),
    (SELECT count(*)::int FROM public.entities e WHERE e.team_id = public.get_my_team_id() AND e.status = 'active')
  );
$$;
GRANT EXECUTE ON FUNCTION public.entities_within_plan_limit() TO authenticated;
REVOKE EXECUTE ON FUNCTION public.entities_within_plan_limit() FROM anon;

DROP POLICY IF EXISTS "Insert Entities" ON public.entities;
CREATE POLICY "Insert Entities" ON public.entities FOR INSERT WITH CHECK (
    public.is_god()
    OR (team_id = public.get_my_team_id()
        AND public.check_permission('page_settings_entities', 'create')
        AND public.entities_within_plan_limit())
);

-- ── E1: la lectura cruzada de entities es solo para admin/god del platform owner ─
DROP POLICY IF EXISTS "View Authorized Entities" ON public.entities;
CREATE POLICY "View Authorized Entities" ON public.entities FOR SELECT USING (
    public.is_god()
    OR (public.is_platform_owner_admin() AND public.session_mfa_ok())
    OR (
        team_id = public.get_my_team_id()
        AND (
            id IN (SELECT entity_id FROM public.sys_entity_access WHERE user_id = auth.uid())
            OR public.check_permission('page_settings_entities', 'read')
        )
    )
);

COMMIT;
