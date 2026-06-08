/**
 * validate-resources.ts — Cross-reference resource definitions, routes, and SQL policies.
 *
 * Usage: npx tsx scripts/validate-resources.ts
 * Exit 0 = everything consistent. Exit 1 = inconsistencies found.
 */

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

const resourcesPath = resolve(root, 'src/config/security/resources.ts');
const routesPath = resolve(root, 'src/app/routes.config.ts');
const sqlMigrationPath = resolve(
  root,
  'supabase/migrations/20260111120000_pragmata_schema.sql',
);

const resourcesSrc = readFileSync(resourcesPath, 'utf-8');
const routesSrc = readFileSync(routesPath, 'utf-8');
const sqlSrc = readFileSync(sqlMigrationPath, 'utf-8');

// ── Parse APP_RESOURCES codes ────────────────────────────────────────
const resourceCodes: Set<string> = new Set();
const codeRe = /code:\s*(['"])(?<code>[a-z_]+)\1/g;
let m: RegExpExecArray | null;
while ((m = codeRe.exec(resourcesSrc)) !== null) {
  resourceCodes.add(m.groups!.code);
}

// ── Parse routes.config.ts resourceCode values ───────────────────────
const routeCodes: Map<string, string[]> = new Map(); // code → [route paths]
const routeCodeRe = /resourceCode:\s*(['"])(?<code>[a-z_]+)\1/g;

// Collect all routes that have resourceCode and their paths
const routeBlockRe = /\{\s*\n(?:\s*\/\/[^\n]*\n)*(?:\s*\w+:[^\n]*\n)*/g;
// Simpler approach: just extract the resourceCode values
let rm: RegExpExecArray | null;
while ((rm = routeCodeRe.exec(routesSrc)) !== null) {
  const code = rm.groups!.code;
  if (!routeCodes.has(code)) routeCodes.set(code, []);
}

// ── Parse SQL check_permission() calls ───────────────────────────────
const sqlResourceCodes: Set<string> = new Set();
const sqlCheckRe = /check_permission\s*\(\s*(['"])(?<code>[a-z_]+)\1/g;
let sm: RegExpExecArray | null;
while ((sm = sqlCheckRe.exec(sqlSrc)) !== null) {
  sqlResourceCodes.add(sm.groups!.code);
}

// ── Validate ─────────────────────────────────────────────────────────
let errors = 0;

console.log(`\n📋 Resource codes in APP_RESOURCES: ${resourceCodes.size}`);
console.log(`🛤️  Resource codes in routes.config.ts: ${routeCodes.size}`);
console.log(`🗄️  Resource codes in SQL check_permission(): ${sqlResourceCodes.size}\n`);

// 1. Routes referencing non-existent resource codes
for (const code of routeCodes.keys()) {
  if (!resourceCodes.has(code)) {
    console.error(`❌ Route references '${code}' but it's NOT in APP_RESOURCES`);
    errors++;
  }
}

// 2. SQL check_permission() referencing non-existent resource codes
for (const code of sqlResourceCodes) {
  if (!resourceCodes.has(code)) {
    console.error(`❌ SQL check_permission('${code}', ...) has NO matching APP_RESOURCES entry`);
    errors++;
  }
}

// 3. APP_RESOURCES entries NOT used by any route OR SQL policy (warn, not error)
const sqlOrRoute = new Set([...routeCodes.keys(), ...sqlResourceCodes]);
for (const code of resourceCodes) {
  if (!sqlOrRoute.has(code)) {
    // action_* and feature_* are embedded in shell — no dedicated route expected
    if (code.startsWith('page_')) {
      console.warn(`⚠️  '${code}' is in APP_RESOURCES but NOT referenced by any route or SQL policy`);
    }
  }
}

if (errors === 0) {
  console.log('✅ All resource definitions are consistent.\n');
} else {
  console.error(`\n❌ ${errors} inconsistency(s) found.\n`);
}

process.exit(errors > 0 ? 1 : 0);
