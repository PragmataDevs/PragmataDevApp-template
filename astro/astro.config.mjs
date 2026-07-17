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

const supabaseUrl =
  merged.PUBLIC_SUPABASE_URL?.trim?.() ?? merged.VITE_SUPABASE_URL?.trim?.() ?? '';
const supabaseAnon =
  merged.PUBLIC_SUPABASE_ANON_KEY?.trim?.() ??
  merged.VITE_SUPABASE_ANON_KEY?.trim?.() ??
  '';

/** Dominios de ejemplo del template — no deben usarse como fallback en runtime. */
const PLACEHOLDER = /tucliente|tudominio|your-project-ref|example\.com/i;

/**
 * @param {string | undefined} raw
 * @param {string} devDefault
 * @returns {string}
 */
function pickPublicUrl(raw, devDefault) {
  const t = raw?.trim?.() ?? '';
  if (t && !PLACEHOLDER.test(t)) return t;
  if (mode === 'development') return devDefault;
  return t;
}

const site = pickPublicUrl(
  merged.PUBLIC_SITE_URL || merged.VITE_PUBLIC_SITE_URL,
  'http://localhost:4321',
);

const publicAppUrl = pickPublicUrl(merged.PUBLIC_APP_URL, 'http://localhost:7070');

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
    port: 4321,
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
