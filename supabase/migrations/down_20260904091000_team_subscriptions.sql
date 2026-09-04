-- ROLLBACK de 20260904091000_team_subscriptions.sql
-- ⚠️ Revertir ANTES 20260904092000_tenant_self_signup (create_tenant escribe aquí)
-- y quitar de las policies de cliente cualquier AND plan_allows()/team_can_write().
BEGIN;

DO $$
DECLARE t TEXT;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'powersync') THEN
    FOREACH t IN ARRAY ARRAY['subscription_plans','plan_features','plan_limits','team_subscriptions'] LOOP
      IF EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='powersync' AND schemaname='public' AND tablename=t) THEN
        EXECUTE format('ALTER PUBLICATION powersync DROP TABLE public.%I', t);
      END IF;
    END LOOP;
  END IF;
END $$;

DROP FUNCTION IF EXISTS public.team_can_write();
DROP FUNCTION IF EXISTS public.plan_within_limit(TEXT, INTEGER);
DROP FUNCTION IF EXISTS public.plan_allows(TEXT, TEXT);
DROP FUNCTION IF EXISTS public.my_team_is_platform_owner();
DROP FUNCTION IF EXISTS public.my_plan_code();

DROP TABLE IF EXISTS public.billing_events;
DROP TABLE IF EXISTS public.team_subscriptions;
DROP TABLE IF EXISTS public.plan_limits;
DROP TABLE IF EXISTS public.plan_features;
DROP TABLE IF EXISTS public.subscription_plans;

COMMIT;
