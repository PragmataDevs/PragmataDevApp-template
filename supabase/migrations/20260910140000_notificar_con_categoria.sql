-- ==============================================================================
-- notificar_con_categoria.sql — los emisores aprenden a decir de qué tema hablan.
--
-- POR QUÉ EXISTE
-- 20260910120000 le agregó `category_code` a notifications y construyó el
-- interruptor por tema. Pero los emisores del backport (notificar_a y compañía)
-- escriben el renglón SIN categoría, así que push_debe_enviar recibía siempre
-- NULL y las preferencias del usuario no se aplicaban nunca: toda la pantalla de
-- ajustes habría sido decorativa. Esto cierra ese eslabón.
--
-- Se DROPEA la firma vieja en vez de sobrecargar: dos versiones de notificar_a
-- conviviendo hacen ambigua toda llamada existente de 6 argumentos.
-- El parámetro nuevo va al final con DEFAULT NULL, así que las llamadas
-- posicionales que ya existan siguen compilando igual.
--
-- Candidato a backport hacia cuentaaparte (allí vive el original).
-- Idempotente. Reversa en down_.
-- ==============================================================================

BEGIN;

DROP FUNCTION IF EXISTS public.notificar_a(UUID, TEXT, TEXT, TEXT, TEXT, UUID);

CREATE OR REPLACE FUNCTION public.notificar_a(
    p_recipient  UUID,
    p_title      TEXT,
    p_body       TEXT DEFAULT NULL,
    p_type       TEXT DEFAULT 'info',
    p_action_url TEXT DEFAULT NULL,
    p_sender     UUID DEFAULT NULL,
    p_category   TEXT DEFAULT NULL
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

    INSERT INTO public.notifications
        (recipient_id, sender_id, type, title, body, action_url, category_code, created_by)
    VALUES
        (p_recipient, p_sender, coalesce(p_type,'info'), p_title, p_body, p_action_url, p_category, p_sender)
    RETURNING id INTO nuevo;

    RETURN nuevo;
END;
$$;

COMMENT ON FUNCTION public.notificar_a IS
'Crea UNA notificación. SECURITY DEFINER porque el emisor corre dentro de un
trigger y el actor no necesariamente puede escribir en notifications. Se salta
al propio autor del evento. p_category alimenta el interruptor por tema
(push_debe_enviar); sin ella el aviso se manda siempre.';


DROP FUNCTION IF EXISTS public.notificar_equipo(UUID, TEXT, TEXT, TEXT, TEXT, UUID);

CREATE OR REPLACE FUNCTION public.notificar_equipo(
    p_team       UUID,
    p_title      TEXT,
    p_body       TEXT DEFAULT NULL,
    p_type       TEXT DEFAULT 'info',
    p_action_url TEXT DEFAULT NULL,
    p_sender     UUID DEFAULT NULL,
    p_category   TEXT DEFAULT NULL
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
        PERFORM public.notificar_a(r.id, p_title, p_body, p_type, p_action_url, p_sender, p_category);
        n := n + 1;
    END LOOP;

    RETURN n;
END;
$$;


DROP FUNCTION IF EXISTS public.notificar_con_permiso(TEXT, TEXT, UUID, TEXT, TEXT, TEXT, TEXT, UUID);

CREATE OR REPLACE FUNCTION public.notificar_con_permiso(
    p_resource   TEXT,
    p_action     TEXT,
    p_team       UUID,
    p_title      TEXT,
    p_body       TEXT DEFAULT NULL,
    p_type       TEXT DEFAULT 'action',
    p_action_url TEXT DEFAULT NULL,
    p_sender     UUID DEFAULT NULL,
    p_category   TEXT DEFAULT NULL
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
                p.access_level IN ('god','admin')
                OR EXISTS (
                    SELECT 1 FROM public.sys_user_permissions up
                     WHERE up.user_id = p.id
                       AND up.resource_code = p_resource
                       AND p_action = ANY(up.granted_actions)
                )
           )
    LOOP
        PERFORM public.notificar_a(r.id, p_title, p_body, p_type, p_action_url, p_sender, p_category);
        n := n + 1;
    END LOOP;

    RETURN n;
END;
$$;

COMMIT;
