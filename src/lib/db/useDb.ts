import { supabase } from '@/lib/supabase';
import type { PowerSyncDatabase } from '@powersync/web';

/**
 * useDb — Acceso unificado a la capa de datos.
 *
 * Pilar Operativo: las lecturas van a SQLite local (PowerSync) si el flag está activo,
 * de lo contrario van directamente a Supabase. Las escrituras SIEMPRE van a Supabase.
 *
 * Patrón de uso en hooks:
 *
 *   const { db, ps, isPowerSync } = useDb();
 *
 *   if (isPowerSync && ps) {
 *     const rows = await ps.getAll<MyType>('SELECT * FROM tabla WHERE status = ?', ['active']);
 *   } else {
 *     const { data } = await db.from('tabla').select('*').eq('status', 'active');
 *   }
 */

export const POWERSYNC_ENABLED = import.meta.env.VITE_ENABLE_POWERSYNC === 'true';

export interface DbContext {
  /** Cliente Supabase — siempre disponible. Usar para ESCRITURAS y para LECTURAS si PowerSync está off. */
  db: typeof supabase;
  /** Instancia PowerSync — solo disponible si VITE_ENABLE_POWERSYNC=true. Usar para LECTURAS offline-first. */
  ps: PowerSyncDatabase | null;
  /** true cuando PowerSync está activo y la instancia está lista. */
  isPowerSync: boolean;
}

let _psInstance: PowerSyncDatabase | null = null;

/**
 * Obtiene el contexto de DB de forma asíncrona.
 * Usar dentro de callbacks y efectos (no en el render síncrono).
 *
 * @example
 * const { db, ps, isPowerSync } = await getDb();
 */
export async function getDb(): Promise<DbContext> {
  if (POWERSYNC_ENABLED) {
    if (!_psInstance) {
      const { db } = await import('@/lib/db');
      _psInstance = db;
    }
    return { db: supabase, ps: _psInstance, isPowerSync: true };
  }
  return { db: supabase, ps: null, isPowerSync: false };
}
