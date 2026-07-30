/**
 * ⚠️  DESTRUCTIVO — solo para proyectos SIN datos reales de producción en la nube.
 *
 * Copia los datos de Supabase LOCAL hacia la nube: hace `TRUNCATE` de los
 * catálogos sembrados por migraciones (DATA_SYNC_CLEAR_CATALOG_TABLES) y luego
 * IMPORTA el dump de `public` (excluyendo DATA_SYNC_EXCLUDE_TABLES). Nunca lo
 * corras contra un proyecto en uso por un cliente real — ver
 * docs/supabase-cloud-bootstrap.md.
 */

import { execSync } from 'node:child_process';
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import {
  DATA_SYNC_CLEAR_CATALOG_TABLES,
  DATA_SYNC_EXCLUDE_TABLES,
} from '../supabase-cloud-manifest';

const ROOT = resolve(import.meta.dirname, '../..');
const SUPABASE_DIR = resolve(ROOT, '.supabase');

export type SyncDataFromLocalOptions = {
  dryRun?: boolean;
  excludeTables?: readonly string[];
  cloudTeamSlug?: string;
  envFile?: string;
};

type QueryRow = Record<string, string>;

function loadCloudEnv(envFile = '.env.cloud'): { url: string; serviceRoleKey: string } {
  const path = resolve(ROOT, envFile);
  if (!existsSync(path)) {
    throw new Error(`Falta ${envFile} con VITE_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY.`);
  }
  const env = dotenv.parse(readFileSync(path, 'utf8'));
  const url = env.VITE_SUPABASE_URL?.trim();
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceRoleKey) {
    throw new Error(`${envFile} debe incluir VITE_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY.`);
  }
  return { url, serviceRoleKey };
}

function isLocalSupabaseRunning(): boolean {
  try {
    execSync('supabase status -o json', { cwd: ROOT, stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

function parseCliJson(stdout: string): QueryRow[] {
  const start = stdout.indexOf('{');
  const end = stdout.lastIndexOf('}');
  if (start === -1 || end === -1) return [];
  const parsed = JSON.parse(stdout.slice(start, end + 1)) as { rows?: QueryRow[] };
  return parsed.rows ?? [];
}

function queryLocalRows(sql: string): QueryRow[] {
  const tmpPath = resolve(SUPABASE_DIR, 'sync-query.tmp.sql');
  writeFileSync(tmpPath, sql, 'utf8');
  try {
    const raw = execSync(`supabase db query --local --output json -f "${tmpPath}"`, {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return parseCliJson(raw);
  } finally {
    if (existsSync(tmpPath)) unlinkSync(tmpPath);
  }
}

function runLinkedSqlFile(path: string, dryRun: boolean): void {
  const cmd = `supabase db query --linked -f "${path}"`;
  console.log(`\n▶ ${cmd}`);
  if (!dryRun) {
    execSync(cmd, { cwd: ROOT, stdio: 'inherit' });
  }
}

function buildClearCatalogSql(tables: readonly string[]): string {
  const list = tables.join(',\n  ');
  return `-- Auto-generated: vacía catálogos sembrados por migraciones antes de import local
BEGIN;
TRUNCATE TABLE
  ${list}
RESTART IDENTITY CASCADE;
COMMIT;
`;
}

/**
 * Descubre dinámicamente qué tablas de `public` tienen columnas AuditBase
 * (`created_by` / `updated_by`, ambas FK a `profiles`) para poder remapear
 * los ids de usuario local → god user de nube. Genérico: no depende de
 * conocer de antemano las tablas de negocio del cliente.
 */
function findAuditUserColumns(): { table: string; column: string }[] {
  const sql = `
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND column_name IN ('created_by', 'updated_by')
    ORDER BY table_name, column_name;
  `;
  return queryLocalRows(sql).map((row) => ({ table: row.table_name, column: row.column_name }));
}

function collectLocalUserIdsForRemap(): string[] {
  const ids = new Set<string>();

  for (const row of queryLocalRows('SELECT id::text AS id FROM public.profiles;')) {
    if (row.id) ids.add(row.id);
  }

  const auditColumns = findAuditUserColumns();
  if (auditColumns.length) {
    const selects = auditColumns.map(
      ({ table, column }) => `SELECT ${column}::text AS id FROM public.${table} WHERE ${column} IS NOT NULL`,
    );
    const refSql = `SELECT DISTINCT id FROM (${selects.join(' UNION ')}) refs;`;
    for (const row of queryLocalRows(refSql)) {
      if (row.id) ids.add(row.id);
    }
  }

  return [...ids];
}

function replaceAllUuid(content: string, from: string, to: string): string {
  if (!from || from === to) return content;
  return content.split(from).join(to);
}

async function resolveCloudTeamAndGodIds(
  envFile: string,
  cloudTeamSlug: string,
): Promise<{ cloudTeamId: string; cloudGodId: string; teamSource: string }> {
  const { url, serviceRoleKey } = loadCloudEnv(envFile);
  const admin = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: godProfile, error: godError } = await admin
    .from('profiles')
    .select('id, team_id')
    .eq('access_level', 'god')
    .limit(1)
    .maybeSingle();

  if (godError) {
    throw new Error(`No se pudo leer profiles en nube: ${godError.message}`);
  }

  if (!godProfile?.id) {
    throw new Error('No hay usuario god en nube. Ejecuta bootstrap sin --skip-god-user primero.');
  }

  const { data: slugTeam } = await admin
    .from('teams')
    .select('id, slug, name')
    .eq('slug', cloudTeamSlug)
    .maybeSingle();

  if (slugTeam?.id) {
    return {
      cloudTeamId: slugTeam.id,
      cloudGodId: godProfile.id,
      teamSource: `slug=${cloudTeamSlug}`,
    };
  }

  if (godProfile.team_id) {
    return {
      cloudTeamId: godProfile.team_id,
      cloudGodId: godProfile.id,
      teamSource: 'team_id del perfil god',
    };
  }

  const { data: ownerTeam } = await admin
    .from('teams')
    .select('id, slug, name')
    .eq('is_platform_owner', true)
    .limit(1)
    .maybeSingle();

  if (ownerTeam?.id) {
    return {
      cloudTeamId: ownerTeam.id,
      cloudGodId: godProfile.id,
      teamSource: `is_platform_owner (${ownerTeam.slug})`,
    };
  }

  const { data: anyTeam } = await admin.from('teams').select('id, slug, name').limit(1).maybeSingle();
  if (anyTeam?.id) {
    return {
      cloudTeamId: anyTeam.id,
      cloudGodId: godProfile.id,
      teamSource: `primer team (${anyTeam.slug})`,
    };
  }

  throw new Error(
    `No hay teams en nube. Ejecuta bootstrap sin --skip-god-user para crear el team "${cloudTeamSlug}".`,
  );
}

async function prepareDumpForCloudImport(
  dumpPath: string,
  envFile: string,
  cloudTeamSlug: string,
): Promise<void> {
  const localTeamIds = queryLocalRows('SELECT id::text AS id FROM public.teams;').map((r) => r.id);
  const localUserIds = collectLocalUserIdsForRemap();

  const { cloudTeamId, cloudGodId, teamSource } = await resolveCloudTeamAndGodIds(envFile, cloudTeamSlug);

  let sql = readFileSync(dumpPath, 'utf8');

  for (const localTeamId of localTeamIds) {
    if (localTeamId !== cloudTeamId) {
      sql = replaceAllUuid(sql, localTeamId, cloudTeamId);
    }
  }

  for (const localUserId of localUserIds) {
    if (localUserId !== cloudGodId) {
      sql = replaceAllUuid(sql, localUserId, cloudGodId);
    }
  }

  writeFileSync(dumpPath, sql, 'utf8');

  console.log(`\n🔧 Dump ajustado para nube:`);
  console.log(`   team → ${cloudTeamId} (${teamSource})`);
  console.log(`   ${localUserIds.length} user/profile id(s) local → god user: ${cloudGodId}`);
}

export async function syncDataFromLocal(options: SyncDataFromLocalOptions = {}): Promise<void> {
  console.log('\n⚠️  --sync-data-from-local: DESTRUCTIVO en la nube (TRUNCATE + import). No usar en proyectos con datos reales.');

  if (!isLocalSupabaseRunning()) {
    throw new Error(
      'Supabase local no está corriendo. Ejecuta `supabase start` o omite con --skip-data-sync.',
    );
  }

  const envFile = options.envFile ?? '.env.cloud';
  const excludes = options.excludeTables ?? DATA_SYNC_EXCLUDE_TABLES;
  const excludeFlags = excludes.map((t) => `-x ${t}`).join(' ');
  const dumpPath = resolve(SUPABASE_DIR, 'cloud-data-sync.generated.sql');
  const clearPath = resolve(SUPABASE_DIR, 'cloud-data-sync-clear.generated.sql');
  const cloudTeamSlug = options.cloudTeamSlug ?? 'pragmata-devs';

  const dumpCmd = `supabase db dump --local --data-only --schema public ${excludeFlags} -f "${dumpPath}"`;
  console.log(`\n▶ ${dumpCmd}`);

  if (options.dryRun) {
    console.log('\n(dry-run) También se vaciarían catálogos en nube y se remapearían team_id / profiles.');
    return;
  }

  execSync(dumpCmd, { cwd: ROOT, stdio: 'inherit' });

  if (!existsSync(dumpPath)) {
    throw new Error('No se generó el dump de datos local.');
  }

  if (DATA_SYNC_CLEAR_CATALOG_TABLES.length) {
    writeFileSync(clearPath, buildClearCatalogSql(DATA_SYNC_CLEAR_CATALOG_TABLES), 'utf8');
    console.log('\n🧹 Vacía catálogos sembrados por migraciones en nube (evita duplicate key)...');
    runLinkedSqlFile(clearPath, false);
  } else {
    console.log('\nℹ️  DATA_SYNC_CLEAR_CATALOG_TABLES vacío — no hay catálogos que vaciar antes del import.');
  }

  await prepareDumpForCloudImport(dumpPath, envFile, cloudTeamSlug);

  runLinkedSqlFile(dumpPath, false);

  if (existsSync(dumpPath)) unlinkSync(dumpPath);
  if (existsSync(clearPath)) unlinkSync(clearPath);
}
