/**
 * scripts/sync-resources.ts
 *
 * Sincroniza el catálogo de recursos (sys_resources) entre el código y Supabase.
 *
 * - Upserta todos los recursos activos definidos en APP_RESOURCES.
 * - Depreca los recursos que ya no existen en el código (resource_status → 'deprecated').
 * - NO elimina registros: borrado lógico via resource_status.
 *
 * USO:
 *   SUPABASE_SERVICE_ROLE_KEY=eyJh... pnpm db:sync
 *
 * REQUISITOS:
 *   - VITE_SUPABASE_URL definida en .env
 *   - SUPABASE_SERVICE_ROLE_KEY pasada inline (nunca en .env)
 */

import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { APP_RESOURCES } from '../src/config/security/resources';

dotenv.config();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ Credenciales faltantes.');
  console.error('   Uso: SUPABASE_SERVICE_ROLE_KEY=eyJh... pnpm db:sync');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function syncResources() {
  console.log('\n🔄 Sincronizando recursos con Supabase...');
  console.log(`📦 ${APP_RESOURCES.length} recursos definidos en el código.\n`);

  // ── 1. Upsert todos los recursos activos del código ──────────────
  let ok = 0;
  let fail = 0;

  for (const resource of APP_RESOURCES) {
    const { error } = await supabase
      .from('sys_resources')
      .upsert(
        {
          code: resource.code,
          name: resource.name,
          description: resource.description ?? null,
          category: resource.category,
          type: resource.type,
          default_actions: resource.default_actions,
          resource_status: 'active',
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'code' }
      );

    if (error) {
      console.error(`  ❌ ${resource.code}:`, error.message);
      fail++;
    } else {
      console.log(`  ✅ ${resource.name} (${resource.code})`);
      ok++;
    }
  }

  // ── 2. Deprecar recursos que ya no existen en el código ──────────
  const activeCodes = APP_RESOURCES.map((r) => r.code);

  const { data: dbResources, error: fetchError } = await supabase
    .from('sys_resources')
    .select('code, name, resource_status')
    .eq('resource_status', 'active');

  if (fetchError) {
    console.error('\n❌ Error al obtener recursos existentes:', fetchError.message);
  } else {
    const toDeprecate = (dbResources ?? []).filter((r) => !activeCodes.includes(r.code));

    if (toDeprecate.length > 0) {
      console.log(`\n⚠️  Deprecando ${toDeprecate.length} recursos que ya no están en el código:`);
      for (const r of toDeprecate) {
        const { error: depError } = await supabase
          .from('sys_resources')
          .update({ resource_status: 'deprecated', updated_at: new Date().toISOString() })
          .eq('code', r.code);

        if (depError) {
          console.error(`  ❌ No se pudo deprecar ${r.code}:`, depError.message);
        } else {
          console.log(`  🗄️  Deprecado: ${r.name} (${r.code})`);
        }
      }
    } else {
      console.log('\n✨ Sin recursos obsoletos que deprecar.');
    }
  }

  // ── 3. Resumen ────────────────────────────────────────────────────
  console.log('\n══════════════════════════════════════════');
  console.log(`🎉 Sincronización completada`);
  console.log(`  ✅ Actualizados: ${ok}`);
  console.log(`  ❌ Con error:    ${fail}`);
  console.log('══════════════════════════════════════════\n');

  if (fail > 0) process.exit(1);
}

syncResources().catch((err) => {
  console.error('Error inesperado:', err);
  process.exit(1);
});
