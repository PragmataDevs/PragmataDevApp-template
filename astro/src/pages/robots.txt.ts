/**
 * robots.txt dinámico — línea Sitemap apunta al origen canónico (PUBLIC_SITE_URL / astro.config site).
 */
import type { APIRoute } from 'astro';

import { resolveSiteOrigin } from '../lib/site-origin';

export const prerender = false;

export const GET: APIRoute = ({ site }) => {
  const origin = resolveSiteOrigin(site);
  const ecommerceOn = import.meta.env.PUBLIC_ENABLE_ECOMMERCE === 'true';

  const lines = [
    '# robots.txt — sitio público Pragmata (Astro, generado)',
    '# ERP / app: usar robots propios en el host del SPA (no indexar).',
    '',
    'User-agent: *',
    'Allow: /',
    '',
    '# Rutas transaccionales / thin — no indexar',
    'Disallow: /checkout',
    'Disallow: /gracias',
    '',
  ];

  if (!ecommerceOn) {
    lines.push('# Catálogo desactivado (PUBLIC_ENABLE_ECOMMERCE≠true)');
    lines.push('Disallow: /productos');
    lines.push('');
  }

  lines.push(`Sitemap: ${origin}/sitemap.xml`);
  lines.push('');

  return new Response(lines.join('\n'), {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
};
