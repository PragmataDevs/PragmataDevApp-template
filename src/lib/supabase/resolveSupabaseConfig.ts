/**
 * URL y clave anon de Supabase para el ERP (navegador).
 * Si abres el ERP por IP/LAN y `.env` tiene `127.0.0.1:54321`, usa el mismo host con :54321.
 */

const SUPABASE_API_PORT = 54321;

function isLoopbackHostname(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
}

function isLoopbackSupabaseUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return isLoopbackHostname(host);
  } catch {
    return false;
  }
}

export function resolveSupabaseUrl(): string {
  const fromEnv = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim() ?? '';

  if (typeof window !== 'undefined') {
    const { hostname, protocol } = window.location;
    if (hostname && !isLoopbackHostname(hostname)) {
      if (!fromEnv || isLoopbackSupabaseUrl(fromEnv)) {
        return `${protocol}//${hostname}:${SUPABASE_API_PORT}`;
      }
    }
  }

  return fromEnv;
}

export function resolveSupabaseAnonKey(): string {
  return (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim() ?? '';
}

export function isSupabaseConfigured(): boolean {
  return Boolean(resolveSupabaseUrl() && resolveSupabaseAnonKey());
}
