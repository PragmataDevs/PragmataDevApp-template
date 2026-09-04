-- ============================================================================
-- tenant_sites — sitio público por slug (spec §5)
-- ============================================================================
-- Astro resuelve /{slug} SIN abrir `teams` a anon (teams trae PII: tax_id,
-- contact_email, address). Lo público es exactamente esta fila y nada más.
--
--   tenant_sites          1 por team; slug espejo de teams.slug (trigger)
--   get_public_site(slug) DEFINER STABLE → { site, sucursales[], menu[] } en un
--                         round-trip para SSR. `menu` sale vacío hasta que exista
--                         menu_items (Hito 2, solo Cuenta Aparte).
-- Con platform_mode apagado la tabla existe pero nadie la llena: cero cambio.
-- Idempotente. Reversa: down_20260904097000_tenant_sites.sql
-- ============================================================================
BEGIN;

CREATE TABLE IF NOT EXISTS public.tenant_sites (
    id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id        UUID        NOT NULL UNIQUE REFERENCES public.teams(id) ON DELETE CASCADE,
    slug           TEXT        NOT NULL UNIQUE,                    -- espejo de teams.slug
    template_code  TEXT        NOT NULL DEFAULT 'clasico' CHECK (template_code IN ('brasa','mercado','clasico')),
    theme          JSONB       NOT NULL DEFAULT '{}'::jsonb,       -- colores/tipografía permitidos por la plantilla
    titulo         TEXT,
    descripcion    TEXT,
    logo_url       TEXT,
    portada_url    TEXT,
    telefono_publico TEXT,
    redes          JSONB       NOT NULL DEFAULT '{}'::jsonb,       -- {instagram, facebook, whatsapp}
    custom_domain  TEXT UNIQUE,
    is_published   BOOLEAN     NOT NULL DEFAULT FALSE,
    -- AuditBase
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by  UUID        REFERENCES public.profiles(id) ON DELETE SET NULL,
    updated_by  UUID        REFERENCES public.profiles(id) ON DELETE SET NULL,
    version     INTEGER     NOT NULL DEFAULT 0,
    status      TEXT        NOT NULL DEFAULT 'active' CHECK (status IN ('active','deleted')),
    deleted_at  TIMESTAMPTZ
);
ALTER TABLE public.tenant_sites ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS trg_tenant_sites_set_updated_at ON public.tenant_sites;
CREATE TRIGGER trg_tenant_sites_set_updated_at
  BEFORE UPDATE ON public.tenant_sites
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- slug siempre = teams.slug (no editable aquí)
CREATE OR REPLACE FUNCTION public.tenant_sites_mirror_slug()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    SELECT slug INTO NEW.slug FROM public.teams WHERE id = NEW.team_id;
    IF NEW.slug IS NULL THEN
        RAISE EXCEPTION 'team_not_found' USING ERRCODE = '42704';
    END IF;
    RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS aaa_tenant_sites_mirror_slug ON public.tenant_sites;
CREATE TRIGGER aaa_tenant_sites_mirror_slug
  BEFORE INSERT OR UPDATE OF team_id, slug ON public.tenant_sites
  FOR EACH ROW EXECUTE FUNCTION public.tenant_sites_mirror_slug();

-- si cambia teams.slug, se refleja
CREATE OR REPLACE FUNCTION public.teams_propagate_slug()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NEW.slug IS DISTINCT FROM OLD.slug THEN
        UPDATE public.tenant_sites SET slug = NEW.slug WHERE team_id = NEW.id;
    END IF;
    RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS zzz_teams_propagate_slug ON public.teams;
CREATE TRIGGER zzz_teams_propagate_slug
  AFTER UPDATE OF slug ON public.teams
  FOR EACH ROW EXECUTE FUNCTION public.teams_propagate_slug();

-- RLS: anon ve lo publicado; el team gestiona el suyo (RBAC decide acciones, plan es AND)
DROP POLICY IF EXISTS "tenant_sites_public_select" ON public.tenant_sites;
CREATE POLICY "tenant_sites_public_select" ON public.tenant_sites
  FOR SELECT TO anon, authenticated USING (is_published AND status = 'active');
DROP POLICY IF EXISTS "tenant_sites_team_select" ON public.tenant_sites;
CREATE POLICY "tenant_sites_team_select" ON public.tenant_sites
  FOR SELECT TO authenticated USING (public.is_god() OR team_id = public.get_my_team_id());
DROP POLICY IF EXISTS "tenant_sites_team_insert" ON public.tenant_sites;
CREATE POLICY "tenant_sites_team_insert" ON public.tenant_sites
  FOR INSERT TO authenticated WITH CHECK (
    public.is_god()
    OR (team_id = public.get_my_team_id() AND public.check_permission('page_platform_billing', 'update') AND public.team_can_write())
  );
DROP POLICY IF EXISTS "tenant_sites_team_update" ON public.tenant_sites;
CREATE POLICY "tenant_sites_team_update" ON public.tenant_sites
  FOR UPDATE TO authenticated
  USING (public.is_god() OR (team_id = public.get_my_team_id() AND public.check_permission('page_platform_billing', 'update')))
  WITH CHECK (public.is_god() OR (team_id = public.get_my_team_id() AND public.team_can_write()));
REVOKE INSERT, UPDATE, DELETE ON public.tenant_sites FROM anon;

-- Resolución pública en un round-trip
CREATE OR REPLACE FUNCTION public.get_public_site(p_slug TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
    v_site public.tenant_sites%ROWTYPE;
    v_sucursales JSONB;
BEGIN
    SELECT * INTO v_site
    FROM public.tenant_sites
    WHERE slug = lower(trim(p_slug)) AND is_published AND status = 'active';
    IF NOT FOUND THEN RETURN NULL; END IF;

    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', e.id, 'nombre', e.name, 'direccion', e.location,
        'telefono', e.metadata->>'telefono', 'horario', e.metadata->>'horario'
    ) ORDER BY e.name), '[]'::jsonb) INTO v_sucursales
    FROM public.entities e
    WHERE e.team_id = v_site.team_id AND e.status = 'active'
      AND COALESCE(e.metadata->>'publica', 'true') = 'true';

    RETURN jsonb_build_object(
        'site', jsonb_build_object(
            'slug', v_site.slug, 'template_code', v_site.template_code, 'theme', v_site.theme,
            'titulo', v_site.titulo, 'descripcion', v_site.descripcion, 'logo_url', v_site.logo_url,
            'portada_url', v_site.portada_url, 'telefono', v_site.telefono_publico, 'redes', v_site.redes
        ),
        'sucursales', v_sucursales,
        'menu', '[]'::jsonb   -- se llena cuando exista menu_items (Hito 2)
    );
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_public_site(TEXT) TO anon, authenticated;

COMMIT;
