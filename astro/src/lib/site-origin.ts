/**
 * Origen canónico del sitio público (sin barra final).
 * Prioridad: `site` de Astro (astro.config `site`) → `PUBLIC_SITE_URL` → dev localhost.
 */
export function resolveSiteOrigin(site: URL | undefined): string {
  const fromAstro = site?.origin?.replace(/\/+$/, '') ?? '';
  if (fromAstro) return fromAstro;

  const env =
    typeof import.meta.env.PUBLIC_SITE_URL === 'string'
      ? import.meta.env.PUBLIC_SITE_URL.trim().replace(/\/+$/, '')
      : '';
  if (env) return env;

  if (import.meta.env.DEV) return 'http://localhost:4321';

  return 'https://tucliente.com';
}
