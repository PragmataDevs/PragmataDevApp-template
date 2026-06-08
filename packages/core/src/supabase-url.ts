/**
 * Utilidades compartidas entre ERP (Vite) y Astro para resolver la URL de Supabase
 * cuando se accede por LAN/IP. Extrae el puerto de la URL del .env y reescribe
 * el hostname manteniendo el puerto original.
 */

function isLoopbackHostname(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
}

function isLoopbackSupabaseUrl(url: string): boolean {
  try {
    return isLoopbackHostname(new URL(url).hostname);
  } catch {
    return false;
  }
}

function extractPort(url: string): number | null {
  try {
    const p = new URL(url).port;
    return p ? Number(p) : null;
  } catch {
    return null;
  }
}

function supabaseApiPort(fromEnvUrl: string, explicitPort?: number): number {
  const fromUrl = extractPort(fromEnvUrl);
  if (fromUrl) return fromUrl;
  if (explicitPort !== undefined && Number.isFinite(explicitPort) && explicitPort > 0 && explicitPort < 65536) return explicitPort;
  return 54321;
}

function resolveSupabaseUrlForBrowser(
  supabaseUrlEnv: string,
  apiPortOverride?: number,
): string {
  const fromEnv = supabaseUrlEnv.trim();

  if (typeof window !== 'undefined') {
    const { hostname, protocol } = window.location;
    if (hostname && !isLoopbackHostname(hostname) && (!fromEnv || isLoopbackSupabaseUrl(fromEnv))) {
      const port = supabaseApiPort(fromEnv, apiPortOverride);
      return `${protocol}//${hostname}:${port}`;
    }
  }

  return fromEnv;
}

export {
  isLoopbackHostname,
  isLoopbackSupabaseUrl,
  extractPort,
  supabaseApiPort,
  resolveSupabaseUrlForBrowser,
};
