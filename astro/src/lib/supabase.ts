/**
 * Supabase client for Astro (public data only — uses anon key).
 * Never use this for private/authenticated data on the server.
 */
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = String(import.meta.env.PUBLIC_SUPABASE_URL ?? '').trim();
const supabaseAnon = String(import.meta.env.PUBLIC_SUPABASE_ANON_KEY ?? '').trim();

if (!supabaseUrl || !supabaseAnon) {
  throw new Error(
    'Faltan Supabase para Astro: en el `.env` raíz define `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` (las inyectamos como públicas en build), u opcionalmente `PUBLIC_SUPABASE_URL` / `PUBLIC_SUPABASE_ANON_KEY`.',
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnon);
