/**
 * scripts/cloud/stripe-billing-setup.ts — Stripe BILLING (mensualidad por tenant), capa plataforma.
 *
 * Deja Stripe listo en UN comando el día que exista la cuenta:
 *   1. Para cada plan de `subscription_plans` con precio > 0 y sin `stripe_price_id`:
 *      crea Product + Price recurrente mensual en MXN (precio con IVA incluido → tax_behavior=inclusive)
 *      y guarda el `stripe_price_id` en la tabla (service_role).
 *   2. Registra (o reutiliza) el webhook endpoint hacia la edge function `stripe-billing-webhook`
 *      con los eventos que esa función maneja, e imprime el comando para guardar su signing secret.
 *
 * Idempotente: no duplica productos (busca por metadata.plan_code) ni endpoints (busca por URL).
 * Sin SDK: fetch a la REST de Stripe (regla anti-ruido).
 *
 * Uso (secretos por variables de entorno o ops/secrets/env, nunca por argumento):
 *   STRIPE_SECRET_KEY=sk_test_... pnpm exec tsx scripts/cloud/stripe-billing-setup.ts --producto cuentaaparte
 *   ... --descriptor "CUENTA APARTE"   # texto del extracto bancario del producto (máx 22)
 *   ... --marca "Cuenta Aparte"        # nombre de marca que ve el cliente en Checkout
 *   ... --dry-run          # solo muestra qué haría
 *   ... --env .env.cloud   # de dónde leer SUPABASE_URL / SERVICE_ROLE (default .env.cloud)
 *
 * Lee: STRIPE_SECRET_KEY (env o ops/secrets/env como STRIPE_SECRET_KEY_<PRODUCTO_MAYUS>),
 *      VITE_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY del archivo --env.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { homedir } from 'node:os';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

type Plan = { code: string; producto: string; nombre: string; descripcion: string | null; precio_mxn: number; periodo: 'mes' | 'anio'; stripe_price_id: string | null };

function arg(name: string, def = ''): string {
  const i = process.argv.indexOf(name);
  return i >= 0 ? (process.argv[i + 1] ?? '') : def;
}
const DRY = process.argv.includes('--dry-run');
const PRODUCTO = arg('--producto');
const ENV_FILE = arg('--env', '.env.cloud');
if (!PRODUCTO) { console.error('Falta --producto <slug> (ej. cuentaaparte, gaston)'); process.exit(1); }

const envPath = resolve(process.cwd(), ENV_FILE);
if (existsSync(envPath)) dotenv.config({ path: envPath });

function secretsEnv(): Record<string, string> {
  const p = process.env.PRAGMATA_SECRETS_ENV || resolve(homedir(), 'PragmataDevs/ops/secrets/env');
  if (!existsSync(p)) return {};
  return dotenv.parse(readFileSync(p));
}
const secrets = secretsEnv();
const STRIPE_KEY = process.env.STRIPE_SECRET_KEY || secrets[`STRIPE_SECRET_KEY_${PRODUCTO.toUpperCase()}`] || secrets.STRIPE_SECRET_KEY || '';
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || '';
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
if (!STRIPE_KEY.startsWith('sk_')) { console.error('Falta STRIPE_SECRET_KEY (env o ops/secrets/env). No se imprime nada más.'); process.exit(1); }
if (!SUPABASE_URL || !SERVICE_ROLE) { console.error(`Faltan VITE_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY en ${ENV_FILE}`); process.exit(1); }
const MODE = STRIPE_KEY.startsWith('sk_live') ? 'LIVE' : 'test';
/** Descripción del extracto por producto (--descriptor "CUENTA APARTE"); default: el slug en mayúsculas. */
const DESCRIPTOR = (arg('--descriptor') || PRODUCTO.toUpperCase()).replace(/[<>\\'"*]/g, '').slice(0, 22);
/** Nombre de marca que ve el cliente en Checkout (--marca "Cuenta Aparte"); default: el descriptor en Title Case. */
const MARCA = arg('--marca') || DESCRIPTOR.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

async function stripe<T>(method: 'GET' | 'POST', path: string, form?: Record<string, string>): Promise<T> {
  const res = await fetch(`https://api.stripe.com/v1${path}`, {
    method,
    headers: { Authorization: `Bearer ${STRIPE_KEY}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form ? new URLSearchParams(form).toString() : undefined,
  });
  const json = await res.json() as T & { error?: { message: string } };
  if (!res.ok) throw new Error(`Stripe ${method} ${path}: ${json.error?.message ?? res.status}`);
  return json;
}

async function main() {
  console.log(`\n💳 Stripe Billing setup — producto=${PRODUCTO} · modo ${MODE}${DRY ? ' · DRY RUN' : ''}\n`);
  const sb = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: plans, error } = await sb.from('subscription_plans').select('code,producto,nombre,descripcion,precio_mxn,periodo,stripe_price_id').eq('producto', PRODUCTO).eq('status', 'active');
  if (error) throw error;
  const paid = (plans as Plan[]).filter((p) => Number(p.precio_mxn) > 0);
  if (!paid.length) { console.log('No hay planes de paga para este producto. Nada que hacer.'); return; }

  for (const plan of paid) {
    if (plan.stripe_price_id) { console.log(`  = ${plan.code}: ya tiene ${plan.stripe_price_id}`); continue; }
    const q = `metadata['plan_code']:'${plan.code}' AND metadata['producto']:'${PRODUCTO}' AND active:'true'`;
    const found = await stripe<{ data: Array<{ id: string }> }>('GET', `/products/search?query=${encodeURIComponent(q)}`);
    let productId = found.data[0]?.id;
    if (!productId) {
      console.log(`  + producto Stripe para plan ${plan.code} (${plan.nombre})`);
      if (!DRY) {
        const prod = await stripe<{ id: string }>('POST', '/products', {
          name: `${MARCA} — Plan ${plan.nombre}`,
          description: plan.descripcion ?? '',
          // Lo que el cliente ve en su extracto: la MARCA del producto, no PragmataDevs
          // (evita contracargos por "cargo desconocido"). Máx 22 chars, sin < > \ ' " *.
          statement_descriptor: DESCRIPTOR,
          'metadata[plan_code]': plan.code,
          'metadata[producto]': PRODUCTO,
        });
        productId = prod.id;
      }
    } else console.log(`  = producto Stripe existente ${productId} para ${plan.code}`);

    const amount = Math.round(Number(plan.precio_mxn) * 100);
    console.log(`  + price ${amount / 100} MXN / ${plan.periodo === 'anio' ? 'año' : 'mes'} (IVA incluido, por sucursal)`);
    if (!DRY) {
      const price = await stripe<{ id: string }>('POST', '/prices', {
        product: productId!,
        currency: 'mxn',
        unit_amount: String(amount),
        tax_behavior: 'inclusive',
        'recurring[interval]': plan.periodo === 'anio' ? 'year' : 'month',
        nickname: `${PRODUCTO}-${plan.code}-${plan.periodo}`,
        'metadata[plan_code]': plan.code,
        'metadata[producto]': PRODUCTO,
      });
      const { error: upErr } = await sb.from('subscription_plans').update({ stripe_price_id: price.id }).eq('code', plan.code);
      if (upErr) throw upErr;
      console.log(`  ✓ subscription_plans.${plan.code}.stripe_price_id = ${price.id}`);
    }
  }

  // Webhook endpoint → edge function
  const url = `${SUPABASE_URL.replace(/\/$/, '')}/functions/v1/stripe-billing-webhook`;
  const events = ['checkout.session.completed', 'customer.subscription.created', 'customer.subscription.updated', 'customer.subscription.deleted', 'invoice.payment_succeeded', 'invoice.payment_failed'];
  const existing = await stripe<{ data: Array<{ id: string; url: string }> }>('GET', '/webhook_endpoints?limit=100');
  const hook = existing.data.find((w) => w.url === url);
  if (hook) {
    console.log(`\n  = webhook ya registrado (${hook.id}) → ${url}`);
    console.log('    El signing secret solo se muestra al crearlo; si no lo tienes, bórralo en el Dashboard y vuelve a correr.');
  } else {
    console.log(`\n  + webhook → ${url}`);
    if (!DRY) {
      const form: Record<string, string> = { url, description: `${PRODUCTO} billing (Supabase edge fn)` };
      events.forEach((e, i) => { form[`enabled_events[${i}]`] = e; });
      const created = await stripe<{ id: string; secret: string }>('POST', '/webhook_endpoints', form);
      console.log(`  ✓ webhook ${created.id}. Guarda su secret en la nube (no se vuelve a mostrar):`);
      console.log(`\n    supabase secrets set --project-ref <REF> "STRIPE_BILLING_WEBHOOK_SECRET=${created.secret.slice(0, 8)}…"  ← usa el valor completo que imprime Stripe en el Dashboard o ejecuta este script con --show-secret\n`);
      if (process.argv.includes('--show-secret')) console.log(`    STRIPE_BILLING_WEBHOOK_SECRET=${created.secret}\n`);
    }
  }
  console.log(`\nSiguiente: supabase secrets set --project-ref <REF> "STRIPE_SECRET_KEY=…" y probar con "stripe trigger checkout.session.completed".`);
}

main().catch((e) => { console.error('❌', e.message ?? e); process.exit(1); });
