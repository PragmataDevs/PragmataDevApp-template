import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  isSupabaseConfigured,
  resolveSupabaseAnonKey,
  resolveSupabaseUrl,
} from './resolveSupabaseConfig';

function missingConfigMessage(): string {
  return (
    'Faltan VITE_SUPABASE_URL y/o VITE_SUPABASE_ANON_KEY. ' +
    'En la raíz del repo: cp .env.example .env → supabase start → supabase status ' +
    '(pega Project URL y Publishable). Reinicia pnpm dev.'
  );
}

let client: SupabaseClient | null = null;

function getClient(): SupabaseClient {
  if (client) return client;

  const supabaseUrl = resolveSupabaseUrl();
  const supabaseAnonKey = resolveSupabaseAnonKey();

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(missingConfigMessage());
  }

  client = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storageKey: 'pragmata-auth-v1',
    },
  });

  return client;
}

/** Cliente Supabase; lanza error claro si falta `.env` (no `supabaseUrl is required`). */
export const supabase: SupabaseClient = new Proxy({} as SupabaseClient, {
  get(_target, prop, receiver) {
    return Reflect.get(getClient(), prop, receiver);
  },
});

export { isSupabaseConfigured, resolveSupabaseUrl, resolveSupabaseAnonKey };
