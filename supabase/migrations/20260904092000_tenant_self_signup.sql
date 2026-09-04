-- ============================================================================
-- tenant_self_signup — Modo plataforma, parte 3 de 3: alta self-serve
-- ============================================================================
-- Spec: docs/spec-capa-comun-self-serve.md §1. RPC explícita create_tenant(),
-- NO trigger en auth.users (correría también para comensales anónimos, no tiene
-- los datos de negocio, y una excepción ahí rompe el signup de GoTrue).
--
-- Instala:
--   tenant_signup_log      auditoría de altas (solo éxitos: un fallo hace
--                          ROLLBACK y no hay tx autónoma en PG; el rate limit
--                          por IP es chamba del edge/Turnstile, no de la DB).
--   sys_roles 'tenant_admin' rol de sistema del dueño de un tenant.
--   check_slug_available() para el wizard (anon y authenticated).
--   create_tenant()        SECURITY DEFINER, fail-closed, transaccional.
--
-- Anti-teams-infinitos ESTRUCTURAL: profiles.id = auth.users.id (PK) → un
-- usuario tiene exactamente un team. No hace falta contador.
--
-- Con platform_mode apagado create_tenant() niega → cero cambio en clientes.
-- Idempotente. Reversa: down_20260904092000_tenant_self_signup.sql
-- ============================================================================

BEGIN;

-- ── tenant_signup_log ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.tenant_signup_log (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID,                       -- sin FK: si el usuario se borra, el log queda
    team_id     UUID        REFERENCES public.teams(id) ON DELETE SET NULL,
    slug        TEXT        NOT NULL,
    producto    TEXT        NOT NULL,
    ip_hash     TEXT,
    outcome     TEXT        NOT NULL DEFAULT 'ok' CHECK (outcome IN ('ok')),
    -- AuditBase
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by  UUID        REFERENCES public.profiles(id) ON DELETE SET NULL,
    updated_by  UUID        REFERENCES public.profiles(id) ON DELETE SET NULL,
    version     INTEGER     NOT NULL DEFAULT 0,
    status      TEXT        NOT NULL DEFAULT 'active' CHECK (status IN ('active','deleted')),
    deleted_at  TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_tenant_signup_log_created ON public.tenant_signup_log(created_at DESC);
ALTER TABLE public.tenant_signup_log ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS trg_tenant_signup_log_set_updated_at ON public.tenant_signup_log;
CREATE TRIGGER trg_tenant_signup_log_set_updated_at
  BEFORE UPDATE ON public.tenant_signup_log
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP POLICY IF EXISTS "tenant_signup_log_select_god" ON public.tenant_signup_log;
CREATE POLICY "tenant_signup_log_select_god" ON public.tenant_signup_log
  FOR SELECT TO authenticated USING (public.is_god());
REVOKE INSERT, UPDATE, DELETE ON public.tenant_signup_log FROM anon, authenticated;

-- ── Rol de sistema: tenant_admin ─────────────────────────────────────────────
-- access_level='admin' ya da acceso total dentro del team (check_permission);
-- el rol existe para que el RBAC UI sea coherente y para que el trigger de sync
-- tenga qué copiar. Se le dan todos los recursos activos con sus default_actions.
INSERT INTO public.sys_roles (name, description, is_system_role, is_dev_role, can_be_customized)
VALUES ('tenant_admin', 'Dueño/administrador de un tenant self-serve. Acceso total a su propio equipo.', TRUE, FALSE, FALSE)
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.sys_role_definitions (role_id, resource_code, granted_actions)
SELECT r.id, res.code, res.default_actions
FROM public.sys_roles r
CROSS JOIN public.sys_resources res
WHERE r.name = 'tenant_admin'
  AND res.resource_status = 'active' AND res.status = 'active'
ON CONFLICT (role_id, resource_code) DO NOTHING;

-- ── check_slug_available(p_slug) ─────────────────────────────────────────────
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
GRANT EXECUTE ON FUNCTION public.check_slug_available(TEXT) TO anon, authenticated;

-- ── create_tenant(...) ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_tenant(
    p_nombre          TEXT,
    p_slug            TEXT,
    p_primera_entidad TEXT,
    p_producto        TEXT DEFAULT NULL,
    p_ip_hash         TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid        UUID := auth.uid();
    v_email      TEXT;
    v_confirmed  TIMESTAMPTZ;
    v_full_name  TEXT;
    v_slug       TEXT := lower(trim(coalesce(p_slug, '')));
    v_nombre     TEXT := trim(coalesce(p_nombre, ''));
    v_entidad    TEXT := trim(coalesce(p_primera_entidad, ''));
    v_producto   TEXT;
    v_plan       TEXT;
    v_role_id    UUID;
    v_team_id    UUID;
    v_entity_id  UUID;
    v_check      JSONB;
BEGIN
    -- 0. Modo plataforma
    IF NOT public.is_platform_mode() THEN
        RAISE EXCEPTION 'platform_mode_off' USING ERRCODE = '42501';
    END IF;

    -- 1. Identidad del caller: autenticado, NO anónimo, correo confirmado
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
    END IF;
    IF COALESCE((auth.jwt()->>'is_anonymous')::boolean, FALSE) THEN
        RAISE EXCEPTION 'anonymous_not_allowed' USING ERRCODE = '42501';
    END IF;

    SELECT u.email, u.email_confirmed_at, u.raw_user_meta_data->>'full_name'
      INTO v_email, v_confirmed, v_full_name
    FROM auth.users u WHERE u.id = v_uid;

    IF v_email IS NULL THEN
        RAISE EXCEPTION 'user_not_found' USING ERRCODE = '42501';
    END IF;
    IF v_confirmed IS NULL THEN
        RAISE EXCEPTION 'email_not_confirmed' USING ERRCODE = '42501';
    END IF;

    -- 2. Un usuario = un team (estructural: profiles.id es PK = auth.users.id)
    IF EXISTS (SELECT 1 FROM public.profiles WHERE id = v_uid) THEN
        RAISE EXCEPTION 'already_has_team' USING ERRCODE = '23505';
    END IF;

    -- 3. Datos de negocio
    IF length(v_nombre) < 2 OR length(v_nombre) > 120 THEN
        RAISE EXCEPTION 'nombre_invalid' USING ERRCODE = '22023';
    END IF;
    IF length(v_entidad) < 1 OR length(v_entidad) > 120 THEN
        RAISE EXCEPTION 'entidad_invalid' USING ERRCODE = '22023';
    END IF;

    v_check := public.check_slug_available(v_slug);
    IF NOT (v_check->>'available')::boolean THEN
        RAISE EXCEPTION '%', (v_check->>'reason') USING ERRCODE = '23505';
    END IF;

    -- 4. Producto y plan gratis
    SELECT COALESCE(p_producto, ps.default_product) INTO v_producto
    FROM public.platform_settings ps WHERE ps.id = 1;

    SELECT sp.code INTO v_plan
    FROM public.subscription_plans sp
    WHERE sp.producto = v_producto AND sp.is_default_free AND sp.status = 'active'
    LIMIT 1;
    IF v_plan IS NULL THEN
        RAISE EXCEPTION 'no_free_plan_for_product' USING ERRCODE = '42704';
    END IF;

    SELECT r.id INTO v_role_id FROM public.sys_roles r WHERE r.name = 'tenant_admin' AND r.status = 'active';
    IF v_role_id IS NULL THEN
        RAISE EXCEPTION 'tenant_admin_role_missing' USING ERRCODE = '42704';
    END IF;

    -- 5. Transacción de alta. is_platform_owner va FALSE literal, jamás de parámetro.
    --    created_by/updated_by van NULL aquí: teams.created_by tiene FK a profiles y
    --    el perfil del dueño se crea en el paso siguiente; se completan abajo.
    INSERT INTO public.teams (name, slug, is_platform_owner, contact_email, team_status)
    VALUES (v_nombre, v_slug, FALSE, v_email, 'active')
    RETURNING id INTO v_team_id;

    -- Passthrough acotado para enforce_profile_privilege_guard (ver parte 1).
    PERFORM set_config('pragmata.tenant_bootstrap', v_team_id::text, TRUE);

    INSERT INTO public.profiles (id, email, full_name, team_id, role_id, access_level, is_role_synced, created_by, updated_by)
    VALUES (v_uid, v_email, v_full_name, v_team_id, v_role_id, 'admin', TRUE, v_uid, v_uid);

    PERFORM set_config('pragmata.tenant_bootstrap', '', TRUE);

    UPDATE public.teams SET owner_id = v_uid, created_by = v_uid, updated_by = v_uid WHERE id = v_team_id;

    INSERT INTO public.entities (team_id, name, entity_status, created_by, updated_by)
    VALUES (v_team_id, v_entidad, 'active', v_uid, v_uid)
    RETURNING id INTO v_entity_id;

    INSERT INTO public.sys_entity_access (user_id, entity_id, team_id, created_by, updated_by)
    VALUES (v_uid, v_entity_id, v_team_id, v_uid, v_uid)
    ON CONFLICT (user_id, entity_id) DO NOTHING;

    INSERT INTO public.team_subscriptions (team_id, plan_code, sub_status, created_by, updated_by)
    VALUES (v_team_id, v_plan, 'gratis', v_uid, v_uid);

    INSERT INTO public.tenant_signup_log (user_id, team_id, slug, producto, ip_hash, created_by)
    VALUES (v_uid, v_team_id, v_slug, v_producto, p_ip_hash, v_uid);

    RETURN jsonb_build_object(
        'team_id',   v_team_id,
        'entity_id', v_entity_id,
        'slug',      v_slug,
        'plan_code', v_plan,
        'producto',  v_producto
    );
END;
$$;

COMMENT ON FUNCTION public.create_tenant(TEXT, TEXT, TEXT, TEXT, TEXT) IS
  'Alta self-serve: crea team + profile(admin) + primera entity + acceso + suscripción gratis, '
  'en una transacción y fail-closed. Solo authenticated no-anónimo con correo confirmado y sin profile previo.';

REVOKE ALL ON FUNCTION public.create_tenant(TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_tenant(TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;

COMMIT;
