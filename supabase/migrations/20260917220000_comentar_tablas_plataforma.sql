-- ============================================================================
-- Etiquetar las tablas del MODO PLATAFORMA para que no vuelvan a parecer basura.
--
-- El 17-sep-2026 estuvieron a punto de borrarse: se ven vacías, ningún archivo
-- del front las menciona, y desde afuera parecen restos de algo que no se hizo.
-- No lo son. Son la capa común self-serve (spec: docs/spec-capa-comun-self-serve.md,
-- instalada por 20260904090000 / 091000 / 092000 / 097000 / 098000):
-- alta automática de clientes, planes y cobro, y sitio público por slug.
--
-- Están VACÍAS a propósito: `platform_settings.platform_mode` nace APAGADO, así
-- que un cliente instanciado del template no cambia de comportamiento en nada.
-- Se llenan el día que un producto propio se venda solo.
--
-- Decisión de Wicho (17-sep-2026): se quedan.
-- ============================================================================

BEGIN;

COMMENT ON TABLE public.platform_settings IS
  'MODO PLATAFORMA (self-serve). Un solo renglón; platform_mode nace APAGADO. Vacía = normal.';
COMMENT ON TABLE public.platform_reserved_slugs IS
  'MODO PLATAFORMA (self-serve). Slugs que ningún cliente puede tomar. Vacía = normal.';
COMMENT ON TABLE public.tenant_signup_log IS
  'MODO PLATAFORMA (self-serve). Bitácora de altas automáticas vía create_tenant(). Vacía = normal.';
COMMENT ON TABLE public.tenant_sites IS
  'MODO PLATAFORMA (self-serve). Sitio público por slug, sin exponer los datos fiscales de teams. Vacía = normal.';
COMMENT ON TABLE public.subscription_plans IS
  'MODO PLATAFORMA (self-serve). Catálogo de planes: cambiar un precio es editar una fila, no desplegar. Vacía = normal.';
COMMENT ON TABLE public.plan_features IS
  'MODO PLATAFORMA (self-serve). Qué recursos RBAC habilita cada plan. El corte por plan vive aquí, no en el código. Vacía = normal.';
COMMENT ON TABLE public.plan_limits IS
  'MODO PLATAFORMA (self-serve). Cuotas numéricas por plan (sucursales, tickets al mes…). Vacía = normal.';
COMMENT ON TABLE public.team_subscriptions IS
  'MODO PLATAFORMA (self-serve). Estado de suscripción por cliente. Aparte de teams a propósito: el admin del cliente edita teams, su plan NO. Vacía = normal.';
COMMENT ON TABLE public.billing_events IS
  'MODO PLATAFORMA (self-serve). Eventos de cobro de Stripe Billing. Vacía = normal.';

COMMIT;
