import { useEffect } from 'react';

/**
 * Cierra un overlay (modal, menú, dropdown) con la tecla Escape.
 * Solo escucha mientras `active` es true, así no se apilan listeners.
 *
 *   useEscapeKey(menuOpen, () => setMenuOpen(false));
 */
export function useEscapeKey(active: boolean, onEscape: () => void): void {
  useEffect(() => {
    if (!active) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onEscape();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [active, onEscape]);
}
