import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Faltan las variables de entorno de Supabase. Asegúrate de configurar .env');
}

export const supabase = createClient(
  supabaseUrl || '', // Fallback vacío para evitar crash inmediato si faltan envs en build time, pero fallará runtime si no se proveen.
  supabaseAnonKey || '',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storageKey: 'pragmata-auth-v1',
    },
  }
);
