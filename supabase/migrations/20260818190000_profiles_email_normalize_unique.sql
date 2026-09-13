-- ==============================================================================
-- profiles_email_normalize_unique.sql
--
-- `profiles.email` nació como `email TEXT NOT NULL` — sin UNIQUE, sin CHECK, sin
-- normalización. Eso deja dos agujeros:
--
--   1. El email del profile puede divergir del de auth.users. La edge function
--      `create-auth-user` usa el mismo string crudo para dos destinos que tratan
--      las mayúsculas distinto:
--
--          admin.auth.admin.createUser({ email })   → GoTrue lo baja a lowercase
--          caller.from('profiles').insert({ email }) → lo guarda tal cual
--
--      Si alguien teclea "Jorge.Portilla@Empresa.com", auth guarda la versión en
--      minúsculas y profiles la versión con mayúsculas. Detectado en lawrank el
--      2026-08-18: 2 de 54 perfiles desincronizados.
--
--   2. Nada impide dos perfiles con el mismo correo. Hoy es improbable (la PK
--      cuelga de auth.users, que sí tiene el email único), pero "improbable" no
--      es "imposible", y `profiles.email` es lo que la UI muestra y lo que se
--      exporta en reportes.
--
-- El fix vive en la BASE a propósito: el trigger normaliza venga de donde venga
-- la escritura (edge function, psql, un script futuro), y el índice único hace
-- imposible el duplicado. El arreglo en la app es defensa en profundidad, no la
-- garantía.
--
-- ⚠️ Antes de aplicar en un cliente con datos, verificar que no haya ya
-- duplicados case-insensitive — el índice fallaría:
--
--     SELECT lower(btrim(email)), count(*) FROM public.profiles
--      WHERE deleted_at IS NULL GROUP BY 1 HAVING count(*) > 1;
--
-- Idempotente. Reversa en down_20260818190000_profiles_email_normalize_unique.sql
-- ==============================================================================

BEGIN;

-- ── 1. Normalizar lo que ya está guardado ───────────────────────────────────
-- `btrim` además de `lower`: un espacio al final es igual de invisible y rompe
-- igual. El WHERE lo deja idempotente y evita tocar filas que ya están bien.

UPDATE public.profiles
   SET email = lower(btrim(email))
 WHERE email IS DISTINCT FROM lower(btrim(email));

-- ── 2. Trigger: normalizar en la puerta, siempre ────────────────────────────

CREATE OR REPLACE FUNCTION public.normalize_profile_email()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.email IS NOT NULL THEN
        NEW.email := lower(btrim(NEW.email));
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_normalize_email ON public.profiles;

CREATE TRIGGER trg_profiles_normalize_email
    BEFORE INSERT OR UPDATE OF email ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.normalize_profile_email();

-- ── 3. Índice único — un correo, un perfil vivo ─────────────────────────────
-- Parcial sobre `deleted_at IS NULL` por el soft-delete de AuditBase: si un
-- perfil se da de baja suave y la persona regresa a la empresa, su correo debe
-- poder reusarse. Sin el WHERE, el fantasma bloquearía el alta.

CREATE UNIQUE INDEX IF NOT EXISTS uq_profiles_email_active
    ON public.profiles (email)
    WHERE deleted_at IS NULL;

COMMIT;
