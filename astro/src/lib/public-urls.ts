/**
 * Orígenes públicos (Astro) y ERP (Vite) sin placeholders de template.
 * Si entras por IP/LAN (p. ej. celular → 100.x.x.x:4321), los enlaces usan ese mismo host
 * aunque `.env` tenga `localhost` — evita mandar al loopback del teléfono.
 * Prod: `PUBLIC_APP_URL` / `PUBLIC_SITE_URL` reales en Vercel.
 */

const PLACEHOLDER_HOST =
  /(?:^|\.)tucliente\.com$|(?:^|\.)tudominio\.com$|your-project-ref|example\.com/i;

export function normalizeOrigin(url: string): string {
  return url.trim().replace(/\/+$/, '');
}

export function isLoopbackHostname(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
}

/** IP privada / Tailscale — inferir ERP en el mismo host que la petición (solo dev/LAN). */
function isPrivateOrLanHost(hostname: string): boolean {
  if (isLoopbackHostname(hostname)) return false;
  return /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|100\.)/.test(hostname);
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

function portFromConfiguredUrl(raw: string | undefined, fallback: number): number {
  const t = typeof raw === 'string' ? raw.trim() : '';
  if (!t) return fallback;
  try {
    const withProto = /^https?:\/\//i.test(t) ? t : `https://${t}`;
    const u = new URL(withProto);
    if (u.port) return parseInt(u.port, 10);
    return u.protocol === 'https:' ? 443 : 80;
  } catch {
    return fallback;
  }
}

function parseEnvPort(raw: unknown): number | null {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  const n = parseInt(raw.trim(), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Puerto ERP en dev: `VITE_PORT` (misma fuente que vite.config) → `PUBLIC_APP_URL` → 7070. */
function erpDevPort(): number {
  return parseEnvPort(import.meta.env.VITE_PORT)
    ?? portFromConfiguredUrl(import.meta.env.PUBLIC_APP_URL, 7070);
}

/** Puerto Astro en dev: `ASTRO_PORT` (astro.config) → `PUBLIC_SITE_URL` → 4321. */
function siteDevPort(): number {
  return parseEnvPort(import.meta.env.ASTRO_PORT)
    ?? portFromConfiguredUrl(import.meta.env.PUBLIC_SITE_URL, 4321);
}

function appOriginFromPage(pageUrl: URL): string {
  const { protocol, hostname } = pageUrl;
  const port = erpDevPort();
  const omitPort =
    (protocol === 'https:' && port === 443) || (protocol === 'http:' && port === 80);
  return normalizeOrigin(
    omitPort ? `${protocol}//${hostname}` : `${protocol}//${hostname}:${port}`,
  );
}

function siteOriginFromPage(pageUrl: URL): string {
  const { protocol, hostname, port } = pageUrl;
  const portSuffix = port ? `:${port}` : '';
  return normalizeOrigin(`${protocol}//${hostname}${portSuffix}`);
}

/** Base del ERP para enlaces «Iniciar sesión» → `{origin}/login`. */
export function resolveAppOrigin(pageUrl?: URL): string {
  const fromEnv =
    typeof import.meta.env.PUBLIC_APP_URL === 'string' ? import.meta.env.PUBLIC_APP_URL : '';
  if (isUsablePublicUrl(fromEnv) && !isLoopbackUrl(fromEnv)) {
    return normalizeOrigin(fromEnv);
  }

  // LAN/móvil en dev: mismo host de la petición + puerto ERP del .env
  if (pageUrl?.hostname && !isLoopbackHostname(pageUrl.hostname)) {
    if (import.meta.env.DEV || isPrivateOrLanHost(pageUrl.hostname)) {
      return appOriginFromPage(pageUrl);
    }
  }

  if (import.meta.env.DEV) {
    if (pageUrl?.hostname) return appOriginFromPage(pageUrl);
    return `http://localhost:${erpDevPort()}`;
  }

  return '';
}

/**
 * Origen canónico del sitio público (OG, sitemap, canonical).
 * Prioridad: petición remota → `site` Astro → `PUBLIC_SITE_URL` → dev localhost.
 */
export function resolveSiteOrigin(site?: URL, pageUrl?: URL): string {
  const fromEnv =
    typeof import.meta.env.PUBLIC_SITE_URL === 'string' ? import.meta.env.PUBLIC_SITE_URL : '';
  if (!import.meta.env.DEV && isUsablePublicUrl(fromEnv) && !isLoopbackUrl(fromEnv)) {
    return normalizeOrigin(fromEnv);
  }

  if (pageUrl?.hostname && !isLoopbackHostname(pageUrl.hostname)) {
    if (import.meta.env.DEV || isPrivateOrLanHost(pageUrl.hostname)) {
      return siteOriginFromPage(pageUrl);
    }
  }

  const fromAstro = site?.origin ? normalizeOrigin(site.origin) : '';
  if (fromAstro && isUsablePublicUrl(fromAstro) && !isLoopbackUrl(fromAstro)) {
    return fromAstro;
  }

  if (isUsablePublicUrl(fromEnv) && !isLoopbackUrl(fromEnv)) {
    return normalizeOrigin(fromEnv);
  }

  if (fromAstro && isUsablePublicUrl(fromAstro) && !isLoopbackUrl(fromAstro)) return fromAstro;
  if (isUsablePublicUrl(fromEnv) && !isLoopbackUrl(fromEnv)) return normalizeOrigin(fromEnv);

  if (import.meta.env.DEV) {
    if (pageUrl?.hostname) return siteOriginFromPage(pageUrl);
    return `http://localhost:${siteDevPort()}`;
  }

  return '';
}

export function loginPath(appOrigin: string): string {
  const base = appOrigin ? normalizeOrigin(appOrigin) : '';
  return base ? `${base}/login` : '/login';
}

/** Enlace al login del ERP; opcionalmente añade `return_to` al sitio Astro (mismo host/LAN que la petición). */
export function erpLoginUrl(appOrigin: string, siteOrigin?: string): string {
  const login = loginPath(appOrigin);
  const ret = siteOrigin ? normalizeOrigin(siteOrigin) : '';
  if (!ret) return login;
  const home = ret.endsWith('/') ? ret : `${ret}/`;
  const sep = login.includes('?') ? '&' : '?';
  return `${login}${sep}return_to=${encodeURIComponent(home)}`;
}
