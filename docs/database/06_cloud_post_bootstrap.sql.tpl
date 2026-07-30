-- ==============================================================================
-- Post-bootstrap nube — aplicado por `pnpm cloud:bootstrap` (paso "Post-SQL").
-- No editar el mecanismo de placeholders sin editar también
-- scripts/supabase-cloud-bootstrap.ts (buildPostBootstrapSql).
--
-- Vacío por defecto: el template base NO necesita SQL post-deploy (no usa
-- pg_cron ni secretos internos por SQL). Si tu cliente sí lo necesita,
-- agrega tu SQL abajo, entre BEGIN/COMMIT.
--
-- Placeholders disponibles (reemplazados automáticamente por el script):
--   __PROJECT_REF__   → project ref de Supabase (ej. abcdefghijklmnop)
--   __ANON_KEY__       → anon key, ya como literal SQL entre comillas
--                         (solo se exige VITE_SUPABASE_ANON_KEY en .env.cloud
--                          SI este archivo usa el placeholder — si no aparece,
--                          el script no lo pide)
--
-- Patrón típico si necesitas pg_cron llamando a una Edge Function propia:
--   1. Migración nueva que crea `CREATE SCHEMA IF NOT EXISTS private;` +
--      `private.secrets (key text PRIMARY KEY, value text NOT NULL, ...)`
--      sin grants a anon/authenticated (solo postgres).
--   2. Aquí: `INSERT INTO private.secrets (key, value) VALUES (...) ON CONFLICT ...`
--      con los secrets que tu función SQL necesite (ej. un anon key o un
--      secreto para validar el request entrante).
--   3. Aquí también: `CREATE OR REPLACE FUNCTION public.run_mi_dispatch() ...`
--      que lea `private.secrets` y llame `net.http_post(...)` a tu Edge
--      Function — y agéndala con `SELECT cron.schedule(...)` en su propia
--      migración (requiere la extensión `pg_cron` habilitada en el proyecto).
-- ==============================================================================

BEGIN;

-- (vacío por defecto — agrega aquí el SQL post-bootstrap de tu cliente)

COMMIT;

NOTIFY pgrst, 'reload schema';
