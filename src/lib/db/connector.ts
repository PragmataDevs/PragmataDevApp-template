import { AbstractPowerSyncDatabase, type PowerSyncBackendConnector, UpdateType } from '@powersync/web';
import { supabase } from '@/lib/supabase';

/**
 * El conector es el puente entre SQLite Local (PowerSync) y la Nube (PowerSync Service -> Supabase).
 * Se encarga de:
 * 1. Autenticar la conexión (enviando el token de Supabase).
 * 2. Subir cambios locales a la nube (uploadData).
 */
export class SupabaseConnector implements PowerSyncBackendConnector {
  
  // A. Autenticación / Obtención de Credenciales
  async fetchCredentials() {
    const { data: { session }, error } = await supabase.auth.getSession();
    
    if (error || !session) {
      throw new Error('No active Supabase session');
    }

    return {
      endpoint: import.meta.env.VITE_POWERSYNC_URL || '', // URL de tu instancia PowerSync
      token: session.access_token,
      userID: session.user.id
    };
  }

  // B. Subida de Datos (Write-back)
  // Cuando modificas algo en local, PowerSync llama a esta función para que lo guardes en Supabase.
  async uploadData(database: AbstractPowerSyncDatabase): Promise<void> {
    const transaction = await database.getNextCrudTransaction();

    if (!transaction) return;

    try {
      // Procesamos cada operación (INSERT, UPDATE, DELETE, etc.)
      for (const op of transaction.crud) {
        const table = op.table;
        const id = op.id;

        // Mapeo básico: Local OP -> Supabase Call
        if (op.op === UpdateType.PUT) {
           // Insert or Update (Upsert)
           const { error } = await supabase
             .from(table)
             .upsert({ id, ...op.opData });
           
           if (error) throw error;

        } else if (op.op === UpdateType.PATCH) {
            // Update parcial
            const { error } = await supabase
              .from(table)
              .update(op.opData)
              .eq('id', id);

            if (error) throw error;

        } else if (op.op === UpdateType.DELETE) {
            // Borrado lógico — nunca DELETE físico (ADN Pragmata).
            // Si PowerSync emite un DELETE, lo convertimos en soft delete.
            // En flujo normal esto no debería ocurrir porque el cliente siempre
            // hace upsert con status: 'deleted', pero lo cubrimos como red de seguridad.
            const { error } = await supabase
              .from(table)
              .update({
                status: 'deleted',
                deleted_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              })
              .eq('id', id);

            if (error) throw error;
        }
      }

      // Si todo salió bien, cerramos la transacción (la marcamos como subida)
      await transaction.complete();
      
    } catch (ex) {
      console.error('Upload failed:', ex);
      // No completamos la transacción, PowerSync reintentará luego.
    }
  }
}
