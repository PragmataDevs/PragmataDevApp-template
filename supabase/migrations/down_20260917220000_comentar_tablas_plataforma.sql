-- Reversa de 20260917220000_comentar_tablas_plataforma.sql — quita los comentarios.
BEGIN;
COMMENT ON TABLE public.platform_settings IS NULL;
COMMENT ON TABLE public.platform_reserved_slugs IS NULL;
COMMENT ON TABLE public.tenant_signup_log IS NULL;
COMMENT ON TABLE public.tenant_sites IS NULL;
COMMENT ON TABLE public.subscription_plans IS NULL;
COMMENT ON TABLE public.plan_features IS NULL;
COMMENT ON TABLE public.plan_limits IS NULL;
COMMENT ON TABLE public.team_subscriptions IS NULL;
COMMENT ON TABLE public.billing_events IS NULL;
COMMIT;
