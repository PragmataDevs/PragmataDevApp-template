/**
 * Configura el SMTP de Supabase Auth (Resend) en un proyecto CLOUD, dado su ref.
 *
 * Por qué existe: el SMTP compartido default de Supabase está limitado a 2 correos/hora
 * POR PROYECTO y cae en spam. En prod eso significa que invites y resets de password
 * simplemente no llegan — y se descubre cuando el cliente ya está usando la app.
 *
 * Idempotente: lee la config actual y solo hace PATCH si algo difiere. Re-correrlo es barato.
 *
 * Uso:
 *   tsx scripts/cloud/configure-smtp.ts --ref <projectRef> --sender "Nombre Del Cliente"
 *   tsx scripts/cloud/configure-smtp.ts --ref <ref> --sender "X" --dry-run
 *   tsx scripts/cloud/configure-smtp.ts --ref <ref> --sender "X" --force          # re-aplica (key rotada)
 *   tsx scripts/cloud/configure-smtp.ts --ref <ref> --sender "X" --verify-email me@dominio.com
 *
 * La RESEND_API_KEY se lee de ops/secrets/env (fuera de git). NUNCA se imprime.
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { homedir } from 'node:os';

/** Cloudflare responde 403 "error code: 1010" a requests sin User-Agent de navegador. */
const BROWSER_UA =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

const RESEND_HOST = 'smtp.resend.com';
const RESEND_PORT = '465';
const RESEND_USER = 'resend';
/** Subdominio verificado en Resend. Aísla del MX/SPF de Google Workspace del dominio raíz. */
const DEFAULT_ADMIN_EMAIL = 'no-reply@mail.pragmatadevs.com';
const DEFAULT_RATE_LIMIT = 30;
const DEFAULT_MAX_FREQUENCY = 1;

export type ConfigureSmtpInput = {
  projectRef: string;
  accessToken: string;
  /** Nombre visible del remitente: el del CLIENTE, no "PragmataDevs". */
  senderName: string;
  resendApiKey: string;
  adminEmail?: string;
  rateLimit?: number;
  maxFrequency?: number;
  force?: boolean;
  dryRun?: boolean;
};

export type ConfigureSmtpResult = {
  changed: boolean;
  reason: string;
  before?: Record<string, unknown>;
};

// ─────────────────────────── secretos ───────────────────────────

/**
 * Encuentra ops/secrets/env sin depender de dónde esté clonado el repo:
 * 1) $PRAGMATA_SECRETS_ENV  2) subiendo desde cwd  3) ~/PragmataDevs/ops/secrets/env
 */
export function findSecretsEnv(startDir = process.cwd()): string | null {
  const explicit = process.env.PRAGMATA_SECRETS_ENV?.trim();
  if (explicit) return existsSync(explicit) ? explicit : null;

  let dir = resolve(startDir);
  for (let i = 0; i < 8; i++) {
    const candidate = join(dir, 'ops', 'secrets', 'env');
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  const fallback = join(homedir(), 'PragmataDevs', 'ops', 'secrets', 'env');
  return existsSync(fallback) ? fallback : null;
}

/** Lee una clave de un archivo estilo `KEY=value`. Nunca loguea el valor. */
export function readSecret(key: string, envFile: string): string | null {
  const content = readFileSync(envFile, 'utf8');
  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const name = line.slice(0, eq).trim().replace(/^export\s+/, '');
    if (name !== key) continue;
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    return value || null;
  }
  return null;
}

/** Token de la Management API: env var o ~/.supabase/access-token. */
export function resolveAccessToken(): string | null {
  const fromEnv = process.env.SUPABASE_ACCESS_TOKEN?.trim();
  if (fromEnv) return fromEnv;
  const tokenFile = join(homedir(), '.supabase', 'access-token');
  if (existsSync(tokenFile)) {
    const t = readFileSync(tokenFile, 'utf8').trim();
    if (t) return t;
  }
  return null;
}

// ─────────────────────────── Management API ───────────────────────────

function authHeaders(accessToken: string): Record<string, string> {
  return {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
    'User-Agent': BROWSER_UA,
  };
}

async function getAuthConfig(projectRef: string, accessToken: string): Promise<Record<string, unknown>> {
  const res = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/config/auth`, {
    headers: authHeaders(accessToken),
  });
  if (!res.ok) {
    throw new Error(`No pude leer la config de auth de ${projectRef} (${res.status}): ${await res.text()}`);
  }
  return (await res.json()) as Record<string, unknown>;
}

/**
 * Aplica la config SMTP. Idempotente: compara contra lo que ya está y omite el PATCH si cuadra.
 *
 * Ojo: `smtp_pass` NUNCA lo devuelve la API (Supabase guarda solo un hash), así que no se puede
 * comparar. Si rotaste la RESEND_API_KEY, corre con `force: true` para re-aplicarla.
 */
export async function configureSmtp(input: ConfigureSmtpInput): Promise<ConfigureSmtpResult> {
  const adminEmail = input.adminEmail ?? DEFAULT_ADMIN_EMAIL;
  const rateLimit = input.rateLimit ?? DEFAULT_RATE_LIMIT;
  const maxFrequency = input.maxFrequency ?? DEFAULT_MAX_FREQUENCY;

  const current = await getAuthConfig(input.projectRef, input.accessToken);

  const desired: Record<string, string | number | boolean> = {
    smtp_host: RESEND_HOST,
    smtp_port: RESEND_PORT,
    smtp_user: RESEND_USER,
    smtp_pass: input.resendApiKey,
    smtp_sender_name: input.senderName,
    smtp_admin_email: adminEmail,
    smtp_max_frequency: maxFrequency,
    rate_limit_email_sent: rateLimit,
  };

  // smtp_pass queda fuera del diff: la API no lo devuelve.
  const comparable = Object.keys(desired).filter((k) => k !== 'smtp_pass');
  const drift = comparable.filter((k) => String(current[k] ?? '') !== String(desired[k]));

  if (drift.length === 0 && !input.force) {
    return {
      changed: false,
      reason: 'ya configurado (usa --force si rotaste la RESEND_API_KEY)',
      before: current,
    };
  }

  if (input.dryRun) {
    return {
      changed: false,
      reason: `dry-run — cambiaría: ${drift.length ? drift.join(', ') : 'solo smtp_pass (--force)'}`,
      before: current,
    };
  }

  const res = await fetch(`https://api.supabase.com/v1/projects/${input.projectRef}/config/auth`, {
    method: 'PATCH',
    headers: authHeaders(input.accessToken),
    body: JSON.stringify(desired),
  });

  if (!res.ok) {
    const text = await res.text();
    const hint = text.includes('1010')
      ? ' (Cloudflare 1010: falta User-Agent de navegador)'
      : '';
    throw new Error(`PATCH de SMTP falló en ${input.projectRef} (${res.status})${hint}: ${text}`);
  }

  return {
    changed: true,
    reason: drift.length ? `aplicado — cambió: ${drift.join(', ')}` : 'aplicado (forzado)',
    before: current,
  };
}

// ─────────────────────────── verificación end-to-end ───────────────────────────

/**
 * Dispara un reset real y confirma en Resend que el correo salió.
 * Un PATCH 200 NO prueba que el correo llegue — esto sí.
 */
export async function verifyDelivery(opts: {
  projectRef: string;
  accessToken: string;
  resendApiKey: string;
  email: string;
}): Promise<{ ok: boolean; detail: string }> {
  // La anon key vive en la nube, no en el repo.
  const keysRes = await fetch(
    `https://api.supabase.com/v1/projects/${opts.projectRef}/api-keys?reveal=true`,
    { headers: authHeaders(opts.accessToken) },
  );
  if (!keysRes.ok) return { ok: false, detail: `no pude leer api-keys (${keysRes.status})` };

  const keys = (await keysRes.json()) as Array<{ name?: string; api_key?: string }>;
  const anon = keys.find((k) => k.name === 'anon')?.api_key;
  if (!anon) return { ok: false, detail: 'no encontré la anon key del proyecto' };

  const recoverRes = await fetch(`https://${opts.projectRef}.supabase.co/auth/v1/recover`, {
    method: 'POST',
    headers: { apikey: anon, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: opts.email }),
  });
  if (!recoverRes.ok) {
    return { ok: false, detail: `POST /auth/v1/recover devolvió ${recoverRes.status}: ${await recoverRes.text()}` };
  }

  // Resend tarda un par de segundos en registrar el envío.
  for (let attempt = 0; attempt < 6; attempt++) {
    await new Promise((r) => setTimeout(r, 3000));
    const listRes = await fetch('https://api.resend.com/emails?limit=10', {
      headers: { Authorization: `Bearer ${opts.resendApiKey}` },
    });
    if (!listRes.ok) continue;
    const payload = (await listRes.json()) as {
      data?: Array<{ to?: string[]; last_event?: string; status?: string }>;
    };
    const match = payload.data?.find((e) => (e.to ?? []).includes(opts.email));
    if (match) {
      const status = match.last_event ?? match.status ?? 'desconocido';
      return {
        ok: status === 'delivered' || status === 'sent',
        detail: `Resend id=${match.id} last_event=${status}`,
      };
    }
  }

  return { ok: false, detail: 'el envío no apareció en Resend tras ~18s — revisar manualmente' };
}

// ─────────────────────────── CLI ───────────────────────────

function parseArgs(argv: string[]): Record<string, string | boolean> {
  const out: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith('--')) {
      out[key] = next;
      i++;
    } else {
      out[key] = true;
    }
  }
  return out;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const projectRef = typeof args.ref === 'string' ? args.ref : '';
  const senderName = typeof args.sender === 'string' ? args.sender : '';

  if (!projectRef || !senderName) {
    console.error(
      'Uso: tsx scripts/cloud/configure-smtp.ts --ref <projectRef> --sender "Nombre Cliente"\n' +
        '     [--dry-run] [--force] [--verify-email <addr>] [--admin-email <addr>]\n' +
        '     [--rate-limit <n>] [--max-frequency <n>]',
    );
    process.exit(1);
  }

  const accessToken = resolveAccessToken();
  if (!accessToken) {
    console.error('✖ Sin token de Management API. Exporta SUPABASE_ACCESS_TOKEN o crea ~/.supabase/access-token');
    process.exit(1);
  }

  const secretsFile = findSecretsEnv();
  if (!secretsFile) {
    console.error('✖ No encontré ops/secrets/env. Exporta PRAGMATA_SECRETS_ENV con la ruta.');
    process.exit(1);
  }

  const resendApiKey = process.env.RESEND_API_KEY?.trim() || readSecret('RESEND_API_KEY', secretsFile);
  if (!resendApiKey) {
    console.error(`✖ Falta RESEND_API_KEY en ${secretsFile}. Pídesela a Wicho — no la inventes.`);
    process.exit(1);
  }

  console.log(`🔧 SMTP Resend → ${projectRef}  (sender: "${senderName}")`);
  console.log(`   secretos: ${secretsFile}  ·  key: re_***${resendApiKey.slice(-4)}`);

  const result = await configureSmtp({
    projectRef,
    accessToken,
    senderName,
    resendApiKey,
    adminEmail: typeof args['admin-email'] === 'string' ? args['admin-email'] : undefined,
    rateLimit: typeof args['rate-limit'] === 'string' ? Number(args['rate-limit']) : undefined,
    maxFrequency: typeof args['max-frequency'] === 'string' ? Number(args['max-frequency']) : undefined,
    force: args.force === true,
    dryRun: args['dry-run'] === true,
  });

  console.log(`   ${result.changed ? '✅' : 'ℹ️ '} ${result.reason}`);

  const verifyEmail = args['verify-email'];
  if (typeof verifyEmail === 'string') {
    console.log(`\n📧 Verificación end-to-end → ${verifyEmail}`);
    const check = await verifyDelivery({ projectRef, accessToken, resendApiKey, email: verifyEmail });
    console.log(`   ${check.ok ? '✅' : '⚠️ '} ${check.detail}`);
    if (!check.ok) process.exitCode = 2;
  }
}

// Solo corre como CLI si se invoca directo (permite importarlo desde el bootstrap).
if (process.argv[1] && process.argv[1].includes('configure-smtp')) {
  main().catch((err) => {
    console.error(`✖ ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  });
}
