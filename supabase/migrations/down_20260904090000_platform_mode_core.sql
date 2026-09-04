-- ROLLBACK de 20260904090000_platform_mode_core.sql
-- Quita settings, slugs reservados y el guard de is_platform_owner; restaura
-- enforce_profile_privilege_guard al cuerpo del schema base (sin passthrough).
-- ⚠️ Si ya corrieron las partes 2 y 3 (subscriptions, signup), revertirlas ANTES.
BEGIN;

DROP TRIGGER IF EXISTS aaa_guard_team_platform_owner ON public.teams;
DROP FUNCTION IF EXISTS public.enforce_team_platform_owner_guard();

DROP FUNCTION IF EXISTS public.is_platform_mode();
DROP TABLE IF EXISTS public.platform_reserved_slugs;
DROP TABLE IF EXISTS public.platform_settings;

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
BEGIN
    IF public.is_god() THEN
        RETURN NEW;
    END IF;

    IF current_uid IS NULL THEN
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
