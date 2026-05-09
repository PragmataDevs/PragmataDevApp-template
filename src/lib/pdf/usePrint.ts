/**
 * usePrint — Browser-native PDF printing hook
 *
 * Renders content into a hidden iframe, applies print-only CSS,
 * and triggers window.print(). Zero extra dependencies.
 *
 * Usage:
 *   const { print, printing } = usePrint();
 *   <button onClick={() => print({ title: 'Reporte', html: buildHtml(data) })}>
 *     Imprimir / Guardar PDF
 *   </button>
 */

import { useState, useCallback } from 'react';

export interface PrintOptions {
  /** Page title (appears in browser print dialog and PDF header) */
  title?: string;
  /**
   * Full HTML string to print. Should include inline styles since
   * the iframe is isolated from the app's CSS.
   * If omitted, `elementId` must be provided.
   */
  html?: string;
  /**
   * ID of a DOM element to capture and print.
   * Use this to print a visible section of the page.
   */
  elementId?: string;
  /** Additional CSS injected into the print iframe (e.g. custom fonts) */
  extraCss?: string;
}

/** Base CSS for clean PDF output */
const BASE_PRINT_CSS = `
  *, *::before, *::after { box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    font-size: 12px;
    line-height: 1.5;
    color: #0B1220;
    margin: 0;
    padding: 16px 24px;
  }
  table { width: 100%; border-collapse: collapse; }
  th, td { padding: 6px 8px; border: 1px solid #E3E8F2; text-align: left; }
  th { background: #F2F5FA; font-weight: 600; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; }
  tr:nth-child(even) td { background: #F7F8FB; }
  .page-header { margin-bottom: 16px; border-bottom: 2px solid #1A7FF0; padding-bottom: 8px; }
  .page-header h1 { font-size: 18px; margin: 0 0 2px; color: #0B1220; }
  .page-header .meta { font-size: 11px; color: #5A6B85; }
  .page-footer { margin-top: 16px; font-size: 10px; color: #5A6B85; text-align: right; border-top: 1px solid #E3E8F2; padding-top: 4px; }
  @page { margin: 15mm 12mm; }
`;

export interface UsePrintReturn {
  print: (options: PrintOptions) => Promise<void>;
  printing: boolean;
}

export function usePrint(): UsePrintReturn {
  const [printing, setPrinting] = useState(false);

  const print = useCallback(async (options: PrintOptions) => {
    setPrinting(true);
    try {
      let bodyHtml = options.html ?? '';

      if (!bodyHtml && options.elementId) {
        const el = document.getElementById(options.elementId);
        if (el) bodyHtml = el.innerHTML;
      }

      const iframe = document.createElement('iframe');
      iframe.style.cssText = 'position:fixed;top:0;left:0;width:0;height:0;border:0;opacity:0;';
      document.body.appendChild(iframe);

      const doc = iframe.contentWindow?.document;
      if (!doc) throw new Error('Cannot access iframe document');

      const now = new Date().toLocaleDateString('es-MX', {
        year: 'numeric', month: 'long', day: 'numeric',
        hour: '2-digit', minute: '2-digit',
      });

      doc.open();
      doc.write(`<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <title>${options.title ?? 'Reporte'}</title>
  <style>${BASE_PRINT_CSS}${options.extraCss ?? ''}</style>
</head>
<body>
  <div class="page-header">
    <h1>${options.title ?? 'Reporte'}</h1>
    <div class="meta">Generado el ${now}</div>
  </div>
  ${bodyHtml}
  <div class="page-footer">Generado con Pragmata Platform</div>
</body>
</html>`);
      doc.close();

      // Wait for resources (fonts, images) to load
      await new Promise<void>((resolve) => {
        iframe.contentWindow!.onload = () => resolve();
        // Fallback timeout
        setTimeout(resolve, 800);
      });

      iframe.contentWindow!.focus();
      iframe.contentWindow!.print();

      // Cleanup after the print dialog closes
      setTimeout(() => {
        document.body.removeChild(iframe);
      }, 2000);
    } finally {
      setPrinting(false);
    }
  }, []);

  return { print, printing };
}

// ─── HTML Builders ───────────────────────────────────────────────────────────

/**
 * Build a simple HTML table from data for use with usePrint.
 *
 * Example:
 *   const html = buildPrintTable({
 *     columns: [{ key: 'name', header: 'Nombre' }, { key: 'status', header: 'Estado' }],
 *     rows: clientes,
 *   });
 *   print({ title: 'Clientes', html });
 */
export function buildPrintTable<T extends Record<string, unknown>>({
  columns,
  rows,
  summary,
}: {
  columns: { key: string; header: string; format?: (val: unknown) => string }[];
  rows: T[];
  summary?: string;
}): string {
  const thead = `<thead><tr>${columns.map(c => `<th>${c.header}</th>`).join('')}</tr></thead>`;
  const tbody = `<tbody>${rows.map(row =>
    `<tr>${columns.map(c => {
      const val = row[c.key];
      const formatted = c.format ? c.format(val) : (val === null || val === undefined ? '—' : String(val));
      return `<td>${formatted}</td>`;
    }).join('')}</tr>`
  ).join('')}</tbody>`;
  const summaryRow = summary ? `<p style="margin-top:12px;font-size:11px;color:#5A6B85;">${summary}</p>` : '';
  return `<table>${thead}${tbody}</table>${summaryRow}`;
}
