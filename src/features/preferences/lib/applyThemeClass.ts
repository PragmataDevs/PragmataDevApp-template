/**
 * Aplica la clase de tema en `<html>`.
 *
 * Vive fuera de `ThemeProvider.tsx` porque un archivo de componente que además
 * exporta funciones rompe Fast Refresh (`react-refresh/only-export-components`),
 * y esto se quiere poder probar solo.
 *
 * ── EL DETALLE QUE COSTÓ EL BUG ─────────────────────────────────────────────
 * `index.css` es **dark-first**: los tokens de `:root` son los OSCUROS y el
 * tema claro vive en la clase `.light`. La versión anterior sólo QUITABA
 * `.dark` al elegir claro, y sin `.light` el navegador caía a `:root` — así que
 * "el tema claro se veía oscuro" y la clase `.light` del CSS era código muerto.
 *
 * Por eso las dos clases se manejan explícitamente, no una como ausencia de la
 * otra. `.dark` además la siguen usando las utilidades `dark:` de Tailwind
 * (`darkMode: 'class'`).
 */
export type ResolvedTheme = 'light' | 'dark';

export function applyThemeClass(resolved: ResolvedTheme, root: HTMLElement = document.documentElement): void {
  root.classList.toggle('dark', resolved === 'dark');
  root.classList.toggle('light', resolved === 'light');
}
