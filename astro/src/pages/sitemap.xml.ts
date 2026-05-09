/**
 * Sitemap dinámico (hybrid SSR) — sin @astrojs/sitemap.
 * Incluye `/`, páginas CMS publicadas (`/slug`), `/productos` y fichas cuando PUBLIC_ENABLE_ECOMMERCE=true.
 */
import type { APIRoute } from 'astro';
import { createClient } from '@supabase/supabase-js';

import { resolveSiteOrigin } from '../lib/site-origin';

export const prerender = false;

function xmlEscape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function createPublicSupabase() {
  const url = String(
    import.meta.env.PUBLIC_SUPABASE_URL ?? import.meta.env.VITE_SUPABASE_URL ?? '',
  ).trim();
  const key = String(
    import.meta.env.PUBLIC_SUPABASE_ANON_KEY ?? import.meta.env.VITE_SUPABASE_ANON_KEY ?? '',
  ).trim();
  if (!url || !key) return null;
  return createClient(url, key);
}

function urlEntry(loc: string, opts?: { lastmod?: string | null; priority?: string }): string {
  const lastmod = opts?.lastmod;
  const priority = opts?.priority ?? '0.8';
  const mod =
    lastmod && !Number.isNaN(Date.parse(lastmod))
      ? `<lastmod>${new Date(lastmod).toISOString().slice(0, 10)}</lastmod>`
      : '';
  return `<url><loc>${xmlEscape(loc)}</loc>${mod}<changefreq>weekly</changefreq><priority>${priority}</priority></url>`;
}

export const GET: APIRoute = async ({ site }) => {
  const origin = resolveSiteOrigin(site);
  const ecommerceOn = import.meta.env.PUBLIC_ENABLE_ECOMMERCE === 'true';

  const locs: { path: string; lastmod?: string | null; priority?: string }[] = [
    { path: '/', priority: '1.0' },
  ];

  if (ecommerceOn) {
    locs.push({ path: '/productos', priority: '0.9' });

    try {
      const sb = createPublicSupabase();
      if (sb) {
        const { data: rows, error } = await sb
          .from('products')
          .select('slug, updated_at')
          .eq('status', 'active');

        if (!error && rows?.length) {
          const seen = new Set<string>();
          for (const row of rows) {
            const slug = row.slug as string | undefined;
            if (!slug) continue;
            const path = `/productos/${encodeURIComponent(slug)}`;
            if (seen.has(path)) continue;
            seen.add(path);
            locs.push({
              path,
              lastmod: row.updated_at as string | undefined,
              priority: '0.8',
            });
          }
        }
      }
    } catch (err) {
      console.error('[sitemap.xml]', err);
    }
  }

  try {
    const sb = createPublicSupabase();
    if (sb) {
      const { data: cmsRows, error: cmsErr } = await sb
        .from('cms_pages')
        .select('slug, updated_at')
        .eq('status', 'active')
        .eq('is_published', true)
        .eq('page_kind', 'standard');

      if (!cmsErr && cmsRows?.length) {
        const seen = new Set(locs.map((l) => l.path));
        for (const row of cmsRows) {
          const s = row.slug as string | undefined;
          if (!s || s === 'home') continue;
          const path = `/${encodeURIComponent(s)}`;
          if (seen.has(path)) continue;
          seen.add(path);
          locs.push({
            path,
            lastmod: row.updated_at as string | undefined,
            priority: '0.65',
          });
        }
      }
    }
  } catch (err) {
    console.error('[sitemap.xml cms]', err);
  }

  const body =
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">` +
    locs
      .map(({ path, lastmod, priority }) =>
        urlEntry(`${origin}${path}`, { lastmod, priority }),
      )
      .join('') +
    `</urlset>`;

  return new Response(body, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=300',
    },
  });
};
