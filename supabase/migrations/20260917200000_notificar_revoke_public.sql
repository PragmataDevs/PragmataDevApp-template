-- ============================================================================
-- C5 — las funciones de notificación quedaron ejecutables por `anon`.
--
-- HALLAZGO (17-sep-2026, verificado contra la base, no deducido del SQL):
--     select proname, prosecdef, has_function_privilege('anon', oid, 'EXECUTE')
--       from pg_proc ... where proname like '%notificar%';
--   notificar_a            | SECURITY DEFINER | anon PUEDE
--   notificar_equipo       | SECURITY DEFINER | anon PUEDE
--   notificar_con_permiso  | SECURITY DEFINER | anon PUEDE
--
-- Es decir: cualquiera con la llave pública de la app, SIN autenticarse, podía
-- mandarle una notificación a cualquier usuario o a un equipo entero. Con el
-- texto que quisiera. Spam y phishing desde adentro del producto.
--
-- POR QUÉ SE ESCAPÓ. Dos cosas a la vez:
--   1. En Postgres, una función nueva nace con EXECUTE para PUBLIC. La
--      migración original (20260808200000) nunca las revocó.
--   2. El backport de seguridad (20260826230000) puso
--      `ALTER DEFAULT PRIVILEGES ... REVOKE EXECUTE ON FUNCTIONS FROM anon`,
--      que NO alcanza aquí por dos motivos: solo aplica a funciones creadas
--      DESPUÉS de ese comando (estas son del 8-ago, dieciocho días antes), y
--      revocarle a `anon` no le quita lo que ya tiene heredado de PUBLIC.
--
-- Estas tres funciones existen para que las llamen TRIGGERS y otras funciones
-- del servidor, no la API. Verificado: cero llamadas desde src/ en el template.
-- Por eso el revoke es total y no rompe nada; SECURITY DEFINER hace que sigan
-- corriendo con los privilegios de su dueño cuando un trigger las invoca.
--
-- ⚠️ ANTES DE BACKPORTEAR A UN CLIENTE, LEER ESTO.
-- SECURITY DEFINER cambia con qué privilegios corre la función POR DENTRO, pero
-- para LLAMARLA sigue haciendo falta EXECUTE. En el template nadie las invoca
-- todavía (verificado: cero llamadas en src/ y cero funciones de la base que las
-- mencionen), así que revocar no rompe nada. En un cliente que YA las use desde
-- un trigger normal, ese trigger corre como el usuario que hizo el INSERT y se
-- quedaría sin permiso. Ahí el arreglo correcto es marcar ESE trigger como
-- SECURITY DEFINER, no devolverle el permiso a anon. Revisar cliente por cliente.
--
-- Reversa: down_20260917200000_notificar_revoke_public.sql
-- ============================================================================

BEGIN;

-- Se revoca por búsqueda y no con las firmas escritas a mano: estas funciones
-- ya cambiaron de firma una vez (20260910140000 les agregó `p_category`), y un
-- REVOKE con la firma vieja no falla, simplemente no revoca nada. Este bloque
-- las alcanza tengan la firma que tengan.
DO $$
DECLARE
    f RECORD;
BEGIN
    FOR f IN
        SELECT p.oid::regprocedure AS sig
          FROM pg_proc p
          JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public'
           AND p.proname IN ('notificar_a', 'notificar_equipo', 'notificar_con_permiso')
    LOOP
        EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', f.sig);
        RAISE NOTICE 'revocada: %', f.sig;
    END LOOP;
END $$;

-- Red de seguridad para las que se creen de aquí en adelante.
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

COMMIT;
