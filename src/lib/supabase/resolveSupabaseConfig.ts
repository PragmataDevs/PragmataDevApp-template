/**
 * URL y clave anon de Supabase para el ERP (navegador).
 * Si abres el ERP por IP/LAN y `.env` tiene URL loopback, reescribe el host
 * manteniendo el puerto del `.env`.
 */
import { resolveSupabaseUrlForBrowser } from '@pragmata/core';

export function resolveSupabaseUrl(): string {
  const fromEnv = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim() ?? '';
  const apiPortOverride = Number(import.meta.env.VITE_SUPABASE_API_PORT) || undefined;
  return resolveSupabaseUrlForBrowser(fromEnv, apiPortOverride);
}

export function resolveSupabaseAnonKey(): string {
  return (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim() ?? '';
}

export function isSupabaseConfigured(): boolean {
  return Boolean(resolveSupabaseUrl() && resolveSupabaseAnonKey());
}
