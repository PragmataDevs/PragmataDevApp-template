/**
 * Toggle claro / oscuro para el pilar público (clase `dark` en <html>).
 * Persistencia: localStorage `pragmata_astro_theme` = light | dark
 */

import { useCallback, useEffect, useState } from 'react';
import { PublicIcon } from '../icons/PublicIcon';

const STORAGE_KEY = 'pragmata_astro_theme';

function readStored(): 'light' | 'dark' | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === 'light' || v === 'dark') return v;
  } catch {
    /* ignore */
  }
  return null;
}

function apply(mode: 'light' | 'dark') {
  const root = document.documentElement;
  if (mode === 'dark') root.classList.add('dark');
  else root.classList.remove('dark');
}

export default function ThemeToggle() {
  const [mode, setMode] = useState<'light' | 'dark'>('light');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const stored = readStored();
    const initial =
      stored ??
      (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    setMode(initial);
    apply(initial);
    setReady(true);
  }, []);

  const toggle = useCallback(() => {
    setMode(prev => {
      const next = prev === 'dark' ? 'light' : 'dark';
      try {
        localStorage.setItem(STORAGE_KEY, next);
      } catch {
        /* ignore */
      }
      apply(next);
      return next;
    });
  }, []);

  if (!ready) {
    return (
      <span
        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-pragmata border border-transparent"
        aria-hidden
      />
    );
  }

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
