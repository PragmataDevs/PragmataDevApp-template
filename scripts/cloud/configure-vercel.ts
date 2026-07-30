import { execSync } from 'node:child_process';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '../..');

export type VercelEnvInput = {
  erpCwd?: string;
  astroCwd?: string;
  supabaseUrl: string;
  supabaseAnonKey: string;
  publicSiteUrl: string;
  publicAppUrl: string;
  entityLabel?: string;
  dryRun?: boolean;
};

function hasVercelCli(): boolean {
  try {
    execSync('vercel --version', { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

function runVercel(cmd: string, dryRun?: boolean): { ok: true } | { ok: false; output: string } {
  console.log(`▶ ${cmd.replace(/--value "[^"]*"/, '--value "…"')}`);
  if (dryRun) return { ok: true };
  try {
    execSync(cmd, {
      cwd: ROOT,
      encoding: 'utf8',
      shell: '/bin/bash',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return { ok: true };
  } catch (err: unknown) {
    const e = err as { stderr?: string; stdout?: string; message?: string };
    const output = [e.stderr, e.stdout, e.message].filter(Boolean).join('\n');
    return { ok: false, output };
  }
}

function setVercelEnv(
  cwd: string,
  key: string,
  value: string,
  environment: 'production' | 'preview' | 'development',
  dryRun?: boolean,
): void {
  const addCmd = `vercel env add ${key} ${environment} --value ${JSON.stringify(value)} --cwd ${JSON.stringify(cwd)} --yes`;
  const added = runVercel(addCmd, dryRun);
  if (added.ok) return;

  if (!/already exists/i.test(added.output)) {
    console.error(added.output);
    throw new Error(`vercel env add ${key} ${environment} failed`);
  }

  const updateCmd = `vercel env update ${key} ${environment} --value ${JSON.stringify(value)} --cwd ${JSON.stringify(cwd)} --yes`;
  const updated = runVercel(updateCmd, dryRun);
  if (!updated.ok) {
    console.error(updated.output);
    throw new Error(`vercel env update ${key} ${environment} failed`);
  }
}

export function configureVercelEnv(input: VercelEnvInput): void {
  if (!input.erpCwd && !input.astroCwd) {
    console.log('⚠️  Sin VERCEL_ERP_CWD / VERCEL_ASTRO_CWD — omitiendo Vercel.');
    return;
  }

  if (!hasVercelCli()) {
    console.log('⚠️  Vercel CLI no instalada (`npm i -g vercel`). Variables listadas en docs/supabase-cloud-bootstrap.md.');
    return;
  }

  const erpVars: Record<string, string> = {
    VITE_SUPABASE_URL: input.supabaseUrl,
    VITE_SUPABASE_ANON_KEY: input.supabaseAnonKey,
    VITE_PUBLIC_SITE_URL: input.publicSiteUrl,
  };
  if (input.entityLabel) erpVars.VITE_ENTITY_LABEL = input.entityLabel;

  const astroVars: Record<string, string> = {
    VITE_SUPABASE_URL: input.supabaseUrl,
    VITE_SUPABASE_ANON_KEY: input.supabaseAnonKey,
    PUBLIC_SITE_URL: input.publicSiteUrl,
    PUBLIC_APP_URL: input.publicAppUrl,
  };

  if (input.erpCwd) {
    for (const [key, value] of Object.entries(erpVars)) {
      setVercelEnv(input.erpCwd, key, value, 'production', input.dryRun);
    }
  }

  if (input.astroCwd) {
    for (const [key, value] of Object.entries(astroVars)) {
      setVercelEnv(input.astroCwd, key, value, 'production', input.dryRun);
    }
  }
}
