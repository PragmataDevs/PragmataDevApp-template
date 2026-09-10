-- ==============================================================================
-- push_outbox.sql — la cola de salida y el enganche con las notificaciones.
--
-- DÓNDE SE ENGANCHA, Y POR QUÉ AHÍ
-- El trigger cuelga de AFTER INSERT ON public.notifications, y eso es la mitad
-- del diseño: la decisión de A QUIÉN le toca ya la tomó la base cuando
-- notificar_a / notificar_equipo / notificar_con_permiso escribieron el renglón
-- con su recipient_id. Push no vuelve a decidir nada — solo sigue lo que la base
-- ya resolvió. Un tutor recibe lo de su hijo porque el emisor de esa app lo
-- resolvió contra su propia tabla de tutores, no porque push sepa qué es un niño.
--
-- POR QUÉ UNA COLA Y NO net.http_post DIRECTO EN EL TRIGGER
--   1. Un broadcast a 200 personas dispararía 200 POST dentro del commit.
--   2. pg_net es fire-and-forget: la respuesta cae en net._http_response y el
--      resultado se pierde. Sin fila propia no hay a dónde escribir "falló".
--   3. Si la edge function está caída no hay reintento: el aviso se evapora sin
--      dejar rastro, que es la peor forma de fallar.
--
-- QUÉ VIAJA EN EL HTTP: solo el id del envío. Nunca el título ni el cuerpo.
-- El contenido puede traer el nombre de un menor y lo que comió; eso no sale de
-- la base por un salto HTTP que ni siquiera podemos leer de vuelta.
--
-- Idempotente. Reversa en down_.
-- ==============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.push_outbox (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    notification_id UUID NOT NULL REFERENCES public.notifications(id) ON DELETE CASCADE,
    recipient_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    team_id         UUID REFERENCES public.teams(id),
    category_code   TEXT,
    app_slug        TEXT,

    estado TEXT NOT NULL DEFAULT 'pendiente'
        CHECK (estado IN ('pendiente','enviado','fallido','omitido')),
    intentos     INTEGER NOT NULL DEFAULT 0,
    ultimo_error TEXT,
    enviado_at   TIMESTAMPTZ,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    version    INTEGER NOT NULL DEFAULT 0,
    status     TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','deleted')),
    deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_push_outbox_pendiente
    ON public.push_outbox(created_at)
    WHERE estado = 'pendiente' AND status = 'active';

DROP TRIGGER IF EXISTS trg_push_outbox_set_updated_at ON public.push_outbox;
CREATE TRIGGER trg_push_outbox_set_updated_at
BEFORE UPDATE ON public.push_outbox
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- La cola es cosa del servidor. Nadie la lee desde la app: saber a quién se le
-- mandó qué y cuándo es metadato de todos los usuarios junto.
ALTER TABLE public.push_outbox ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.push_outbox FROM authenticated, anon;

DROP POLICY IF EXISTS "push_outbox_god" ON public.push_outbox;
CREATE POLICY "push_outbox_god" ON public.push_outbox
    FOR SELECT TO authenticated USING (public.is_god());


-- ── El enganche ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.push_encolar()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_envio    UUID;
    v_endpoint TEXT;
    v_secreto  TEXT;
BEGIN
    -- Preferencias, silencio y perfil suspendido se evalúan ANTES de encolar:
    -- lo que no debe salir ni siquiera ocupa lugar en la cola.
    IF NOT public.push_debe_enviar(NEW.recipient_id, NEW.category_code, NEW.type) THEN
        RETURN NEW;
    END IF;

    INSERT INTO public.push_outbox (notification_id, recipient_id, team_id, category_code, created_by)
    VALUES (
        NEW.id,
        NEW.recipient_id,
        (SELECT team_id FROM public.profiles WHERE id = NEW.recipient_id),
        NEW.category_code,
        NEW.created_by
    )
    RETURNING id INTO v_envio;

    -- Camino rápido: si pg_net está, se le toca la puerta a la edge function
    -- para que salga ya. Si no está (o falla), push_drenar_outbox lo recoge
    -- después: el aviso se retrasa, no se pierde.
    v_endpoint := current_setting('app.push_endpoint', true);
    v_secreto  := current_setting('app.push_secret', true);

    IF v_endpoint IS NOT NULL AND v_endpoint <> ''
       AND EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
        BEGIN
            PERFORM net.http_post(
                url     := v_endpoint,
                headers := jsonb_build_object(
                               'Content-Type', 'application/json',
                               'x-push-secret', coalesce(v_secreto, '')),
                body    := jsonb_build_object('envio_id', v_envio)   -- solo el id
            );
        EXCEPTION WHEN OTHERS THEN
            -- Que un fallo de red jamás tumbe el INSERT de la notificación.
            -- La notificación en la app vale más que el push.
            NULL;
        END;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_push_encolar ON public.notifications;
CREATE TRIGGER trigger_push_encolar
AFTER INSERT ON public.notifications
FOR EACH ROW EXECUTE FUNCTION public.push_encolar();


-- ── Tokens muertos: reactivo ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.push_token_muerto(p_token TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    UPDATE public.push_devices
       SET status = 'deleted', deleted_at = NOW(), disabled_at = NOW()
     WHERE token = p_token AND status = 'active';
END;
$$;

COMMENT ON FUNCTION public.push_token_muerto IS
'La llama la edge function cuando FCM contesta que el token ya no existe
(UNREGISTERED / INVALID_ARGUMENT). Soft delete: la fila se conserva para saber
por qué dejó de llegarle a alguien.';


-- ── Tokens muertos: proactivo ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.push_purgar_inactivos(p_dias INTEGER DEFAULT 90)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE n INTEGER;
BEGIN
    UPDATE public.push_devices
       SET status = 'deleted', deleted_at = NOW(), disabled_at = NOW()
     WHERE status = 'active'
       AND last_seen_at < NOW() - make_interval(days => p_dias);
    GET DIAGNOSTICS n = ROW_COUNT;
    RETURN n;
END;
$$;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
        PERFORM cron.schedule('push-purgar-inactivos', '23 4 * * *',
                              $job$SELECT public.push_purgar_inactivos(90)$job$);
    ELSE
        RAISE NOTICE 'pg_cron no disponible: agendar push_purgar_inactivos(90) por fuera.';
    END IF;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'No se pudo agendar push_purgar_inactivos: %', SQLERRM;
END $$;

COMMIT;
