-- ==============================================================================
-- push_preferencias.sql — quién quiere qué, y a qué hora no.
--
-- POR QUÉ EXISTE
-- Una app que vibra por todo se apaga entera: el usuario no desactiva "avisos de
-- pañal", desactiva las notificaciones de la app y ya nunca se entera de nada.
-- El interruptor fino es lo que salva al canal.
--
-- LO QUE ESTA MIGRACIÓN AGREGA AL TEMPLATE, Y POR QUÉ
-- `public.notifications` tiene `type` (info/action/urgent), que es la URGENCIA,
-- no el TEMA. Con tres valores no se puede decir "avísame cuando llegue mi hijo
-- pero no cada cambio de pañal". Por eso se agrega `category_code`: el tema.
-- La urgencia decide si suena en horario de silencio; el tema decide si se manda.
--
-- Este archivo NO declara ninguna categoría de ninguna app. Igual que
-- notificar_evento.sql: aquí vive el mecanismo, el catálogo lo declara cada
-- cliente en su propio repo.
--
-- Idempotente. Reversa en down_.
-- ==============================================================================

BEGIN;

-- ── El tema del aviso, además de su urgencia ────────────────────────────────
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS category_code TEXT;
COMMENT ON COLUMN public.notifications.category_code IS
'Tema del aviso (nino_llego, turno_cerrado...). NULL = sin categoría, siempre se
manda. `type` es la urgencia; esto es el tema. Los cruza push_debe_enviar().';

-- ── Catálogo de temas ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.push_categories (
    id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id UUID REFERENCES public.teams(id) ON DELETE CASCADE,  -- NULL = global
    code    TEXT NOT NULL,
    nombre  TEXT NOT NULL,
    descripcion TEXT,
    default_on  BOOLEAN NOT NULL DEFAULT TRUE,

    -- Un aviso que no se puede apagar. Existe para lo que el usuario NO debe
    -- poder silenciarse a sí mismo: una emergencia en el plantel, una alerta de
    -- seguridad. Se usa con cuentagotas — si todo es obligatorio, nada lo es.
    obligatoria BOOLEAN NOT NULL DEFAULT FALSE,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    version    INTEGER NOT NULL DEFAULT 0,
    status     TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','deleted')),
    deleted_at TIMESTAMPTZ,

    CONSTRAINT uq_push_categories_team_code UNIQUE (team_id, code)
);

-- ── Ajustes globales del usuario (satélite 1:1 de profiles) ─────────────────
CREATE TABLE IF NOT EXISTS public.push_settings (
    id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
    habilitado BOOLEAN NOT NULL DEFAULT TRUE,

    -- El silencio se evalúa en la hora LOCAL del usuario. Sin zona horaria,
    -- "no me molestes de 10pm a 7am" significa cosas distintas en Cancún y en
    -- Tijuana, y el bug solo aparece de noche y solo para algunos.
    zona_horaria   TEXT NOT NULL DEFAULT 'America/Mexico_City',
    silencio_desde TIME,
    silencio_hasta TIME,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    version    INTEGER NOT NULL DEFAULT 0,
    status     TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','deleted')),
    deleted_at TIMESTAMPTZ
);

-- ── Interruptor por tema ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.push_preferences (
    id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    category_code TEXT NOT NULL,
    activo  BOOLEAN NOT NULL DEFAULT TRUE,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    version    INTEGER NOT NULL DEFAULT 0,
    status     TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','deleted')),
    deleted_at TIMESTAMPTZ,

    CONSTRAINT uq_push_preferences_user_cat UNIQUE (user_id, category_code)
);

DO $$
DECLARE t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY['push_categories','push_settings','push_preferences'] LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS trg_%I_set_updated_at ON public.%I;', t, t);
        EXECUTE format(
            'CREATE TRIGGER trg_%I_set_updated_at BEFORE UPDATE ON public.%I
             FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();', t, t);
    END LOOP;
END $$;

-- ── RLS ──────────────────────────────────────────────────────────────────────
-- Las preferencias son del usuario y de nadie más. Calcado de la policy
-- "Manage Own Preferences" que ya rige sys_user_preferences en el template.
ALTER TABLE public.push_settings    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_categories  ENABLE ROW LEVEL SECURITY;
REVOKE DELETE, TRUNCATE ON public.push_settings, public.push_preferences, public.push_categories FROM authenticated;

DROP POLICY IF EXISTS "push_settings_own" ON public.push_settings;
CREATE POLICY "push_settings_own" ON public.push_settings
    FOR ALL TO authenticated
    USING (public.is_god() OR user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "push_preferences_own" ON public.push_preferences;
CREATE POLICY "push_preferences_own" ON public.push_preferences
    FOR ALL TO authenticated
    USING (public.is_god() OR user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

-- El catálogo se lee para pintar la pantalla de ajustes; se escribe solo con permiso.
DROP POLICY IF EXISTS "push_categories_read" ON public.push_categories;
CREATE POLICY "push_categories_read" ON public.push_categories
    FOR SELECT TO authenticated
    USING (status = 'active' AND (team_id IS NULL OR team_id = public.get_my_team_id()));

DROP POLICY IF EXISTS "push_categories_write" ON public.push_categories;
CREATE POLICY "push_categories_write" ON public.push_categories
    FOR ALL TO authenticated
    USING (public.is_god() OR public.check_permission('page_settings_usuarios','update'))
    WITH CHECK (public.is_god() OR public.check_permission('page_settings_usuarios','update'));


-- ── La decisión de si toca mandar, en la BASE ───────────────────────────────
-- Regla 8 de la casa: si la base ya lo calcula, el cliente no lo recalcula.
-- Aquí importa doble, porque son dos clientes (la app y la edge function) los
-- que preguntarían lo mismo — y en seis meses responderían distinto.
CREATE OR REPLACE FUNCTION public.push_debe_enviar(
    p_user     UUID,
    p_category TEXT DEFAULT NULL,
    p_type     TEXT DEFAULT 'info'
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
    v_perfil_ok    BOOLEAN;
    v_habilitado   BOOLEAN;
    v_zona         TEXT;
    v_desde        TIME;
    v_hasta        TIME;
    v_obligatoria  BOOLEAN := FALSE;
    v_activo       BOOLEAN;
    v_default_on   BOOLEAN;
    v_ahora        TIME;
BEGIN
    IF p_user IS NULL THEN RETURN FALSE; END IF;

    SELECT (status = 'active' AND coalesce(profile_status,'active') = 'active')
      INTO v_perfil_ok
      FROM public.profiles WHERE id = p_user;
    IF NOT coalesce(v_perfil_ok, FALSE) THEN RETURN FALSE; END IF;

    SELECT s.habilitado, s.zona_horaria, s.silencio_desde, s.silencio_hasta
      INTO v_habilitado, v_zona, v_desde, v_hasta
      FROM public.push_settings s
     WHERE s.user_id = p_user AND s.status = 'active';

    -- Sin renglón de ajustes = valores de fábrica: recibe todo. Que la ausencia
    -- de configuración no signifique silencio.
    v_habilitado := coalesce(v_habilitado, TRUE);
    IF NOT v_habilitado THEN RETURN FALSE; END IF;

    -- ¿El tema está apagado? Una categoría obligatoria ignora el interruptor.
    IF p_category IS NOT NULL THEN
        SELECT c.obligatoria, c.default_on
          INTO v_obligatoria, v_default_on
          FROM public.push_categories c
         WHERE c.code = p_category
           AND c.status = 'active'
           AND (c.team_id IS NULL OR c.team_id = (SELECT team_id FROM public.profiles WHERE id = p_user))
         ORDER BY c.team_id NULLS LAST   -- la del equipo gana sobre la global
         LIMIT 1;

        IF NOT coalesce(v_obligatoria, FALSE) THEN
            SELECT pr.activo INTO v_activo
              FROM public.push_preferences pr
             WHERE pr.user_id = p_user AND pr.category_code = p_category AND pr.status = 'active';
            -- Sin preferencia explícita manda el default del catálogo.
            IF NOT coalesce(v_activo, coalesce(v_default_on, TRUE)) THEN
                RETURN FALSE;
            END IF;
        END IF;
    END IF;

    -- Ventana de silencio, en hora local del usuario. 'urgent' y las categorías
    -- obligatorias la atraviesan: para eso existen.
    IF v_desde IS NOT NULL AND v_hasta IS NOT NULL
       AND p_type <> 'urgent' AND NOT coalesce(v_obligatoria, FALSE) THEN
        v_ahora := (NOW() AT TIME ZONE coalesce(v_zona, 'America/Mexico_City'))::TIME;
        IF v_desde <= v_hasta THEN
            IF v_ahora >= v_desde AND v_ahora < v_hasta THEN RETURN FALSE; END IF;
        ELSE
            -- Ventana que cruza medianoche (22:00 → 07:00).
            IF v_ahora >= v_desde OR v_ahora < v_hasta THEN RETURN FALSE; END IF;
        END IF;
    END IF;

    RETURN TRUE;
END;
$$;

COMMENT ON FUNCTION public.push_debe_enviar IS
'Única fuente de verdad sobre si un push sale o no: perfil activo, interruptor
general, tema apagado y ventana de silencio en hora local. La app y la edge
function preguntan aquí; ninguna de las dos vuelve a decidirlo por su cuenta.';

COMMIT;
