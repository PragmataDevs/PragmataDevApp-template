/**
 * scripts/sync-roles.ts
 *
 * Seeds default roles + their resource permissions into Supabase.
 * Companion to `sync-resources.ts` — run AFTER `pnpm db:sync`.
 *
 * USO:
 *   SUPABASE_SERVICE_ROLE_KEY=eyJh... pnpm db:sync-roles
 */

import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ Credenciales faltantes.');
  console.error('   Uso: SUPABASE_SERVICE_ROLE_KEY=eyJh... pnpm db:sync-roles');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

interface DefaultRole {
  name: string;
  description: string;
  /** resource_code → granted_actions[] */
  permissions: Record<string, string[]>;
}

const DEFAULT_ROLES: DefaultRole[] = [
  {
    name: 'Miembro',
    description: 'Acceso básico: ver entidades, crear/editar tareas, subir documentos, chatear.',
    permissions: {
      page_workspace_dashboard: ['read'],
      page_workspace_tasks: ['read', 'create', 'update', 'delete'],
      page_workspace_documents: ['read', 'create', 'update', 'delete'],
      page_workspace_config: ['read'],
      feature_chat: ['read', 'create'],
      feature_notifications_send: ['read'],
    },
  },
  {
    name: 'Visualizador',
    description: 'Solo lectura: ver dashboard, entidades, tareas y documentos.',
    permissions: {
      page_workspace_dashboard: ['read'],
      page_workspace_tasks: ['read'],
      page_workspace_documents: ['read'],
      page_workspace_config: ['read'],
      feature_chat: ['read'],
      feature_notifications_send: ['read'],
    },
  },
];

async function main() {
  console.log('🔐 Conectando a Supabase...\n');

  for (const roleDef of DEFAULT_ROLES) {
    // 1. Upsert the role
    const { data: role, error: roleErr } = await supabase
      .from('sys_roles')
      .upsert(
        {
          name: roleDef.name,
          description: roleDef.description,
          is_system_role: false,
          can_be_customized: true,
        },
        { onConflict: 'name' },
      )
      .select()
      .single();

    if (roleErr) {
      console.error(`❌ Error upserting role "${roleDef.name}":`, roleErr.message);
      continue;
    }

    console.log(`✅ Rol "${roleDef.name}" — ${role.id}`);

    // 2. Upsert role definitions (permissions)
    for (const [resourceCode, actions] of Object.entries(roleDef.permissions)) {
      const { error: defErr } = await supabase
        .from('sys_role_definitions')
        .upsert(
          {
            role_id: role.id,
            resource_code: resourceCode,
            granted_actions: actions,
          },
          { onConflict: 'role_id, resource_code' },
        );

      if (defErr) {
        console.error(`  ⚠️  ${resourceCode}:`, defErr.message);
      } else {
        console.log(`  📋 ${resourceCode} → [${actions.join(', ')}]`);
      }
    }
  }

  console.log('\n✅ Roles sembrados exitosamente.\n');
}

main().catch((err) => {
  console.error('❌ Error fatal:', err);
  process.exit(1);
});
