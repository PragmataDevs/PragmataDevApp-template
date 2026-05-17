/**
 * Orígenes públicos (Astro) y ERP (Vite) sin placeholders de template.
 * Si entras por IP/LAN (p. ej. celular → 100.x.x.x:4321), los enlaces usan ese mismo host
 * aunque `.env` tenga `localhost` — evita mandar al loopback del teléfono.
 * Prod: `PUBLIC_APP_URL` / `PUBLIC_SITE_URL` reales en Vercel.
 */

const ERP_DEV_PORT = 7070;

const PLACEHOLDER_HOST =
  /(?:^|\.)tucliente\.com$|(?:^|\.)tudominio\.com$|your-project-ref|example\.com/i;

export function normalizeOrigin(url: string): string {
  return url.trim().replace(/\/+$/, '');
}

export function isLoopbackHostname(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
}

function hostnameOf(url: string): string | null {
  try {
    const withProto = /^https?:\/\//i.test(url) ? url : `https://${url}`;
    return new URL(withProto).hostname;
  } catch {
    return null;
  }
}

export function isLoopbackUrl(url: string): boolean {
  const host = hostnameOf(url);
  return host ? isLoopbackHostname(host) : false;
}

/** URL absoluta usable (no vacía, no dominio de ejemplo del template). */
export function isUsablePublicUrl(url: string): boolean {
  const trimmed = normalizeOrigin(url);
  if (!trimmed) return false;
  const host = hostnameOf(trimmed);
  if (!host || PLACEHOLDER_HOST.test(host)) return false;
  return true;
}

function appOriginFromPage(pageUrl: URL): string {
  const { protocol, hostname } = pageUrl;
  return normalizeOrigin(`${protocol}//${hostname}:${ERP_DEV_PORT}`);
}

function siteOriginFromPage(pageUrl: URL): string {
  const { protocol, hostname, port } = pageUrl;
  const portSuffix = port ? `:${port}` : '';
  return normalizeOrigin(`${protocol}//${hostname}${portSuffix}`);
}

/** Base del ERP para enlaces «Iniciar sesión» → `{origin}/login`. */
export function resolveAppOrigin(pageUrl?: URL): string {
  // Mismo host que la petición (celular, Tailscale, LAN) — prioridad sobre localhost en .env
  if (pageUrl?.hostname && !isLoopbackHostname(pageUrl.hostname)) {
    return appOriginFromPage(pageUrl);
  }

  const fromEnv =
    typeof import.meta.env.PUBLIC_APP_URL === 'string' ? import.meta.env.PUBLIC_APP_URL : '';
  if (isUsablePublicUrl(fromEnv)) return normalizeOrigin(fromEnv);

  if (import.meta.env.DEV) {
    if (pageUrl?.hostname) return appOriginFromPage(pageUrl);
    return 'http://localhost:7070';
  }

  return '';
}

/**
 * Origen canónico del sitio público (OG, sitemap, canonical).
 * Prioridad: petición remota → `site` Astro → `PUBLIC_SITE_URL` → dev localhost.
 */
export function resolveSiteOrigin(site?: URL, pageUrl?: URL): string {
  if (pageUrl?.hostname && !isLoopbackHostname(pageUrl.hostname)) {
    return siteOriginFromPage(pageUrl);
  }

  const fromAstro = site?.origin ? normalizeOrigin(site.origin) : '';
  if (fromAstro && isUsablePublicUrl(fromAstro) && !isLoopbackUrl(fromAstro)) {
    return fromAstro;
  }

  const fromEnv =
    typeof import.meta.env.PUBLIC_SITE_URL === 'string' ? import.meta.env.PUBLIC_SITE_URL : '';
  if (isUsablePublicUrl(fromEnv) && !isLoopbackUrl(fromEnv)) {
    return normalizeOrigin(fromEnv);
  }

  if (fromAstro && isUsablePublicUrl(fromAstro)) return fromAstro;
  if (isUsablePublicUrl(fromEnv)) return normalizeOrigin(fromEnv);

  if (import.meta.env.DEV) {
    if (pageUrl?.hostname) return siteOriginFromPage(pageUrl);
    return 'http://localhost:4321';
  }

  return '';
}

export function loginPath(appOrigin: string): string {
  const base = appOrigin ? normalizeOrigin(appOrigin) : '';
  return base ? `${base}/login` : '/login';
}
