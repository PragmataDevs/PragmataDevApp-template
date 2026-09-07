-- ROLLBACK de 20260907100000_platform_hygiene.sql — restaura las definiciones de
-- 090000/092000/093000/094000/095000/098000/099000 y del schema base.
-- ⚠️ Vuelven los hallazgos M1, M3–M8 y A5 de Cancerbero.
BEGIN;

-- E1
DROP POLICY IF EXISTS "View Authorized Entities" ON public.entities;
CREATE POLICY "View Authorized Entities" ON public.entities FOR SELECT USING (
    public.is_god()
    OR public.my_team_is_platform_owner()
    OR (
        team_id = public.get_my_team_id()
        AND (
            id IN (SELECT entity_id FROM public.sys_entity_access WHERE user_id = auth.uid())
            OR public.check_permission('page_settings_entities', 'read')
        )
    )
);

-- M1
DROP POLICY IF EXISTS "Insert Entities" ON public.entities;
CREATE POLICY "Insert Entities" ON public.entities FOR INSERT WITH CHECK (
    public.is_god()
    OR (team_id = public.get_my_team_id() AND public.check_permission('page_settings_entities', 'create'))
);
DROP FUNCTION IF EXISTS public.entities_within_plan_limit();
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
ALTER TABLE public.platform_settings DROP COLUMN IF EXISTS entity_limit_code;
ALTER TABLE public.plan_limits DROP COLUMN IF EXISTS seat_based;
ALTER TABLE public.team_subscriptions DROP COLUMN IF EXISTS quantity;

-- A5
DROP POLICY IF EXISTS "Platform Owner View Teams" ON public.teams;
CREATE POLICY "Platform Owner View Teams" ON public.teams
  FOR SELECT TO authenticated USING (public.is_platform_owner_admin());
DROP POLICY IF EXISTS "Platform Owner View Profiles" ON public.profiles;
CREATE POLICY "Platform Owner View Profiles" ON public.profiles
  FOR SELECT TO authenticated USING (public.is_platform_owner_admin());
DROP POLICY IF EXISTS "Platform Owner View Subscriptions" ON public.team_subscriptions;
CREATE POLICY "Platform Owner View Subscriptions" ON public.team_subscriptions
  FOR SELECT TO authenticated USING (public.is_platform_owner_admin());
DROP POLICY IF EXISTS "Platform Owner View AI Usage" ON public.ai_usage;
CREATE POLICY "Platform Owner View AI Usage" ON public.ai_usage
  FOR SELECT TO authenticated USING (public.is_platform_owner_admin());
DROP POLICY IF EXISTS "Platform Owner View Signup Log" ON public.tenant_signup_log;
CREATE POLICY "Platform Owner View Signup Log" ON public.tenant_signup_log
  FOR SELECT TO authenticated USING (public.is_platform_owner_admin());
DROP POLICY IF EXISTS "Platform Owner View Billing Events" ON public.billing_events;
CREATE POLICY "Platform Owner View Billing Events" ON public.billing_events
  FOR SELECT TO authenticated USING (public.is_platform_owner_admin());
DROP POLICY IF EXISTS "Platform Owner View God Access Log" ON public.god_access_log;
CREATE POLICY "Platform Owner View God Access Log" ON public.god_access_log
  FOR SELECT TO authenticated USING (public.is_platform_owner_admin());
DROP POLICY IF EXISTS "god_access_log_select_own" ON public.god_access_log;
DROP FUNCTION IF EXISTS public.platform_tenant_stats();

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
DROP FUNCTION IF EXISTS public.support_session_open(UUID);
DROP FUNCTION IF EXISTS public.session_mfa_ok();
ALTER TABLE public.platform_settings DROP COLUMN IF EXISTS require_mfa_platform_owner;

-- M3
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    BEGIN PERFORM cron.unschedule('ai-expire-reservations'); EXCEPTION WHEN OTHERS THEN NULL; END;
  END IF;
END $$;
DROP FUNCTION IF EXISTS public.ai_reserve(TEXT);
DROP FUNCTION IF EXISTS public.ai_expire_reservations(UUID);
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
    SELECT COALESCE(SUM(cost_usd), 0) INTO v_today_usd
    FROM public.ai_usage WHERE created_at >= date_trunc('day', now());
    IF v_today_usd >= v_settings.ai_daily_budget_usd AND NOT public.is_god() THEN
        RETURN jsonb_build_object('allowed', FALSE, 'reason', 'global_budget_exhausted');
    END IF;
    IF NOT v_privileged THEN
        SELECT COALESCE(SUM(cost_usd), 0) INTO v_team_usd
        FROM public.ai_usage WHERE team_id = v_team AND created_at >= date_trunc('day', now());
        IF v_team_usd >= v_settings.ai_team_daily_budget_usd THEN
            RETURN jsonb_build_object('allowed', FALSE, 'reason', 'team_budget_exhausted');
        END IF;
    END IF;
    IF public.is_platform_mode() AND NOT v_privileged THEN
        IF NOT public.team_can_write() THEN
            RETURN jsonb_build_object('allowed', FALSE, 'reason', 'team_cannot_write');
        END IF;
        SELECT TRUE, pl.limit_value INTO v_has_limit, v_limit
        FROM public.plan_limits pl
        WHERE pl.plan_code = public.my_plan_code()
          AND pl.limit_code = 'ia_' || p_feature || '_mes'
          AND pl.status = 'active';
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
DROP INDEX IF EXISTS public.idx_ai_usage_team_state;
ALTER TABLE public.ai_usage DROP COLUMN IF EXISTS state;

-- M8
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
    IF public.is_god() THEN RETURN NEW; END IF;
    IF current_uid IS NULL THEN RETURN NEW; END IF;
    IF TG_OP = 'INSERT'
       AND bootstrap_team IS NOT NULL
       AND bootstrap_team <> ''
       AND bootstrap_team = NEW.team_id::text
       AND NEW.id = current_uid
       AND NEW.access_level = 'admin' THEN
        RETURN NEW;
    END IF;
    SELECT p.access_level, p.team_id INTO actor_level, actor_team
    FROM public.profiles p WHERE p.id = current_uid;
    IF TG_OP = 'INSERT' THEN
        IF NEW.access_level IS DISTINCT FROM 'member' THEN
            IF actor_level IS DISTINCT FROM 'admin' THEN
                RAISE EXCEPTION 'Not authorized to create a user with this access level' USING ERRCODE = '42501';
            END IF;
            IF NEW.access_level = 'god' THEN
                RAISE EXCEPTION 'Only a god may create a god user' USING ERRCODE = '42501';
            END IF;
        END IF;
        IF NEW.team_id IS DISTINCT FROM actor_team THEN
            RAISE EXCEPTION 'Cannot create a user in another team' USING ERRCODE = '42501';
        END IF;
        RETURN NEW;
    END IF;
    IF NEW.access_level IS DISTINCT FROM OLD.access_level THEN
        IF actor_level IS DISTINCT FROM 'admin' THEN
            RAISE EXCEPTION 'Not authorized to change access_level' USING ERRCODE = '42501';
        END IF;
        IF NEW.access_level = 'god' THEN
            RAISE EXCEPTION 'Only a god may grant the god access level' USING ERRCODE = '42501';
        END IF;
    END IF;
    IF NEW.role_id IS DISTINCT FROM OLD.role_id THEN
        IF NOT public.check_permission('page_settings_usuarios', 'update') THEN
            RAISE EXCEPTION 'Not authorized to change role' USING ERRCODE = '42501';
        END IF;
    END IF;
    IF NEW.team_id IS DISTINCT FROM OLD.team_id THEN
        RAISE EXCEPTION 'Not authorized to change team' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
END;
$$;

-- M7
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
    IF v_slug !~ '^[a-z0-9]{3,40}(-[a-z0-9]+)*$' THEN
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

-- M6
DROP POLICY IF EXISTS "Add Participant" ON public.chat_participants;
CREATE POLICY "Add Participant" ON public.chat_participants
    FOR INSERT WITH CHECK (
        public.is_god()
        OR user_id = auth.uid()
        OR public.is_chat_participant(conversation_id)
        OR EXISTS (
            SELECT 1 FROM public.chat_conversations
            WHERE id = conversation_id AND created_by = auth.uid()
        )
    );

-- M4
DROP FUNCTION IF EXISTS public.get_platform_public_settings();
DROP POLICY IF EXISTS "platform_settings_select" ON public.platform_settings;
CREATE POLICY "platform_settings_select" ON public.platform_settings
  FOR SELECT TO anon, authenticated USING (true);

COMMIT;
