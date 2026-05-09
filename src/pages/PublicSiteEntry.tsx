import { useEffect } from 'react';

/** Origen del sitio público (Astro), alineado con ProductsPage / documentación. */
function publicSiteOrigin(): string {
  const raw =
    typeof import.meta.env.VITE_PUBLIC_SITE_URL === 'string'
      ? import.meta.env.VITE_PUBLIC_SITE_URL.trim().replace(/\/+$/, '')
      : '';
  if (raw) return raw;
  if (import.meta.env.DEV) return 'http://localhost:4321';
  return '';
}

/**
 * Ruta `/` del ERP: envía al visitante a la landing Astro.
 * El operativo no duplica marketing; el login sigue en `/login`.
 */
export default function PublicSiteEntry() {
  useEffect(() => {
    const base = publicSiteOrigin();
    if (base) {
      window.location.replace(`${base}/`);
      return;
    }
    window.location.replace('/login');
  }, []);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-2 bg-slate-50 text-slate-500 text-sm px-6 text-center">
      <p className="text-slate-900 font-medium">Redirigiendo al sitio público…</p>
      <p className="text-xs">Si no avanza, abre <a href="/login" className="text-sky-600 underline">/login</a> o configura <code className="rounded bg-slate-200 px-1">VITE_PUBLIC_SITE_URL</code> en .env.</p>
    </div>
  );
}
