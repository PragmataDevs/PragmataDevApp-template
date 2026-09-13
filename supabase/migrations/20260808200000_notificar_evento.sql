-- ==============================================================================
-- notificar_evento.sql — el EMISOR de notificaciones por evento.
--
-- POR QUÉ EXISTE
-- El sistema de notificaciones estaba completo... menos el último tramo. Había
-- tablas, RLS, adjuntos, broadcasts, y la UI para verlas — pero verificado el
-- 8-ago-2026: CERO archivos en el template y en los 5 clientes insertaban una
-- notificación. Existía toda la entrega y ningún emisor. Por eso las tablas
-- estaban vacías en producción: no es que nadie las usara, es que nunca llegaba
-- ninguna.
--
-- Esto NO es un catálogo de eventos: qué merece aviso depende de cada app (un
-- contratista subiendo una estimación en Clibsa no se parece a un ranking en
-- LawRank). El catálogo lo declara cada cliente; aquí vive el mecanismo.
--
-- POR QUÉ EN LA BASE Y NO EN EL FRONT
-- Un trigger dispara pase lo que pase: da igual si la fila entró por la app, por
-- una edge function, por un import masivo o por un script. Si el emisor viviera
-- en el front, cualquier otro camino se saltaría el aviso en silencio — que es
-- justo cómo se rompen estas cosas.
--
-- Idempotente. Reversa en down_.
-- ==============================================================================

BEGIN;

-- ── notificar_a: una persona ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.notificar_a(
    p_recipient  UUID,
    p_title      TEXT,
    p_body       TEXT DEFAULT NULL,
    p_type       TEXT DEFAULT 'info',
    p_action_url TEXT DEFAULT NULL,
    p_sender     UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    nuevo UUID;
BEGIN
    IF p_recipient IS NULL THEN
        RETURN NULL;   -- sin destinatario no hay nada que hacer; no es error
    END IF;

    -- No se notifica a quien causó el evento: recibir "subiste un archivo" es ruido.
    IF p_sender IS NOT NULL AND p_sender = p_recipient THEN
        RETURN NULL;
    END IF;

    INSERT INTO public.notifications (recipient_id, sender_id, type, title, body, action_url, created_by)
    VALUES (p_recipient, p_sender, coalesce(p_type, 'info'), p_title, p_body, p_action_url, p_sender)
    RETURNING id INTO nuevo;

    RETURN nuevo;
END;
$$;

COMMENT ON FUNCTION public.notificar_a IS
'Crea UNA notificación. SECURITY DEFINER porque el emisor corre dentro de un
trigger y el actor no necesariamente puede escribir en notifications. Se salta
al propio autor del evento para no avisarle de lo que él mismo hizo.';


-- ── notificar_equipo: a todos los de un equipo ───────────────────────────────
CREATE OR REPLACE FUNCTION public.notificar_equipo(
    p_team       UUID,
    p_title      TEXT,
    p_body       TEXT DEFAULT NULL,
    p_type       TEXT DEFAULT 'info',
    p_action_url TEXT DEFAULT NULL,
    p_sender     UUID DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    n INTEGER := 0;
    r RECORD;
BEGIN
    IF p_team IS NULL THEN RETURN 0; END IF;

    FOR r IN
        SELECT id FROM public.profiles
         WHERE team_id = p_team
           AND status = 'active'
           AND (p_sender IS NULL OR id <> p_sender)
    LOOP
        PERFORM public.notificar_a(r.id, p_title, p_body, p_type, p_action_url, p_sender);
        n := n + 1;
    END LOOP;

    RETURN n;
END;
$$;

COMMENT ON FUNCTION public.notificar_equipo IS
'Notifica a todos los miembros activos de un equipo. Útil para "el contratista X
subió un documento" → avisar a la gerencia. Omite al autor del evento.';


-- ── notificar_con_permiso: a quien pueda actuar sobre esto ───────────────────
CREATE OR REPLACE FUNCTION public.notificar_con_permiso(
    p_resource   TEXT,
    p_action     TEXT,
    p_team       UUID,
    p_title      TEXT,
    p_body       TEXT DEFAULT NULL,
    p_type       TEXT DEFAULT 'action',
    p_action_url TEXT DEFAULT NULL,
    p_sender     UUID DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    n INTEGER := 0;
    r RECORD;
BEGIN
    -- El destinatario NO se escribe a mano: sale del RBAC. Si mañana cambias
    -- quién puede aprobar, las notificaciones siguen a la nueva persona solas.
    FOR r IN
        SELECT p.id
          FROM public.profiles p
         WHERE p.status = 'active'
           AND (p_team IS NULL OR p.team_id = p_team)
           AND (p_sender IS NULL OR p.id <> p_sender)
           AND (
                p.access_level IN ('god', 'admin')
                OR EXISTS (
                    SELECT 1 FROM public.sys_user_permissions up
                     WHERE up.user_id = p.id
                       AND up.resource_code = p_resource
                       AND p_action = ANY(up.granted_actions)
                )
           )
    LOOP
        PERFORM public.notificar_a(r.id, p_title, p_body, p_type, p_action_url, p_sender);
        n := n + 1;
    END LOOP;

    RETURN n;
END;
$$;

COMMENT ON FUNCTION public.notificar_con_permiso IS
'Notifica a quien TENGA EL PERMISO de actuar sobre algo (p. ej. quien puede
aprobar una estimación). El destinatario sale del RBAC, no de una lista escrita
a mano: si cambia quién aprueba, el aviso lo sigue solo.';

COMMIT;
