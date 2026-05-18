/** Sitio público (Astro): URL base para enlaces desde el ERP. */
export function getConfiguredPublicSiteUrl(): string {
  if (import.meta.env.VITE_USE_ASTRO_PUBLIC_SITE === 'false') return '';
  const raw =
    typeof import.meta.env.VITE_PUBLIC_SITE_URL === 'string'
      ? import.meta.env.VITE_PUBLIC_SITE_URL.trim().replace(/\/+$/, '')
      : '';
  if (raw) return raw;
  if (import.meta.env.DEV) return 'http://localhost:4321';
  return '';
}

function isPrivateOrLanHost(hostname: string): boolean {
  if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') return true;
  if (/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|100\.)/.test(hostname)) return true;
  return false;
}

/** Parámetro `return_to` en `/login`: mismo origen que el sitio configurado o red privada en desarrollo. */
export function isSafeReturnToUrl(href: string): boolean {
  try {
    const u = new URL(href);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
    const cfg = getConfiguredPublicSiteUrl();
    if (cfg) {
      try {
        const base = cfg.includes('://') ? cfg : `https://${cfg}`;
        if (u.origin === new URL(base).origin) return true;
      } catch {
        /* ignore */
      }
    }
    if (import.meta.env.DEV && isPrivateOrLanHost(u.hostname)) return true;
    return false;
  } catch {
    return false;
  }
}
