
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { APP_RESOURCES } from '../src/config/security/resources';

// ═══════════════════════════════════════════════════════════════
// USO:
//   SUPABASE_SERVICE_ROLE_KEY=eyJh... pnpm db:seed
//
// NOTA:
//   - VITE_SUPABASE_URL debe estar definida en tu archivo .env
//   - El Service Role Key se pasa inline para no guardarlo en .env
//   - Lo encuentras en: Supabase Dashboard > Settings > API > service_role
// ═══════════════════════════════════════════════════════════════

// Load environment variables
dotenv.config();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY; // MUST use Service Role for seeding system tables

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ Error: Missing Credentials.');
  console.error('   To run this script securely without saving the Service Role Key in .env,');
  console.error('   pass it directly in the command line:');
  console.error('');
  console.error('   SUPABASE_SERVICE_ROLE_KEY=eyJh... pnpm db:seed');
  console.error('');
  console.error('   (Ensure VITE_SUPABASE_URL is set in your .env)');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function seedResources() {
  console.log('🚀 Starting Resource Seeding in Supabase...');
  console.log(`📦 Found ${APP_RESOURCES.length} resources in code catalog.`);

  let successCount = 0;
  let errorCount = 0;

  for (const resource of APP_RESOURCES) {
    // Map TS definition to DB Column names
    const dbPayload = {
      code: resource.code,
      name: resource.name,
      description: resource.description || null,
      category: resource.category,
      type: resource.type,
      default_actions: resource.default_actions,
      updated_at: new Date().toISOString()
    };

    const { error } = await supabase
      .from('sys_resources')
      .upsert(dbPayload, { onConflict: 'code' });

    if (error) {
      console.error(`❌ Failed to sync ${resource.code}:`, error.message);
      errorCount++;
    } else {
      console.log(`✅ Synced: ${resource.name} (${resource.code})`);
      successCount++;
    }
  }

  console.log('\n=============================================');
  console.log(`🎉 Seeding Completed!`);
  console.log(`✅ Successful: ${successCount}`);
  console.log(`❌ Failed:     ${errorCount}`);
  console.log('=============================================\n');
}

seedResources().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
