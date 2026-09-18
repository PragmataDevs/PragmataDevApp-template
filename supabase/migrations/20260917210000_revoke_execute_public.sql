-- ============================================================================
-- C6 — cerrar la puerta de atrás: 32 funciones privilegiadas seguían abiertas
-- a PUBLIC, y `anon` heredaba de ahí.
--
-- EL PATRÓN, que es lo importante de entender antes de tocar esto:
-- en Postgres una función nace con EXECUTE para PUBLIC. `anon` y `authenticated`
-- son miembros de PUBLIC, así que heredan ese permiso. Escribir
-- `REVOKE EXECUTE ... FROM anon` NO se lo quita: le quita el grant DIRECTO, que
-- muchas veces ni tenía, y lo deja entrando por la herencia.
--
-- Resultado: el template tenía REVOKEs escritos, aplicados, y sin efecto. El
-- código decía cerrado y la base decía abierto. Ejemplo verificado el 17-sep:
--     support_session_open  →  migración con REVOKE ... FROM anon
--                              proacl = {=X/postgres, authenticated=X/postgres, …}
--     el `=X` sin rol delante ES PUBLIC. anon podía llamarla igual.
--
-- MEDIDO EN LA BASE (no deducido del SQL), stack local del template:
--     49 funciones SECURITY DEFINER
--     32 abiertas a PUBLIC
--     33 ejecutables por anon de hecho
--     13 con anon explícito (se revisan aparte, una por una: unas son legítimas
--        como get_public_site o get_platform_public_settings, otras no)
--      8 de tipo trigger (PostgREST no las expone; no son llamables por API)
--
-- POR QUÉ ESTO NO ROMPE NADA. Se midió antes de escribirlo:
--     funciones que heredan de PUBLIC y NO tienen grant propio a authenticated
--     y no son trigger  →  CERO.
-- Es decir, todo lo que la app usa de verdad tiene su permiso explícito. Lo que
-- se cae es solo el acceso que nadie pidió.
--
-- Las funciones NUEVAS ya están cubiertas por el ALTER DEFAULT PRIVILEGES de
-- 20260917200000. Esta migración es para las que ya existían.
--
-- Reversa: down_20260917210000_revoke_execute_public.sql
-- ============================================================================

BEGIN;

REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;

-- Cinturón y tirantes: por si alguna migración vieja dejó un grant directo a
-- anon que ya no tiene razón de ser. Las 13 con anon deliberado se revisan en
-- su propio ticket; aquí NO se tocan (no hay REVOKE masivo a anon a propósito).

COMMIT;
