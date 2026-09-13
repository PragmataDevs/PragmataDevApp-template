/**
 * @vitest-environment jsdom
 *
 * El pragma va explícito porque este archivo viaja: aquí el default ya es
 * jsdom, pero en el template (`PragmataDevApp-template`) vitest corre en
 * `environment: 'node'` y sin esta línea el test truena con
 * "document is not defined" al backportearlo.
 *
 * applyThemeClass — la regresión de "el tema claro se ve oscuro".
 *
 * El bug original: al elegir claro sólo se QUITABA `.dark`, y como `index.css`
 * es dark-first (los tokens de `:root` son los oscuros), el navegador caía a
 * `:root` y pintaba oscuro. La clase `.light` existía en el CSS y no la aplicaba
 * nadie.
 *
 * Por eso el test afirma la presencia de `.light`, no sólo la ausencia de
 * `.dark`: es justo la diferencia que dejó pasar el bug.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { applyThemeClass } from '../applyThemeClass';

let root: HTMLElement;

beforeEach(() => {
  root = document.createElement('html');
});

describe('applyThemeClass', () => {
  it('el tema claro AGREGA .light (no basta con quitar .dark)', () => {
    applyThemeClass('light', root);
    expect(root.classList.contains('light')).toBe(true);
    expect(root.classList.contains('dark')).toBe(false);
  });

  it('el tema oscuro agrega .dark y no deja .light', () => {
    applyThemeClass('dark', root);
    expect(root.classList.contains('dark')).toBe(true);
    expect(root.classList.contains('light')).toBe(false);
  });

  it('nunca deja las dos clases al mismo tiempo', () => {
    applyThemeClass('dark', root);
    applyThemeClass('light', root);
    expect(root.classList.contains('light')).toBe(true);
    expect(root.classList.contains('dark')).toBe(false);

    applyThemeClass('dark', root);
    expect(root.classList.contains('dark')).toBe(true);
    expect(root.classList.contains('light')).toBe(false);
  });

  it('aplicar el mismo tema dos veces es idempotente', () => {
    applyThemeClass('light', root);
    applyThemeClass('light', root);
    expect(root.className.split(/\s+/).filter((c) => c === 'light')).toHaveLength(1);
  });

  it('respeta clases ajenas que ya traía el <html>', () => {
    root.classList.add('js-enabled');
    applyThemeClass('light', root);
    expect(root.classList.contains('js-enabled')).toBe(true);
  });
});
