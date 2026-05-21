import { useEffect, useState } from 'react';
import { getConfiguredPublicSiteUrl } from '@/lib/publicSiteUrl';

function originOf(url: string): string | null {
  const trimmed = url.trim();
  if (!trimmed) return null;
  try {
    const withProto = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    return new URL(withProto).origin;
  } catch {
    return null;
  }
}

/**
 * Ruta `/` del ERP: envía al visitante a la landing Astro.
 * Si `VITE_PUBLIC_SITE_URL` apunta al mismo host que el ERP (p. ej. www en ambos), evitamos bucle infinito.
 */
export default function PublicSiteEntry() {
  const [sameHostMisconfig, setSameHostMisconfig] = useState(false);

  useEffect(() => {
    const base = getConfiguredPublicSiteUrl();
    const baseOrigin = base ? originOf(base) : null;
    const here = window.location.origin;

    if (baseOrigin && here === baseOrigin) {
      setSameHostMisconfig(true);
      return;
    }

    if (base) {
      window.location.replace(`${base.replace(/\/+$/, '')}/`);
      return;
    }
    window.location.replace('/login');
  }, []);

  if (sameHostMisconfig) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-slate-50 text-slate-600 text-sm px-6 text-center max-w-lg mx-auto">
        <p className="text-slate-900 font-semibold text-base">
          Configuración de dominios: mismo origen que el sitio público
        </p>
        <p className="text-xs leading-relaxed">
          El ERP y el sitio Astro deben servirse en <strong>hosts distintos</strong> (por ejemplo{' '}
          <code className="rounded bg-slate-200 px-1">app.tucliente.com</code> para el operativo y{' '}
          <code className="rounded bg-slate-200 px-1">www.tucliente.com</code> para el público). Ajusta{' '}
          <code className="rounded bg-slate-200 px-1">VITE_PUBLIC_SITE_URL</code> en el build del ERP para que
          apunte al origen del sitio Astro, no al del ERP.
        </p>
        <a
          href="/login"
          className="mt-2 inline-flex items-center justify-center rounded-pragmata bg-brand-accent px-5 py-2.5 text-sm font-semibold text-white hover:bg-sky-600"
        >
          Ir a iniciar sesión
        </a>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-2 bg-slate-50 text-slate-500 text-sm px-6 text-center">
      <p className="text-slate-900 font-medium">Redirigiendo al sitio público…</p>
      <p className="text-xs">
        Si no avanza, abre{' '}
        <a href="/login" className="text-sky-600 underline">
          /login
        </a>{' '}
        o configura <code className="rounded bg-slate-200 px-1">VITE_PUBLIC_SITE_URL</code> en .env.
      </p>
    </div>
  );
}
