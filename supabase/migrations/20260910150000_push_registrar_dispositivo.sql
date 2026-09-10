-- ==============================================================================
-- push_registrar_dispositivo.sql — el alta del aparato, hecha en la base.
--
-- POR QUÉ UNA RPC Y NO UN UPSERT DESDE LA APP
-- El índice que protege la unicidad del token es PARCIAL
-- (`UNIQUE (token) WHERE status='active'`), porque con soft delete un índice
-- total dejaría el token ocupado para siempre. PostgREST no sabe expresar la
-- cláusula WHERE de un índice parcial en su upsert, así que
-- `.upsert(..., onConflict: 'token')` truena con:
--     "there is no unique or exclusion constraint matching the ON CONFLICT
--      specification"
-- Verificado contra la base, no supuesto. Y habría reventado en el teléfono,
-- no aquí.
--
-- POR QUÉ SECURITY DEFINER
-- El caso que hay que soportar es que un aparato CAMBIE DE DUEÑO: Ana cierra
-- sesión y Beto entra en el mismo teléfono, con el mismo token. Beto necesita
-- tomar posesión de una fila que hoy es de Ana — y RLS, con razón, no lo deja
-- ni verla. La función corre como definer para poder reasignarla, pero SIEMPRE
-- escribe `auth.uid()` como dueño: nadie puede registrar un aparato a nombre de
-- otro. Ese es justo el agujero que se cierra, no uno que se abre.
--
-- Idempotente. Reversa en down_.
-- ==============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.push_registrar_dispositivo(
    p_token        TEXT,
    p_platform     TEXT,
    p_app_slug     TEXT,
    p_device_label TEXT DEFAULT NULL,
    p_app_version  TEXT DEFAULT NULL,
    p_locale       TEXT DEFAULT NULL,
    p_entity       UUID DEFAULT NULL
)
RETURNS public.push_devices
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user UUID := auth.uid();
    v_team UUID;
    v_fila public.push_devices;
BEGIN
    IF v_user IS NULL THEN
        RAISE EXCEPTION 'push_registrar_dispositivo requiere sesión';
    END IF;
    IF p_token IS NULL OR length(trim(p_token)) = 0 THEN
        RAISE EXCEPTION 'token vacío';
    END IF;
    IF p_platform NOT IN ('android','ios','web') THEN
        RAISE EXCEPTION 'platform inválida: %', p_platform;
    END IF;

    SELECT team_id INTO v_team FROM public.profiles WHERE id = v_user;
    IF v_team IS NULL THEN
        RAISE EXCEPTION 'el usuario % no tiene equipo', v_user;
    END IF;

    -- Toma de posesión: si el aparato ya estaba registrado (aunque fuera de
    -- otra persona), la fila cambia de dueño en vez de duplicarse. Y se limpia
    -- disabled_at/failure_count: si el aparato está aquí registrándose, vive.
    UPDATE public.push_devices
       SET user_id      = v_user,
           team_id      = v_team,
           platform     = p_platform,
           app_slug     = p_app_slug,
           device_label = coalesce(p_device_label, device_label),
           app_version  = coalesce(p_app_version, app_version),
           locale       = coalesce(p_locale, locale),
           entity_id    = p_entity,
           last_seen_at = NOW(),
           failure_count = 0,
           disabled_at  = NULL,
           updated_by   = v_user
     WHERE token = p_token AND status = 'active'
    RETURNING * INTO v_fila;

    IF FOUND THEN
        RETURN v_fila;
    END IF;

    INSERT INTO public.push_devices
        (user_id, team_id, token, platform, app_slug, device_label,
         app_version, locale, entity_id, created_by, updated_by)
    VALUES
        (v_user, v_team, p_token, p_platform, p_app_slug, p_device_label,
         p_app_version, p_locale, p_entity, v_user, v_user)
    RETURNING * INTO v_fila;

    RETURN v_fila;
END;
$$;

REVOKE ALL ON FUNCTION public.push_registrar_dispositivo(TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.push_registrar_dispositivo(TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,UUID) TO authenticated;

COMMENT ON FUNCTION public.push_registrar_dispositivo IS
'Alta o toma de posesión de un aparato para push. Siempre asigna auth.uid()
como dueño: un token pertenece a una sola persona a la vez, que es lo que evita
que a alguien le lleguen al teléfono los avisos del dueño anterior.';


-- ── Baja: al cerrar sesión ──────────────────────────────────────────────────
-- Sin esto, el teléfono sigue recibiendo lo de quien ya se salió.
CREATE OR REPLACE FUNCTION public.push_desvincular_dispositivo(p_token TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_user UUID := auth.uid();
BEGIN
    IF v_user IS NULL THEN RETURN; END IF;
    UPDATE public.push_devices
       SET status = 'deleted', deleted_at = NOW(), updated_by = v_user
     WHERE token = p_token AND status = 'active' AND user_id = v_user;
END;
$$;

REVOKE ALL ON FUNCTION public.push_desvincular_dispositivo(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.push_desvincular_dispositivo(TEXT) TO authenticated;


-- ── Señal de vida: al volver del background ─────────────────────────────────
CREATE OR REPLACE FUNCTION public.push_tocar_dispositivo(p_token TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_user UUID := auth.uid();
BEGIN
    IF v_user IS NULL THEN RETURN; END IF;
    UPDATE public.push_devices
       SET last_seen_at = NOW()
     WHERE token = p_token AND status = 'active' AND user_id = v_user;
END;
$$;

REVOKE ALL ON FUNCTION public.push_tocar_dispositivo(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.push_tocar_dispositivo(TEXT) TO authenticated;

COMMIT;
