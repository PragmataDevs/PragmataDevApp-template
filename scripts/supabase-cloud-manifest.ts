/**
 * Manifiesto de despliegue Supabase nube — editar por cliente.
 *
 * - `EDGE_FUNCTIONS_CORE`: siempre se despliegan con `pnpm cloud:deploy-functions`.
 * - `EDGE_FUNCTIONS_OPTIONAL`: grupos que se despliegan solo si el flag/feature
 *   correspondiente está activo (`--with-ai`, `--with-ecommerce`, …).
 *
 * 👉 Agrega aquí las Edge Functions propias de TU cliente. Dos formas:
 *   1. Si son siempre necesarias → añádelas a `EDGE_FUNCTIONS_CORE`.
 *   2. Si dependen de un feature flag → crea un grupo nuevo en
 *      `EDGE_FUNCTIONS_OPTIONAL` (ej. `EDGE_FUNCTIONS_OPTIONAL.miIntegracion`)
 *      y su propio flag `--with-<algo>` en `supabase-cloud-bootstrap.ts`
 *      (`resolveEdgeFunctions()` + `parseArgs()` + `printHelp()`).
 */

export const EDGE_FUNCTIONS_CORE = [
  'create-auth-user',
] as const;

export const EDGE_FUNCTIONS_OPTIONAL = {
  /** VITE_ENABLE_AI */
  ai: ['ai-gateway', 'ai-task-summary'] as const,
  /** VITE_ENABLE_ECOMMERCE */
  ecommerce: ['stripe-checkout', 'stripe-webhook'] as const,
} as const;

/**
 * Secrets de Edge Functions (Dashboard → Project Settings → Edge Functions,
 * o `supabase secrets set`). Solo se suben los que estén definidos en
 * `.env.cloud` — los que falten se listan como "opcionales no definidos".
 *
 * 👉 Agrega aquí los secrets de las integraciones propias de tu cliente
 * (ej. API keys de terceros que consuman tus Edge Functions).
 */
export const EDGE_SECRETS_INTEGRATIONS = [
  'OPENAI_API_KEY',
  'OPENAI_MODEL',
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'PUBLIC_SITE_URL',
] as const;

/**
 * Tablas excluidas al copiar datos local → nube (`--sync-data-from-local`).
 * El god user, RBAC y catálogos se recrean en bootstrap; no sobrescribir.
 */
export const DATA_SYNC_EXCLUDE_TABLES = [
  'public.profiles',
  'public.teams',
  'public.sys_roles',
  'public.sys_role_definitions',
  'public.sys_resources',
  'public.sys_user_permissions',
  'public.sys_entity_access',
  // CMS seed en migraciones (slug home) — no lo pises al copiar datos.
  'public.cms_pages',
] as const;

/**
 * Catálogos sembrados por migraciones en nube (ON CONFLICT / códigos fijos)
 * que deben vaciarse ANTES del import de `--sync-data-from-local`, para poder
 * reusar los UUIDs generados en el entorno local (si no, `duplicate key`).
 *
 * Vacío por defecto — el template base no siembra catálogos propios.
 * 👉 Agrega aquí las tablas `platform_settings_*` (o similares) que tu
 * cliente siembre por migración, ej: 'public.platform_settings_algo'.
 */
export const DATA_SYNC_CLEAR_CATALOG_TABLES = [] as const;

export function resolveEdgeFunctions(options: {
  includeAi?: boolean;
  includeEcommerce?: boolean;
}): string[] {
  const list: string[] = [...EDGE_FUNCTIONS_CORE];
  if (options.includeAi) {
    list.push(...EDGE_FUNCTIONS_OPTIONAL.ai);
  }
  if (options.includeEcommerce) {
    list.push(...EDGE_FUNCTIONS_OPTIONAL.ecommerce);
  }
  return list;
}
