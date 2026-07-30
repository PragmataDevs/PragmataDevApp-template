#!/usr/bin/env tsx
/**
 * scripts/supabase-cloud-bootstrap.ts
 *
 * Orquesta el paso de local → Supabase nube (schema, post-SQL, secrets, functions, RBAC).
 *
 * USO:
 *   cp .env.cloud.example .env.cloud   # rellenar credenciales del Dashboard
 *   supabase login
 *   pnpm cloud:bootstrap -- --project-ref <ref>
 *
 * Opciones:
 *   --project-ref <ref>   Enlaza el proyecto si aún no está linkeado
 *   --env-file <path>     Default: .env.cloud
 *   --dry-run             Solo imprime comandos
 *   --yes                 Sin confirmaciones interactivas
 *   --skip-link           No ejecutar supabase link
 *   --skip-push           No ejecutar supabase db push
 *   --skip-post-sql       No aplicar SQL post-bootstrap (docs/database/06_cloud_post_bootstrap.sql.tpl)
 *   --skip-secrets        No supabase secrets set
 *   --skip-functions      No deploy de Edge Functions
 *   --skip-sync           No pnpm db:sync
 *   --skip-ai-sync        No pnpm ai:sync-prompts
 *   --with-ai              Incluir ai-gateway + ai-task-summary (VITE_ENABLE_AI)
 *   --with-ecommerce       Incluir stripe-checkout + stripe-webhook (VITE_ENABLE_ECOMMERCE)
 *
 *   ⚠️  --sync-data-from-local   DESTRUCTIVO: hace TRUNCATE de tablas en la nube
 *       e importa los datos del Supabase LOCAL. Apagado por default. Úsalo
 *       SOLO en proyectos que todavía NO tienen datos reales de producción.
 *       Ver docs/supabase-cloud-bootstrap.md antes de usarlo.
 *
 * Documentación: docs/supabase-cloud-bootstrap.md
 */

import { execSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, unlinkSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import dotenv from 'dotenv';
import {
  EDGE_SECRETS_INTEGRATIONS,
  resolveEdgeFunctions,
} from './supabase-cloud-manifest';
import { configureAuthUrls } from './cloud/configure-auth';
import { configureVercelEnv } from './cloud/configure-vercel';
import { ensureStorageBuckets } from './cloud/ensure-storage';
import { resolveEnvWithPrompts } from './cloud/prompt-env';
import { seedGodUser } from './cloud/seed-god-user';
import { syncDataFromLocal } from './cloud/sync-data-local';

const ROOT = resolve(import.meta.dirname, '..');
const POST_SQL_TEMPLATE = resolve(ROOT, 'docs/database/06_cloud_post_bootstrap.sql.tpl');

type CliOptions = {
  projectRef: string;
  envFile: string;
  dryRun: boolean;
  yes: boolean;
  skipLink: boolean;
  skipPush: boolean;
  skipPostSql: boolean;
  skipSecrets: boolean;
  skipFunctions: boolean;
  skipSync: boolean;
  skipAiSync: boolean;
  skipGodUser: boolean;
  skipAuthConfig: boolean;
  skipStorage: boolean;
  skipDataSync: boolean;
  skipVercel: boolean;
  syncDataFromLocal: boolean;
  withAi: boolean;
  withEcommerce: boolean;
  withVercel: boolean;
};

function parseArgs(argv: string[]): CliOptions {
  const opts: CliOptions = {
    projectRef: '',
    envFile: '.env.cloud',
    dryRun: false,
    yes: false,
    skipLink: false,
    skipPush: false,
    skipPostSql: false,
    skipSecrets: false,
    skipFunctions: false,
    skipSync: false,
    skipAiSync: false,
    skipGodUser: false,
    skipAuthConfig: false,
    skipStorage: false,
    skipDataSync: true,
    skipVercel: false,
    syncDataFromLocal: false,
    withAi: false,
    withEcommerce: false,
    withVercel: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    switch (arg) {
      case '--project-ref':
        opts.projectRef = argv[++i] || '';
        break;
      case '--env-file':
        opts.envFile = argv[++i] || '.env.cloud';
        break;
      case '--dry-run':
        opts.dryRun = true;
        break;
      case '--yes':
        opts.yes = true;
        break;
      case '--skip-link':
        opts.skipLink = true;
        break;
      case '--skip-push':
        opts.skipPush = true;
        break;
      case '--skip-post-sql':
        opts.skipPostSql = true;
        break;
      case '--skip-secrets':
        opts.skipSecrets = true;
        break;
      case '--skip-functions':
        opts.skipFunctions = true;
        break;
      case '--skip-sync':
        opts.skipSync = true;
        break;
      case '--skip-ai-sync':
        opts.skipAiSync = true;
        break;
      case '--with-ai':
        opts.withAi = true;
        break;
      case '--with-ecommerce':
        opts.withEcommerce = true;
        break;
      case '--with-vercel':
        opts.withVercel = true;
        break;
      case '--sync-data-from-local':
        opts.syncDataFromLocal = true;
        opts.skipDataSync = false;
        break;
      case '--skip-god-user':
        opts.skipGodUser = true;
        break;
      case '--skip-auth-config':
        opts.skipAuthConfig = true;
        break;
      case '--skip-storage':
        opts.skipStorage = true;
        break;
      case '--skip-data-sync':
        opts.skipDataSync = true;
        break;
      case '--skip-vercel':
        opts.skipVercel = true;
        break;
      case '--help':
      case '-h':
        printHelp();
        process.exit(0);
        break;
      default:
        if (arg.startsWith('-')) {
          console.error(`Opción desconocida: ${arg}`);
          printHelp();
          process.exit(1);
        }
    }
  }

  return opts;
}

function printHelp(): void {
  console.log(`Uso: pnpm cloud:bootstrap -- [opciones]

Orquesta local → nube: schema, secrets, functions, god user, Auth URLs,
storage, datos opcionales y Vercel.

Pide en terminal (como db:sync) lo que falte en .env.cloud:
  SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ACCESS_TOKEN, GOD_USER_* …

Opciones principales:
  --project-ref <ref>     Project ref (Settings → General en Dashboard)
  --env-file <path>       Default: .env.cloud
  --dry-run | --yes

Manifiesto (scripts/supabase-cloud-manifest.ts):
  --with-ai               Incluir ai-gateway + ai-task-summary (VITE_ENABLE_AI)
  --with-ecommerce        Incluir stripe-checkout + stripe-webhook (VITE_ENABLE_ECOMMERCE)

Automatización extra:
  --with-vercel           Sube env Production a proyectos Vercel (requiere CLI + link)

  ⚠️  --sync-data-from-local  DESTRUCTIVO. Hace TRUNCATE de tablas en la nube
      e IMPORTA los datos del Supabase LOCAL (excluye RBAC/god/catálogos).
      Apagado por default (--skip-data-sync). Úsalo SOLO en proyectos que
      todavía NO tienen datos reales de producción — nunca en un cliente vivo.

Saltar pasos:
  --skip-link | --skip-push | --skip-post-sql | --skip-secrets
  --skip-functions | --skip-sync | --skip-god-user | --skip-auth-config
  --skip-storage | --skip-data-sync | --skip-vercel

Ver docs/supabase-cloud-bootstrap.md`);
}

function run(cmd: string, opts: CliOptions): void {
  console.log(`\n▶ ${cmd}`);
  if (opts.dryRun) return;
  execSync(cmd, { cwd: ROOT, stdio: 'inherit', env: process.env });
}

function sqlLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function readLinkedProjectRef(): string | null {
  const refPath = resolve(ROOT, '.supabase/project-ref');
  if (!existsSync(refPath)) return null;
  return readFileSync(refPath, 'utf8').trim() || null;
}

function ensureSupabaseCli(opts: CliOptions): void {
  try {
    execSync('supabase --version', { stdio: 'pipe' });
  } catch {
    console.error('❌ Supabase CLI no encontrada. Instala: https://supabase.com/docs/guides/cli');
    process.exit(1);
  }
  if (opts.dryRun) return;
  try {
    execSync('supabase projects list -o json', { cwd: ROOT, stdio: 'pipe' });
  } catch {
    console.error('❌ Ejecuta primero: supabase login');
    process.exit(1);
  }
}

function loadEnvFile(envFile: string): Record<string, string> {
  const path = resolve(ROOT, envFile);
  if (!existsSync(path)) {
    console.log(`ℹ️  No existe ${envFile}; se pedirán credenciales en terminal (como db:sync).`);
    return {};
  }
  return dotenv.parse(readFileSync(path, 'utf8'));
}

function resolveProjectRef(opts: CliOptions): string {
  const fromCli = opts.projectRef.trim();
  if (fromCli) return fromCli;
  const linked = readLinkedProjectRef();
  if (linked) return linked;
  console.error('❌ Falta --project-ref o ejecuta supabase link primero.');
  process.exit(1);
}

/**
 * El template base NO requiere SQL post-bootstrap (docs/database/06_cloud_post_bootstrap.sql.tpl
 * viene vacío). Si tu cliente lo extiende con placeholders __PROJECT_REF__ / __ANON_KEY__,
 * aquí se resuelven; __ANON_KEY__ solo se exige si el .tpl realmente lo usa.
 */
function buildPostBootstrapSql(projectRef: string, env: Record<string, string>): string {
  let sql = readFileSync(POST_SQL_TEMPLATE, 'utf8');

  if (sql.includes('__ANON_KEY__')) {
    const anonKey = env.VITE_SUPABASE_ANON_KEY?.trim();
    if (!anonKey) {
      console.error(
        '❌ VITE_SUPABASE_ANON_KEY requerida en .env.cloud (docs/database/06_cloud_post_bootstrap.sql.tpl usa __ANON_KEY__).',
      );
      process.exit(1);
    }
    sql = sql.replaceAll('__ANON_KEY__', sqlLiteral(anonKey));
  }

  sql = sql.replaceAll('__PROJECT_REF__', projectRef);
  return sql;
}

function ensureSupabaseDir(): void {
  mkdirSync(resolve(ROOT, '.supabase'), { recursive: true });
}

function applyPostBootstrapSql(projectRef: string, env: Record<string, string>, opts: CliOptions): void {
  if (opts.dryRun) {
    console.log('▶ supabase db query --linked -f <generated post-bootstrap sql>');
    buildPostBootstrapSql(projectRef, env);
    return;
  }

  ensureSupabaseDir();
  const sql = buildPostBootstrapSql(projectRef, env);
  const tmpPath = resolve(ROOT, '.supabase/cloud-post-bootstrap.generated.sql');
  writeFileSync(tmpPath, sql, 'utf8');
  run(`supabase db query --linked -f "${tmpPath}"`, opts);
  if (existsSync(tmpPath)) {
    unlinkSync(tmpPath);
  }
}

function writeSecretsEnvFile(env: Record<string, string>): string {
  const keys = EDGE_SECRETS_INTEGRATIONS;
  const lines: string[] = [];
  for (const key of keys) {
    const value = env[key]?.trim() || process.env[key]?.trim();
    if (value) lines.push(`${key}=${value}`);
  }
  const tmpPath = resolve(ROOT, '.supabase/cloud-secrets.generated.env');
  writeFileSync(tmpPath, `${lines.join('\n')}\n`, 'utf8');
  return tmpPath;
}

function setEdgeSecrets(env: Record<string, string>, opts: CliOptions): void {
  const keys = EDGE_SECRETS_INTEGRATIONS;
  const defined = keys.filter((k) => env[k]?.trim() || process.env[k]?.trim());

  if (opts.dryRun) {
    console.log(`▶ supabase secrets set --env-file .supabase/cloud-secrets.generated.env (${defined.length} keys)`);
    return;
  }

  if (!defined.length) {
    console.log('⚠️  No hay secrets en .env.cloud para subir. Omite --skip-secrets o rellena integraciones.');
    return;
  }

  ensureSupabaseDir();
  const tmpPath = writeSecretsEnvFile(env);
  run(`supabase secrets set --env-file "${tmpPath}"`, opts);
  if (existsSync(tmpPath)) {
    unlinkSync(tmpPath);
  }

  const missingIntegrations = EDGE_SECRETS_INTEGRATIONS.filter((k) => !env[k]?.trim());
  if (missingIntegrations.length) {
    console.log('\n⚠️  Secrets opcionales no definidos (OK si no usas esa integración):');
    for (const key of missingIntegrations) {
      console.log(`   - ${key}`);
    }
  }
}

function deployFunctions(opts: CliOptions): void {
  const names = resolveEdgeFunctions({
    includeAi: opts.withAi,
    includeEcommerce: opts.withEcommerce,
  });

  console.log(`\n📦 Desplegando ${names.length} Edge Functions...`);
  for (const name of names) {
    run(`supabase functions deploy ${name}`, opts);
  }
}

function syncResources(env: Record<string, string>, opts: CliOptions): void {
  process.env.VITE_SUPABASE_URL = env.VITE_SUPABASE_URL.trim();
  process.env.SUPABASE_SERVICE_ROLE_KEY = env.SUPABASE_SERVICE_ROLE_KEY.trim();
  run('pnpm db:sync', opts);
}

async function resolveBootstrapEnv(envFile: string, opts: CliOptions): Promise<Record<string, string>> {
  const env = loadEnvFile(envFile);
  const specs = [
    {
      key: 'VITE_SUPABASE_ANON_KEY',
      label: 'VITE_SUPABASE_ANON_KEY (Dashboard → API → anon)',
      required: true,
      secret: true,
    },
    {
      key: 'SUPABASE_SERVICE_ROLE_KEY',
      label: 'SUPABASE_SERVICE_ROLE_KEY (Dashboard → API → service_role)',
      required: true,
      secret: true,
    },
    {
      key: 'SUPABASE_ACCESS_TOKEN',
      label: 'SUPABASE_ACCESS_TOKEN (https://supabase.com/dashboard/account/tokens)',
      required: !opts.skipAuthConfig,
      secret: true,
    },
  ];

  if (!opts.skipGodUser) {
    specs.push(
      {
        key: 'GOD_USER_EMAIL',
        label: 'Email usuario god',
        required: true,
        secret: false,
      },
      {
        key: 'GOD_USER_PASSWORD',
        label: 'Contraseña usuario god (mín. 8 caracteres)',
        required: true,
        secret: true,
      },
      {
        key: 'GOD_USER_FULL_NAME',
        label: 'Nombre completo usuario god',
        required: false,
        secret: false,
      },
    );
  }

  if (!opts.skipAuthConfig || opts.withVercel) {
    specs.push({
      key: 'CLOUD_ERP_URL',
      label: 'URL ERP producción (ej. https://app.tudominio.com)',
      required: !opts.skipAuthConfig,
      secret: false,
    });
  }

  return resolveEnvWithPrompts(env, specs);
}

function printFinalSummary(projectRef: string, env: Record<string, string>, godUserId?: string): void {
  const appUrl = env.CLOUD_ERP_URL?.trim() || env.PUBLIC_APP_URL?.trim() || 'https://app.tudominio.com';
  console.log(`
══════════════════════════════════════════════════════════════
✅ Cloud bootstrap completado.

Supabase: https://${projectRef}.supabase.co
ERP login: ${appUrl}/login
${godUserId ? `God user id: ${godUserId}` : ''}

Si omitiste pasos:
  --skip-auth-config  → Dashboard → Authentication → URL configuration
  --skip-god-user     → crear usuario + docs/database/02_seed_god_user.sql
  --skip-vercel       → Vercel env manual (ver docs/deployment-environments.md)
  sin --sync-data-from-local → re-import CSV o volver a correr con ese flag

Smoke test: login god → RLS en vivo (member ve solo lo suyo) → flujo crítico

docs/supabase-cloud-bootstrap.md
══════════════════════════════════════════════════════════════`);
}

async function main(): Promise<void> {
  const rawArgs = process.argv.slice(2).filter((arg) => arg !== '--');
  const opts = parseArgs(rawArgs);
  ensureSupabaseCli(opts);

  const env = await resolveBootstrapEnv(opts.envFile, opts);
  const projectRef = resolveProjectRef(opts);

  if (!env.VITE_SUPABASE_URL?.trim()) {
    env.VITE_SUPABASE_URL = `https://${projectRef}.supabase.co`;
  }

  console.log('\n🚀 Supabase Cloud Bootstrap');
  console.log(`   Project ref: ${projectRef}`);
  console.log(`   Env file:    ${opts.envFile}`);
  if (opts.dryRun) console.log('   Modo:        DRY RUN');

  if (opts.syncDataFromLocal) {
    console.log('\n⚠️  ⚠️  ⚠️  --sync-data-from-local ACTIVO ⚠️  ⚠️  ⚠️');
    console.log('   Esto hará TRUNCATE de tablas en la nube e importará datos del LOCAL.');
    console.log('   Úsalo SOLO si el proyecto en la nube todavía NO tiene datos reales.');
  }

  if (!opts.yes && !opts.dryRun) {
    console.log('\nContinuar aplicará cambios al proyecto linkeado en la nube.');
    console.log('Usa --yes para omitir esta advertencia.');
  }

  if (!opts.skipLink && opts.projectRef) {
    run(`supabase link --project-ref ${projectRef}`, opts);
  }

  if (!opts.skipPush) {
    console.log('\n📂 Aplicando migraciones (supabase db push)...');
    run('supabase db push', opts);
  }

  if (!opts.skipPostSql) {
    console.log('\n🔧 Post-bootstrap SQL (docs/database/06_cloud_post_bootstrap.sql.tpl)...');
    applyPostBootstrapSql(projectRef, env, opts);
  }

  if (!opts.skipSecrets) {
    console.log('\n🔐 Edge Function secrets...');
    setEdgeSecrets(env, opts);
  }

  if (!opts.skipAiSync && opts.withAi) {
    run('pnpm ai:sync-prompts', opts);
  }

  if (!opts.skipFunctions) {
    deployFunctions(opts);
  }

  if (!opts.skipSync) {
    console.log('\n🔄 Sincronizando catálogo RBAC (sys_resources)...');
    syncResources(env, opts);
  }

  let godUserId: string | undefined;

  if (!opts.skipGodUser) {
    const email = env.GOD_USER_EMAIL!.trim();
    const password = env.GOD_USER_PASSWORD!.trim();
    const fullName = env.GOD_USER_FULL_NAME?.trim() || 'System Admin';

    console.log('\n👤 Usuario god (Auth + profiles)...');
    if (opts.dryRun) {
      console.log(`▶ seedGodUser(${email})`);
    } else {
      const result = await seedGodUser({
        supabaseUrl: env.VITE_SUPABASE_URL.trim(),
        serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY.trim(),
        email,
        password: password || 'dry-run-placeholder',
        fullName,
      });
      godUserId = result.userId;
      if (result.skipped) {
        console.log(`   Ya existía god user: ${result.email} (${result.userId})`);
      } else {
        console.log(`   Creado: ${result.email} (${result.userId})`);
      }
    }
  }

  if (!opts.skipAuthConfig) {
    const token = env.SUPABASE_ACCESS_TOKEN?.trim();
    const erpUrl = env.CLOUD_ERP_URL?.trim() || env.PUBLIC_APP_URL?.trim();

    if (!token) {
      console.log('\n⚠️  Sin SUPABASE_ACCESS_TOKEN — omitiendo Auth URL config (usa --skip-auth-config).');
    } else if (!erpUrl) {
      console.log('\n⚠️  Sin CLOUD_ERP_URL / PUBLIC_APP_URL — omitiendo Auth URL config.');
    } else {
      console.log('\n🔐 Auth URL configuration (Management API)...');
      if (opts.dryRun) {
        console.log(`▶ configureAuthUrls(site=${erpUrl})`);
      } else {
        await configureAuthUrls({
          projectRef,
          accessToken: token,
          siteUrl: erpUrl,
          publicSiteUrl: env.PUBLIC_SITE_URL?.trim() || env.VITE_PUBLIC_SITE_URL?.trim(),
        });
        console.log('   Site URL y redirect URLs aplicados.');
      }
    }
  }

  if (!opts.skipStorage) {
    console.log('\n📦 Storage buckets...');
    if (opts.dryRun) {
      console.log('▶ ensureStorageBuckets(documents)');
    } else {
      const created = await ensureStorageBuckets(
        env.VITE_SUPABASE_URL.trim(),
        env.SUPABASE_SERVICE_ROLE_KEY.trim(),
      );
      console.log(created.length ? `   Creados: ${created.join(', ')}` : '   Buckets ya existían.');
    }
  }

  if (opts.syncDataFromLocal && !opts.skipDataSync) {
    console.log('\n📤 Copiando datos public desde Supabase local (DESTRUCTIVO en nube)...');
    await syncDataFromLocal({ dryRun: opts.dryRun, envFile: opts.envFile });
  }

  if (opts.withVercel && !opts.skipVercel) {
    console.log('\n▲ Vercel env (production)...');
    configureVercelEnv({
      erpCwd: env.VERCEL_ERP_CWD?.trim() || '.',
      astroCwd: env.VERCEL_ASTRO_CWD?.trim() || 'astro',
      supabaseUrl: env.VITE_SUPABASE_URL.trim(),
      supabaseAnonKey: env.VITE_SUPABASE_ANON_KEY.trim(),
      publicSiteUrl: env.PUBLIC_SITE_URL?.trim() || env.VITE_PUBLIC_SITE_URL?.trim() || '',
      publicAppUrl: env.PUBLIC_APP_URL?.trim() || env.CLOUD_ERP_URL?.trim() || '',
      entityLabel: env.VITE_ENTITY_LABEL?.trim(),
      dryRun: opts.dryRun,
    });
  }

  printFinalSummary(projectRef, env, godUserId);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
