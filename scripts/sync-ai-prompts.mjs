/**
 * Copia ai/prompts/*.json → supabase/functions/_shared/ai-gateway/prompts/
 * para que el deploy de Edge Functions incluya las definiciones.
 *
 * Ejecutar tras editar prompts: pnpm ai:sync-prompts
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const srcDir = path.join(root, 'ai', 'prompts');
const destDir = path.join(root, 'supabase', 'functions', '_shared', 'ai-gateway', 'prompts');

if (!fs.existsSync(srcDir)) {
  console.error('Missing', srcDir);
  process.exit(1);
}

fs.mkdirSync(destDir, { recursive: true });
const files = fs.readdirSync(srcDir).filter((f) => f.endsWith('.json'));
if (!files.length) {
  console.error('No JSON files in', srcDir);
  process.exit(1);
}
for (const f of files) {
  fs.copyFileSync(path.join(srcDir, f), path.join(destDir, f));
}
console.log(`Synced ${files.length} prompt(s) → ${destDir}`);
