/**
 * Supabase client for Astro (public data only — anon key).
 * Never use for private/authenticated data on the server.
 *
 * En build (Vercel) pueden faltar `PUBLIC_SUPABASE_*`; no lanzamos en import:
 * las páginas comprueban `supabase` / `isSupabaseConfigured`.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_API_PORT = 54321;

function isLoopbackHost(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
}

function isLoopbackSupabaseUrl(url: string): boolean {
  try {
    return isLoopbackHost(new URL(url).hostname);
  } catch {
    return false;
  }
}

function resolveSupabaseUrlForBrowser(): string {
  const fromEnv = String(
    import.meta.env.PUBLIC_SUPABASE_URL ?? import.meta.env.VITE_SUPABASE_URL ?? '',
  ).trim();

  if (typeof window !== 'undefined') {
    const { hostname, protocol } = window.location;
    if (hostname && !isLoopbackHost(hostname) && (!fromEnv || isLoopbackSupabaseUrl(fromEnv))) {
      return `${protocol}//${hostname}:${SUPABASE_API_PORT}`;
    }
  }

  return fromEnv;
}

const supabaseUrl = resolveSupabaseUrlForBrowser();
const supabaseAnon = String(
  import.meta.env.PUBLIC_SUPABASE_ANON_KEY ?? import.meta.env.VITE_SUPABASE_ANON_KEY ?? '',
).trim();

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnon);

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnon)
  : null;
