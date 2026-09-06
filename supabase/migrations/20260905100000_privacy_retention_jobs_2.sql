-- ============================================================================
-- privacy_retention_jobs_2 — retención que el aviso promete (Cancerbero A4)
-- ============================================================================
--   · pg_cron habilitado (si el rol lo permite) y AMBOS jobs agendados:
--       privacy-cleanup-anonymous-users  04:17 UTC diario  (anónimos > 30 días)
--       privacy-cleanup-logs             04:33 UTC diario  (bitácoras vencidas)
--   · privacy_cleanup_logs(): tenant_signup_log > 90 d; billing_events procesados
--     > 24 m; god_access_log > 24 m; ai_usage: anonimiza user_id > 90 d y borra > 13 m.
--   · La limpieza de anónimos ahora respeta actividad: last_sign_in_at (o created_at)
--     > 30 días, para no matar la sesión de un comensal recurrente.
-- Sin pg_cron (local), las funciones quedan listas para un cron externo.
-- Idempotente. Reversa: down_20260905100000_privacy_retention_jobs_2.sql
-- ============================================================================
BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    BEGIN
      CREATE EXTENSION pg_cron;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'pg_cron no se pudo habilitar aquí (%). Agendar externamente.', SQLERRM;
    END;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.privacy_cleanup_anonymous_users(p_days INTEGER DEFAULT 30)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_count INTEGER;
BEGIN
    IF p_days < 1 THEN RAISE EXCEPTION 'p_days must be >= 1'; END IF;
    WITH del AS (
        DELETE FROM auth.users
        WHERE is_anonymous IS TRUE
          AND COALESCE(last_sign_in_at, created_at) < now() - make_interval(days => p_days)
        RETURNING id
    )
    SELECT count(*) INTO v_count FROM del;
    RETURN v_count;
END;
$$;
REVOKE ALL ON FUNCTION public.privacy_cleanup_anonymous_users(INTEGER) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.privacy_cleanup_logs()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    n_signup INTEGER; n_billing INTEGER; n_god INTEGER; n_ai_anon INTEGER; n_ai_del INTEGER;
BEGIN
    WITH d AS (DELETE FROM public.tenant_signup_log WHERE created_at < now() - interval '90 days' RETURNING 1)
    SELECT count(*) INTO n_signup FROM d;

    WITH d AS (DELETE FROM public.billing_events WHERE processed_at IS NOT NULL AND created_at < now() - interval '24 months' RETURNING 1)
    SELECT count(*) INTO n_billing FROM d;

    WITH d AS (DELETE FROM public.god_access_log WHERE created_at < now() - interval '24 months' RETURNING 1)
    SELECT count(*) INTO n_god FROM d;

    WITH u AS (UPDATE public.ai_usage SET user_id = NULL WHERE user_id IS NOT NULL AND created_at < now() - interval '90 days' RETURNING 1)
    SELECT count(*) INTO n_ai_anon FROM u;

    WITH d AS (DELETE FROM public.ai_usage WHERE created_at < now() - interval '13 months' RETURNING 1)
    SELECT count(*) INTO n_ai_del FROM d;

    RETURN jsonb_build_object('tenant_signup_log', n_signup, 'billing_events', n_billing,
                              'god_access_log', n_god, 'ai_usage_anonimizados', n_ai_anon, 'ai_usage_borrados', n_ai_del);
END;
$$;
REVOKE ALL ON FUNCTION public.privacy_cleanup_logs() FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    BEGIN PERFORM cron.unschedule('privacy-cleanup-anonymous-users'); EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN PERFORM cron.unschedule('privacy-cleanup-logs'); EXCEPTION WHEN OTHERS THEN NULL; END;
    PERFORM cron.schedule('privacy-cleanup-anonymous-users', '17 4 * * *', $job$SELECT public.privacy_cleanup_anonymous_users(30)$job$);
    PERFORM cron.schedule('privacy-cleanup-logs',            '33 4 * * *', $job$SELECT public.privacy_cleanup_logs()$job$);
    RAISE NOTICE 'pg_cron: 2 jobs de retención agendados';
  ELSE
    RAISE NOTICE 'pg_cron no disponible: agendar privacy_cleanup_anonymous_users(30) y privacy_cleanup_logs() externamente';
  END IF;
END $$;

COMMIT;
