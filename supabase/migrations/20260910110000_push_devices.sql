-- ==============================================================================
-- push_devices.sql — el registro de aparatos a los que se les puede tocar la puerta.
--
-- POR QUÉ EXISTE
-- El sistema de notificaciones ya está completo dentro de la app: tablas,
-- RLS, broadcasts, emisores (notificar_a / notificar_equipo / notificar_con_permiso).
-- Lo que faltaba es el último metro: que el aviso llegue al teléfono cuando la
-- app está CERRADA. Eso no lo entrega ningún backend — lo entrega el sistema
-- operativo (APNs en iOS, FCM en Android), y para hablarle hay que saber a qué
-- aparato. Esta tabla es esa libreta de direcciones.
--
-- EL GRANO: UN RENGLÓN POR TOKEN. No por usuario, no por "dispositivo".
-- El token de FCM identifica una INSTALACIÓN de la app en un aparato, no a una
-- persona. Si Ana cierra sesión y Beto entra en el mismo teléfono, el token es
-- el mismo. Con grano "usuario + dispositivo" quedarían dos filas activas con
-- el mismo token, y Ana seguiría recibiendo en el teléfono de Beto los avisos
-- que son de ella. Eso no es un detalle de UX: es una fuga de datos. Por eso
-- UNIQUE(token) parcial + upsert que reasigna user_id, y desvincular() al salir.
--
-- Idempotente. Reversa en down_.
-- ==============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.push_devices (
    id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id  UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    team_id  UUID NOT NULL REFERENCES public.teams(id),

    token    TEXT NOT NULL,
    platform TEXT NOT NULL CHECK (platform IN ('android','ios','web')),

    -- Un proyecto de Supabase sirve a varias apps (el OS, la web, Cuenta Aparte).
    -- Sin esto, un aviso de una app le vibra el teléfono al usuario en la otra.
    app_slug TEXT NOT NULL,

    device_label TEXT,   -- "S24 Ultra" — para que el dueño reconozca el suyo en la lista
    app_version  TEXT,
    locale       TEXT,

    -- Dónde está parado el aparato. Permite no despertar al de la sucursal A
    -- con lo que pasó en la B. NULL = le llega de todas.
    entity_id UUID REFERENCES public.entities(id) ON DELETE SET NULL,

    last_seen_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    failure_count INTEGER NOT NULL DEFAULT 0,
    disabled_at   TIMESTAMPTZ,   -- FCM lo reportó muerto; se conserva para diagnóstico

    -- AuditBase
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    version    INTEGER NOT NULL DEFAULT 0,
    status     TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','deleted')),
    deleted_at TIMESTAMPTZ
);

-- UNIQUE PARCIAL, no UNIQUE a secas: con soft delete (regla 2, nunca DELETE físico)
-- un índice total dejaría el token ocupado para siempre y el aparato no podría
-- volver a registrarse jamás.
CREATE UNIQUE INDEX IF NOT EXISTS uq_push_devices_token_activo
    ON public.push_devices(token) WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_push_devices_user
    ON public.push_devices(user_id) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_push_devices_envio
    ON public.push_devices(user_id, app_slug) WHERE status = 'active' AND disabled_at IS NULL;

DROP TRIGGER IF EXISTS trg_push_devices_set_updated_at ON public.push_devices;
CREATE TRIGGER trg_push_devices_set_updated_at
BEFORE UPDATE ON public.push_devices
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.push_devices IS
'Aparatos registrados para recibir push. Un renglón por token de FCM: el token
identifica una instalación, no a una persona. Ver la cabecera de la migración.';

-- ── RLS ──────────────────────────────────────────────────────────────────────
-- Un token ES la capacidad de mandarle algo a ese teléfono. Por eso NADIE ve
-- tokens ajenos, ni un admin de equipo: quien envía es la edge function con
-- service_role, que no pasa por RLS. Un admin que necesite depurar ve la lista
-- de aparatos de su gente por una vista sin la columna token, no por aquí.
ALTER TABLE public.push_devices ENABLE ROW LEVEL SECURITY;
REVOKE DELETE, TRUNCATE ON public.push_devices FROM authenticated;

DROP POLICY IF EXISTS "push_devices_select" ON public.push_devices;
CREATE POLICY "push_devices_select" ON public.push_devices
    FOR SELECT TO authenticated
    USING (public.is_god() OR user_id = auth.uid());

DROP POLICY IF EXISTS "push_devices_insert" ON public.push_devices;
CREATE POLICY "push_devices_insert" ON public.push_devices
    FOR INSERT TO authenticated
    WITH CHECK (user_id = auth.uid() AND team_id = public.get_my_team_id());

-- USING con is_god para que el god pueda desactivar un aparato robado;
-- WITH CHECK sin is_god para que nadie (ni él) pueda reasignar un token a otro.
DROP POLICY IF EXISTS "push_devices_update" ON public.push_devices;
CREATE POLICY "push_devices_update" ON public.push_devices
    FOR UPDATE TO authenticated
    USING (public.is_god() OR user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

COMMIT;
