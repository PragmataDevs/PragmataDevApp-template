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

const site =
  merged.PUBLIC_SITE_URL?.trim?.() ||
  merged.VITE_PUBLIC_SITE_URL?.trim?.() ||
  (mode === 'development' ? 'http://localhost:4321' : 'https://tucliente.com');

// ───────────────────────────────────────────────────────────────────────────────
export default defineConfig({
  site,

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
