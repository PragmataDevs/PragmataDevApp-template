/**
 * Supabase client for Astro (public data only — anon key).
 * Never use for private/authenticated data on the server.
 *
 * En build (Vercel) pueden faltar `PUBLIC_SUPABASE_*`; no lanzamos en import:
 * las páginas comprueban `supabase` / `isSupabaseConfigured`.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = String(
  import.meta.env.PUBLIC_SUPABASE_URL ?? import.meta.env.VITE_SUPABASE_URL ?? '',
).trim();
const supabaseAnon = String(
  import.meta.env.PUBLIC_SUPABASE_ANON_KEY ?? import.meta.env.VITE_SUPABASE_ANON_KEY ?? '',
).trim();

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnon);

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnon)
  : null;
