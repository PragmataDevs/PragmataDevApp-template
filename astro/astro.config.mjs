// @ts-check
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import vercel from '@astrojs/vercel/serverless';
import react from '@astrojs/react';
import tailwind from '@astrojs/tailwind';
import { defineConfig } from 'astro/config';
import { loadEnv } from 'vite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
/** Repo raíz: el mismo archivo `.env` que usa el ERP (Vite). */
const REPO_ROOT = path.resolve(__dirname, '..');

/** Astro `defineConfig` es un objeto plano; una función como en Vite hace que se ignore adapter/output. */
const mode = process.env.NODE_ENV === 'production' ? 'production' : 'development';

const merged = {
  ...loadEnv(mode, REPO_ROOT, ''),
  ...loadEnv(mode, __dirname, ''),
};

/** Puerto de dev de Astro. Lo manda el registro central (~/PragmataDevs/ports.json).
 *  El fallback es el puerto PROPIO de este proyecto, no un default compartido. */
const viteDevPort = Number.parseInt(merged.VITE_PORT ?? '', 10) || 7020;
const astroDevPort = Number.parseInt(merged.ASTRO_PORT ?? '', 10) || 7021;

const supabaseUrl =
  merged.PUBLIC_SUPABASE_URL?.trim?.() ?? merged.VITE_SUPABASE_URL?.trim?.() ?? '';
const supabaseAnon =
  merged.PUBLIC_SUPABASE_ANON_KEY?.trim?.() ??
  merged.VITE_SUPABASE_ANON_KEY?.trim?.() ??
  '';

/** Dominios de ejemplo del template — no deben usarse como fallback en runtime. */
const PLACEHOLDER = /tucliente|tudominio|your-project-ref|example\.com/i;

/** Hosts que apuntan al propio equipo: en dev nunca aportan puerto útil. */
const LOOPBACK_HOST = /^(localhost|127\.0\.0\.1|\[?::1\]?)$/i;

/**
 * @param {string | undefined} raw
 * @param {string} devDefault
 * @returns {string}
 */
function pickPublicUrl(raw, devDefault) {
  const t = raw?.trim?.() ?? '';

  if (mode === 'development') {
    // En desarrollo el PUERTO lo manda siempre el registro (via `devDefault`), nunca
    // la URL configurada: esa se queda vieja en cuanto el proyecto se renumera y
    // nadie se entera hasta que un enlace muere. De lo configurado solo se respeta
    // el HOST, que es justo lo que el registro no sabe (IP de tailnet, dominio de
    // pruebas) y lo que hace falta para entrar desde otra máquina.
    //
    // Sin esto, tras la renumeración del 5-ago-2026 el botón «Acceso empleados» del
    // sitio Astro apuntaba a puertos muertos en seis proyectos: `PUBLIC_APP_URL`
    // seguía diciendo :7170 (indpack), :4567 (clibsa), :3443 (lawrank), :4545
    // (objetiva-ops), :7330 (invitaciones), :7091 (segubros).
    //
    // En producción no aplica: ahí la URL es un dominio real, con su puerto real, y
    // manda ella entera.
    const port = /:(\d+)/.exec(devDefault)?.[1];
    const parsed = t && !PLACEHOLDER.test(t) ? /^(https?):\/\/([^/:]+)/i.exec(t) : null;
    if (parsed && port && !LOOPBACK_HOST.test(parsed[2])) {
      return `${parsed[1]}://${parsed[2]}:${port}`;
    }
    return devDefault;
  }

  if (t && !PLACEHOLDER.test(t)) return t;
  return t;
}

const site = pickPublicUrl(
  merged.PUBLIC_SITE_URL || merged.VITE_PUBLIC_SITE_URL,
  `http://localhost:${astroDevPort}`,
);

const publicAppUrl = pickPublicUrl(merged.PUBLIC_APP_URL, `http://localhost:${viteDevPort}`);

/** @type {Record<string, string>} */
const defineMap = {};

for (const key of Object.keys(merged)) {
  if (!key.startsWith('PUBLIC_')) continue;
  defineMap[`import.meta.env.${key}`] = JSON.stringify(merged[key] ?? '');
}

if (supabaseUrl && supabaseAnon) {
  defineMap['import.meta.env.PUBLIC_SUPABASE_URL'] = JSON.stringify(supabaseUrl);
  defineMap['import.meta.env.PUBLIC_SUPABASE_ANON_KEY'] =
    JSON.stringify(supabaseAnon);
}

if (publicAppUrl) {
  defineMap['import.meta.env.PUBLIC_APP_URL'] = JSON.stringify(publicAppUrl);
}
if (site && !PLACEHOLDER.test(site)) {
  defineMap['import.meta.env.PUBLIC_SITE_URL'] = JSON.stringify(site);
}

const astroSite = site && !PLACEHOLDER.test(site) ? site : undefined;

// ───────────────────────────────────────────────────────────────────────────────
export default defineConfig({
  ...(astroSite ? { site: astroSite } : {}),

  /** Misma UX que Vite (`host: true`): localhost + IP LAN en `pnpm dev` / `dev:all`. */
  server: {
    host: true,
    port: astroDevPort,
  },

  output: 'hybrid',
  adapter: vercel(),

  integrations: [
    react(),

    // Sitemap / robots: endpoints SSR `src/pages/sitemap.xml.ts` y `robots.txt.ts`
    // (evita @astrojs/sitemap en hybrid — ver docs/SETUP.md §8.8).

    tailwind({ applyBaseStyles: false }),
  ],

  vite: {
    envDir: REPO_ROOT,
    define: defineMap,
    resolve: {
      alias: { '@': path.resolve(__dirname, 'src') },
    },
  },
});
