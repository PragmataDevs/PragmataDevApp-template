-- ============================================================================
-- platform_mode_core — Modo plataforma (capa común self-serve), parte 1 de 3
-- ============================================================================
-- Spec: docs/spec-capa-comun-self-serve.md (Arquímedes, sep-2026).
--
-- Qué instala:
--   1. platform_settings   — un solo renglón; `platform_mode` apaga/prende la
--                            capa. APAGADO por default: los clientes que
--                            heredan esto (Clibsa, Objetiva, IndPack…) no cambian
--                            de comportamiento en absoluto.
--   2. is_platform_mode()  — helper STABLE para policies y funciones.
--   3. platform_reserved_slugs — slugs que ningún tenant puede tomar.
--   4. aaa_guard_team_platform_owner — backport del guard de clibsa/crm-objetiva:
--                            un no-god no puede encender teams.is_platform_owner.
--   5. enforce_profile_privilege_guard — MISMA función del schema base más un
--                            passthrough acotado para el alta self-serve
--                            (create_tenant, parte 3). Ver nota abajo.
--
-- NOTA sobre el passthrough (difiere de la spec §1 a propósito):
--   La spec proponía `IF current_user IN ('postgres', ...)`. No sirve: este
--   trigger es SECURITY DEFINER, así que DENTRO de él current_user es SIEMPRE
--   'postgres' (el dueño), venga la fila de donde venga. Habría desactivado el
--   guard completo. En su lugar create_tenant() fija un GUC transaccional
--   `pragmata.tenant_bootstrap = <team_id recién creado>` (set_config(..., true))
--   y el guard solo deja pasar el INSERT del PROPIO perfil (NEW.id = auth.uid())
--   como admin de ESE team. pg_catalog.set_config no es alcanzable por PostgREST
--   (solo expone funciones de `public`), nadie puede correr SET, y aunque
--   alguien fijara el GUC necesitaría el id de un team que no puede crear
--   (teams no tiene policy de INSERT). Fail-closed.
--
-- NO se agrega CHECK de formato a teams.slug: los clientes ya instanciados
-- tienen slugs libres y un CHECK (aun NOT VALID) rompería sus UPDATEs. El
-- formato se valida en create_tenant() y check_slug_available().
--
-- Idempotente. Reversa: down_20260904090000_platform_mode_core.sql
-- ============================================================================

BEGIN;

-- ── 1. platform_settings ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.platform_settings (
    id                SMALLINT    PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    platform_mode     BOOLEAN     NOT NULL DEFAULT FALSE,
    -- producto por default para create_tenant cuando el front no lo manda
    default_product   TEXT        NOT NULL DEFAULT 'app',
    -- AuditBase
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by  UUID        REFERENCES public.profiles(id) ON DELETE SET NULL,
    updated_by  UUID        REFERENCES public.profiles(id) ON DELETE SET NULL,
    version     INTEGER     NOT NULL DEFAULT 0,
    status      TEXT        NOT NULL DEFAULT 'active' CHECK (status IN ('active','deleted')),
    deleted_at  TIMESTAMPTZ
);
COMMENT ON TABLE public.platform_settings IS
  'Singleton (id=1). platform_mode=FALSE deja el chasis exactamente como antes; '
  'TRUE habilita create_tenant, gates por plan y sitios públicos por slug.';

INSERT INTO public.platform_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS trg_platform_settings_set_updated_at ON public.platform_settings;
CREATE TRIGGER trg_platform_settings_set_updated_at
  BEFORE UPDATE ON public.platform_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Leer el flag es inofensivo y la pantalla de registro (anon) lo necesita.
DROP POLICY IF EXISTS "platform_settings_select" ON public.platform_settings;
CREATE POLICY "platform_settings_select" ON public.platform_settings
  FOR SELECT TO anon, authenticated USING (true);

-- Escribir: solo god. Sin policy de INSERT/DELETE para nadie más.
DROP POLICY IF EXISTS "platform_settings_write_god" ON public.platform_settings;
CREATE POLICY "platform_settings_write_god" ON public.platform_settings
  FOR ALL TO authenticated USING (public.is_god()) WITH CHECK (public.is_god());

-- ── 2. is_platform_mode() ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_platform_mode()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
    SELECT COALESCE(
        (SELECT platform_mode FROM public.platform_settings WHERE id = 1 AND status = 'active'),
        FALSE
    );
$$;
COMMENT ON FUNCTION public.is_platform_mode() IS
  'TRUE solo si platform_settings.platform_mode está encendido. Apagado = chasis clásico.';

-- ── 3. platform_reserved_slugs ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.platform_reserved_slugs (
    slug        TEXT        PRIMARY KEY,
    reason      TEXT,
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
COMMENT ON TABLE public.platform_reserved_slugs IS
  'Slugs que ningún tenant puede registrar (rutas del sitio, subdominios técnicos, marca).';

INSERT INTO public.platform_reserved_slugs (slug, reason) VALUES
  ('app', 'ruta'), ('api', 'ruta'), ('admin', 'ruta'), ('www', 'dns'),
  ('login', 'ruta'), ('registro', 'ruta'), ('signup', 'ruta'), ('precios', 'ruta'),
  ('pricing', 'ruta'), ('docs', 'ruta'), ('blog', 'ruta'), ('soporte', 'ruta'),
  ('support', 'ruta'), ('status', 'ruta'), ('ayuda', 'ruta'), ('help', 'ruta'),
  ('legal', 'ruta'), ('privacidad', 'ruta'), ('terminos', 'ruta'), ('mail', 'dns'),
  ('smtp', 'dns'), ('ftp', 'dns'), ('cdn', 'dns'), ('static', 'ruta'),
  ('assets', 'ruta'), ('_astro', 'ruta'), ('auth', 'ruta'), ('functions', 'ruta'),
  ('rest', 'ruta'), ('storage', 'ruta'), ('realtime', 'ruta'), ('dashboard', 'ruta'),
  ('workspace', 'ruta'), ('settings', 'ruta'), ('pragmata', 'marca'),
  ('pragmatadevs', 'marca'), ('pragmata-devs', 'marca'), ('gaston', 'marca'),
  ('cuentaaparte', 'marca'), ('cuenta-aparte', 'marca')
ON CONFLICT (slug) DO NOTHING;

ALTER TABLE public.platform_reserved_slugs ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS trg_platform_reserved_slugs_set_updated_at ON public.platform_reserved_slugs;
CREATE TRIGGER trg_platform_reserved_slugs_set_updated_at
  BEFORE UPDATE ON public.platform_reserved_slugs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP POLICY IF EXISTS "platform_reserved_slugs_select" ON public.platform_reserved_slugs;
CREATE POLICY "platform_reserved_slugs_select" ON public.platform_reserved_slugs
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "platform_reserved_slugs_write_god" ON public.platform_reserved_slugs;
CREATE POLICY "platform_reserved_slugs_write_god" ON public.platform_reserved_slugs
  FOR ALL TO authenticated USING (public.is_god()) WITH CHECK (public.is_god());

-- ── 4. Guard de is_platform_owner (backport clibsa 20260808130000) ───────────
CREATE OR REPLACE FUNCTION public.enforce_team_platform_owner_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- god: la llave maestra la damos nosotros, pasa.
    IF public.is_god() THEN
        RETURN NEW;
    END IF;

    -- service_role / cadena interna definer (auth.uid() NULL): backend confiable.
    IF auth.uid() IS NULL THEN
        RETURN NEW;
    END IF;

    IF TG_OP = 'INSERT' THEN
        IF NEW.is_platform_owner THEN
            RAISE EXCEPTION 'Solo un god puede crear un equipo platform owner'
                USING ERRCODE = '42501';
        END IF;
        RETURN NEW;
    END IF;

    -- Solo importa si el valor CAMBIA: mandar el campo igual pasa sin ruido, para
    -- no romper formularios que envían la fila completa.
    IF NEW.is_platform_owner IS DISTINCT FROM OLD.is_platform_owner THEN
        RAISE EXCEPTION 'Solo un god puede cambiar is_platform_owner'
            USING ERRCODE = '42501';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS aaa_guard_team_platform_owner ON public.teams;
CREATE TRIGGER aaa_guard_team_platform_owner
    BEFORE INSERT OR UPDATE ON public.teams
    FOR EACH ROW
    EXECUTE FUNCTION public.enforce_team_platform_owner_guard();

COMMENT ON FUNCTION public.enforce_team_platform_owner_guard() IS
'Impide que un no-god encienda teams.is_platform_owner (el flag que da visibilidad
cruzada entre equipos). Solo reacciona si el valor cambia, para no romper formularios
que envían la fila completa. service_role pasa.';

-- ── 5. enforce_profile_privilege_guard + passthrough de bootstrap ────────────
-- ⚠️ BACKPORT: fusionar, no pisar. Si un cliente tiene esta función modificada
-- (clibsa, crm-objetiva), agregar SOLO el bloque "Passthrough" a su versión.
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
    -- perfil, como admin, en el team que la misma transacción acaba de crear.
    IF TG_OP = 'INSERT'
       AND bootstrap_team IS NOT NULL
       AND bootstrap_team <> ''
       AND bootstrap_team = NEW.team_id::text
       AND NEW.id = current_uid
       AND NEW.access_level = 'admin' THEN
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

COMMIT;
