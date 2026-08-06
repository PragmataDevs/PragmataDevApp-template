/**
 * Toggle claro / oscuro para el pilar público (clase `dark` en <html>).
 * Persistencia: localStorage `pragmata_astro_theme` = light | dark
 */

import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { PublicIcon } from '../icons/PublicIcon';

type Mode = 'light' | 'dark';

const STORAGE_KEY = 'pragmata_astro_theme';
const THEME_EVENT = 'theme:changed';

/**
 * El tema es un store externo (localStorage + la preferencia del sistema), no
 * estado de React. Antes se copiaba a estado con un `setMode(...)` en el efecto
 * de montaje, más una bandera `ready` para no pintar el botón equivocado durante
 * la hidratación. `useSyncExternalStore` cubre las dos cosas de fábrica: el
 * `getServerSnapshot` da el valor que usa el HTML del servidor y el snapshot del
 * cliente toma el mando al hidratar.
 */
function readMode(): Mode {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === 'light' || v === 'dark') return v;
  } catch {
    /* ignore */
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/** En SSR no hay `localStorage` ni `matchMedia`: se asume claro, igual que antes. */
function readServerMode(): Mode {
  return 'light';
}

function subscribe(onStoreChange: () => void): () => void {
  window.addEventListener(THEME_EVENT, onStoreChange);
  window.addEventListener('storage', onStoreChange);
  return () => {
    window.removeEventListener(THEME_EVENT, onStoreChange);
    window.removeEventListener('storage', onStoreChange);
  };
}

function apply(mode: Mode) {
  const root = document.documentElement;
  if (mode === 'dark') root.classList.add('dark');
  else root.classList.remove('dark');
}

export default function ThemeToggle() {
  const mode = useSyncExternalStore(subscribe, readMode, readServerMode);

  // Pintar la clase en <html> SÍ es un efecto de verdad: sincroniza el DOM de
  // fuera de React con el modo vigente. No escribe estado.
  useEffect(() => {
    apply(mode);
  }, [mode]);

  const toggle = useCallback(() => {
    const next: Mode = readMode() === 'dark' ? 'light' : 'dark';
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
    window.dispatchEvent(new Event(THEME_EVENT));
  }, []);

  const isDark = mode === 'dark';

  return (
    <button
      type="button"
      onClick={toggle}
      className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-pragmata border border-brand-border bg-white/90 text-brand-steel shadow-sm transition hover:border-brand-accent/40 hover:text-brand-dark dark:border-slate-600 dark:bg-slate-900/90 dark:text-slate-300 dark:hover:border-brand-accent/50 dark:hover:text-white"
      aria-label={isDark ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'}
      title={isDark ? 'Tema claro' : 'Tema oscuro'}
    >
      {isDark ? <PublicIcon name="sun" className="h-4 w-4" /> : <PublicIcon name="moon" className="h-4 w-4" />}
    </button>
  );
}
