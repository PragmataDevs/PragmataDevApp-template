// src/lib/db/index.ts
import { PowerSyncDatabase } from '@powersync/web';
import { AppSchema } from './schema';
import { SupabaseConnector } from './connector';

// Singleton instance
export let db: PowerSyncDatabase;

export const initPowerSync = async () => {
  if (db) return db;

  // 1. Instanciamos la base de datos PowerSync
  db = new PowerSyncDatabase({
    schema: AppSchema,
    database: {
      dbFilename: 'pragmata_db_v1.sqlite' // Nombre del archivo local
    }
  });

  // 2. Conectamos con el Integrador (Supabase)
  const connector = new SupabaseConnector();
  
  // 3. Iniciamos (Connect)
  // Esto arrancará la sincronización en segundo plano si hay sesión.
  await db.connect(connector);

  console.log('[PowerSync] Database initialized and connected.');
  return db;
};
